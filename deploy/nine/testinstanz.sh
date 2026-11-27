#!/usr/bin/env bash
# zeugnio - Testinstanz fuer Cutover B (eigene Anmeldung, PR #91) auf advisori01.
#
# Baut neben der Produktion eine vollstaendig abgetrennte zweite Instanz auf, damit der
# Anmeldeablauf unter https://test.zeugnio.ch im Browser durchgespielt werden kann, bevor die
# Produktion umschaltet. Ablauf, Pruefungen und Testfaelle: deploy/nine/cutover-b-testinstanz.md
#
#   Teil              Testinstanz                               Produktion (nie veraendert)
#   Datenbank         Wegwerf-Cluster ~/zeugnio-test/pg,        nmd_zeugnio auf 127.0.0.1:5432
#                     nur Socket, Port 5444, DB zeugnio_test    (keine Verbindung dorthin)
#   Daten-API         postgrest-zeugnio-test, 3014/3015          postgrest, 3011/3012
#   App               pm2 zeugnio-test, Port 3013                pm2 zeugnio, Port 3010
#   Ordner            ~/zeugnio-test                            ~/zeugnio (nur gelesen: .env,
#                                                                backup.key, backups/, uploads/)
#
# Als www-zeugnio, im Checkout des PR-#91-Branches unter ~/zeugnio-test/setup:
#   bash ~/zeugnio-test/setup/deploy/nine/testinstanz.sh <befehl>
#
# Befehle in der Reihenfolge des Aufbaus:
#   vorpruefung        prueft alle Voraussetzungen, veraendert nichts
#   aufbau-db [--neu] [--datei <sicherung>]
#                      Wegwerf-Cluster anlegen, Rollen wie in der Produktion, juengste Sicherung
#                      einspielen (--neu: einen bestehenden Test-Cluster vorher verwerfen)
#   db-pruefen         903_nine_verify.sql gegen die Testdatenbank (nur lesen)
#   env [--neu]        ~/zeugnio-test/shared/.env aus der Produktions-.env ableiten, Logos kopieren
#   postgrest [--neu]  postgrest.conf schreiben, Dienst postgrest-zeugnio-test starten
#   anmeldung-db       906 einspielen, 907 als Probe, PostgREST neu einlesen, Probe der Daten-API
#   vor-deploy         unmittelbar vor jedem Deploy: Cluster, PostgREST, Arbeitsspeicher
#   (danach: ~/kit/deploy.sh zeugnio-test, dann vhost umstellen, siehe Runbook)
#
# Im Betrieb:
#   status             was laeuft, wie alt die Datenkopie ist
#   probe              postgrest-probe.mjs --auth-eigen gegen die Test-Daten-API
#   psql [psql-Optionen]
#                      psql auf die Testdatenbank als nmd_zeugnio (z. B. -c "select ...")
#   start | stopp      nach einem Server-Neustart starten bzw. pausieren (Daten bleiben)
#   abbau [--ja]       ALLES entfernen, auch die Datenkopie. Ohne --ja nur anzeigen, was weg kaeme.
#
# Sicherheitsregeln, die dieses Skript selbst durchsetzt:
#   - Es gibt nie einen Wert aus der .env aus und uebergibt Geheimnisse nie als Argument
#     (Argumente stehen in der Prozessliste).
#   - Jeder Datenbankaufruf geht ausdruecklich an den Socket der Testinstanz. Die Umgebung
#     (PGHOST, PGPASSWORD, ~/.pgpass ...) wird vorher geleert, damit nichts auf die Produktion
#     zeigen kann. Die Testdatenbank heisst zeugnio_test: ein Befehl, der doch bei der Produktion
#     landet, scheitert dort an «database does not exist».
#   - Aus ~/zeugnio wird nur gelesen. Geschrieben, gestartet und geloescht wird nur unter
#     ~/zeugnio-test, am Dienst postgrest-zeugnio-test und am pm2-Prozess zeugnio-test.
set -euo pipefail
umask 077

# --- Feste Werte -------------------------------------------------------------------------------
REPO_DIR="$(cd "$(dirname "$(readlink -f "${BASH_SOURCE[0]}")")/../.." && pwd)"

TEST_APP="zeugnio-test"
TEST_DIR="$HOME/zeugnio-test"
SHARED="$TEST_DIR/shared"
UPLOAD_DIR="$TEST_DIR/uploads"
MARK_FILE="$TEST_DIR/DATENKOPIE.txt"
PG_DIR="$TEST_DIR/pg"
PG_DATA="$PG_DIR/data"
PG_RUN="$PG_DIR/run"
PG_LOG="$PG_DIR/log"
PG_PORT="5444"
PG_UNIT="zeugnio-test-pg"
PG_ADMIN="testadmin"
DB_NAME="zeugnio_test"
# Dieselben Rollennamen wie in der Produktion (supabase/900_0_nine_rollen.sql): Die Migrationen
# und die Rechte im Auszug nennen sie beim Namen.
APP_ROLE="nmd_zeugnio"
APP_PORT="3013"
API_PORT="3014"
API_ADMIN_PORT="3015"
API_UNIT="postgrest-zeugnio-test"
SITE_URL="https://test.zeugnio.ch"

PROD_DIR="$HOME/zeugnio"
PROD_ENV="$PROD_DIR/shared/.env"
PROD_KEY="$PROD_DIR/shared/backup.key"
PROD_BACKUPS="$PROD_DIR/backups"
KIT_DIR="$HOME/kit"
KIT_CONF="$KIT_DIR/apps/$TEST_APP/kit.conf"
POSTGREST_BIN="$HOME/opt/postgrest/postgrest"
UNIT_DIR="$HOME/.config/systemd/user"
PM2_LOGS="$HOME/.pm2/logs"

PGB=""

# --- Ausgabe -----------------------------------------------------------------------------------
log() { printf '\n==> %s\n' "$*"; }
info() { printf '    %s\n' "$*"; }
warn() { printf '    WARNUNG: %s\n' "$*" >&2; }
fail() { printf '\nFehler: %s\n' "$*" >&2; exit 1; }

# --- Umgebung ----------------------------------------------------------------------------------
# Nichts aus der Shell darf eine Datenbankverbindung umlenken. ~/.pgpass koennte das Passwort der
# Produktion enthalten; PGPASSFILE=/dev/null schaltet die Datei fuer dieses Skript ab.
unset PGHOST PGHOSTADDR PGPORT PGUSER PGPASSWORD PGDATABASE PGSERVICE PGSERVICEFILE PGOPTIONS PGAPPNAME DATABASE_URL
export PGPASSFILE=/dev/null
export PGCONNECT_TIMEOUT=10
export LC_MESSAGES=C
# Ohne diese Variable erreicht `systemctl --user` den eigenen systemd nicht (z. B. nach nine-su).
export XDG_RUNTIME_DIR="${XDG_RUNTIME_DIR:-/run/user/$(id -u)}"

require_user() {
  [ "$(id -un)" = "www-zeugnio" ] || fail "Dieses Skript laeuft als www-zeugnio (Fenster www-zeugnio), nicht als $(id -un)."
  [ "$TEST_DIR" != "$PROD_DIR" ] || fail "Interner Fehler: Test- und Produktionsordner sind gleich."
}

# Node und pm2 aus nvm, falls die Shell sie nicht schon kennt (gleich wie das Kit).
load_node() {
  if command -v node >/dev/null 2>&1 && command -v pm2 >/dev/null 2>&1; then return 0; fi
  export NVM_DIR="$HOME/.nvm"
  [ -s "$NVM_DIR/nvm.sh" ] || fail "nvm fehlt ($NVM_DIR)."
  set +u
  # shellcheck disable=SC1091
  . "$NVM_DIR/nvm.sh"
  nvm use 22 >/dev/null 2>&1 || true
  set -u
  command -v node >/dev/null 2>&1 || fail "node nicht gefunden."
}

