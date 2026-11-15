#!/usr/bin/env python3
"""Rastreador estático de voyagermenorca.com -> carpeta public/ (sin WordPress)."""
import hashlib, os, re, sys, threading, urllib.parse, urllib.request, ssl
from concurrent.futures import ThreadPoolExecutor

OUT = sys.argv[1]
PAGES = [l.strip() for l in open(sys.argv[2]) if l.strip()]
HOST = "voyagermenorca.com"
CDN = re.compile(r"^(?:i[0-2]\.wp\.com)$")
UA = {"User-Agent": "Mozilla/5.0 (static-mirror for site owner)"}
ctx = ssl.create_default_context()
lock = threading.Lock()
done, failed = {}, {}

def fetch(url, tries=4):
    for i in range(tries):
        try:
            req = urllib.request.Request(url, headers=UA)
            with urllib.request.urlopen(req, timeout=40, context=ctx) as r:
                return r.read(), r.headers.get("Content-Type", "")
        except Exception as e:
            err = str(e)
    failed[url] = err
    return None, ""

def local_for(url):
    """URL absoluta -> ruta pública local (o None si no se descarga)."""
    u = urllib.parse.urlsplit(url)
    host = u.netloc.lower()
    if host in (HOST, "www." + HOST):
        path = urllib.parse.unquote(u.path) or "/"
        if path.endswith("/") or not os.path.splitext(path)[1]:
            return None  # es una página (o ruta sin extensión)
        if u.query and not re.search(r"\.(css|js)$", path):
            h = hashlib.md5(u.query.encode()).hexdigest()[:8]
            base, ext = os.path.splitext(path)
            return f"{base}.{h}{ext}"
        return path
    if CDN.match(host):
        path = urllib.parse.unquote(u.path)  # /voyagermenorca.com/wp-content/uploads/...
        base, ext = os.path.splitext(path)
        h = hashlib.md5((u.query or "").encode()).hexdigest()[:8]
        return f"/img{base}.{h}{ext or '.jpg'}"
    return None

URL_RE = re.compile(r"""(?:https?:)?(?:\\?/\\?/)(?:www\.)?(?:voyagermenorca\.com|i[0-2]\.wp\.com)[^\s"'<>)\\]*(?:\\/[^\s"'<>)\\]*)*""")

def norm(raw):
    s = raw.replace("\\/", "/").replace("&#038;", "&").replace("&amp;", "&")
    if s.startswith("//"):
        s = "https:" + s
    return s.replace("http://", "https://")

def download(url):
    lp = local_for(url)
    if not lp:
        return
    with lock:
        if lp in done:
            return
        done[lp] = url
    data, ctype = fetch(url)
    if data is None:
        return
    dest = os.path.join(OUT, lp.lstrip("/"))
    if os.path.isfile(dest) and os.path.getsize(dest) > 0 and not lp.endswith(".css"):
        return
    os.makedirs(os.path.dirname(dest), exist_ok=True)
    if lp.endswith(".css") or "text/css" in ctype:
        data = process_css(data.decode("utf-8", "replace"), url).encode()
    with open(dest, "wb") as f:
        f.write(data)

def process_css(css, base):
    def sub(m):
        raw = m.group(2)
        if raw.startswith("data:"):
            return m.group(0)
        absu = urllib.parse.urljoin(base, norm(raw))
        lp = local_for(absu)
        if not lp:
            return m.group(0)
        download(absu)
        return f"url({m.group(1)}{lp}{m.group(1)})"
    return re.sub(r"url\((['\"]?)([^)'\"]+)\1\)", sub, css)

def rewrite_text(text, collected):
    def sub(m):
        raw = m.group(0)
        esc = "\\/" in raw
        url = norm(raw)
        u = urllib.parse.urlsplit(url)
        lp = local_for(url)
        if lp:
            collected.append(url)
            res = lp
        elif u.netloc.lower() in (HOST, "www." + HOST):
            res = urllib.parse.unquote(u.path) or "/"
            if not res.endswith("/") and not os.path.splitext(res)[1]:
                res += "/"
            if u.fragment:
                res += "#" + u.fragment
        else:
            return raw
        return res.replace("/", "\\/") if esc else res
    return URL_RE.sub(sub, text)

def page_dest(url):
    path = urllib.parse.urlsplit(url).path
    return os.path.join(OUT, path.lstrip("/"), "index.html")

def do_page(url):
    try:
        _do_page(url)
    except Exception as e:
        failed[url] = repr(e)

def _do_page(url):
    data, _ = fetch(url)
    if data is None:
        return
    html = data.decode("utf-8", "replace")
    assets = []
    html = rewrite_text(html, assets)
    # srcset de i0.wp.com ya cubierto por URL_RE; descarga recursos
    for a in set(assets):
        download(a)
    dest = page_dest(url)
    os.makedirs(os.path.dirname(dest), exist_ok=True)
    with open(dest, "w", encoding="utf-8") as f:
        f.write(html)

if __name__ == "__main__":
    os.makedirs(OUT, exist_ok=True)
    with ThreadPoolExecutor(6) as ex:
        list(ex.map(do_page, PAGES))
    with open(os.path.join(OUT, "..", "crawl-report.txt"), "w") as f:
        f.write(f"paginas: {len(PAGES)}\nrecursos: {len(done)}\nfallos: {len(failed)}\n")
        for u, e in failed.items():
            f.write(f"{u}\t{e}\n")
    print("paginas", len(PAGES), "recursos", len(done), "fallos", len(failed))
