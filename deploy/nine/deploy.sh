#!/usr/bin/env bash
# zeugnio.ch - Deployment auf dem Managed Server bei nine.ch.
#
# Jede Version wird in einem eigenen Ordner unter ~/zeugnio/releases gebaut. Erst wenn Build
# und Migrationen durch sind, zeigt ~/zeugnio/current auf die neue Version und die App startet
# neu. Schlaegt vorher etwas fehl, laeuft die bisherige Version unveraendert weiter. Antwortet
# die neue Version nach dem Start nicht, wird automatisch zurueckgeschaltet.
#
# Aufbau auf dem Server:
#   ~/zeugnio/shared/.env             Zugangsdaten (chmod 600), Vorlage: deploy/nine/env.production.example
#   ~/zeugnio/shared/postgrest.conf   Konfiguration der Daten-API (chmod 600), eigener Dienst
#   ~/zeugnio/shared/backup.key       Schluessel der eigenen Sicherung (chmod 600)
#   ~/zeugnio/shared/uploads/         hochgeladene Firmenlogos - ueberlebt jedes Deployment
#   ~/zeugnio/releases/...            gebaute Versionen (die letzten KEEP_RELEASES bleiben liegen)
#   ~/zeugnio/current                 Verknuepfung auf die laufende Version
#
# usage: deploy.sh --check      Voraussetzungen pruefen, nichts veraendern
#        deploy.sh [branch]     neue Version ausliefern (Default: main)
#        deploy.sh --rollback   auf die vorherige Version zurueckschalten (Datenbank bleibt)
set -euo pipefail

APP_DIR="${APP_DIR:-$HOME/zeugnio}"
REPO_URL="${REPO_URL:-git@github.com:patrickhitz-eng/zeugnix.git}"
# Drei statt fuenf: auf dieser Maschine liegen vier Anwendungen, und ein Release-Ordner mit
# node_modules und .next belegt rund 1 GB.
KEEP_RELEASES="${KEEP_RELEASES:-3}"
APP_NAME="zeugnio"
APP_PORT="${APP_PORT:-3010}"
HEALTH_URL="http://127.0.0.1:${APP_PORT}/api/health"
# Verwaltungsport von PostgREST (/live und /ready), siehe postgrest.conf.example.
DATA_API_READY_URL="${DATA_API_READY_URL:-http://127.0.0.1:3012/ready}"
GOOD_MARK=".deploy-ok"
# Serverweite Sperre gegen zwei gleichzeitige Builds. Liegt absichtlich in /tmp und nicht
# unter $HOME: sie muss ueber Benutzergrenzen hinweg wirken, weil jede Anwendung auf dieser
# Maschine unter einem eigenen Benutzer laeuft.
BUILD_LOCK="${BUILD_LOCK:-/tmp/nine-next-build.lock}"
DEPLOY_RELEASE=""

log() { printf '\n==> %s\n' "$*"; }
warn() { printf '    WARNUNG: %s\n' "$*" >&2; }
fail() { printf '\nFehler: %s\n' "$*" >&2; exit 1; }

# Node in der Version aus der .nvmrc des angegebenen Release-Ordners (Default 22) laden.
load_node() {
  local version
  version="$(cat "$1/.nvmrc" 2>/dev/null || echo 22)"
  export NVM_DIR="$HOME/.nvm"
  [ -s "$NVM_DIR/nvm.sh" ] || fail "nvm fehlt ($NVM_DIR) - siehe Runbook, Schritt Node.js."
  set +u
  # shellcheck disable=SC1091
  . "$NVM_DIR/nvm.sh"
  # Erst die installierte Version nehmen: `nvm install 22` holte sonst bei jedem Deployment
  # die neueste 22.x - ohne das global installierte pm2, und der Autostart zeigte ins Leere.
  nvm use "$version" >/dev/null 2>&1 || { nvm install "$version" >/dev/null && nvm use "$version" >/dev/null; }
  set -u
  command -v pm2 >/dev/null || fail "pm2 fehlt fuer Node $(node -v) - einmalig: npm install -g pm2"
}

list_releases() {
  [ -d "$APP_DIR/releases" ] || return 0
  find "$APP_DIR/releases" -mindepth 1 -maxdepth 1 -type d -printf '%f\n' | sort -r
}

