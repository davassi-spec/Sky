#!/usr/bin/env python3
"""Convierte tools/_data/inventory.json (extraído de la copia de WordPress) en contenido
propio del sitio nuevo: src/content/{pages,posts}/<lang>/*.md, src/data/*.json y src/images/*.
Uso (desde la raíz del proyecto): python3 -I tools/build_content.py"""
import json, os, re, shutil, sys, unicodedata, collections
from PIL import Image

ROOT = os.getcwd()
INV = json.load(open("tools/_data/inventory.json", encoding="utf-8"))
LEGACY = "legacy/public"
OUT_IMG = "src/images"
LANGS = ["es", "ca", "en", "fr"]
BY_URL = {d["url"]: d for d in INV}

# ---------- imágenes ----------
def stem_of(p):
    b = os.path.basename(p.split("?")[0])
    b = re.sub(r"\.[0-9a-f]{8}(?=\.[a-z0-9]+$)", "", b)
    b = re.sub(r"-\d+x\d+(?=\.[a-z0-9]+$)", "", b)
    b = re.sub(r"-scaled(?=\.[a-z0-9]+$)", "", b)
    return os.path.splitext(b)[0]

def slug(s):
    s = unicodedata.normalize("NFKD", s).encode("ascii", "ignore").decode()
    return re.sub(r"[^a-z0-9]+", "-", s.lower()).strip("-")

_cands = collections.defaultdict(list)
for base in ("wp-content/uploads", "img"):
    for r, _, fs in os.walk(os.path.join(LEGACY, base)):
        for f in fs:
            if re.search(r"\.(jpe?g|png|webp|gif|svg|avif)$", f, re.I):
                _cands[slug(stem_of(f))].append(os.path.join(r, f))
_resolved = {}
def image(ref):
    """Ruta original (legacy) -> '/images/<nombre>' (copia el archivo de mayor resolución)."""
    if not ref: return ""
    ref = ref.split("?")[0]
    k = slug(stem_of(ref))
    if k in _resolved: return _resolved[k]
    files = _cands.get(k)
    if not files: _resolved[k] = ""; return ""
    def area(p):
        if p.endswith(".svg"): return os.path.getsize(p)
        try:
            with Image.open(p) as im: return im.width * im.height
        except Exception: return 0
    best = max(files, key=lambda p: (area(p), os.path.getsize(p)))
    ext = os.path.splitext(best)[1].lower()
    name = k[:80] + ext
    os.makedirs(OUT_IMG, exist_ok=True)
    shutil.copyfile(best, os.path.join(OUT_IMG, name))
    _resolved[k] = "/images/" + name
    return _resolved[k]

# ---------- utilidades ----------
def fm(d):
    return "---\n" + json.dumps(d, ensure_ascii=False, indent=1).strip("{}\n").replace('\n ', '\n') + "\n---\n"

def yaml_fm(d):
    """Frontmatter YAML simple pero válido (JSON es YAML)."""
    lines = []
    for k, v in d.items():
        if v in (None, "", [], {}): continue
        lines.append(f"{k}: {json.dumps(v, ensure_ascii=False)}")
    return "---\n" + "\n".join(lines) + "\n---\n"

def slug_of(url):
    s = re.sub(r"^/(ca|en|fr)/", "/", url).strip("/")
    return s or "home"

def tkey(d):
    alts = d.get("alts", {})
    return slug_of(alts.get("es") or d["url"]).replace("/", "__") if alts.get("es") or True else ""

def is_code(b):
    if len(b) < 40: return False
    low = b.lower()
    return (("{" in b and b.count(";") >= 2 and ("!important" in b or "elementor" in low or "@media" in low or re.search(r"[.#][\w-]+\s*\{", b))) or "document.addeventlistener" in low or low.startswith(("function(", "(function", "var ", "window.")))

JUNK = re.compile(r"(Gestionar el consentimiento|Gestionar las opciones|Gestionar los servicios|Ver preferencias|Manage consent|Gérer le consentement|Gestiona el consentiment)", re.I)
BOOK_H2 = re.compile(r"^(Solicita tu reserva|Request your booking|Demande de réservation|Sol·licita la teva reserva|Reserva ahora)", re.I)
STAR = re.compile(r"^★+$")

