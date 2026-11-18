#!/usr/bin/env python3
"""
Cerca al BOIB (Butlletí Oficial de les Illes Balears) les bases i convocatòries
d'ajuts dels ajuntaments que no publiquen a la BDNS (Ciutadella, es Castell,
es Migjorn Gran) i les afegeix a ../data.js.

Ús:
    python3 tools/actualitzar_boib.py                 # des de 2025 fins avui
    python3 tools/actualitzar_boib.py --des 2024-01-01

L'import i el termini s'extreuen del text de l'edicte amb regles senzilles:
són APROXIMATS i la web ho indica. El text vinculant és l'edicte del BOIB.
"""
import argparse, datetime as dt, html, json, os, re, sys, time, urllib.parse, urllib.request

BOIB = "https://www.caib.es"
AQUI = os.path.dirname(os.path.abspath(__file__))
DATA = os.path.join(AQUI, "..", "data.js")

# clau d'organisme → text per al camp «Organisme» del cercador del BOIB
ORGS_BOIB = {
    "ciutadella": "Ajuntament de Ciutadella",
    "escastell":  "Ajuntament des Castell",
    "migjorn":    "Ajuntament des Migjorn Gran",
}

AJUT = re.compile(r"\b(subvenci\w*|ajud\w*|ajuts?|premis?|beques?|beca|prestacions? econ\w*|bonificaci\w*)\b", re.I)
CONV = re.compile(r"\b(bases|convocat\w*|extracte|aprovaci\w*)\b", re.I)
EXCLOU = re.compile(r"\b(selecti\w*|lloc de treball|llocs de treball|places?|plaça|borsa|oposici\w*|pressupost\w*|modificaci\w* de cr[eè]dit|ordenan[çc]a fiscal|preus? p[uú]blics?|impost\w*|tax(a|es)|personal|funcionari\w*|interinitat|plantilla|licitaci\w*|contracte)\b", re.I)

MESOS = {"gener":1,"febrer":2,"març":3,"abril":4,"maig":5,"juny":6,"juliol":7,"agost":8,"setembre":9,"octubre":10,"novembre":11,"desembre":12}
NUMS = {"un":1,"una":1,"cinc":5,"deu":10,"quinze":15,"vint":20,"trenta":30,"quaranta-cinc":45,"seixanta":60,"dos":2,"tres":3}

def get(url, data=None):
    for intent in range(4):
        try:
            req = urllib.request.Request(url, data=data, headers={"User-Agent": "subvencions-menorca/1.0"})
            with urllib.request.urlopen(req, timeout=60) as r:
                return r.read().decode("utf-8", "replace")
        except Exception:
            if intent == 3: raise
            time.sleep(2 * (intent + 1))

def text_pla(h):
    h = re.sub(r"<script.*?</script>|<style.*?</style>", "", h, flags=re.S)
    h = re.sub(r"<(br|/p|/li|/h\d|/tr|/div)[^>]*>", "\n", h)
    t = html.unescape(re.sub(r"<[^>]+>", "", h)).replace("\xa0", " ")
    t = re.sub(r"[ \t]+", " ", t)
    return re.sub(r"\n\s*\n+", "\n", t).strip()

def cerca(organisme, des, fins):
    """Tots els edictes de l'organisme entre dues dates (paginant)."""
    q = {"cerca": "Enviar", "lang": "ca", "ordenacio": "data", "organisme": organisme,
         "fec_ini": des.strftime("%d/%m/%Y"), "fec_fin": fins.strftime("%d/%m/%Y")}
    pag, res = 0, []
    while True:
        s = get(f"{BOIB}/eboibfront/cercar?" + urllib.parse.urlencode({**q, "page": pag}))
        for caixa in re.findall(r'<div class="caja">(.*?)</ul>\s*</p>\s*</li>', s, re.S):
            m = re.search(r"Núm\s+(\d+)/(\d{4})\s+de\s+(\d{2})/(\d{2})/(\d{4})\s*-\s*Número d'edicte:\s*(\d+)", re.sub(r"\s+", " ", caixa))
            ps = [text_pla(p) for p in re.findall(r"<p>(.*?)</p>", caixa, re.S)]
            link = re.search(r'class="html" href="([^"]+)"', caixa)
            pdf = re.search(r"class=\"pdf\"[^>]*href='([^']+)'", caixa)
            if not (m and link and len(ps) >= 2): continue
            res.append({"num": f"{m.group(1)}/{m.group(2)}", "data": f"{m.group(5)}-{m.group(4)}-{m.group(3)}",
                        "edicte": m.group(6), "org": ps[0], "titol": ps[1],
                        "url": BOIB + link.group(1), "pdf": BOIB + pdf.group(1) if pdf else None})
        if "Següent" not in s: break
        pag += 1
        time.sleep(0.4)
    return res

LIMIT_BOIB = 50  # el cercador del BOIB no torna més de 50 resultats per consulta

