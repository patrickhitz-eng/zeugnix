# Hook des advisori01-Kits: nach migrate.sh. Laesst PostgREST das Schema neu einlesen.
#
# PostgREST haelt das Schema im Zwischenspeicher. Ohne Neuladen antwortet die Daten-API auf eine
# neue Spalte mit «column does not exist», obwohl sie in der Datenbank steht. `reload` schickt dem
# Dienst SIGUSR1 (ExecReload in postgrest.service), er liest das Schema neu, ohne Neustart.
#
# Welcher Dienst, haengt an der App (APP_NAME setzt das Kit):
#   zeugnio       -> postgrest                (Produktion)
#   zeugnio-test  -> postgrest-zeugnio-test   (Testinstanz, deploy/nine/cutover-b-testinstanz.md)
# Die Testinstanz darf nie den Dienst der Produktion neu laden und umgekehrt.
#
# Absichtlich nur eine Warnung, kein Abbruch: Die Migrationen sind an dieser Stelle schon
# eingespielt. Ein Abbruch liesse die alte Version laufen, und beim naechsten Deployment waere
# nichts mehr offen - dieser Hook liefe dann gar nicht mehr. Darum weiter, aber laut.
set -uo pipefail

case "${APP_NAME:-zeugnio}" in
  zeugnio) unit="postgrest" ;;
  zeugnio-test) unit="postgrest-zeugnio-test" ;;
  *)
    echo "    WARNUNG: unbekannte App '${APP_NAME}' - kein PostgREST-Dienst zugeordnet, Schema nicht neu eingelesen." >&2
    exit 0
    ;;
esac

if ! systemctl --user is-active --quiet "$unit"; then
  echo "    WARNUNG: $unit laeuft nicht - das Schema wurde nicht neu eingelesen." >&2
  exit 0
fi

if systemctl --user reload "$unit"; then
  echo "    PostgREST ($unit) liest das Schema neu ein."
else
  echo "    WARNUNG: reload $unit fehlgeschlagen. Von Hand: systemctl --user reload $unit" >&2
fi