def esc_md(t): return t

def md_blocks(blocks):
    out, i = [], 0
    chk = []
    kick = {i for i, b in enumerate(blocks[:-1]) if b["t"] == "p" and len(b["x"]) <= 38 and not re.search(r"[.!?:]$", b["x"]) and blocks[i + 1]["t"] == "h2"}
    blocks = [b for i, b in enumerate(blocks) if i not in kick]
    def flush():
        nonlocal chk
        if chk: out.append("\n".join("- " + c for c in chk)); chk = []
    for b in blocks:
        t = b["t"]
        if t == "p":
            x = b["x"]
            if x.startswith(("✓ ", "✔ ")): chk.append(x[2:].strip()); continue
            flush()
            if JUNK.search(x) or is_code(x): continue
            out.append(x)
        else:
            flush()
            if t in ("h1", "h2"): out.append("## " + b["x"])
            elif t in ("h3", "h4", "h5"): out.append("### " + b["x"])
            elif t == "ul": out.append("\n".join("- " + x for x in b["x"]))
            elif t == "ol": out.append("\n".join(f"{n+1}. {x}" for n, x in enumerate(b["x"])))
            elif t == "q": out.append("> " + b["x"])
            elif t == "img":
                p = image(b["src"])
                if p: out.append(f"![{b.get('alt','')}]({p})")
            elif t == "table":
                rows = b["x"]
                if rows:
                    w = max(len(r) for r in rows)
                    rows = [r + [""] * (w - len(r)) for r in rows]
                    out.append("| " + " | ".join(rows[0]) + " |\n|" + "---|" * w + "\n" + "\n".join("| " + " | ".join(r) + " |" for r in rows[1:]))
            elif t == "row": out.append(" · ".join(x.replace(" | ", " — ") for x in b["x"]))
            elif t == "cta": out.append(f"[{b['x']}]({b['href']})")
            elif t == "faq": pass
    flush()
    return "\n\n".join(out)

def split_facts(item):
    """'**2 horas**duración' | '2 horas | Duración' -> (valor, etiqueta)."""
    if " | " in item:
        a, b = item.split(" | ", 1); return {"value": a.strip(), "label": b.strip()}
    m = re.match(r"\*\*(.+?)\*\*(.*)$", item)
    if m: return {"value": m.group(1).strip(), "label": m.group(2).strip()}
    return {"value": item.strip(), "label": ""}

def glued_facts(x):
    parts = re.findall(r"\*\*(.+?)\*\*([^*]*)", x)
    return [{"value": a.strip(), "label": b.strip()} for a, b in parts] if len(parts) >= 2 else None