health_check() {
  local attempt
  for attempt in $(seq 1 30); do
    if curl -fsS --max-time 5 "$HEALTH_URL" >/dev/null 2>&1; then return 0; fi
    sleep 2
  done
  return 1
}

switch_to() {
  ln -sfn "$1" "$APP_DIR/current.tmp"
  mv -Tf "$APP_DIR/current.tmp" "$APP_DIR/current"
}

restart_app() {
  # Loeschen und neu starten statt `pm2 reload`: PM2 merkt sich sonst das alte
  # Arbeitsverzeichnis. Das ist hier keine Kleinigkeit - lib/pdf/certificate.tsx loest die
  # Inter-Schriften ueber process.cwd() auf, und ein veraltetes cwd erzeugt Zeugnisse in
  # Helvetica, ohne eine Fehlermeldung. Der Preis sind einige Sekunden 502.
  pm2 delete "$APP_NAME" >/dev/null 2>&1 || true
  pm2 start "$APP_DIR/current/deploy/nine/ecosystem.config.cjs"
  pm2 save >/dev/null
}

previous_release() {
  local current name releases
  current="$(basename "$(readlink -f "$APP_DIR/current" 2>/dev/null || echo none)")"
  mapfile -t releases < <(list_releases)
  for name in "${releases[@]}"; do
    if [[ "$name" < "$current" ]] && [ -f "$APP_DIR/releases/$name/$GOOD_MARK" ]; then
      echo "$APP_DIR/releases/$name"
      return 0
    fi
  done
}

# Nur ein Deployment dieser Anwendung gleichzeitig.
acquire_lock() {
  mkdir -p "$APP_DIR"
  exec 9>"$APP_DIR/.deploy.lock"
  flock -n 9 || fail "Es laeuft bereits ein Deployment ($APP_DIR/.deploy.lock) - bitte warten."
}

# Zusaetzlich serverweit: zwei gleichzeitige `next build` brauchen je rund 2-2,5 GB. Bei 8 GB
# Arbeitsspeicher und vier Anwendungen im Betrieb trifft der OOM-Killer dann im schlechtesten
# Fall PostgreSQL - und damit alle Produkte auf dieser Maschine, nicht nur dieses.
acquire_build_lock() {
  # Die Datei fuer alle Benutzer beschreibbar anlegen, falls sie noch nicht existiert.
  if [ ! -e "$BUILD_LOCK" ]; then
    ( umask 0000; : > "$BUILD_LOCK" ) 2>/dev/null || true
  fi
  if exec 8>"$BUILD_LOCK" 2>/dev/null; then
    log "Auf die serverweite Build-Sperre warten (bis 30 min)"
    flock -w 1800 8 || fail "Ein anderer Build laeuft seit ueber 30 Minuten ($BUILD_LOCK)."
    return 0
  fi
  # Die Sperrdatei gehoert einem anderen Benutzer und ist nicht beschreibbar. Dann bleibt nur
  # der Blick in die Prozessliste - der aber nur trifft, wenn /proc nicht mit hidepid
  # abgeschirmt ist. Das Pruefskript check-advisori01.sh sagt, welcher Fall hier gilt.
  warn "$BUILD_LOCK nicht beschreibbar - weiche auf die Prozessliste aus."
  if pgrep -fa "next build" >/dev/null 2>&1; then
    fail "Auf diesem Server laeuft bereits ein next build. Bitte warten (pgrep -fa 'next build')."
  fi
}

cleanup_failed_release() {
  [ -n "$DEPLOY_RELEASE" ] && [ -d "$DEPLOY_RELEASE" ] || return 0
  if [ "$(readlink -f "$APP_DIR/current" 2>/dev/null || true)" != "$DEPLOY_RELEASE" ]; then
    cd "$APP_DIR"
    rm -rf -- "$DEPLOY_RELEASE"
    echo "  Unvollstaendige Version $(basename "$DEPLOY_RELEASE") entfernt." >&2
  fi
}

# Anzahl offener Migrationen. Nur davon haengt ab, ob vor dem Einspielen ein Auszug noetig ist.
pending_migrations() {
  local out
  out="$(node --env-file=.env scripts/migrate.mjs --status 2>/dev/null || true)"
  printf '%s\n' "$out" | sed -n 's/^Offen (\([0-9]\+\)):.*/\1/p' | head -1
}

