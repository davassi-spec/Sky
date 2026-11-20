#!/usr/bin/env python3
"""
Descarrega de la BDNS les subvencions JA CONCEDIDES pel Consell Insular de
Menorca i pels ajuntaments de l'illa, i genera ../concessions.js.

Ús:
    python3 tools/actualitzar_concessions.py                 # des de 2025 fins avui
    python3 tools/actualitzar_concessions.py --des 2023-01-01

Privacitat: de les persones jurídiques (entitats, empreses, administracions)
es desa el NIF i el nom tal com els publica la BDNS. De les persones físiques
NO es desa ni el nom ni el NIF: només l'import, la data i la convocatòria,
perquè la web en mostri el total agregat.

Font: Sistema Nacional de Publicidad de Subvenciones y Ayudas Públicas (BDNS).
Avís legal de reutilització: https://www.infosubvenciones.es/bdnstrans/GE/es/avisolegal
"""
import argparse, datetime as dt, json, os, re, sys, time

AQUI = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, AQUI)
from actualitzar_bdns import ORGANISMES, get, net_titol  # noqa: E402

NIF_JURIDICA = re.compile(r"^[A-HJNP-SUVW]\d{7}[0-9A-J]$", re.I)

def separa(beneficiari):
    """'G07207996 ASOC DE …' → ('G07207996', 'ASOC DE …', 'e'); persones físiques → (None, None, 'p')."""
    b = (beneficiari or "").strip()
    nif, _, nom = b.partition(" ")
    if NIF_JURIDICA.match(nif):
        return nif.upper(), re.sub(r"\s+", " ", nom).strip(" ."), "e"
    return None, None, "p"

def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--des", default="2025-01-01")
    ap.add_argument("--fins", default=dt.date.today().isoformat())
    ap.add_argument("--sortida", default=os.path.join(AQUI, "..", "concessions.js"))
    a = ap.parse_args()
    fmt = lambda s: dt.date.fromisoformat(s).strftime("%d/%m/%Y")

    files, convs = [], {}
    for clau, org in ORGANISMES.items():
        n, pag = 0, 0
        while True:
            r = get("concesiones/busqueda", vpd="GE", page=pag, pageSize=1000, organos=org["bdns"],
                    fechaDesde=fmt(a.des), fechaHasta=fmt(a.fins))
            for c in r["content"]:
                nif, nom, tipus = separa(c.get("beneficiario"))
                num = c.get("numeroConvocatoria")
                if num and num not in convs:
                    convs[num] = {"t": net_titol(c.get("descripcionCooficial") or c.get("convocatoria")),
                                  "te": net_titol(c.get("convocatoria")), "o": clau, "u": c.get("urlBR")}
                files.append({"d": c.get("fechaConcesion"), "o": clau, "k": tipus,
                              "n": nom, "f": nif, "i": round(c.get("importe") or 0, 2), "c": num})
                n += 1
            if r.get("last", True): break
            pag += 1
            time.sleep(0.5)
        print(f"{org['curt']:<16} {n:>5} concessions", file=sys.stderr)

    files.sort(key=lambda x: x["d"] or "", reverse=True)
    dades = {"actualitzat": dt.date.today().isoformat(), "periode": [a.des, a.fins],
             "font": "BDNS · concessions", "convocatories": convs, "concessions": files}
    with open(a.sortida, "w", encoding="utf-8") as f:
        f.write("/* Generat per tools/actualitzar_concessions.py — no editar a mà.\n"
                "   Font: BDNS (www.infosubvenciones.es). Les persones físiques es desen sense nom ni NIF. */\n")
        f.write("window.SM_CONC = " + json.dumps(dades, ensure_ascii=False, separators=(",", ":")) + ";\n")
    e = sum(1 for x in files if x["k"] == "e")
    print(f"{len(files)} concessions ({e} a entitats, {len(files)-e} a persones físiques) → {os.path.normpath(a.sortida)}", file=sys.stderr)

if __name__ == "__main__":
    main()
