#!/usr/bin/env python3
"""Captura el panel en Chromium sin cabeza. Uso: captura.py 'ruta?query' salida.png [ancho] [alto]"""
import subprocess, sys, os, urllib.parse
from PIL import Image
chrome = [p for p in ['/opt/pw-browsers/chromium-1194/chrome-linux/chrome'] if os.path.exists(p)][0]
url, salida = sys.argv[1], sys.argv[2]
ancho = int(sys.argv[3]) if len(sys.argv) > 3 else 390
alto = int(sys.argv[4]) if len(sys.argv) > 4 else 844
tmp = salida + '.tmp.png'
subprocess.run([chrome, '--headless', '--no-sandbox', '--disable-gpu', '--hide-scrollbars', '--force-device-scale-factor=1',
                '--virtual-time-budget=9000', f'--window-size={max(ancho, 520)},{alto + 120}', f'--screenshot={tmp}', 'http://127.0.0.1:8765/marco?w=%d&h=%d&u=%s' % (ancho, alto, urllib.parse.quote(url, safe=''))],
               stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL, timeout=60)
Image.open(tmp).crop((0, 0, ancho, alto)).save(salida); os.remove(tmp)