check() {
  local ok=1
  log "Voraussetzungen pruefen"
  load_node "$APP_DIR/current"
  echo "  Node $(node -v), npm $(npm -v), pm2 $(pm2 -v)"

  local f mode
  for f in "$APP_DIR/shared/.env" "$APP_DIR/shared/postgrest.conf" "$APP_DIR/shared/backup.key"; do
    if [ -f "$f" ]; then
      mode="$(stat -c %a "$f")"
      if [ "$mode" = "600" ]; then
        echo "  $(basename "$f") vorhanden, Rechte 600"
      else
        warn "$f hat Rechte $mode - bitte: chmod 600 $f"; ok=0
      fi
    else
      warn "FEHLT: $f"; ok=0
    fi
  done

  if [ -d "$APP_DIR/shared/uploads" ]; then
    echo "  uploads/ vorhanden ($(find "$APP_DIR/shared/uploads" -type f | wc -l) Dateien)"
  else
    warn "FEHLT: $APP_DIR/shared/uploads - hochgeladene Firmenlogos haetten keinen Ort"; ok=0
  fi

  if git ls-remote "$REPO_URL" HEAD >/dev/null 2>&1; then
    echo "  GitHub-Zugriff ok"
  else
    warn "kein Lesezugriff auf $REPO_URL (Deploy-Key eingerichtet?)"; ok=0
  fi

  if systemctl --user is-enabled pm2 >/dev/null 2>&1; then
    echo "  systemd-Dienst pm2 aktiv (App startet nach Server-Neustart)"
  else
    warn "systemd-Dienst pm2 nicht aktiviert - nach einem Neustart laeuft die App nicht"; ok=0
  fi

  if systemctl --user is-active postgrest >/dev/null 2>&1; then
    echo "  Daten-API laeuft"
    if curl -fsS --max-time 5 "$DATA_API_READY_URL" >/dev/null 2>&1; then
      echo "  Daten-API meldet sich bereit"
    else
      warn "Daten-API laeuft, meldet sich aber nicht bereit ($DATA_API_READY_URL)"; ok=0
    fi
  else
    warn "systemd-Dienst postgrest laeuft nicht - die App findet keine Daten"; ok=0
  fi

  if command -v pg_dump >/dev/null 2>&1; then
    echo "  $(pg_dump --version)"
  else
    warn "pg_dump fehlt - ohne ihn gibt es vor Migrationen keinen Auszug"; ok=0
  fi

  [ "$ok" = 1 ] && echo "  Alles bereit." || fail "Nicht alle Voraussetzungen erfuellt."
}

