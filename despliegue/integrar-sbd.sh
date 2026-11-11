#!/bin/bash
# Conecta sforms con el SBD de producción: base «sforms», un usuario solo para ella y una clave de API.
#   sudo bash despliegue/integrar-sbd.sh
# 1. Copia de seguridad de los datos de SBD (sin parar el servidor: el «sbd» de terminal respeta sus cerrojos).
# 2. Crea la base si no existe y el usuario «sforms_app» con «puede todo en sforms»
#    (crea sus tablas, pero no ve las demás bases ni administra el servidor).
# 3. Crea una clave de API y la guarda en /srv/sforms/datos/sbd.json (sforms:sforms 600).
#    La clave no va nunca al repositorio. Si ya existe ese archivo, no hace nada.
set -euo pipefail
[ "$(id -u)" = 0 ] || { echo "✕ hay que ejecutarlo como root" >&2; exit 1; }
SBD=/srv/sbd/venv/bin/sbd
DATOS=/srv/sbd/datos
ARCHIVO=/srv/sforms/datos/sbd.json
BASE=sforms
USUARIO=sforms_app
RESPALDO="/root/sbd/respaldos/$(date +%Y%m%d-%H%M%S)-antes-de-integrar-sforms"
sbd() { (cd /srv/sbd && sudo -u sbd "$SBD" "$DATOS" -e "$1"); }

if [ -f "$ARCHIVO" ]; then
  echo "✓ sforms ya está conectado a SBD ($ARCHIVO). No se cambia nada."
  exit 0
fi
id sforms >/dev/null 2>&1 || useradd --system --home-dir /srv/sforms --shell /usr/sbin/nologin sforms
install -d -o root -g sforms -m 750 /srv/sforms
install -d -o sforms -g sforms -m 700 /srv/sforms/datos

echo "· 1/3 copia de seguridad de SBD"
mkdir -p "$RESPALDO" && chmod 700 "$RESPALDO"
cp -a "$DATOS" "$RESPALDO/datos"
echo "  $RESPALDO"

echo "· 2/3 base «$BASE» y usuario «$USUARIO»"
sbd "crear base $BASE si no existe" >/dev/null
if ! sbd 'usuarios' | grep -q "^$USUARIO "; then
  sbd "crear usuario $USUARIO clave \"$(openssl rand -hex 24)\" puede todo en $BASE" >/dev/null
fi

echo "· 3/3 clave de API"
CLAVE=$(sbd "crear clave api para $USUARIO llamada \"sforms · sforms.serenaesteve.com\"" | grep -o 'sbd_k[^ ]*')
[ -n "$CLAVE" ] || { echo "✕ no se ha podido crear la clave de API" >&2; exit 1; }
umask 077
python3 - "$ARCHIVO" "$CLAVE" "$BASE" <<'PY'
import json, sys
ruta, clave, base = sys.argv[1:]
with open(ruta, "w") as f:
    json.dump({"url": "http://127.0.0.1:8090", "clave": clave, "base": base}, f, indent=2)
PY
chown sforms:sforms "$ARCHIVO"
chmod 600 "$ARCHIVO"
echo "✓ sforms conectado a la base «$BASE» de SBD."