def tour_parse(d):
    """Extrae hero/ficha de una página de producto y devuelve (meta, bloques_restantes)."""
    bl = list(d["blocks"]); meta = {}
    h1i = next((i for i, b in enumerate(bl) if b["t"] == "h1"), None)
    if h1i is None: return {}, bl
    # eyebrow = párrafo corto previo (sin '/' del contador del carrusel)
    eyebrow = ""
    for j in range(h1i - 1, -1, -1):
        if bl[j]["t"] == "p" and 3 < len(bl[j]["x"]) < 60 and not re.search(r"\d\s*/\s*\d", bl[j]["x"]): eyebrow = bl[j]["x"]; break
    meta["eyebrow"] = eyebrow
    meta["h1"] = bl[h1i]["x"]
    used = set(range(0, h1i + 1))
    intro, facts, price = [], [], None
    j = h1i + 1
    while j < len(bl) and bl[j]["t"] != "h2":
        b = bl[j]
        if b["t"] == "p":
            g = glued_facts(b["x"])
            if g and not facts: facts = g; used.add(j)
            elif re.match(r"^\*\*Con ", b["x"]) : used.add(j)
            elif re.search(r"\d+\s*/\s*\d+$", b["x"]) : used.add(j)
            elif b["x"].startswith("Completo") or b["x"].startswith("★"): meta.setdefault("badge", b["x"]); used.add(j)
            elif len(b["x"]) > 50 and len(intro) < 2: intro.append(b["x"]); used.add(j)
            elif len(b["x"]) <= 50 and not facts and not intro: meta.setdefault("tagline", b["x"]); used.add(j)
        elif b["t"] == "row":
            it = b["x"]
            if it and it[0].lower() in ("desde", "from", "à partir de", "a partir de", "des de") and len(it) >= 2: price = {"from": True, "amount": it[1], "note": it[2] if len(it) > 2 else ""}; used.add(j)
            elif any(re.match(r"^★", x) for x in it): used.add(j)
            elif not facts and len(it) >= 2 and all(" | " in x or len(x) < 40 for x in it): facts = [split_facts(x) for x in it]; used.add(j)
            else: used.add(j)
        elif b["t"] in ("cta", "img"): used.add(j)
        j += 1
    # confianza (row 4 items) dentro de la zona previa al primer h2 ya consumida
    meta["intro"] = intro; meta["facts"] = facts
    if price is None:
        for f in facts:
            if "€" in f["value"]: price = {"from": False, "amount": f["value"], "note": f["label"]}; break
    if price: meta["price"] = price
    rest = [b for i, b in enumerate(bl) if i not in used]
    # FAQ
    meta["faq"] = [{"q": b["x"], "a": b["a"]} for b in rest if b["t"] == "faq"]
    rest = [b for b in rest if b["t"] != "faq"]
    # reseñas: ★★★★★ + texto + 'Reseña…'
    rv, k, keep = [], 0, []
    while k < len(rest):
        b = rest[k]
        if b["t"] == "p" and STAR.match(b["x"]) and k + 1 < len(rest) and rest[k + 1]["t"] == "p" and len(rest[k + 1]["x"]) > 60:
            rv.append({"text": rest[k + 1]["x"]}); k += 3 if k + 2 < len(rest) and re.search(r"(Google|reseña|review|avis)", rest[k + 2]["x"], re.I) else 2; continue
        keep.append(b); k += 1
    meta["reviews"] = rv; rest = keep
    REV_H = re.compile(r"^(Lo que dicen|What (our )?(travell?ers|guests|clients)|Ce que disent|Què diuen|Opiniones|Reviews)", re.I)
    FAQ_H = re.compile(r"^(Preguntas frecuentes|Frequently asked|Questions fréquentes|Preguntes freqüents|FAQ)", re.I)
    rest = [b for b in rest if not (b["t"] == "h2" and ((rv and REV_H.match(b["x"])) or (meta["faq"] and FAQ_H.match(b["x"]))))]
    rest = [b for b in rest if not (b["t"] == "p" and re.match(r"^★+\s*\*\*?\d", b["x"]))]
    # quitar bloque de reserva/formulario/relacionados
    out, skip = [], False
    for b in rest:
        if b["t"] == "h2" and BOOK_H2.match(b["x"]): skip = True; continue
        if skip:
            if b["t"] == "ul" and any("24" in x for x in b["x"]): continue
            if b["t"] == "p" and re.search(r"(directamente|directly|directement|directament)", b["x"], re.I): continue
            if b["t"] == "p" and re.match(r"^(Sigue descubriendo|Keep discovering|Continuez|Continua)", b["x"], re.I): break
            if b["t"] in ("h2", "h3"): skip = False
            else: continue
        out.append(b)
    # quitar CTA/teaser final "Sigue descubriendo…"
    for idx, b in enumerate(out):
        if b["t"] == "p" and re.match(r"^(Sigue descubriendo|Keep discovering|Continuez à découvrir|Continua descobrint)", b["x"], re.I): out = out[:idx]; break
    return meta, out

# ---------- clasificación ----------
TOUR_ES = ["/tour-privado-por-ciutadella/", "/visita-guiada-privada-de-mahon/", "/excursion-talayotica-menorca/", "/free-tour-ciutadella/", "/eclipse-solar-total-menorca-12-agosto-2026/"]
tour_keys = {slug_of(u): i for i, u in enumerate(TOUR_ES)}
def key_of(d):
    es = d["alts"].get("es")
    return slug_of(es if es else d["url"])

