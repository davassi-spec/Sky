#!/usr/bin/env python3
"""Extrae contenido estructurado de la copia estática (voyager-menorca-estatico/public)
a un inventario JSON + Markdown limpio. Uso: python3 -I extract.py <public_dir> <out_dir>"""
import json, os, re, sys, html
from urllib.parse import unquote
from bs4 import BeautifulSoup, NavigableString, Tag

PUB, OUT = sys.argv[1], sys.argv[2]
SKIP_ROOT = re.compile(r"^(\.|public)?/?((ca|en|fr)/)?(wp-|img)")
DROP_CLASSES = ("elementor-widget-loop-grid", "elementor-location-header", "elementor-location-footer", "cmplz", "wpcf7", "elementor-form", "elementor-widget-share-buttons",
                "elementor-widget-post-navigation", "elementor-widget-breadcrumbs", "elementor-widget-nav-menu", "elementor-widget-wpml-language-switcher")

def clean(t):
    return re.sub(r"[ \t ]+", " ", t.replace("​", "")).strip()

def inline(node, base):
    """Convierte hijos inline a Markdown."""
    out = []
    for c in node.children:
        if isinstance(c, NavigableString):
            out.append(str(c))
        elif isinstance(c, Tag):
            n = c.name
            if n in ("script", "style", "svg", "noscript"): continue
            if n == "br": out.append("  \n"); continue
            txt = inline(c, base)
            if n in ("strong", "b") and txt.strip(): out.append("**" + txt.strip() + "**")
            elif n in ("em", "i") and txt.strip(): out.append("*" + txt.strip() + "*")
            elif n == "a" and c.get("href") and txt.strip():
                href = c["href"].strip()
                out.append(f"[{txt.strip()}]({href})")
            elif n == "img": out.append("")
            else: out.append(txt)
    return re.sub(r"[ \t]+", " ", "".join(out))

def img_info(tag):
    src = tag.get("data-src") or tag.get("data-lazy-src") or tag.get("src") or ""
    if src.startswith("data:"): return None
    ss = tag.get("srcset") or tag.get("data-srcset") or ""
    if ss:
        cands = []
        for p in ss.split(","):
            p = p.strip().split(" ")
            if len(p) == 2 and p[1].endswith("w") and p[1][:-1].isdigit(): cands.append((int(p[1][:-1]), p[0]))
        if cands: src = max(cands)[1]
    if not src or not src.startswith("/img/") and not src.startswith("/wp-content/uploads"): return None
    return {"src": src, "alt": clean(tag.get("alt", ""))}