# --- PostgreSQL --------------------------------------------------------------------------------
# Die Programme der neuesten installierten Version, mindestens 17: Ein Auszug von pg_dump 17
# laesst sich nicht in einen aelteren Server einspielen. Gibt es den Cluster schon, die Version,
# mit der er angelegt wurde.
find_pg_bin() {
  local dir version
  if [ -f "$PG_DATA/PG_VERSION" ]; then
    version="$(cat "$PG_DATA/PG_VERSION")"
    dir="/usr/lib/postgresql/$version/bin"
  else
    dir="$(find /usr/lib/postgresql -mindepth 2 -maxdepth 2 -type d -name bin 2>/dev/null | sort -V | tail -1)"
  fi
  [ -n "$dir" ] && [ -x "$dir/initdb" ] || fail "Keine PostgreSQL-Serverprogramme gefunden (/usr/lib/postgresql/*/bin/initdb)."
  version="$(basename "$(dirname "$dir")")"
  [ "${version%%.*}" -ge 17 ] 2>/dev/null || fail "PostgreSQL $version gefunden, gebraucht wird 17 oder neuer (die Produktion laeuft auf 17)."
  echo "$dir"
}

pgb() { [ -n "$PGB" ] || PGB="$(find_pg_bin)"; }

# psql an den Socket der Testinstanz, sonst nirgendwohin. -X: keine ~/.psqlrc.
tpsql() {
  pgb
  "$PGB/psql" -X -h "$PG_RUN" -p "$PG_PORT" "$@"
}

pg_ready() {
  pgb
  "$PGB/pg_isready" -q -h "$PG_RUN" -p "$PG_PORT" >/dev/null 2>&1
}

# Der Cluster laeuft als voruebergehender systemd-Dienst des Benutzers (systemd-run): So gehoert
# er nicht zur SSH-Sitzung und laeuft weiter, wenn das Fenster zugeht. Nach einem Neustart des
# Servers ist er weg (Absicht, siehe postgrest-zeugnio-test.service) und kommt mit `start`.
# KillSignal=SIGINT heisst «fast shutdown»: offene Verbindungen (PostgREST) werden getrennt,
# statt dass das Stoppen auf sie wartet. KillMode=mixed schickt das Signal nur dem Hauptprozess,
# der seine Kindprozesse selbst beendet (so steht es auch in der Unit von PostgreSQL selbst).
pg_start() {
  local pid
  pgb
  if pg_ready; then info "Test-Cluster laeuft schon (Socket $PG_RUN, Port $PG_PORT)"; return 0; fi
  [ -f "$PG_DATA/PG_VERSION" ] || fail "Kein Test-Cluster unter $PG_DATA. Zuerst: aufbau-db"
  pid="$(pg_live_postmaster)"
  [ -z "$pid" ] || fail "Der Postmaster des Test-Clusters laeuft schon (PID $pid), antwortet aber noch nicht. Eine Minute warten und start wiederholen; hilft das nicht: stopp, dann start."
  # Nach einem OOM-Kill oder Absturz bleibt postmaster.pid liegen, und postgres verweigert den
  # Start («lock file already exists»), sobald die alte PID wieder vergeben ist.
  pg_clear_stale_pidfile
  systemctl --user reset-failed "$PG_UNIT" >/dev/null 2>&1 || true
  systemd-run --user --quiet --unit="$PG_UNIT" \
    --description="PostgreSQL Wegwerf-Cluster der zeugnio-Testinstanz" \
    -p KillSignal=SIGINT -p KillMode=mixed -p TimeoutStopSec=60 -p MemoryMax=1G \
    "$PGB/postgres" -D "$PG_DATA" \
    || fail "Der Test-Cluster laesst sich nicht starten (systemctl --user status $PG_UNIT)."
  local i
  for i in $(seq 1 60); do
    if pg_ready; then info "Test-Cluster laeuft (Socket $PG_RUN, Port $PG_PORT, nur Benutzer www-zeugnio)"; return 0; fi
    sleep 1
  done
  tail -20 "$PG_LOG"/postgresql-*.log 2>/dev/null >&2 || true
  fail "Der Test-Cluster antwortet nach 60 s nicht (journalctl --user -u $PG_UNIT)."
}

pg_stop() {
  local pid
  if systemctl --user is-active --quiet "$PG_UNIT" 2>/dev/null; then
    systemctl --user stop "$PG_UNIT" || warn "systemctl --user stop $PG_UNIT meldet einen Fehler (journalctl --user -u $PG_UNIT)"
  fi
  systemctl --user reset-failed "$PG_UNIT" >/dev/null 2>&1 || true
  # Ein sauber beendeter Postmaster loescht postmaster.pid selbst. Liegt die Datei noch da, wurde
  # der Cluster entweder anders gestartet (z. B. von Hand mit pg_ctl), oder er ist hart beendet
  # worden (OOM-Kill, Absturz, harter Neustart) und die Datei ist verwaist.
  [ -f "$PG_DATA/postmaster.pid" ] || return 0
  # pg_ctl stop schickt der PID aus der Datei SIGINT, ohne zu pruefen, wer dahinter steckt. Nach
  # einem harten Ende kann der Kernel diese PID laengst einem anderen Prozess von www-zeugnio
  # gegeben haben: pm2, der App der Produktion, dem Dienst postgrest, dem Backup-Cron. Darum geht
  # ein Signal nur an eine PID, die nachweislich der Postmaster des Test-Clusters ist.
  pid="$(pg_live_postmaster)"
  if [ -n "$pid" ]; then
    pgb
    info "Postmaster des Test-Clusters (PID $pid) laeuft ausserhalb von $PG_UNIT - pg_ctl stop"
    "$PGB/pg_ctl" -D "$PG_DATA" -m fast -w stop || fail "pg_ctl stop ist gescheitert (Meldung oben). Nichts geloescht."
  else
    pg_clear_stale_pidfile
  fi
}

# Gehoert die PID nachweislich zum Test-Cluster? Zwei Merkmale zusammen:
#   1. Der Prozess steht im Datenverzeichnis des Test-Clusters. Der Postmaster und jeder seiner
#      Kindprozesse wechseln beim Start dorthin (chdir), ein fremder Prozess nie. Prozesse eines
#      anderen Benutzers geben /proc/<pid>/cwd gar nicht preis und fallen damit heraus.
#   2. Das Programm ist postgres. Damit faellt auch eine Shell heraus, die zufaellig in diesem
#      Ordner steht (cd ~/zeugnio-test/pg/data).
pg_is_test_process() {
  local pid="$1" real comm exe
  [[ "$pid" =~ ^[0-9]+$ ]] || return 1
  real="$(readlink -f "$PG_DATA" 2>/dev/null)" || return 1
  [ -n "$real" ] && [ "$(readlink -f "/proc/$pid/cwd" 2>/dev/null)" = "$real" ] || return 1
  comm="$(cat "/proc/$pid/comm" 2>/dev/null || true)"
  [ "$comm" = "postgres" ] && return 0
  exe="$(readlink "/proc/$pid/exe" 2>/dev/null || true)"
  case "$exe" in */postgres | */postgres" (deleted)") return 0 ;; esac
  return 1
}

# Die PID aus postmaster.pid, aber nur, wenn dahinter der Postmaster des Test-Clusters laeuft.
# Sonst leer.
pg_live_postmaster() {
  local pid
  [ -f "$PG_DATA/postmaster.pid" ] || return 0
  # || true: Der Postmaster kann die Datei beim Herunterfahren genau jetzt loeschen.
  pid="$(head -1 "$PG_DATA/postmaster.pid" 2>/dev/null | tr -dc '0-9' || true)"
  pg_is_test_process "$pid" && echo "$pid"
  return 0
}

# Alle postgres-Prozesse dieses Benutzers, die zum Test-Cluster gehoeren (Postmaster und Kinder).
pg_data_pids() {
  local p
  for p in $(pgrep -u "$(id -u)" 2>/dev/null || true); do
    pg_is_test_process "$p" && echo "$p"
  done
  return 0
}