def canonical_map(kinds):
    """(lang,key) -> url canónica. Si WPML dejó duplicados, manda la que enlaza el original en español (hreflang)."""
    groups = collections.defaultdict(list)
    for d in INV:
        if d["kind"] in kinds: groups[(d["lang"], key_of(d))].append(d)
    canon, redirects = {}, {}
    for (lang, key), ds in groups.items():
        es = next((x for x in ds if x["lang"] == "es"), None)
        pref = None
        for x in INV:
            if x["lang"] == "es" and key_of(x) == key and x["kind"] in kinds and x["alts"].get(lang): pref = x["alts"][lang]; break
        pick = next((x for x in ds if x["url"] == pref), None) or ds[0]
        canon[(lang, key)] = pick["url"]
        for x in ds:
            if x["url"] != pick["url"]: redirects[x["url"]] = pick["url"]
    return canon, redirects

_REDIR = {}
def fix_links(text):
    return re.sub(r"\]\((/[^)\s#]*)", lambda m: "](" + _REDIR.get(m.group(1), m.group(1)), text)

def main():
    canon, REDIR = canonical_map(("page", "home", "post"))
    _REDIR.update(REDIR)
    os.makedirs("src/content/pages", exist_ok=True); os.makedirs("src/content/posts", exist_ok=True); os.makedirs("src/data", exist_ok=True)
    for sub in ("pages", "posts"):
        for l in LANGS: os.makedirs(f"src/content/{sub}/{l}", exist_ok=True)
    stats = collections.Counter()
    post_urls = {d["url"] for d in INV if d["kind"] == "post"}
    # categorías
    cats = {}; membership = collections.defaultdict(set)
    for d in INV:
        if d["kind"] == "category":
            base = re.sub(r"page/\d+/$", "", d["url"])
            if base not in cats:
                name = d["h1"] or re.sub(r"\s*[-|–]\s*Voyager.*$", "", d["title"])
                cats[base] = {"url": base, "lang": d["lang"], "name": name, "alts": {k: v for k, v in d["alts"].items() if k in LANGS}}
            for it in d["items"]: membership[it].add(base)
    json.dump(sorted(cats.values(), key=lambda c: c["url"]), open("src/data/categories.json", "w", encoding="utf-8"), ensure_ascii=False, indent=1)
    # blog index (todas las páginas) -> url de los posts por orden
    blog_roots = {d["url"] for d in INV if d["kind"] == "blog" and not re.search(r"page/\d+/$", d["url"])}
    # --- posts
    ONLY = os.environ.get("ONLY_TOURS")
    for d in INV:
        if ONLY or d["kind"] != "post": continue
        if canon[(d["lang"], key_of(d))] != d["url"]: stats["post_dup"] += 1; continue
        fmv = {"url": d["url"], "lang": d["lang"], "translationKey": key_of(d), "title": d["h1"] or d["title"], "seoTitle": d["title"],
               "description": d["description"] or d["og_description"], "date": (d["published"] or "")[:10], "updated": (d["modified"] or "")[:10],
               "image": image(d["og_image"] or d["thumb"] or ""), "categories": sorted(membership.get(d["url"], []))}
        body = md_blocks(d["blocks"])
        slug_ = slug_of(d["url"])
        open(f"src/content/posts/{d['lang']}/{slug_}.md", "w", encoding="utf-8").write(yaml_fm(fmv) + "\n" + fix_links(body) + "\n"); stats["post"] += 1
    # --- páginas
    home = {}
    for d in INV:
        if d["kind"] not in ("page", "home"): continue
        if "login-customizer" in d["url"] or "personalizador" in d["url"] or "personnalisateur" in d["url"]: stats["omitida"] += 1; REDIR[d["url"]] = ("/" if d["lang"] == "es" else f"/{d['lang']}/"); continue
        if canon[(d["lang"], key_of(d))] != d["url"]: stats["page_dup"] += 1; continue
        k = key_of(d); is_tour = k in tour_keys
        if ONLY and not is_tour: continue
        fmv = {"url": d["url"], "lang": d["lang"], "translationKey": k, "seoTitle": d["title"], "description": d["description"] or d["og_description"],
               "image": image(d["og_image"]), "noindex": bool(re.search(r"noindex", d["robots"] or ""))}
        if d["kind"] == "home":
            home[d["lang"]] = d; fmv.update({"template": "home", "title": d["title"]}); body = ""
        elif is_tour:
            meta, rest = tour_parse(d)
            fmv.update({"template": "tour", "tourOrder": tour_keys[k], "title": meta.get("h1") or d["h1"] or d["title"]})
            for kk in ("eyebrow", "tagline", "badge", "intro", "facts", "price", "faq", "reviews"):
                if meta.get(kk): fmv[kk] = meta[kk]
            imgs = [image(b["src"]) for b in d["blocks"] if b["t"] == "img"]
            fmv["gallery"] = [x for x in dict.fromkeys(imgs) if x and "daniel-vaquera" not in x][:6]
            if "price" not in fmv:
                m_ = re.search(r"(?:Desde|From|À partir de|A partir de|Des de)\s+([\d.,]+\s?€)", d["description"] or "", re.I)
                if m_: fmv["price"] = {"from": True, "amount": m_.group(1), "note": ""}
            if d.get("vmx_blocks"): rest = d["vmx_blocks"]
            body = md_blocks(rest)
        else:
            tpl = {"excursiones": "excursiones", "contacto": "contacto", "quienes-somos": "about"}.get(k, "page")
            bl = [b for b in d["blocks"] if not (b["t"] == "h1" and False)]
            faq = [{"q": b["x"], "a": b["a"]} for b in bl if b["t"] == "faq"]
            fmv.update({"template": tpl, "title": d["h1"] or re.sub(r"\s*[|–-]\s*Voyager.*$", "", d["title"])})
            if faq: fmv["faq"] = faq
            body = md_blocks([b for b in bl if b["t"] not in ("h1",) or tpl == "page" and False])
        slug_ = slug_of(d["url"]) if d["kind"] != "home" else "home"
        open(f"src/content/pages/{d['lang']}/{slug_.replace('/', '__')}.md", "w", encoding="utf-8").write(yaml_fm(fmv) + "\n" + fix_links(body) + "\n"); stats["page"] += 1
    if ONLY: print(dict(stats)); return
    # --- home como datos estructurados
    H = {}
    for lang, d in home.items():
        b = d["blocks"]
        if len(b) < 48: stats["home_corta_" + lang] += 1; continue
        g = lambda i: b[i].get("x", "")
        stats_row = glued_facts(g(7)) or []
        H[lang] = {
            "heroEyebrow": g(0), "heroTitle": g(1), "heroLede": g(2), "heroImage": image(b[4].get("src", "")), "heroCardTitle": (b[5]["x"][0] if b[5]["t"] == "row" else ""), "heroCardSub": (b[5]["x"][1] if b[5]["t"] == "row" else ""),
            "stats": stats_row, "toursKicker": g(8), "toursTitle": g(9), "toursLede": g(10), "toursLink": re.sub(r"\]\(.*", "", g(11)).lstrip("["),
            "cards": [{"image": image(b[12 + 5 * n].get("src", "")), "kicker": g(13 + 5 * n), "title": g(14 + 5 * n), "text": g(15 + 5 * n), "badge": g(16 + 5 * n)} for n in range(3)],
            "guideImage": image(b[27].get("src", "")), "guideKicker": g(28), "guideQuote": g(29), "guideText": [g(30), g(31)], "guideLink": re.sub(r"\]\(.*", "", g(32)).lstrip("["),
            "stepsKicker": g(33), "stepsTitle": g(34), "stepsLede": g(35), "steps": [{"title": g(37 + 3 * n), "text": g(38 + 3 * n)} for n in range(3)],
            "ctaKicker": g(45), "ctaTitle": g(46), "ctaText": g(47), "ctaImage": image(b[48].get("src", "")) if len(b) > 48 else "",
        }
    json.dump(H, open("src/data/home.json", "w", encoding="utf-8"), ensure_ascii=False, indent=1)
    nav = {l: [x for x in d["nav"] if x[0]][:6] for l, d in home.items()}
    json.dump(nav, open("src/data/nav.json", "w", encoding="utf-8"), ensure_ascii=False, indent=1)
    # inventario de URLs (para pruebas y redirecciones)
    inv_urls = sorted(d["url"] for d in INV)
    json.dump(inv_urls, open("src/data/legacy-urls.json", "w", encoding="utf-8"), ensure_ascii=False, indent=0)
    json.dump(REDIR, open("src/data/redirects.json", "w", encoding="utf-8"), ensure_ascii=False, indent=1)
    print(dict(stats), "imágenes:", len(_resolved))

main()
