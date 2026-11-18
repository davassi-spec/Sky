#!/usr/bin/env python3
"""
Descarrega les convocatòries del Consell Insular de Menorca i dels
ajuntaments de l'illa des de la BDNS (Base de Datos Nacional de
Subvenciones, www.infosubvenciones.es) i genera ../data.js.

Ús:
    python3 tools/actualitzar_bdns.py                 # 2025 fins avui
    python3 tools/actualitzar_bdns.py --des 2024-01-01

Font: Sistema Nacional de Publicidad de Subvenciones y Ayudas Públicas.
La reutilització d'aquestes dades està subjecta a l'avís legal de la BDNS:
https://www.infosubvenciones.es/bdnstrans/GE/es/avisolegal
"""
import argparse, datetime as dt, html, json, os, re, sys, time, urllib.parse, urllib.request

API = "https://www.infosubvenciones.es/bdnstrans/api"
FITXA = "https://www.infosubvenciones.es/bdnstrans/GE/es/convocatorias/{}"
AQUI = os.path.dirname(os.path.abspath(__file__))

# Codis d'òrgan a la BDNS (api/organos?vpd=GE&idAdmon=L → Illes Balears)
ORGANISMES = {
    "cime":       {"bdns": 4735, "nom": "Consell Insular de Menorca", "curt": "Consell Insular", "color": "#0b6e6e", "web": "https://www.cime.es"},
    "mao":        {"bdns": 5424, "nom": "Ajuntament de Maó", "curt": "Maó", "color": "#b23a48", "web": "https://www.ajmao.org"},
    "ciutadella": {"bdns": 5843, "nom": "Ajuntament de Ciutadella", "curt": "Ciutadella", "color": "#3a5ba0", "web": "https://www.ciutadella.cat"},
    "alaior":     {"bdns": 2302, "nom": "Ajuntament d'Alaior", "curt": "Alaior", "color": "#7a4fa3", "web": None},
    "escastell":  {"bdns": 3937, "nom": "Ajuntament des Castell", "curt": "Es Castell", "color": "#c26a1b", "web": None},
    "santlluis":  {"bdns": 3225, "nom": "Ajuntament de Sant Lluís", "curt": "Sant Lluís", "color": "#2f8f4e", "web": None},
    "mercadal":   {"bdns": 2428, "nom": "Ajuntament des Mercadal", "curt": "Es Mercadal", "color": "#8a6d1f", "web": None},
    "migjorn":    {"bdns": 3958, "nom": "Ajuntament des Migjorn Gran", "curt": "Es Migjorn Gran", "color": "#a0476e", "web": None},
    "ferreries":  {"bdns": 4122, "nom": "Ajuntament de Ferreries", "curt": "Ferreries", "color": "#46707d", "web": None},
}

# Finalitat BDNS → àmbit de la web
AMBITS = {
    "cultura":     {"ca": "Cultura", "es": "Cultura"},
    "esports":     {"ca": "Esports", "es": "Deportes"},
    "social":      {"ca": "Serveis socials", "es": "Servicios sociales"},
    "educacio":    {"ca": "Educació i joventut", "es": "Educación y juventud"},
    "economia":    {"ca": "Comerç, turisme i empresa", "es": "Comercio, turismo y empresa"},
    "agricultura": {"ca": "Agricultura, ramaderia i pesca", "es": "Agricultura, ganadería y pesca"},
    "medi":        {"ca": "Medi ambient", "es": "Medio ambiente"},
    "habitatge":   {"ca": "Habitatge i urbanisme", "es": "Vivienda y urbanismo"},
    "cooperacio":  {"ca": "Cooperació internacional", "es": "Cooperación internacional"},
    "ocupacio":    {"ca": "Ocupació", "es": "Empleo"},
    "salut":       {"ca": "Salut", "es": "Sanidad"},
    "altres":      {"ca": "Altres", "es": "Otros"},
}
def ambit_de(finalitat):
    f = (finalitat or "").lower()
    regles = [("deport", "esports"), ("cultur", "cultura"), ("social", "social"), ("educa", "educacio"),
              ("juventud", "educacio"), ("comercio", "economia"), ("turismo", "economia"), ("industria", "economia"),
              ("agricult", "agricultura"), ("pesca", "agricultura"), ("ganad", "agricultura"), ("rural", "agricultura"),
              ("medio ambiente", "medi"), ("vivienda", "habitatge"), ("urban", "habitatge"), ("cooperaci", "cooperacio"),
              ("empleo", "ocupacio"), ("sanidad", "salut"), ("salud", "salut")]
    for clau, amb in regles:
        if clau in f: return amb
    return "altres"