# Eine postmaster.pid, hinter der kein Postmaster des Test-Clusters mehr steht, bekommt kein
# Signal, sie wird nur entfernt. Aber nicht, solange noch Kindprozesse des abgestuerzten
# Clusters laufen: Sie haengen am gemeinsamen Speicher, und ein zweiter Postmaster daneben
# koennte die Daten beschaedigen. postgres selbst erkennt das nur, solange die Datei da ist.
pg_clear_stale_pidfile() {
  local pid others
  [ -f "$PG_DATA/postmaster.pid" ] || return 0
  [ -z "$(pg_live_postmaster)" ] || return 0
  pid="$(head -1 "$PG_DATA/postmaster.pid" 2>/dev/null | tr -dc '0-9' || true)"
  others="$(pg_data_pids | paste -sd ' ' -)"
  if [ -n "$others" ]; then
    warn "postmaster.pid nennt PID ${pid:-?}, das ist nicht der Postmaster des Test-Clusters."
    fail "Im Datenverzeichnis laufen noch postgres-Prozesse des Test-Clusters (PID $others), Reste nach einem Absturz. Kein Signal gesendet, nichts geloescht. Diese PIDs gehoeren nachweislich zum Test-Cluster. Beenden mit: kill $others - dann denselben Befehl wiederholen."
  fi
  rm -f -- "$PG_DATA/postmaster.pid"
  info "verwaiste postmaster.pid entfernt (PID ${pid:-?} ist nicht der Postmaster des Test-Clusters, darum kein Signal an sie)"
}

# --- Kleinigkeiten -----------------------------------------------------------------------------
port_in_use() {
  command -v ss >/dev/null 2>&1 || return 1
  ss -ltnH "sport = :$1" 2>/dev/null | grep -q .
}

newest_backup() {
  find "$PROD_BACKUPS" -maxdepth 1 -type f -name 'zeugnio-*.pg.sql.gz.enc' -printf '%f\n' 2>/dev/null | sort | tail -1
}

# Alter in Stunden aus dem Zeitstempel im Namen (zeugnio-2026-11-21T05-15-00...), wie restore-test.sh.
backup_age_hours() {
  local stamp="${1#zeugnio-}"
  stamp="${stamp:0:19}"
  [[ "$stamp" =~ ^([0-9]{4}-[0-9]{2}-[0-9]{2})T([0-9]{2})-([0-9]{2})-([0-9]{2})$ ]] || { echo "?"; return 0; }
  echo $(( ($(date -u +%s) - $(date -u -d "${BASH_REMATCH[1]} ${BASH_REMATCH[2]}:${BASH_REMATCH[3]}:${BASH_REMATCH[4]}" +%s)) / 3600 ))
}

kit_value() {
  sed -n "s/^$1=[\"']\{0,1\}\([^\"']*\)[\"']\{0,1\}[[:space:]]*\$/\1/p" "$KIT_CONF" 2>/dev/null | tail -1
}

repo_branch() { git -C "$REPO_DIR" rev-parse --abbrev-ref HEAD 2>/dev/null || echo "?"; }

wait_http() {
  local url="$1" seconds="$2" i
  for i in $(seq 1 "$seconds"); do
    if curl -fsS --max-time 3 "$url" >/dev/null 2>&1; then return 0; fi
    sleep 1
  done
  return 1
}

need_file() { [ -f "$1" ] || fail "$1 fehlt${2:+ ($2)}."; }

# --- Arbeitsspeicher ---------------------------------------------------------------------------
# Der Build laeuft im Kit mit einem Speicherdeckel (systemd-run -p MemoryMax, BUILD_MEMORY_MAX).
# Dieser Deckel schuetzt die Produktion aber nur, wenn der Server so viel wirklich frei hat. Sonst
# ist der Speicher weg, bevor der Build seinen Deckel erreicht, und nicht der Deckel greift,
# sondern der OOM-Killer des ganzen Servers. Der waehlt sein Opfer selbst: die App der
# Produktion, PostgREST oder das PostgreSQL von nine und damit alle Produkte (Kommentar in
# deploy.sh des Kits). Darum ist zu wenig freier Speicher hier ein Fehler, keine Warnung.
TEST_MEM_MB=1000   # Testinstanz im Betrieb: Cluster (Deckel 1G, braucht weniger), PostgREST, App
MEM_RESERVE_MB=500 # Luft fuer die App der Testinstanz nach dem Build und Schwankungen der Produktion

# Speicherdeckel des Builds in MB, so wie deploy.sh ihn setzt (lib/common.sh: ohne Eintrag 3G).
# Leer, wenn kit.conf den Deckel abschaltet (BUILD_MEMORY_MAX="") oder das Format unbekannt ist.
build_cap_mb() {
  local value="3G"
  if grep -q '^BUILD_MEMORY_MAX=' "$KIT_CONF" 2>/dev/null; then value="$(kit_value BUILD_MEMORY_MAX)"; fi
  if [[ "$value" =~ ^([0-9]+)G$ ]]; then echo $(( BASH_REMATCH[1] * 1024 ))
  elif [[ "$value" =~ ^([0-9]+)M$ ]]; then echo "${BASH_REMATCH[1]}"
  fi
  return 0
}

# MemAvailable ist, was der Kernel ohne Auslagern noch hergeben kann (freier Speicher plus Cache,
# den er verwerfen darf). Prueft es gegen den Bedarf; Rueckgabe 1, wenn es nicht reicht.
mem_enough() {
  local need="$1" what="$2" mem
  mem="$(awk '/^MemAvailable:/ { print int($2 / 1024) }' /proc/meminfo 2>/dev/null || true)"
  if ! [[ "$mem" =~ ^[0-9]+$ ]]; then warn "MemAvailable nicht lesbar (/proc/meminfo)"; return 1; fi
  info "Arbeitsspeicher verfuegbar: $mem MB, gebraucht: $need MB ($what)"
  if [ "$mem" -lt "$need" ]; then
    warn "zu wenig Arbeitsspeicher frei ($mem MB statt mindestens $need MB). Nicht weitermachen: Der Build koennte die Produktion treffen. Laeuft gerade ein anderer Build (pgrep -fa 'next build'), warten und neu pruefen; sonst zeigt free -m die Lage."
    return 1
  fi
  return 0
}

# Laeuft schon ein Teil der Testinstanz, ist sein Speicher in MemAvailable bereits abgezogen.
# Dann braucht es nur noch den Build plus Reserve, sonst zusaetzlich die Testinstanz selbst.
mem_check_for_build() {
  local cap
  cap="$(build_cap_mb)"
  if [ -z "$cap" ]; then
    warn "kit.conf: BUILD_MEMORY_MAX ist leer oder nicht als <Zahl>G/<Zahl>M lesbar - ohne Speicherdeckel darf neben der Produktion kein Build laufen"
    return 1
  fi
  if pg_ready || systemctl --user is-active --quiet "$API_UNIT" 2>/dev/null; then
    mem_enough $(( cap + MEM_RESERVE_MB )) "Build bis $cap MB, Reserve $MEM_RESERVE_MB MB; Cluster und PostgREST laufen schon"
  else
    mem_enough $(( TEST_MEM_MB + cap )) "Testinstanz rund $TEST_MEM_MB MB, Build bis $cap MB"
  fi
}