BG = re.compile(r"background(?:-image)?\s*:\s*[^;]*url\(\s*['\"]?([^'\")]+)")
def walk(el, base, blocks, seen_imgs):
    for c in el.children:
        if not isinstance(c, Tag): continue
        n = c.name
        bgm = BG.search(c.get("style", ""))
        if bgm and (bgm.group(1).startswith("/img/") or bgm.group(1).startswith("/wp-content/uploads")) and bgm.group(1) not in seen_imgs:
            seen_imgs.add(bgm.group(1)); blocks.append({"t": "img", "src": bgm.group(1), "alt": clean(c.get("aria-label", ""))})
        if n in ("script", "style", "noscript", "form", "nav", "svg", "iframe", "button", "select", "input"): continue
        cls = " ".join(c.get("class", []))
        if any(d in cls for d in DROP_CLASSES): continue
        if n in ("h1", "h2", "h3", "h4", "h5"):
            t = clean(inline(c, base))
            if t: blocks.append({"t": n, "x": t})
        elif n == "p":
            t = clean(inline(c, base))
            if t: blocks.append({"t": "p", "x": t})
            for im in c.find_all("img"):
                i = img_info(im)
                if i and i["src"] not in seen_imgs: seen_imgs.add(i["src"]); blocks.append({"t": "img", **i})
        elif n in ("ul", "ol"):
            items = [clean(inline(li, base)) for li in c.find_all("li", recursive=False)]
            items = [i for i in items if i]
            if items: blocks.append({"t": n, "x": items})
        elif n == "blockquote":
            t = clean(inline(c, base))
            if t: blocks.append({"t": "q", "x": t})
        elif n == "table":
            rows = [[clean(inline(td, base)) for td in tr.find_all(["td", "th"])] for tr in c.find_all("tr")]
            if rows: blocks.append({"t": "table", "x": rows})
        elif n == "img":
            i = img_info(c)
            if i and i["src"] not in seen_imgs: seen_imgs.add(i["src"]); blocks.append({"t": "img", **i})
        elif n == "a" and "elementor-button" in cls or (n == "a" and re.search(r"(btn|button|cta)", cls)):
            t = clean(inline(c, base))
            if t and c.get("href"): blocks.append({"t": "cta", "x": t, "href": c["href"]})
        elif n == "details":
            q = c.find("summary")
            for sp in (q.select(".pl") if q else []): sp.decompose()
            ans = c.select_one(".a") or c
            ap = [clean(inline(x, base)) for x in ans.find_all("p")] or [clean(inline(ans, base))]
            blocks.append({"t": "faq", "x": clean(inline(q, base)) if q else "", "a": [a for a in ap if a]})
        else:
            # contenedor (div, section, article, figure, li…): ¿tiene texto directo?
            if n in ("div", "span", "section", "article", "main", "figure", "figcaption", "li", "header", "aside", "b", "strong", "em", "small", "label") and not c.find(["h1","h2","h3","h4","p","ul","ol","img","table","blockquote","a"]):
                for dsc in c.find_all(style=BG):
                    m_ = BG.search(dsc.get("style", ""))
                    if m_ and (m_.group(1).startswith("/img/") or m_.group(1).startswith("/wp-content/uploads")) and m_.group(1) not in seen_imgs:
                        seen_imgs.add(m_.group(1)); blocks.append({"t": "img", "src": m_.group(1), "alt": clean(dsc.get("aria-label", ""))})
                kids = [k for k in c.children if isinstance(k, Tag) and k.name not in ("br", "svg", "script", "style")]
                if len(kids) >= 2 and all(clean(k.get_text(" ")) for k in kids):
                    blocks.append({"t": "row", "x": [clean(" | ".join(clean(x.get_text(" ")) for x in (k.find_all(True, recursive=False) or [k]) if clean(x.get_text(" ")))) for k in kids]})
                else:
                    t = clean(inline(c, base))
                    if t and len(t) > 1: blocks.append({"t": "p", "x": t})
            elif False: pass
            else:
                walk(c, base, blocks, seen_imgs)

def vmx_blocks(root):
    """Páginas de producto con la plantilla .vmx (tour privado Ciutadella): conserva la estructura semántica."""
    B = []
    def T(el): return clean(el.get_text(" ")) if el else ""
    for sec in root.select(".vmx section"):
        cls = (sec.get("class") or [""])[0]
        h2 = sec.find("h2")
        if cls in ("lead", "band", "faq"): continue
        if cls == "guide":
            B.append({"t": "h2", "x": T(h2)})
            for p_ in sec.find_all("p"): B.append({"t": "p", "x": T(p_)})
            sig = sec.select_one(".sig")
            if sig: B.append({"t": "q", "x": T(sig)})
            continue
        if h2: B.append({"t": "h2", "x": T(h2)})
        if cls == "intro":
            for p_ in sec.find_all("p"): B.append({"t": "p", "x": T(p_)})
            pq = sec.select_one(".pq")
            if pq: B.append({"t": "q", "x": T(pq)})
        elif cls == "see":
            for c in sec.select(".card"):
                b = c.select_one(".tx b"); m_ = BG.search((c.select_one(".ph") or {}).get("style", "") if c.select_one(".ph") else "")
                if b: B.append({"t": "h3", "x": T(b)})
                if m_: B.append({"t": "img", "src": m_.group(1), "alt": clean((c.select_one(".ph") or {}).get("aria-label", ""))})
                tp = c.select_one(".tx p")
                if tp: B.append({"t": "p", "x": T(tp)})
        elif cls == "route":
            sub = sec.select_one("p.sub")
            if sub: B.append({"t": "p", "x": T(sub)})
            for i_, st in enumerate(sec.select(".stop"), 1):
                k = st.select_one(".k"); b = st.select_one(".b b"); tp = st.select_one(".b p")
                B.append({"t": "p", "x": f"**{i_:02d} · {T(k)}**"})
                B.append({"t": "h3", "x": T(b)})
                if tp: B.append({"t": "p", "x": T(tp)})
            rf = sec.select_one(".rfoot")
            if rf: B.append({"t": "p", "x": "*" + T(rf) + "*"})
        elif cls == "incl":
            for el in sec.find_all(["p", "div"], recursive=False):
                if "sh" in (el.get("class") or []): B.append({"t": "h3", "x": T(el)})
                elif "ilist" in (el.get("class") or []):
                    B.append({"t": "ul", "x": [f"**{T(r.find('b'))}** — {T(r.find('span'))}" if r.find("span") else f"**{T(r.find('b'))}**" for r in el.select(".irow")]})
        elif cls == "fares":
            note = sec.select_one("p.note")
            if note: B.append({"t": "p", "x": T(note)})
            rows = [[T(f.select_one(".who b")), T(f.select_one(".who span")), T(f.select_one(".amt"))] for f in sec.select(".fc")]
            if rows: B.append({"t": "table", "x": rows})
    return B

