# Hook des advisori01-Kits: bei `deploy.sh <app> --check`, sobald eine Version laeuft. Laeuft in
# ~/<app>/current und meldet alle Befunde, bevor es mit 1 endet.
#
# Prueft, was das Kit allgemein nicht wissen kann:
#  - die .env nach den Regeln von scripts/check-env.mjs (nur Befunde, nie Werte),
#  - ob PostgREST laeuft und sich auf dem Verwaltungsport bereit meldet. /ready heisst: Die
#    Verbindung zur Datenbank steht und das Schema ist eingelesen.
#
# Dienst und Verwaltungsport haengen an der App (APP_NAME setzt das Kit):
#   zeugnio       -> postgrest,               127.0.0.1:3012  (Produktion)
#   zeugnio-test  -> postgrest-zeugnio-test,  127.0.0.1:3015  (Testinstanz)
set -uo pipefail

ok=0

case "${APP_NAME:-zeugnio}" in
  zeugnio) unit="postgrest"; admin_port="3012" ;;
  zeugnio-test) unit="postgrest-zeugnio-test"; admin_port="3015" ;;
  *)
    echo "    WARNUNG: unbekannte App '${APP_NAME}' - kein PostgREST-Dienst zugeordnet." >&2
    unit=""
    ok=1
    ;;
esac

if ! node --env-file=.env scripts/check-env.mjs; then
  ok=1
fi

if [ -n "$unit" ]; then
  ready="http://127.0.0.1:${admin_port}/ready"
  if systemctl --user is-active --quiet "$unit"; then
    if curl -fsS --max-time 5 "$ready" >/dev/null 2>&1; then
      echo "    PostgREST ($unit) laeuft und meldet sich bereit ($ready)"
    else
      echo "    WARNUNG: PostgREST ($unit) laeuft, meldet sich aber nicht bereit ($ready)" >&2
      ok=1
    fi
  else
    echo "    WARNUNG: systemd-Dienst $unit laeuft nicht - die App findet keine Daten" >&2
    ok=1
  fi
fi

exit "$ok"