# --- vorpruefung -------------------------------------------------------------------------------
cmd_vorpruefung() {
  require_user
  load_node
  local ok=1 f name age branch eco_name avail

  log "Checkout ($REPO_DIR)"
  branch="$(repo_branch)"
  info "Branch $branch, Stand $(git -C "$REPO_DIR" log -1 --format='%h %cd %s' --date=format:'%d.%m. %H:%M' 2>/dev/null || echo '?')"
  for f in supabase/900_0_nine_rollen.sql supabase/903_nine_verify.sql supabase/906_auth_eigen.sql \
    supabase/907_auth_eigen_verify.sql deploy/nine/postgrest-conf.mjs deploy/nine/postgrest-probe.mjs \
    deploy/nine/postgrest-zeugnio-test.service deploy/nine/testinstanz-env.mjs scripts/check-env.mjs; do
    if [ -f "$REPO_DIR/$f" ]; then info "$f vorhanden"; else warn "FEHLT: $f - ist main in den PR-#91-Branch gemergt?"; ok=0; fi
  done
  # Die drei Aenderungen aus main, ohne die zwei Instanzen nicht nebeneinander laufen.
  eco_name="$(APP_DIR="$TEST_DIR" PORT="$APP_PORT" node -e \
    'const c = require(process.argv[1]); const a = (c.apps || [])[0] || {}; console.log(`${a.name} ${a.args}`);' \
    "$REPO_DIR/deploy/nine/ecosystem.config.cjs" 2>/dev/null || true)"
  if [ "$eco_name" = "$TEST_APP start --hostname 127.0.0.1 --port $APP_PORT" ]; then
    info "ecosystem.config.cjs: Name und Port aus APP_DIR/PORT ($TEST_APP, $APP_PORT)"
  else
    warn "ecosystem.config.cjs ergibt '$eco_name' statt $TEST_APP auf $APP_PORT - Stand von main fehlt im Branch"; ok=0
  fi
  if grep -q 'searchParams.get("host")' "$REPO_DIR/scripts/migrate.mjs" 2>/dev/null; then
    info "scripts/migrate.mjs versteht host= (Socket)"
  else
    warn "scripts/migrate.mjs versteht host= nicht - Stand von main fehlt im Branch"; ok=0
  fi
  if grep -q 'postgrest-zeugnio-test' "$REPO_DIR/deploy/nine/hooks/post-migrate.sh" 2>/dev/null \
    && grep -q 'postgrest-zeugnio-test' "$REPO_DIR/deploy/nine/hooks/check.sh" 2>/dev/null; then
    info "Hooks post-migrate und check kennen $API_UNIT"
  else
    warn "Hooks post-migrate/check kennen $API_UNIT nicht - Stand von main fehlt im Branch"; ok=0
  fi
  # Das Kit klont beim Deploy den Branch frisch von GitHub. Haengt dieser Checkout hinterher,
  # passen 906/907 hier nicht zum Code, der gleich laeuft.
  if git -C "$REPO_DIR" fetch --quiet --depth 1 origin "$branch" 2>/dev/null; then
    if [ "$(git -C "$REPO_DIR" rev-parse HEAD)" = "$(git -C "$REPO_DIR" rev-parse FETCH_HEAD)" ]; then
      info "Checkout ist auf dem Stand von GitHub"
    else
      warn "GitHub hat einen neueren Stand von $branch. Zuerst: git -C $REPO_DIR pull --ff-only"; ok=0
    fi
  else
    warn "Stand auf GitHub nicht abfragbar (Netz?)"
  fi

  log "Kit ($KIT_DIR)"
  need_file "$KIT_DIR/deploy.sh" "Kit fehlt"
  need_file "$KIT_DIR/decrypt.mjs" "Kit zu alt"
  if [ -f "$KIT_CONF" ]; then
    info "$KIT_CONF vorhanden"
    [ "$(kit_value APP_NAME)" = "$TEST_APP" ] || { warn "kit.conf: APP_NAME ist nicht $TEST_APP"; ok=0; }
    [ "$(kit_value PORT)" = "$APP_PORT" ] || { warn "kit.conf: PORT ist nicht $APP_PORT"; ok=0; }
    [ "$(kit_value PRE_DEPLOY_BACKUP)" = "never" ] || { warn "kit.conf: PRE_DEPLOY_BACKUP muss never sein"; ok=0; }
    [ "$(kit_value BACKUP_OFFSITE)" = "off" ] || { warn "kit.conf: BACKUP_OFFSITE muss off sein"; ok=0; }
    if [ "$(kit_value BRANCH)" = "$branch" ]; then
      info "kit.conf: BRANCH $branch (gleich wie dieser Checkout)"
    else
      warn "kit.conf: BRANCH '$(kit_value BRANCH)' ist nicht der Branch dieses Checkouts ($branch)"; ok=0
    fi
  else
    warn "FEHLT: $KIT_CONF (Runbook Schritt 1)"; ok=0
  fi

  log "Produktion (nur lesen)"
  [ -r "$PROD_ENV" ] && info "$PROD_ENV lesbar" || { warn "$PROD_ENV nicht lesbar"; ok=0; }
  [ -r "$PROD_KEY" ] && info "$PROD_KEY lesbar" || { warn "$PROD_KEY nicht lesbar"; ok=0; }
  name="$(newest_backup)"
  if [ -n "$name" ]; then
    age="$(backup_age_hours "$name")"
    info "juengste Sicherung: $name ($age h alt)"
    if [ "$age" != "?" ] && [ "$age" -gt 26 ]; then warn "Die juengste Sicherung ist aelter als 26 h - laeuft der Backup-Cron?"; fi
  else
    warn "keine Sicherung zeugnio-*.pg.sql.gz.enc in $PROD_BACKUPS"; ok=0
  fi

  log "Programme und Ports"
  PGB="$(find_pg_bin)"
  info "PostgreSQL-Programme: $PGB ($("$PGB/postgres" --version))"
  if [ -x "$POSTGREST_BIN" ]; then info "PostgREST: $("$POSTGREST_BIN" --version 2>/dev/null | head -1)"; else warn "PostgREST fehlt: $POSTGREST_BIN"; ok=0; fi
  command -v pm2 >/dev/null 2>&1 && info "pm2 $(pm2 -v 2>/dev/null)" || { warn "pm2 fehlt"; ok=0; }
  if systemctl --user show-environment >/dev/null 2>&1; then info "systemctl --user erreichbar"; else warn "systemctl --user nicht erreichbar (direkt per SSH als www-zeugnio anmelden, nicht ueber nine-su)"; ok=0; fi
  local test_api=0 test_app=0
  systemctl --user is-active --quiet "$API_UNIT" 2>/dev/null && test_api=1
  pm2 describe "$TEST_APP" >/dev/null 2>&1 && test_app=1
  for f in "$APP_PORT" "$API_PORT" "$API_ADMIN_PORT"; do
    if ! port_in_use "$f"; then
      info "Port $f frei"
    elif { [ "$f" = "$APP_PORT" ] && [ "$test_app" = 1 ]; } || { [ "$f" != "$APP_PORT" ] && [ "$test_api" = 1 ]; }; then
      info "Port $f belegt von der Testinstanz selbst (laeuft schon)"
    else
      warn "Port $f ist belegt (ss -ltnp | grep $f)"; ok=0
    fi
  done
  command -v ss >/dev/null 2>&1 || warn "ss fehlt - Ports nicht geprueft"
  if [ -S "$PG_RUN/.s.PGSQL.$PG_PORT" ]; then info "Test-Cluster laeuft schon ($PG_RUN)"; else info "Socket $PG_PORT frei"; fi

  log "Platz"
  avail="$(df -Pm "$HOME" | awk 'NR == 2 { print $4 }')"
  info "frei in $HOME: ${avail} MB (gebraucht: rund 3000 MB fuer zwei Versionen und die Datenbank)"
  [ "${avail:-0}" -ge 3000 ] || { warn "weniger als 3000 MB frei"; ok=0; }
  # Vor dem Deploy (Schritt 7) prueft vor-deploy dasselbe nochmals, dann mit laufendem Cluster.
  mem_check_for_build || ok=0

  log "Testinstanz ($TEST_DIR)"
  if [ -d "$TEST_DIR" ]; then
    info "vorhanden: $(find "$TEST_DIR" -mindepth 1 -maxdepth 1 -printf '%f ' | sort)"
    [ -f "$MARK_FILE" ] && info "$(head -1 "$MARK_FILE")"
  else
    info "noch nicht angelegt"
  fi

  if [ "$ok" = 1 ]; then log "Vorpruefung ok."; else fail "Nicht alle Voraussetzungen erfuellt (WARNUNG-Zeilen oben)."; fi
}

