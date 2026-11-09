# Hook des advisori01-Kits: nach migrate.sh. Laesst PostgREST das Schema neu einlesen.
#
# PostgREST haelt das Schema im Zwischenspeicher. Ohne Neuladen antwortet die Daten-API auf eine
# neue Spalte mit «column does not exist», obwohl sie in der Datenbank steht. `reload` schickt dem
# Dienst SIGUSR1 (ExecReload in postgrest.service), er liest das Schema neu, ohne Neustart.
#
# Absichtlich nur eine Warnung, kein Abbruch: Die Migrationen sind an dieser Stelle schon
# eingespielt. Ein Abbruch liesse die alte Version laufen, und beim naechsten Deployment waere
# nichts mehr offen - dieser Hook liefe dann gar nicht mehr. Darum weiter, aber laut.
set -uo pipefail

if ! systemctl --user is-active --quiet postgrest; then
  echo "    WARNUNG: postgrest laeuft nicht - das Schema wurde nicht neu eingelesen." >&2
  exit 0
fi

if systemctl --user reload postgrest; then
  echo "    PostgREST liest das Schema neu ein."
else
  echo "    WARNUNG: reload postgrest fehlgeschlagen. Von Hand: systemctl --user reload postgrest" >&2
fi
