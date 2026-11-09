# Hook des advisori01-Kits (~/kit/deploy.sh zeugnio): nach dem Klonen, vor `npm ci`.
#
# Prueft die .env, bevor Minuten in Installation und Build gehen. Die Pruefung nennt nur Befunde,
# nie Werte. Bricht sie ab, laeuft die bisherige Version unveraendert weiter.
#
# Vertrag des Kits: laeuft mit bash im neuen Release-Ordner, .env ist dort schon auf
# ~/zeugnio/shared/.env verknuepft, Node aus der .nvmrc ist geladen. Ein Rueckgabewert ungleich 0
# bricht das Deployment ab.
set -euo pipefail

node --env-file=.env scripts/check-env.mjs