BENEFICIARIS = {
    "entitats":    {"ca": "Entitats sense activitat econòmica", "es": "Entidades sin actividad económica"},
    "empreses":    {"ca": "Empreses i autònoms", "es": "Empresas y autónomos"},
    "particulars": {"ca": "Particulars", "es": "Particulares"},
    "altres":      {"ca": "Altres", "es": "Otros"},
}
def benef_de(desc):
    d = (desc or "").upper()
    if "JURÍDICAS QUE NO DESARROLLAN" in d: return "entitats"
    if "PYME" in d or "GRAN EMPRESA" in d or "QUE DESARROLLAN ACTIVIDAD" in d: return "empreses"
    if "FÍSICAS QUE NO DESARROLLAN" in d: return "particulars"
    return "altres"

def get(path, **params):
    url = f"{API}/{path}?{urllib.parse.urlencode(params)}"
    for intent in range(4):
        try:
            req = urllib.request.Request(url, headers={"Accept": "application/json", "User-Agent": "subvencions-menorca/1.0"})
            with urllib.request.urlopen(req, timeout=60) as r:
                return json.load(r)
        except Exception as e:
            if intent == 3: raise
            time.sleep(2 * (intent + 1))

def text_pla(h):
    t = re.sub(r"<\s*(br|/p|/li)\s*/?>", "\n", h or "", flags=re.I)
    t = html.unescape(re.sub(r"<[^>]+>", "", t)).replace("\xa0", " ")
    return re.sub(r"\n\s*\n+", "\n", t).strip()

def seccio(text, *noms):
    """Paràgraf que segueix un encapçalament tipus «Segundo. Objeto»."""
    linies = [l.strip() for l in text.split("\n") if l.strip()]
    for i, l in enumerate(linies):
        if len(l) < 60 and any(re.search(rf"\b{n}\b", l, re.I) for n in noms):
            cos = []
            for seg in linies[i + 1:]:
                if len(seg) < 60 and re.match(r"^(primer|segon|tercer|quart|cinqu|sis|set|vuit|nov|des|\w+o\.|\d+\.)", seg, re.I):
                    break
                cos.append(seg)
                if sum(len(c) for c in cos) > 420: break
            if cos: return " ".join(cos)
    return None

def retalla(t, n):
    if not t or len(t) <= n: return t
    return t[:n].rsplit(" ", 1)[0].rstrip(",;:") + "…"

def net_titol(t):
    t = re.sub(r"\s*\((exp|expte|expedient|expediente)\.?[^)]*\)\s*$", "", t or "", flags=re.I)
    return re.sub(r"\s+", " ", t).strip()

