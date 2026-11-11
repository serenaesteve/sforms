#!/bin/bash
# Publica (o actualiza) sforms en sforms.serenaesteve.com. Se puede lanzar las veces que haga falta;
# nunca toca los datos (están en el SBD de producción, base «sforms»).
#   sudo bash despliegue/desplegar.sh
# La primera vez, antes: sudo bash despliegue/integrar-sbd.sh
set -euo pipefail

DOMINIO=sforms.serenaesteve.com
IP_SERVIDOR=82.165.244.40
PUERTO=8106
ORIGEN=$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)
DIR=$ORIGEN/despliegue

[ -f /srv/sforms/datos/sbd.json ] || { echo "✕ falta conectar con SBD: sudo bash despliegue/integrar-sbd.sh" >&2; exit 1; }

# 1. El código: de root y solo lectura para el servicio
install -d -o root -g sforms -m 750 /srv/sforms/app
rsync -a --delete --chown=root:sforms --chmod=D750,F640 --exclude __pycache__ \
  "$ORIGEN/servidor.py" "$ORIGEN/api" "$ORIGEN/sbd" "$ORIGEN/web" /srv/sforms/app/

# 2. El servicio (aplica las migraciones al arrancar)
install -m 644 "$DIR/sforms.service" /etc/systemd/system/sforms.service
systemctl daemon-reload
systemctl enable sforms.service >/dev/null 2>&1
systemctl restart sforms.service
sleep 2
systemctl is-active sforms.service
echo "Servicio: $(curl -s -o /dev/null -m 5 -w '%{http_code}' http://127.0.0.1:$PUERTO/api/estado) en /api/estado"

# 3. Apache en el 80 (redirección y Let's Encrypt)
install -m 644 "$DIR/sforms.conf" /etc/apache2/sites-available/sforms.conf
a2ensite -q sforms.conf

IP_DOMINIO=$(dig +short A "$DOMINIO" @1.1.1.1 | tail -1)
IPV6_DOMINIO=$(dig +short AAAA "$DOMINIO" @1.1.1.1 | tail -1)
if [ "$IP_DOMINIO" != "$IP_SERVIDOR" ] || [ -n "$IPV6_DOMINIO" ]; then
  apache2ctl -t 2>&1 | tail -1 && systemctl reload apache2
  echo "FALTA EL DNS: $DOMINIO apunta a ${IP_DOMINIO:-nada}${IPV6_DOMINIO:+ y a la IPv6 $IPV6_DOMINIO}; tiene que ser un A con $IP_SERVIDOR y sin AAAA."
  exit 0
fi
apache2ctl -t 2>&1 | tail -1
systemctl reload apache2
if [ ! -e "/etc/letsencrypt/live/$DOMINIO/fullchain.pem" ]; then
  certbot certonly --webroot -w /var/www/acme -d "$DOMINIO" --non-interactive --keep-until-expiring --deploy-hook "systemctl reload apache2"
fi

# 4. HTTPS
install -m 644 "$DIR/sforms-ssl.conf" /etc/apache2/sites-available/sforms-ssl.conf
a2ensite -q sforms-ssl.conf
apache2ctl -t 2>&1 | tail -1
systemctl reload apache2
sleep 1
echo "Publicado: https://$DOMINIO → $(curl -s -o /dev/null -m 10 --resolve "$DOMINIO:443:$IP_SERVIDOR" -w '%{http_code}' "https://$DOMINIO/")"