# --- aufbau-db ---------------------------------------------------------------------------------
# Rollen gehoeren zum Cluster, nicht zur Datenbank. pg_dump nimmt sie darum nicht mit, und der
# Auszug nennt sie trotzdem (OWNER TO, GRANT). Darum zuerst die Rollen so, wie nine und
# 900_0_nine_rollen.sql sie in der Produktion angelegt haben, dann die Datenbank mit den Rechten,
# die nine vorgibt, dann der Auszug.
sql_roles_pre() {
  cat <<'SQL'
\set ON_ERROR_STOP on
-- Was nine vorgibt (Kopf von 900_0_nine_rollen.sql, gemessen am 6.11.2026):
--   nmd             gehoert die Datenbank
--   nmd_zeugnio     Anmeldebenutzer der App, wechselt beim Anmelden sofort in nmd_zeugnio_rw
--   nmd_zeugnio_rw  Schreibrolle, besitzt Schemas, Tabellen und Funktionen
--   nmd_zeugnio_ro  Leserolle, ueber sie erbt authenticator das CONNECT
do $$
begin
  if not exists (select 1 from pg_roles where rolname = 'nmd') then create role nmd nologin; end if;
  if not exists (select 1 from pg_roles where rolname = 'nmd_zeugnio_rw') then create role nmd_zeugnio_rw nologin; end if;
  if not exists (select 1 from pg_roles where rolname = 'nmd_zeugnio_ro') then create role nmd_zeugnio_ro nologin; end if;
  if not exists (select 1 from pg_roles where rolname = 'nmd_zeugnio') then create role nmd_zeugnio login; end if;
end
$$;
grant nmd_zeugnio_rw to nmd_zeugnio;
alter role nmd_zeugnio set role = 'nmd_zeugnio_rw';
SQL
}

create_db() {
  tpsql -U "$PG_ADMIN" -d postgres -q -v ON_ERROR_STOP=1 <<SQL
create database $DB_NAME owner nmd encoding 'UTF8' template template0;
-- nine: PUBLIC hat kein CONNECT und kein TEMPORARY (900_0 Punkt 2, 901 Kopf). CONNECT haben
-- nur die Lese- und die Schreibrolle; alle anderen erben es von ihnen.
revoke all on database $DB_NAME from public;
grant connect on database $DB_NAME to nmd_zeugnio_ro, nmd_zeugnio_rw;
SQL
}

restore_dump() {
  local file="$1" round role
  for round in $(seq 1 30); do
    # Eine Transaktion (-1 mit -f -): Scheitert eine Anweisung, ist nichts eingespielt, und der
    # naechste Durchgang beginnt in einer leeren Datenbank.
    if node "$KIT_DIR/decrypt.mjs" --key "$PROD_KEY" --gunzip "$file" 2>"$PG_LOG/decrypt.err" \
      | tpsql -U "$PG_ADMIN" -d "$DB_NAME" -q -v ON_ERROR_STOP=1 --single-transaction -f - >/dev/null 2>"$PG_LOG/restore.err"; then
      rm -f "$PG_LOG/restore.err" "$PG_LOG/decrypt.err"
      return 0
    fi
    role="$(sed -n 's/.*ERROR: *role "\([^"]*\)" does not exist.*/\1/p' "$PG_LOG/restore.err" | head -1)"
    if [ -z "$role" ]; then
      if ! grep -q 'ERROR' "$PG_LOG/restore.err" && [ -s "$PG_LOG/decrypt.err" ]; then
        cat "$PG_LOG/decrypt.err" >&2
        fail "Die Sicherung laesst sich nicht entschluesseln (Meldung oben). Nichts eingespielt."
      fi
      # Nur die Fehlerzeilen, gekuerzt: Die Zeilen danach (CONTEXT) koennten Daten enthalten.
      grep -E '^(psql:|ERROR)' "$PG_LOG/restore.err" | head -5 | cut -c1-300 >&2 || true
      fail "Einspielen gescheitert (Meldung oben, ganz in $PG_LOG/restore.err). Die Transaktion ist zurueckgerollt."
    fi
    info "Rolle $role kommt im Auszug vor, fehlt im Cluster - als NOLOGIN angelegt, Einspielen beginnt neu."
    tpsql -U "$PG_ADMIN" -d postgres -q -v ON_ERROR_STOP=1 -c "create role \"${role//\"/\"\"}\" nologin" >/dev/null
  done
  fail "Nach 30 Durchgaengen fehlen noch immer Rollen - Auszug pruefen."
}

cmd_aufbau_db() {
  require_user
  load_node
  local neu=0 file=""
  while [ $# -gt 0 ]; do
    case "$1" in
      --neu) neu=1 ;;
      --datei) file="${2:-}"; [ -n "$file" ] || fail "--datei braucht einen Pfad."; shift ;;
      *) fail "Unbekannte Option fuer aufbau-db: $1" ;;
    esac
    shift
  done

  if [ -e "$PG_DATA" ]; then
    [ "$neu" = 1 ] || fail "Es gibt schon einen Test-Cluster ($PG_DATA). Neu aufbauen (verwirft die Testdaten): aufbau-db --neu"
    log "Bestehenden Test-Cluster verwerfen"
    if systemctl --user is-active --quiet "$API_UNIT" 2>/dev/null; then systemctl --user stop "$API_UNIT"; info "$API_UNIT gestoppt"; fi
    pg_stop
    rm -rf -- "${PG_DIR:?}"
    rm -f -- "$MARK_FILE"
    info "$PG_DIR entfernt"
  fi

  if [ -z "$file" ]; then
    file="$(newest_backup)"
    [ -n "$file" ] || fail "Keine Sicherung in $PROD_BACKUPS."
    file="$PROD_BACKUPS/$file"
  fi
  need_file "$file"
  need_file "$PROD_KEY"
  need_file "$KIT_DIR/decrypt.mjs" "Kit"
  need_file "$REPO_DIR/supabase/900_0_nine_rollen.sql"

  log "1. Ordner und Cluster (initdb)"
  mkdir -p "$TEST_DIR" "$PG_RUN" "$PG_LOG"
  chmod 700 "$TEST_DIR" "$PG_DIR" "$PG_RUN" "$PG_LOG"
  PGB="$(find_pg_bin)"
  info "Programme: $PGB ($("$PGB/postgres" --version))"
  "$PGB/initdb" -D "$PG_DATA" -U "$PG_ADMIN" -A trust -E UTF8 --locale=C.UTF-8 >"$PG_LOG/initdb.log" 2>&1 \
    || { tail -20 "$PG_LOG/initdb.log" >&2; fail "initdb ist gescheitert."; }
  # Am Ende angehaengt, darum gelten diese Werte (spaetere Zeilen gewinnen).
  cat >>"$PG_DATA/postgresql.conf" <<CONF

# --- zeugnio-Testinstanz (deploy/nine/testinstanz.sh) ---------------------------------------
# Kein Netz: nur ein Socket im eigenen Ordner. Ordner und Socket haben Rechte 700, also kommt
# nur der Benutzer www-zeugnio heran - dieselbe Grenze, die auch ~/zeugnio/shared/.env schuetzt.
listen_addresses = ''
unix_socket_directories = '$PG_RUN'
unix_socket_permissions = 0700
port = $PG_PORT
max_connections = 30
shared_buffers = 64MB
# Protokoll in eine Datei unter ~/zeugnio-test, nicht ins Journal: Fehlermeldungen koennen
# Daten aus der Kopie enthalten, und die Datei verschwindet mit dem Abbau.
logging_collector = on
log_directory = '$PG_LOG'
log_filename = 'postgresql-%a.log'
log_truncate_on_rotation = on
lc_messages = 'C'
CONF
  # initdb -A trust erlaubt auch 127.0.0.1 und ::1. Hier bleibt nur der Socket.
  cat >"$PG_DATA/pg_hba.conf" <<'HBA'
# zeugnio-Testinstanz: nur ueber den Socket, ohne Passwort (trust). An den Socket kommt nur
# www-zeugnio (Rechte 700). Kein TCP: listen_addresses ist leer.
local   all   all   trust
HBA
  info "Cluster angelegt: $PG_DATA (Superuser $PG_ADMIN, nur Socket, Port $PG_PORT)"

  log "2. Cluster starten"
  pg_start

  log "3. Rollen wie in der Produktion"
  sql_roles_pre | tpsql -U "$PG_ADMIN" -d postgres -q -v ON_ERROR_STOP=1
  info "nmd, nmd_zeugnio (Anmeldung, wechselt in nmd_zeugnio_rw), nmd_zeugnio_rw, nmd_zeugnio_ro"
  create_db
  info "Datenbank $DB_NAME, Eigentuemer nmd, CONNECT nur fuer nmd_zeugnio_ro und nmd_zeugnio_rw"
  info "Jetzt 900_0_nine_rollen.sql aus dem Repo (anon, authenticated, service_role, authenticator):"
  tpsql -U "$PG_ADMIN" -d "$DB_NAME" -v ON_ERROR_STOP=1 -v app="$APP_ROLE" -f "$REPO_DIR/supabase/900_0_nine_rollen.sql"

  log "4. Sicherung einspielen"
  info "Datei: $(basename "$file") ($(du -h "$file" | cut -f1) verschluesselt, $(backup_age_hours "$(basename "$file")") h alt)"
  info "Entschluesselt wird nur im Speicher (Pipe), nichts landet unverschluesselt auf der Platte."
  restore_dump "$file"
  info "ohne Fehler eingespielt (eine Transaktion)"
  {
    echo "Datenkopie der Produktion aus $(basename "$file"), eingespielt am $(date '+%d.%m.%Y %H:%M')."
    echo "Enthaelt echte Personendaten. Gleich nach dem Test abbauen: testinstanz.sh abbau --ja"
  } >"$MARK_FILE"

  log "5. Inhalt (nur Zahlen)"
  tpsql -U "$PG_ADMIN" -d "$DB_NAME" -At -F '|' -v ON_ERROR_STOP=1 <<'SQL' | while IFS='|' read -r what count; do info "$(printf '%-32s %s' "$what" "$count")"; done
select 'Tabellen', count(*) from information_schema.tables
 where table_type = 'BASE TABLE' and table_schema not in ('pg_catalog', 'information_schema');
select 'Migrationen', count(*) from public.schema_migrations;
select 'auth.users', count(*) from auth.users;
select 'public.companies', (xpath('/row/n/text()', query_to_xml('select count(*) as n from public.companies', false, true, '')))[1]::text
 where to_regclass('public.companies') is not null;
select 'public.certificates', (xpath('/row/n/text()', query_to_xml('select count(*) as n from public.certificates', false, true, '')))[1]::text
 where to_regclass('public.certificates') is not null;
select '906 schon drin (auth.sessions)', (to_regclass('auth.sessions') is not null)::text;
SQL
  info "Letzte Migration: $(tpsql -U "$PG_ADMIN" -d "$DB_NAME" -At -c 'select max(filename) from public.schema_migrations')"

  log "Fertig. Weiter mit: db-pruefen, dann env"
}