def meta(soup, name=None, prop=None):
    t = soup.find("meta", attrs={"name": name} if name else {"property": prop})
    return t.get("content", "").strip() if t else ""

def parse(path_dir):
    s = open(os.path.join(PUB, path_dir, "index.html"), encoding="utf-8").read()
    soup = BeautifulSoup(s, "lxml")
    url = "/" + path_dir.strip("./") + "/" if path_dir not in (".", "") else "/"
    url = re.sub(r"/+", "/", url)
    lang = (re.match(r"^/(ca|en|fr)/", url) or [None, "es"])[1]
    alts = {}
    for l in soup.find_all("link", rel="alternate", hreflang=True):
        alts[l["hreflang"]] = l["href"]
    body = soup.body
    cls = " ".join(body.get("class", [])) if body else ""
    types = re.findall(r'data-elementor-type="([^"]+)"', s)
    kind = ("category" if "category" in cls and "archive" in cls else "blog" if " blog " in f" {cls} " else "post" if "single-post" in cls else "home" if " home " in f" {cls} " else "page")
    main = soup.find(attrs={"data-elementor-type": re.compile("^(wp-page|single-post|wp-post)$")})
    if main is None:
        main = soup.find("main") or body
        main = main  # páginas sin plantilla de Elementor
    # para posts: el contenido está en el widget theme-post-content
    pc = main.select_one(".elementor-widget-theme-post-content") if kind == "post" else None
    root = pc or main
    blocks, seen = [], set()
    walk(root, url, blocks, seen)
    h1 = soup.find("h1")
    vmx = vmx_blocks(main) if main.select_one(".vmx") else None
    d = {
        "vmx_blocks": vmx,
        "url": url, "lang": lang, "kind": kind, "alts": alts,
        "title": clean(unquote(meta(soup, prop="og:title") or (soup.title.string if soup.title else ""))),
        "h1": clean(h1.get_text(" ")) if h1 else "",
        "description": meta(soup, name="description"), "og_description": meta(soup, prop="og:description"),
        "og_image": meta(soup, prop="og:image"), "published": meta(soup, prop="article:published_time"), "modified": meta(soup, prop="article:modified_time"),
        "robots": meta(soup, name="robots"), "blocks": blocks,
        "cats": [a.get("href") for a in soup.select("a[rel~='category']")],
        "items": sorted({a["href"] for it in soup.select("[data-elementor-type='loop-item']") for a in it.find_all("a", href=True) if "#" not in a["href"]}) if kind in ("category", "blog") else [],
        "nav": [[clean(a.get_text(" ")), a["href"]] for a in (soup.select("header nav a, [data-elementor-type='header'] nav a"))][:12] if kind == "home" else [],
        "thumb": (lambda im: (im.get("data-src") or im.get("src")) if im else "")(soup.select_one("[data-elementor-type='single-post'] img.wp-post-image, .elementor-widget-theme-post-featured-image img")),
        "body_classes": cls,
    }
    # imagen destacada de posts / portada
    return d

if __name__ == "__main__":
    os.makedirs(OUT, exist_ok=True)
    inv = []
    for root, _, fs in os.walk(PUB):
        rel = os.path.relpath(root, PUB)
        if re.match(r"^((ca|en|fr)/)?(wp-|img)", rel) or "index.html" not in fs: continue
        if rel.startswith("wp-json") or "/wp-json" in rel: continue
        try: inv.append(parse(rel))
        except Exception as e: print("ERR", rel, e, file=sys.stderr)
    inv.sort(key=lambda d: d["url"])
    json.dump(inv, open(os.path.join(OUT, "inventory.json"), "w", encoding="utf-8"), ensure_ascii=False, indent=1)
    from collections import Counter
    print(len(inv), Counter(d["kind"] for d in inv))