def cerca_completa(organisme, des, fins):
    """Divideix l'interval en mesos (i en meitats si cal) per esquivar el límit de 50."""
    def interval(a, b):
        r = cerca(organisme, a, b)
        if len(r) >= LIMIT_BOIB and (b - a).days > 1:
            mig = a + (b - a) // 2
            return interval(a, mig) + interval(mig + dt.timedelta(days=1), b)
        return r
    res, a = [], des
    while a <= fins:
        b = min(dt.date(a.year + (a.month // 12), a.month % 12 + 1, 1) - dt.timedelta(days=1), fins)
        res += interval(a, b)
        a = b + dt.timedelta(days=1)
    vistos, unics = set(), []
    for e in res:
        k = (e["num"], e["edicte"])
        if k not in vistos: vistos.add(k); unics.append(e)
    return unics

def es_ajut(titol):
    return bool(AJUT.search(titol) and CONV.search(titol) and not EXCLOU.search(titol))

def suma_habils(d, n):
    while n > 0:
        d += dt.timedelta(days=1)
        if d.weekday() < 5: n -= 1
    return d

def termini(text, publicada):
    """Retorna (data_fi, text_original) a partir de la clàusula del termini."""
    for frase in re.split(r"(?<=[.;])\s+|\n", text):
        f = frase.lower()
        if "termini" not in f or not re.search(r"presentaci|presentar", f): continue
        if not re.search(r"publicaci|boib|butllet|fins (al|el)|endemà|convocatòria", f): continue
        if re.search(r"anteriors a la sol|requerid|esmen|justifica", f): continue
        m = re.search(r"fins (?:al|el) (?:dia )?(\d{1,2}) de (?:d')?(\w+) de (\d{4})", f)
        if m and m.group(2) in MESOS:
            return dt.date(int(m.group(3)), MESOS[m.group(2)], int(m.group(1))), frase.strip()
        m = re.search(r"\b(\d{1,3}|" + "|".join(NUMS) + r")\s+(dies|mes|mesos)\b(?:\s+(hàbils|naturals))?", f)
        if m:
            n = int(m.group(1)) if m.group(1).isdigit() else NUMS[m.group(1)]
            if m.group(2).startswith("mes"):
                mes = publicada.month - 1 + n
                fi = dt.date(publicada.year + mes // 12, mes % 12 + 1, min(publicada.day, 28))
            elif m.group(3) == "hàbils":
                fi = suma_habils(publicada, n)
            else:
                fi = publicada + dt.timedelta(days=n)
            return fi, frase.strip()
    return None, None

IMPORT = re.compile(r"(\d{1,3}(?:\.\d{3})+|\d{4,})(?:,\d{1,2})?\s?(?:€|euros)")
def import_total(text):
    millor = None
    for frase in re.split(r"(?<=[.;])\s+|\n", text):
        f = frase.lower()
        if not re.search(r"crèdit|import (total|global|màxim de la convocat)|quantia (total|global)|dotaci|previst|consigna|pressupost de la convocat|conté un import|aplicació pressupostària", f): continue
        if "contracte menor" in f: continue
        for m in IMPORT.finditer(frase):
            v = int(m.group(1).replace(".", ""))
            if 100 <= v <= 50_000_000 and (millor is None or v > millor): millor = v
    return millor

def seccio_objecte(text):
    """Primera frase que diu quin és l'objecte de la convocatòria; si no n'hi ha cap de clara, None."""
    for m in re.finditer(r"[^.\n]*\b(?:l['’]objecte|per objecte|com a objecte|té per finalitat|tenen per finalitat)\b[^.\n]{20,}\.", text[:25000], re.I):
        f = m.group(0)
        if re.search(r"no en poden|requisit|registre|exclos|actuacions de comprovació|activitat objecte|destinar", f, re.I): continue
        return re.sub(r"^\s*(\d+\.|[a-z]\))\s*", "", f.strip())
    return None

def retalla(t, n=420):
    if not t or len(t) <= n: return t
    return t[:n].rsplit(" ", 1)[0].rstrip(",;:") + "…"

def ambit_titol(t):
    t = t.lower()
    for clau, amb in [(r"esport|club|deport", "esports"), (r"cultur|festes|patrimoni|música|teatre", "cultura"),
                      (r"social|urgència|vulnerab|famíli|menjador|dependència|gent gran", "social"),
                      (r"escol|alumn|estudi|beca|beques|educa|llibres|joves|joventut", "educacio"),
                      (r"comer|empres|autònom|turisme|emprened|activitats econòmiques", "economia"), (r"agr|ramad|pesca|rural|pagès", "agricultura"),
                      (r"habitatge|lloguer|rehabilita|façan|aclarit|emblanquin", "habitatge"), (r"medi ambient|energ|fotovolta|residu|sostenib", "medi"),
                      (r"cooperaci|solidari", "cooperacio"), (r"ocupaci|treball|contractaci", "ocupacio")]:
        if re.search(clau, t): return amb
    return "altres"

def benef_titol(t):
    t = t.lower(); b = set()
    if re.search(r"entitats|associacions|clubs|ànim de lucre|apima|ampa", t): b.add("entitats")
    if re.search(r"empres|comer|autònom|establiments", t): b.add("empreses")
    if re.search(r"persones|famíli|alumn|estudiants|joves|beques|beca|prestacions|particular|veïns", t): b.add("particulars")
    return sorted(b) or ["altres"]

def benef(titol, cos):
    b = benef_titol(titol)
    return b if b != ["altres"] else benef_titol(cos[:2500])

URGENCIA = re.compile(r"urgència|emergència|caràcter social|vulnerabilitat", re.I)

def converteix(clau, e, avui):
    pub = dt.date.fromisoformat(e["data"])
    text = text_pla(get(e["url"]))
    i = text.find(e["titol"][:40]); cos = text[i:] if i >= 0 else text
    fi, frase_fi = termini(cos, pub)
    return {
        "id": f"boib-{e['num'].replace('/', '-')}-{e['edicte']}",
        "titol": re.sub(r"\s+", " ", e["titol"]).strip(),
        "titol_es": None,
        "organisme": clau,
        "ambit": ambit_titol(e["titol"]),
        "finalitat": None,
        "beneficiaris": benef(e["titol"], cos),
        "import": import_total(cos),
        "import_aprox": True,
        "maxim": None,
        "publicada": e["data"],
        "inici": (pub + dt.timedelta(days=1)).isoformat() if fi else None,
        "fi": fi.isoformat() if fi else None,
        "fi_aprox": bool(fi),
        "text_inici": None,
        "text_fi": retalla(frase_fi, 300),
        # ajuts d'urgència social: oberts tot l'any de la convocatòria
        "obert_bdns": (not fi) and bool(URGENCIA.search(e["titol"])) and pub.year == avui.year,
        "tipus": "Publicat al BOIB",
        "directa": False,
        "resum": retalla(seccio_objecte(cos)),
        "requisits": [],
        "url": e["url"],
        "pdf": e["pdf"],
        "bases": None,
        "seu": None,
        "bdns": None,
        "bdns_url": None,
        "boib": e["num"],
        "font": "boib",
    }

def carrega():
    raw = open(DATA, encoding="utf-8").read()
    cap, cos = raw.split("window.SM_DATA = ", 1)
    return cap, json.loads(cos.rstrip().rstrip(";"))

def desa(cap, dades):
    with open(DATA, "w", encoding="utf-8") as f:
        f.write(cap + "window.SM_DATA = " + json.dumps(dades, ensure_ascii=False, indent=1) + ";\n")

def executa(des, fins):
    avui = dt.date.today()
    nous = []
    for clau, nom in ORGS_BOIB.items():
        edictes = cerca_completa(nom, des, fins)
        propis = [e for e in edictes if e["org"].lower().startswith(nom.lower())]
        ajuts = [e for e in propis if es_ajut(e["titol"])]
        print(f"BOIB {nom:<28} {len(propis):>4} edictes, {len(ajuts):>3} d'ajuts", file=sys.stderr)
        for e in ajuts:
            nous.append(converteix(clau, e, avui))
            time.sleep(0.4)
    return dedup(nous)

def paraules(t):
    return {w for w in re.findall(r"\w{4,}", t.lower())}

def dedup(convs):
    """El BOIB sovint publica l'aprovació i després les bases de la mateixa convocatòria:
    si dues entrades del mateix organisme tenen el mateix termini i títols molt semblants,
    en deixam només la més recent."""
    convs = sorted(convs, key=lambda c: c["publicada"], reverse=True)
    fora = []
    for c in convs:
        if any(k["organisme"] == c["organisme"] and k["fi"] and k["fi"] == c["fi"]
               and len(paraules(k["titol"]) & paraules(c["titol"])) / max(1, len(paraules(k["titol"]) | paraules(c["titol"]))) > 0.45
               for k in fora):
            continue
        fora.append(c)
    return fora

def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--des", default="2025-01-01")
    ap.add_argument("--fins", default=dt.date.today().isoformat())
    a = ap.parse_args()
    nous = executa(dt.date.fromisoformat(a.des), dt.date.fromisoformat(a.fins))
    cap, dades = carrega()
    dades["CONVOCATORIES"] = [c for c in dades["CONVOCATORIES"] if c.get("font") != "boib"] + nous
    dades["CONVOCATORIES"].sort(key=lambda c: c.get("publicada") or "", reverse=True)
    dades["font_boib"] = {"organismes": list(ORGS_BOIB), "actualitzat": dt.date.today().isoformat()}
    desa(cap, dades)
    print(f"{len(nous)} convocatòries del BOIB afegides a data.js", file=sys.stderr)

if __name__ == "__main__":
    main()
