#!/usr/bin/env python3
"""Captura todas las vistas del panel y las junta en montajes. Uso: todas.py carpeta_salida"""
import subprocess, sys, os, urllib.parse
from PIL import Image, ImageDraw
sal = sys.argv[1]; os.makedirs(sal, exist_ok=True)
Q = urllib.parse.quote
VISTAS = [
  ('inicio', 'ir(\'inicio\')', '', 900), ('mensajes', 'ir(\'mensajes\')', '', 1500), ('caducados', "pestanaMsg='caducados'; ir('mensajes')", '', 1100),
  ('mas', 'ir(\'mas\')', '', 560), ('pantalla', 'ir(\'pantalla\')', '', 1900), ('cuentas', 'ir(\'cuentas\')', '', 700),
  ('cuenta', "cuentaEditando=Object.assign({},S.datos.cuentasAtras[0]); ir('cuenta')", '', 1250), ('familia', 'ir(\'familia\')', '', 1100),
  ('ajustes', 'ir(\'ajustes\')', '', 2100),
  ('familiar', None, '&rol=familia&quien=Ana', 1500),
  ('inicio-oscuro', "ir('inicio')", '&tema=oscuro', 900), ('pantalla-oscuro', "ir('pantalla')", '&tema=oscuro', 1900),
  ('familiar-oscuro', None, '&rol=familia&quien=Ana&tema=oscuro', 1500), ('mensajes-oscuro', "ir('mensajes')", '&tema=oscuro', 1500),
]
for nombre, js, extra, alto in VISTAS:
    url = '/admin?js=' + Q(js or '1', safe='') + extra
    subprocess.run([sys.executable, os.path.join(os.path.dirname(__file__), 'captura.py'), url, f'{sal}/{nombre}.png', '390', str(alto)], check=True, timeout=120)
print('hecho')
def montaje(nombres, destino):
    ims = [Image.open(f'{sal}/{n}.png') for n in nombres]
    h = max(i.height for i in ims); W = sum(i.width for i in ims) + 12 * (len(ims) + 1)
    m = Image.new('RGB', (W, h + 36), (110, 110, 120)); d = ImageDraw.Draw(m); x = 12
    for n, i in zip(nombres, ims):
        d.text((x, 10), n, fill=(255, 255, 255)); m.paste(i, (x, 30)); x += i.width + 12
    m.save(destino)
montaje(['inicio', 'mensajes', 'caducados', 'mas'], f'{sal}/m1.png')
montaje(['pantalla', 'cuentas', 'cuenta'], f'{sal}/m2.png')
montaje(['familia', 'ajustes', 'familiar'], f'{sal}/m3.png')
montaje(['inicio-oscuro', 'mensajes-oscuro', 'pantalla-oscuro', 'familiar-oscuro'], f'{sal}/m4.png')
