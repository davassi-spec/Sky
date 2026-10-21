#!/bin/sh
# Publica la app del móvil en la subcarpeta tele/ de la rama que sirve GitHub Pages (la web de la Torre d'en Galmés vive en la raíz y no se toca).
# Uso:  sh madre/web-app/publicar.sh        (desde la raíz del repositorio; antes: python3 madre/web-app/construir.py)
set -e
RAMA=claude/api-install-test-u8px6b
RAIZ=$(git rev-parse --show-toplevel)
python3 "$RAIZ/madre/web-app/construir.py" --comprobar
TMP=$(mktemp -d)
git fetch -q origin $RAMA
git worktree add -q --detach "$TMP" origin/$RAMA
mkdir -p "$TMP/tele/iconos" "$TMP/tele/iconos-familia"
cp "$RAIZ/madre/web-app/index.html" "$TMP/tele/index.html"
cp "$RAIZ/madre/web-app/iconos/"* "$TMP/tele/iconos/"
cp "$RAIZ/madre/web-app/iconos-familia/"* "$TMP/tele/iconos-familia/"
cd "$TMP"
git add tele
if git diff --cached --quiet; then echo "tele/ ya estaba al día"; else
  git commit -q -m "Publicar la app La tele de mamá en tele/ (sin tocar el resto)"
  git push -q origin HEAD:$RAMA
  echo "publicado: https://davassi-spec.github.io/Sky/tele/"
fi
cd "$RAIZ" && git worktree remove --force "$TMP"
