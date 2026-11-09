# Hook des advisori01-Kits: bei `deploy.sh zeugnio --check`, sobald eine Version laeuft. Laeuft in
# ~/zeugnio/current und meldet alle Befunde, bevor es mit 1 endet.
#
# Prueft, was das Kit allgemein nicht wissen kann:
#  - die .env nach den Regeln von scripts/check-env.mjs (nur Befunde, nie Werte),
#  - ob PostgREST laeuft und sich auf dem Verwaltungsport bereit meldet. /ready heisst: Die
#    Verbindung zur Datenbank steht und das Schema ist eingelesen.
set -uo pipefail

ok=0

if ! node --env-file=.env scripts/check-env.mjs; then
  ok=1
fi

if systemctl --user is-active --quiet postgrest; then
  if curl -fsS --max-time 5 http://127.0.0.1:3012/ready >/dev/null 2>&1; then
    echo "    PostgREST laeuft und meldet sich bereit (127.0.0.1:3012/ready)"
  else
    echo "    WARNUNG: PostgREST laeuft, meldet sich aber nicht bereit (127.0.0.1:3012/ready)" >&2
    ok=1
  fi
else
  echo "    WARNUNG: systemd-Dienst postgrest laeuft nicht - ab Cutover A findet die App keine Daten" >&2
  ok=1
fi

exit "$ok"