# --- db-pruefen --------------------------------------------------------------------------------
cmd_db_pruefen() {
  require_user
  pg_ready || fail "Der Test-Cluster laeuft nicht. Zuerst: start"
  log "903_nine_verify.sql gegen $DB_NAME, als $APP_ROLE (wie in der Produktion)"
  info "Abschnitte mit «MUSS LEER SEIN» muessen leer sein, «MUSS t sein» muss t zeigen."
  tpsql -U "$APP_ROLE" -d "$DB_NAME" -v ON_ERROR_STOP=1 -f "$REPO_DIR/supabase/903_nine_verify.sql"
  log "903 ohne Abbruch durchgelaufen. Ergebnisse oben mit den Erwartungen vergleichen."
}

# --- env ---------------------------------------------------------------------------------------
cmd_env() {
  require_user
  load_node
  local neu=""
  case "${1:-}" in "") ;; --neu) neu=1 ;; *) fail "Unbekannte Option fuer env: $1" ;; esac
  need_file "$PROD_ENV"
  need_file "$REPO_DIR/deploy/nine/testinstanz-env.mjs"
  mkdir -p "$SHARED"
  chmod 700 "$TEST_DIR" "$SHARED"

  log "Test-.env aus der Produktions-.env ableiten (es wird kein Wert angezeigt)"
  TESTINSTANZ_PROD_ENV="$PROD_ENV" \
    TESTINSTANZ_DIR="$TEST_DIR" \
    TESTINSTANZ_ENV="$SHARED/.env" \
    TESTINSTANZ_PG_SOCKET="$PG_RUN" \
    TESTINSTANZ_PG_PORT="$PG_PORT" \
    TESTINSTANZ_DB="$DB_NAME" \
    TESTINSTANZ_DB_USER="$APP_ROLE" \
    TESTINSTANZ_API_PORT="$API_PORT" \
    TESTINSTANZ_SITE_URL="$SITE_URL" \
    TESTINSTANZ_UPLOAD_DIR="$UPLOAD_DIR" \
    TESTINSTANZ_NEU="$neu" \
    node "$REPO_DIR/deploy/nine/testinstanz-env.mjs"

  log "Pruefung nach den Regeln der App (scripts/check-env.mjs, nur Befunde)"
  (cd "$REPO_DIR" && node --env-file="$SHARED/.env" scripts/check-env.mjs) \
    || fail "check-env meldet Fehler (oben). So wuerde auch das Deployment abbrechen."
  if [ -f "$SHARED/postgrest.conf" ]; then
    warn "postgrest.conf gibt es schon. Die neue .env hat ein neues DATA_API_JWT_SECRET: jetzt postgrest --neu"
  fi
  if pm2 describe "$TEST_APP" >/dev/null 2>&1; then
    warn "$TEST_APP laeuft schon. Die Werte wirken erst nach einem neuen Deploy: ~/kit/deploy.sh $TEST_APP"
  fi
  log "Fertig. Weiter mit: postgrest"
}

# --- postgrest ---------------------------------------------------------------------------------
cmd_postgrest() {
  require_user
  load_node
  local neu=0 force=() db_uri
  case "${1:-}" in "") ;; --neu) neu=1; force=(--force) ;; *) fail "Unbekannte Option fuer postgrest: $1" ;; esac
  need_file "$SHARED/.env" "zuerst: env"
  [ -x "$POSTGREST_BIN" ] || fail "PostgREST fehlt: $POSTGREST_BIN"
  pg_ready || fail "Der Test-Cluster laeuft nicht. Zuerst: aufbau-db (oder start)"

  log "1. postgrest.conf der Testinstanz"
  if [ -f "$SHARED/postgrest.conf" ] && [ "$neu" = 0 ]; then
    info "$SHARED/postgrest.conf gibt es schon - bleibt (neu schreiben: postgrest --neu)"
  else
    # Kein Passwort in der Adresse: Der Cluster laesst authenticator ueber den Socket herein.
    db_uri="postgresql:///$DB_NAME?host=$(node -e 'process.stdout.write(encodeURIComponent(process.argv[1]))' "$PG_RUN")&port=$PG_PORT&user=authenticator"
    ZEUGNIO_SHARED_DIR="$SHARED" \
      POSTGREST_DB_URI="$db_uri" \
      POSTGREST_SERVER_PORT="$API_PORT" \
      POSTGREST_ADMIN_PORT="$API_ADMIN_PORT" \
      node "$REPO_DIR/deploy/nine/postgrest-conf.mjs" "${force[@]}"
  fi
  # Gegenproben ohne Werte: Das Geheimnis der Testinstanz ist nicht das der Produktion, und .env
  # und postgrest.conf haben dasselbe (sonst antwortet die Daten-API auf alles mit 401).
  node - "$SHARED/.env" "$PROD_ENV" "$SHARED/postgrest.conf" <<'JS'
