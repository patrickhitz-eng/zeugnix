# Hook des advisori01-Kits: vor den Migrationen. Gibt genau eine Zahl aus, die Anzahl offener
# Migrationen.
#
# Davon haengt ab, ob das Kit vor dem Einspielen einen Auszug anlegt. Bei 0 gibt es weder Auszug
# noch Migration. Scheitert die Abfrage (Datenbank nicht erreichbar, eine eingespielte Migration
# wurde nachtraeglich veraendert), ist die Ausgabe leer oder der Rueckgabewert ungleich 0. Das Kit
# wertet das als «unbekannt» und sichert vorsichtshalber, bevor migrate.sh laeuft - der dann mit
# einer klaren Meldung abbricht.
#
# Die Zahl kommt aus der Zeile «Offen (N):» von `migrate.mjs --status`. Aendert sich diese Zeile
# dort, hier nachziehen.
set -euo pipefail

node --env-file=.env scripts/migrate.mjs --status | sed -n 's/^Offen (\([0-9]\+\)):.*/\1/p' | head -1
