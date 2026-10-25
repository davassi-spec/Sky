#!/usr/bin/env python3
"""Actualiza en apps-script/Admin.html las miniaturas de las distribuciones con diseño propio (MINI_DIST) a partir de capturas de la tele.

Las capturas salen de los tests de la app:  cd madre/app-tv && gradle testDebugUnitTest -Dcapturas.dir=/tmp/caps
Uso:  python3 madre/web-app/hacer-miniaturas.py /tmp/caps      (usa  t7-<id>-solo-hora-y-tiempo.png  de cada diseño)
Después:  python3 madre/web-app/construir.py
"""
import base64, io, json, os, re, sys
from PIL import Image

AQUI = os.path.dirname(os.path.abspath(__file__))
ADMIN = os.path.join(AQUI, '..', 'apps-script', 'Admin.html')
IDS = ['banda', 'mosaico', 'bloques', 'lateral', 'titular', 'marco', 'limpia']

def main(carpeta):
    s = open(ADMIN, encoding='utf-8').read()
    m = re.search(r'var MINI_DIST = (\{.*?\});\n', s, re.S)
    mini = json.loads(m.group(1))
    for i in IDS:
        im = Image.open(os.path.join(carpeta, 't7-%s-solo-hora-y-tiempo.png' % i)).convert('RGB').resize((384, 216), Image.LANCZOS)
        b = io.BytesIO()
        im.save(b, 'JPEG', quality=80, optimize=True)
        mini[i] = 'data:image/jpeg;base64,' + base64.b64encode(b.getvalue()).decode()
    nuevo = 'var MINI_DIST = ' + json.dumps(mini, ensure_ascii=False) + ';\n'
    open(ADMIN, 'w', encoding='utf-8').write(s[:m.start()] + nuevo + s[m.end():])
    print('miniaturas actualizadas:', ', '.join(IDS))

if __name__ == '__main__':
    if len(sys.argv) != 2:
        sys.exit(__doc__)
    main(sys.argv[1])