const { readFileSync } = require("node:fs");
const { parseEnv } = require("node:util");
const [testEnv, prodEnv, conf] = process.argv.slice(2);
const secret = (f) => parseEnv(readFileSync(f, "utf8")).DATA_API_JWT_SECRET ?? "";
const test = secret(testEnv);
const inConf = readFileSync(conf, "utf8").match(/^jwt-secret = "(.*)"$/m)?.[1] ?? "";
if (test === "" || test === secret(prodEnv)) {
  console.error("Fehler: DATA_API_JWT_SECRET der Testinstanz fehlt oder ist gleich wie in der Produktion. Abhilfe: env --neu, dann postgrest --neu.");
  process.exit(1);
}
if (test !== inConf) {
  console.error("Fehler: DATA_API_JWT_SECRET in der Test-.env und jwt-secret in postgrest.conf sind verschieden. Abhilfe: postgrest --neu");
  process.exit(1);
}
JS
  info "DATA_API_JWT_SECRET: eigener Wert, in .env und postgrest.conf gleich"

  log "2. Dienst $API_UNIT"
  mkdir -p "$UNIT_DIR"
  cp "$REPO_DIR/deploy/nine/$API_UNIT.service" "$UNIT_DIR/$API_UNIT.service"
  systemctl --user daemon-reload
  systemctl --user reset-failed "$API_UNIT" >/dev/null 2>&1 || true
  if systemctl --user is-active --quiet "$API_UNIT"; then
    systemctl --user restart "$API_UNIT"
    info "neu gestartet"
  else
    systemctl --user start "$API_UNIT"
    info "gestartet (absichtlich nicht enable: kein Autostart, siehe Unit-Datei)"
  fi
  if wait_http "http://127.0.0.1:$API_ADMIN_PORT/ready" 30; then
    info "bereit: http://127.0.0.1:$API_ADMIN_PORT/ready (Datenbank verbunden, Schema eingelesen)"
  else
    journalctl --user -u "$API_UNIT" -n 20 --no-pager >&2 || true
    fail "$API_UNIT meldet sich nicht bereit."
  fi
  log "Fertig. Weiter mit: anmeldung-db"
}

# --- anmeldung-db ------------------------------------------------------------------------------
cmd_anmeldung_db() {
  require_user
  load_node
  local out
  pg_ready || fail "Der Test-Cluster laeuft nicht. Zuerst: start"
  need_file "$REPO_DIR/supabase/906_auth_eigen.sql"
  need_file "$REPO_DIR/supabase/907_auth_eigen_verify.sql"

  log "1. 906_auth_eigen.sql als $APP_ROLE (wie spaeter in der Produktion)"
  tpsql -U "$APP_ROLE" -d "$DB_NAME" -v ON_ERROR_STOP=1 -f "$REPO_DIR/supabase/906_auth_eigen.sql" \
    || fail "906 ist gescheitert (Meldung oben). In der Produktion wuerde es an derselben Stelle scheitern - das ist ein Befund fuer PR #91."
  info "906 eingespielt"

  log "2. 907_auth_eigen_verify.sql (Probe, endet mit ROLLBACK)"
  out="$(tpsql -U "$APP_ROLE" -d "$DB_NAME" -v ON_ERROR_STOP=1 -f "$REPO_DIR/supabase/907_auth_eigen_verify.sql" 2>&1)" \
    || { printf '%s\n' "$out"; fail "907 ist gescheitert (Meldung oben)."; }
  printf '%s\n' "$out"
  printf '%s\n' "$out" | grep -q "907: ALLE PR" || fail "907 lief durch, meldet aber nicht «ALLE PRÜFUNGEN BESTANDEN»."
  info "907: alle Pruefungen bestanden"

  log "3. PostgREST liest das Schema neu ein"
  if systemctl --user is-active --quiet "$API_UNIT"; then
    systemctl --user reload "$API_UNIT"
    sleep 2
    info "systemctl --user reload $API_UNIT (ohne das: 404 auf /rpc/auth_*)"
    cmd_probe
  else
    warn "$API_UNIT laeuft nicht - Reload und Probe uebersprungen. Zuerst: postgrest"
  fi
  log "Fertig. Weiter mit: vor-deploy && ~/kit/deploy.sh $TEST_APP (Runbook Schritt 7)"
}

# --- vor-deploy --------------------------------------------------------------------------------
# Unmittelbar vor jedem ~/kit/deploy.sh zeugnio-test. Zwischen vorpruefung und Deploy liegen
# Cluster, PostgREST und eine halbe Stunde; der Speicher von damals sagt nichts mehr.
cmd_vor_deploy() {
  require_user
  local ok=1
  log "Vor dem Deploy von $TEST_APP"
  if pg_ready; then info "Test-Cluster laeuft (die Migrationen im Deploy brauchen ihn)"; else warn "Test-Cluster laeuft nicht. Zuerst: start"; ok=0; fi
  if curl -fsS --max-time 3 "http://127.0.0.1:$API_ADMIN_PORT/ready" >/dev/null 2>&1; then
    info "$API_UNIT bereit (der Hook post-migrate laedt ihn neu)"
  else
    warn "$API_UNIT ist nicht bereit. Zuerst: postgrest (oder start)"; ok=0
  fi
  mem_check_for_build || ok=0
  if [ "$ok" = 1 ]; then log "Bereit fuer ~/kit/deploy.sh $TEST_APP"; else fail "Nicht deployen (WARNUNG-Zeilen oben)."; fi
}

# --- probe -------------------------------------------------------------------------------------
cmd_probe() {
  require_user
  load_node
  need_file "$SHARED/.env" "zuerst: env"
  log "Probe der Test-Daten-API (postgrest-probe.mjs --auth-eigen)"
  ZEUGNIO_SHARED_DIR="$SHARED" POSTGREST_ADMIN_URL="http://127.0.0.1:$API_ADMIN_PORT" \
    node "$REPO_DIR/deploy/nine/postgrest-probe.mjs" --auth-eigen
}

# --- psql --------------------------------------------------------------------------------------
cmd_psql() {
  require_user
  pg_ready || fail "Der Test-Cluster laeuft nicht. Zuerst: start"
  tpsql -U "$APP_ROLE" -d "$DB_NAME" "$@"
}

# --- start / stopp -----------------------------------------------------------------------------
cmd_start() {
  require_user
  load_node
  log "Test-Cluster"
  pg_start
  log "Daten-API $API_UNIT"
  if [ -f "$UNIT_DIR/$API_UNIT.service" ]; then
    systemctl --user reset-failed "$API_UNIT" >/dev/null 2>&1 || true
    systemctl --user start "$API_UNIT"
    wait_http "http://127.0.0.1:$API_ADMIN_PORT/ready" 30 && info "bereit" || warn "$API_UNIT meldet sich nicht bereit"
  else
    info "noch nicht eingerichtet (postgrest)"
  fi
  log "App $TEST_APP"
  if pm2 describe "$TEST_APP" >/dev/null 2>&1; then
    pm2 restart "$TEST_APP" >/dev/null && info "pm2 restart $TEST_APP"
  else
    info "noch nicht deployt (~/kit/deploy.sh $TEST_APP)"
  fi
  cmd_status
}

cmd_stopp() {
  require_user
  load_node
  log "Testinstanz pausieren (Daten bleiben, start setzt fort)"
  if pm2 describe "$TEST_APP" >/dev/null 2>&1; then pm2 stop "$TEST_APP" >/dev/null && info "pm2 stop $TEST_APP"; fi
  if systemctl --user is-active --quiet "$API_UNIT" 2>/dev/null; then systemctl --user stop "$API_UNIT" && info "$API_UNIT gestoppt"; fi
  pg_stop
  info "Test-Cluster gestoppt"
  info "Die Datenkopie liegt weiter in $PG_DATA. Abbauen, sobald der Test vorbei ist: abbau --ja"
}