deploy() {
  local branch="$1"
  [ -f "$APP_DIR/shared/.env" ] || fail "$APP_DIR/shared/.env fehlt - Vorlage: deploy/nine/env.production.example"
  [ -d "$APP_DIR/shared/uploads" ] || fail "$APP_DIR/shared/uploads fehlt - bitte anlegen (dort liegen die Firmenlogos)."
  mkdir -p "$APP_DIR/releases"

  local release previous
  release="$APP_DIR/releases/$(date +%Y%m%d-%H%M%S)"
  previous="$(readlink -f "$APP_DIR/current" 2>/dev/null || true)"
  DEPLOY_RELEASE="$release"
  trap cleanup_failed_release EXIT

  log "Code holen (Branch $branch)"
  git clone --quiet --depth 1 --branch "$branch" "$REPO_URL" "$release"
  cd "$release"
  ln -s "$APP_DIR/shared/.env" .env
  echo "  Commit $(git rev-parse --short HEAD): $(git log -1 --format=%s)"

  load_node "$release"

  log "Konfiguration pruefen"
  node --env-file=.env scripts/check-env.mjs

  log "Abhaengigkeiten installieren"
  # --include=dev ausdruecklich: steht NODE_ENV=production in der Umgebung, laesst npm die
  # Entwicklungsabhaengigkeiten sonst weg - und ohne tsx und typescript scheitert der Build.
  npm ci --include=dev --no-audit --no-fund

  acquire_build_lock

  log "Build"
  # `npm run build` und nicht `npx next build`: das prebuild-Skript prueft die Farbthemen und
  # kopiert den pdf.js-Worker nach public/pdfjs. Ohne diesen Worker laedt die Zeugnispruefung
  # im Browser nicht - und zwar erst beim Hochladen eines PDFs, nicht beim Start.
  NODE_OPTIONS="--max-old-space-size=2048" NEXT_TELEMETRY_DISABLED=1 npm run build

  local pending
  pending="$(pending_migrations)"
  if [ -n "$pending" ] && [ "$pending" != "0" ]; then
    log "$pending offene Migration(en) - vorher einen Auszug anlegen"
    # Ein Schemawechsel ohne Auszug davor ist der Fall, in dem die taegliche Sicherung von
    # nine (02-03 Uhr) zu alt ist. Scheitert der Auszug, wird nicht migriert.
    node deploy/nine/db-backup.mjs || fail "Auszug vor der Migration fehlgeschlagen - es wird nicht migriert."
    log "Migrationen einspielen"
    node --env-file=.env scripts/migrate.mjs
    # PostgREST haelt das Schema im Zwischenspeicher. Ohne dieses Neuladen antwortet die
    # Daten-API auf neue Spalten mit "column does not exist", obwohl sie existiert.
    if systemctl --user is-active postgrest >/dev/null 2>&1; then
      log "Schema-Zwischenspeicher der Daten-API neu lesen"
      systemctl --user reload postgrest || warn "reload postgrest fehlgeschlagen - von Hand nachholen."
    fi
  else
    log "Keine offenen Migrationen"
  fi

  log "Umschalten und neu starten"
  switch_to "$release"
  restart_app

  log "Lebenszeichen abwarten ($HEALTH_URL)"
  if ! health_check; then
    echo "Die neue Version antwortet nicht. Letzte Log-Zeilen:" >&2
    pm2 logs "$APP_NAME" --lines 40 --nostream >&2 || true
    if [ -n "$previous" ] && [ -d "$previous" ]; then
      log "Zurueck auf $(basename "$previous")"
      switch_to "$previous"
      restart_app
      health_check && echo "  Vorherige Version laeuft wieder." >&2
    fi
    fail "Deployment fehlgeschlagen. Wurden Migrationen eingespielt, sind sie NICHT zurueckgenommen - bei Schemaaenderungen pruefen."
  fi
  # Der Gesundheitstest liefert mehr als ok/nicht ok. Die Befunde gehoeren ins Deploy-Log,
  # damit ein fehlender Schriftschnitt oder eine leere Variable nicht erst im Zeugnis auffaellt.
  echo "  App antwortet: $(curl -fsS --max-time 5 "$HEALTH_URL" 2>/dev/null || echo '(Antwort nicht lesbar)')"
  touch "$release/$GOOD_MARK"
  trap - EXIT

  log "Alte Versionen aufraeumen (behalte $KEEP_RELEASES)"
  local releases name
  mapfile -t releases < <(list_releases)
  for name in "${releases[@]:$KEEP_RELEASES}"; do
    if [ "$APP_DIR/releases/$name" != "$release" ]; then
      rm -rf -- "${APP_DIR:?}/releases/$name"
      echo "  entfernt: $name"
    fi
  done

  log "Fertig: $(basename "$release") laeuft."
}

rollback() {
  local target
  target="$(previous_release)"
  [ -n "$target" ] || fail "Keine aeltere Version unter $APP_DIR/releases gefunden."
  load_node "$target"
  log "Zurueck auf $(basename "$target")"
  switch_to "$target"
  restart_app
  health_check || fail "Auch die vorherige Version antwortet nicht - pm2 logs $APP_NAME pruefen."
  log "Fertig: $(basename "$target") laeuft. Die Datenbank wurde NICHT zurueckgesetzt."
}

# Alles in Funktionen: bash liest das Skript damit vollstaendig ein, bevor es etwas
# veraendert - wichtig, weil ein Deployment die Datei ersetzt, aus der es gerade laeuft.
main() {
  case "${1:-main}" in
    --check) check ;;
    --rollback) acquire_lock; rollback ;;
    -h | --help) sed -n '2,25p' "$0" ;;
    -*) fail "Unbekannte Option: $1 (erlaubt: --check, --rollback, Branch-Name)" ;;
    *) acquire_lock; deploy "${1:-main}" ;;
  esac
}

main "$@"