def converteix(clau, d):
    anunci = (d.get("anuncios") or [{}])[0]
    cos = text_pla(anunci.get("texto"))
    resum = seccio(cos, "objeto", "objecte", "finalidad", "finalitat") or d.get("descripcionBasesReguladoras")
    qui = seccio(cos, "beneficiarios", "beneficiaris", "beneficiarias")
    benef = sorted({benef_de(b.get("descripcion")) for b in d.get("tiposBeneficiarios") or []}) or ["altres"]
    tipus = d.get("tipoConvocatoria") or ""
    return {
        "id": f"bdns-{d['codigoBDNS']}",
        "titol": net_titol(d.get("descripcionLeng") or d.get("descripcion")),
        "titol_es": net_titol(d.get("descripcion")),
        "organisme": clau,
        "ambit": ambit_de(d.get("descripcionFinalidad")),
        "finalitat": d.get("descripcionFinalidad"),
        "beneficiaris": benef,
        "import": d.get("presupuestoTotal"),
        "maxim": None,
        "publicada": d.get("fechaRecepcion"),
        "inici": d.get("fechaInicioSolicitud"),
        "fi": d.get("fechaFinSolicitud"),
        "text_inici": d.get("textInicio"),
        "text_fi": d.get("textFin"),
        "obert_bdns": d.get("abierto"),
        "tipus": tipus,
        "directa": "directa" in tipus.lower() or "nominativa" in tipus.lower(),
        "resum": retalla(resum, 420),
        "requisits": [retalla(qui, 420)] if qui else [],
        "url": anunci.get("url") or d.get("urlBasesReguladoras"),
        "bases": d.get("urlBasesReguladoras"),
        "seu": ("https://" + d["sedeElectronica"]) if d.get("sedeElectronica") and not d["sedeElectronica"].startswith("http") else d.get("sedeElectronica"),
        "bdns": d["codigoBDNS"],
        "bdns_url": FITXA.format(d["codigoBDNS"]),
    }

def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--des", default="2025-01-01", help="data de registre inicial (AAAA-MM-DD)")
    ap.add_argument("--fins", default=dt.date.today().isoformat())
    ap.add_argument("--sortida", default=os.path.join(AQUI, "..", "data.js"))
    a = ap.parse_args()
    fmt = lambda s: dt.date.fromisoformat(s).strftime("%d/%m/%Y")

    convs = []
    for clau, org in ORGANISMES.items():
        llista, pag = [], 0
        while True:
            r = get("convocatorias/busqueda", vpd="GE", page=pag, pageSize=50, organos=org["bdns"],
                    fechaDesde=fmt(a.des), fechaHasta=fmt(a.fins), order="fechaRecepcion", direccion="desc")
            llista += r["content"]
            if r.get("last", True): break
            pag += 1
        print(f"{org['curt']:<16} {len(llista):>4} convocatòries", file=sys.stderr)
        for i, c in enumerate(llista):
            d = get("convocatorias", numConv=c["numeroConvocatoria"], vpd="GE")
            convs.append(converteix(clau, d))
            time.sleep(0.25)  # sense presses: la BDNS demana un ús raonable de l'API

    convs.sort(key=lambda c: c["publicada"] or "", reverse=True)
    dades = {
        "exemple": False,
        "font": "BDNS · Sistema Nacional de Publicidad de Subvenciones y Ayudas Públicas",
        "actualitzat": dt.date.today().isoformat(),
        "periode": [a.des, a.fins],
        "ORGANISMES": {k: {kk: vv for kk, vv in v.items()} for k, v in ORGANISMES.items()},
        "AMBITS": AMBITS,
        "BENEFICIARIS": BENEFICIARIS,
        "CONVOCATORIES": convs,
    }
    with open(a.sortida, "w", encoding="utf-8") as f:
        f.write("/* Generat automàticament per tools/actualitzar_bdns.py — no editar a mà.\n"
                "   Font: BDNS (www.infosubvenciones.es). Avís legal de reutilització:\n"
                "   https://www.infosubvenciones.es/bdnstrans/GE/es/avisolegal */\n")
        f.write("window.SM_DATA = ")
        json.dump(dades, f, ensure_ascii=False, indent=1)
        f.write(";\n")
    print(f"{len(convs)} convocatòries → {os.path.normpath(a.sortida)}", file=sys.stderr)

if __name__ == "__main__":
    main()
