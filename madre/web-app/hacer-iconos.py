#!/usr/bin/env python3
"""Genera los iconos de la pantalla de inicio de los FAMILIARES (iconos-familia/) a partir de un PNG cuadrado.

  python3 madre/web-app/hacer-iconos.py mi-icono.png      → crea iconos-familia/ con los cinco tamaños
  python3 madre/web-app/hacer-iconos.py --girar 220        → vuelve a crear la variante verde del icono del panel (iconos/)

Los del administrador están en iconos/. El panel pone unos u otros según quién entra (ver ponerIconos en construir.py).
"""
import os, sys
from PIL import Image

AQUI = os.path.dirname(os.path.abspath(__file__))
SALIDA = os.path.join(AQUI, 'iconos-familia')
TAMANOS = {'apple-touch-icon.png': 180, 'favicon-32.png': 32, 'icono-192.png': 192, 'icono-512.png': 512}

def girar(im, grados):
    hsv = im.convert('RGB').convert('HSV'); h, s, v = hsv.split(); d = int(grados / 360 * 256)
    return Image.merge('HSV', (h.point(lambda x: (x + d) % 256), s, v)).convert('RGB')

def guardar(img):
    os.makedirs(SALIDA, exist_ok=True)
    img = img.convert('RGB')                      # sin transparencia: iOS pinta de negro lo transparente
    for nombre, lado in TAMANOS.items():
        img.resize((lado, lado), Image.LANCZOS).save(os.path.join(SALIDA, nombre), optimize=True)
    # "maskable" (Android): el dibujo ocupa el 80 % central para que el recorte redondo no lo corte
    fondo = Image.new('RGB', (512, 512), img.getpixel((4, 4)))
    fondo.paste(img.resize((410, 410), Image.LANCZOS), (51, 51))
    fondo.save(os.path.join(SALIDA, 'icono-maskable-512.png'), optimize=True)

if __name__ == '__main__':
    if len(sys.argv) >= 3 and sys.argv[1] == '--girar':
        guardar(girar(Image.open(os.path.join(AQUI, 'iconos', 'icono-512.png')), float(sys.argv[2])))
    elif len(sys.argv) == 2 and not sys.argv[1].startswith('-'):
        guardar(Image.open(sys.argv[1]))
    else:
        sys.exit(__doc__)
    print('iconos de familiares en', SALIDA)