# --- status ------------------------------------------------------------------------------------
cmd_status() {
  require_user
  load_node
  local age_h
  log "Testinstanz $TEST_APP"
  if [ -f "$MARK_FILE" ]; then
    age_h=$(( ($(date +%s) - $(stat -c %Y "$MARK_FILE")) / 3600 ))
    info "$(head -1 "$MARK_FILE")"
    info "Die Kopie liegt seit $age_h h auf dem Server."
    [ "$age_h" -lt 24 ] || warn "Datenkopie seit ueber 24 h vorhanden - echte Personendaten. Nach dem Test: abbau --ja"
  else
    info "keine Datenkopie ($MARK_FILE fehlt)"
  fi
  if pg_ready; then
    info "Cluster: laeuft ($PG_RUN, Port $PG_PORT), Datenbank $(tpsql -U "$PG_ADMIN" -d "$DB_NAME" -At -c "select pg_size_pretty(pg_database_size(current_database()))" 2>/dev/null || echo '?')"
    info "906: $(tpsql -U "$PG_ADMIN" -d "$DB_NAME" -At -c "select case when to_regclass('auth.sessions') is null then 'fehlt' else 'eingespielt, ' || (select count(*) from auth.sessions) || ' Sitzungen' end" 2>/dev/null || echo '?')"
  else
    info "Cluster: laeuft nicht"
  fi
  if systemctl --user is-active --quiet "$API_UNIT" 2>/dev/null; then
    if curl -fsS --max-time 3 "http://127.0.0.1:$API_ADMIN_PORT/ready" >/dev/null 2>&1; then
      info "Daten-API: $API_UNIT laeuft und ist bereit (3014/3015)"
    else
      info "Daten-API: $API_UNIT laeuft, NICHT bereit"
    fi
  else
    info "Daten-API: $API_UNIT laeuft nicht"
  fi
  if pm2 describe "$TEST_APP" >/dev/null 2>&1; then
    info "App: pm2 kennt $TEST_APP ($(pm2 jlist 2>/dev/null | node -e 'let s="";process.stdin.on("data",d=>s+=d).on("end",()=>{try{const p=JSON.parse(s).find(x=>x.name===process.argv[1]);console.log(p?p.pm2_env.status:"?")}catch{console.log("?")}})' "$TEST_APP"))"
    if curl -fsS --max-time 5 "http://127.0.0.1:$APP_PORT/api/health" >/dev/null 2>&1; then
      info "App antwortet: http://127.0.0.1:$APP_PORT/api/health"
    else
      info "App antwortet NICHT auf http://127.0.0.1:$APP_PORT/api/health"
    fi
  else
    info "App: pm2 kennt $TEST_APP nicht"
  fi
  info "Produktion zum Vergleich: pm2 zeugnio und Dienst postgrest werden von diesem Skript nicht angefasst."
}

# --- abbau -------------------------------------------------------------------------------------
cmd_abbau() {
  require_user
  load_node
  local ja=0
  case "${1:-}" in "") ;; --ja) ja=1 ;; *) fail "Unbekannte Option fuer abbau: $1" ;; esac

  log "Abbau der Testinstanz - das kommt weg:"
  info "pm2-Prozess $TEST_APP (danach pm2 save) und seine Logs $PM2_LOGS/$TEST_APP-*"
  info "Dienst $API_UNIT und $UNIT_DIR/$API_UNIT.service"
  info "Test-Cluster $PG_UNIT mit der DATENKOPIE (echte Personendaten)"
  info "Ordner $TEST_DIR (Cluster, Versionen, .env, postgrest.conf, Logos-Kopie, Checkout)"
  info "Kit-Konfiguration $KIT_DIR/apps/$TEST_APP"
  info "NICHT angefasst: ~/zeugnio, pm2 zeugnio, Dienst postgrest, Crontab, Sicherungen"
  if [ "$ja" = 0 ]; then
    log "Nichts geloescht. Zum Ausfuehren: bash $TEST_DIR/setup/deploy/nine/testinstanz.sh abbau --ja"
    return 0
  fi
  # Feste Pfade, keine leeren Variablen: lieber hier abbrechen als falsch loeschen.
  [ "$TEST_DIR" = "$HOME/zeugnio-test" ] && [ -n "$HOME" ] && [ "$HOME" != "/" ] || fail "Unerwarteter Pfad $TEST_DIR - Abbruch."
  # Die Shell, aus der dieses Skript kommt, kann im Ordner stehen, der gleich verschwindet.
  cd "$HOME"

  log "1. App"
  if pm2 describe "$TEST_APP" >/dev/null 2>&1; then
    pm2 delete "$TEST_APP" >/dev/null && info "pm2 delete $TEST_APP"
    pm2 save >/dev/null && info "pm2 save (Autostart-Liste ohne $TEST_APP; zeugnio bleibt drin)"
  else
    info "pm2 kennt $TEST_APP nicht (schon weg)"
  fi
  rm -f -- "$PM2_LOGS/$TEST_APP"-* && info "pm2-Logs der Testinstanz geloescht"

  log "2. Daten-API"
  systemctl --user stop "$API_UNIT" >/dev/null 2>&1 || true
  rm -f -- "$UNIT_DIR/$API_UNIT.service"
  systemctl --user daemon-reload
  systemctl --user reset-failed "$API_UNIT" >/dev/null 2>&1 || true
  info "$API_UNIT gestoppt und entfernt"

  log "3. Test-Cluster"
  pg_stop
  local rest
  rest="$(pg_data_pids | paste -sd ' ' -)"
  [ -z "$rest" ] || fail "postgres-Prozesse des Test-Clusters laufen noch (PID $rest). Ordner nicht geloescht. Beenden mit: kill $rest - dann abbau --ja erneut."
  info "gestoppt"

  log "4. Ordner $TEST_DIR"
  rm -rf -- "${TEST_DIR:?}"
  info "entfernt (mit der Datenkopie, der Test-.env und der Logos-Kopie)"

  log "5. Kit-Konfiguration"
  rm -rf -- "${KIT_DIR:?}/apps/$TEST_APP"
  info "$KIT_DIR/apps/$TEST_APP entfernt (das Original liegt im Kit-Repo auf dem eigenen Rechner)"

  log "6. Gegenprobe"
  [ ! -e "$TEST_DIR" ] && info "$TEST_DIR: weg" || warn "$TEST_DIR gibt es noch"
  pm2 describe "$TEST_APP" >/dev/null 2>&1 && warn "pm2 kennt $TEST_APP noch" || info "pm2: $TEST_APP weg"
  systemctl --user cat "$API_UNIT" >/dev/null 2>&1 && warn "$API_UNIT gibt es noch" || info "$API_UNIT: weg"
  port_in_use "$APP_PORT" && warn "Port $APP_PORT noch belegt" || info "Port $APP_PORT frei"
  if pm2 describe zeugnio >/dev/null 2>&1 && curl -fsS --max-time 5 http://127.0.0.1:3010/api/health >/dev/null 2>&1; then
    info "Produktion antwortet weiter (127.0.0.1:3010)"
  else
    warn "Produktion antwortet nicht auf 127.0.0.1:3010 - sofort pruefen (pm2 logs zeugnio)"
  fi
  log "Abbau fertig. Noch offen: vhost test.zeugnio.ch zurueck auf 3010 (Fenster www-data, Runbook Schritt 9)."
}

# --- Hauptteil ---------------------------------------------------------------------------------
# Alles in Funktionen und main am Schluss: bash liest so das ganze Skript, bevor es etwas tut.
# Wichtig fuer abbau, das den Ordner loescht, in dem dieses Skript liegt.
main() {
  local cmd="${1:-}"
  [ $# -gt 0 ] && shift
  case "$cmd" in
    vorpruefung) cmd_vorpruefung "$@" ;;
    aufbau-db) cmd_aufbau_db "$@" ;;
    db-pruefen) cmd_db_pruefen "$@" ;;
    env) cmd_env "$@" ;;
    postgrest) cmd_postgrest "$@" ;;
    anmeldung-db) cmd_anmeldung_db "$@" ;;
    vor-deploy) cmd_vor_deploy "$@" ;;
    probe) cmd_probe "$@" ;;
    psql) cmd_psql "$@" ;;
    start) cmd_start "$@" ;;
    stopp) cmd_stopp "$@" ;;
    status) cmd_status "$@" ;;
    abbau) cmd_abbau "$@" ;;
    "" | -h | --help | hilfe) awk 'NR > 1 && /^#/ { sub(/^# ?/, ""); print; next } NR > 1 { exit }' "$0" ;;
    *) fail "Unbekannter Befehl: $cmd (Liste: bash $0 hilfe)" ;;
  esac
}

main "$@"
