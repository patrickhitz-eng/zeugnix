#!/usr/bin/env bash
# zeugnio.ch - Bestandsaufnahme auf dem Managed Server advisori01 (nine.ch).
#
# NUR LESEN. Das Skript legt keine Datei an, startet und stoppt keinen Dienst, aendert
# keine Konfiguration, installiert nichts und fuehrt in der Datenbank ausser SELECT/SHOW
# nichts aus. Es gibt ausserdem kein Geheimnis aus: keine .env, kein Passwort, kein
# pg_authid, keine Verbindungszeichenfolge. Die Ausgabe ist zum Zurueckschicken gedacht -
# sie darf bedenkenlos in ein Ticket oder einen Chat kopiert werden.
#
# Zweck: die drei Fragen beantworten, die den Umzug von zeugnio.ch blockieren.
#   1) Darf der Datenbankbenutzer CREATE ROLE, CREATE SCHEMA, ALTER TABLE ... OWNER TO
#      und CREATE EXTENSION? Ohne diese vier traegt die PostgREST-Architektur nicht.
#   2) Reichen Arbeitsspeicher, Platte und Ports fuer eine weitere Anwendung?
#   3) Welche Vorgaben macht nines nginx (Upload-Grenze, Antwort-Zeitlimit)?
#
# Zwei Durchlaeufe, weil die Antworten sich unterscheiden:
#   1) als Hauptbenutzer des Servers    ./check-advisori01.sh
#   2) als Datenbankbenutzer der App    PGUSER=nmd_zeugnio PGDATABASE=nmd_zeugnio ./check-advisori01.sh
#
# usage: ./check-advisori01.sh [--help]
#
#   PROBE_WRITE=1   fuehrt die Rechte zusaetzlich echt aus - CREATE ROLE, CREATE SCHEMA,
#                   ALTER OWNER, CREATE EXTENSION - jeweils in einer eigenen Transaktion
#                   mit ROLLBACK am Ende. In PostgreSQL sind diese Befehle transaktional,
#                   es bleibt nichts zurueck; eine Gegenprobe weist das am Ende nach.
#                   Erst ohne, dann mit dieser Variable laufen lassen: die Abfragen sagen,
#                   was erlaubt sein SOLLTE, die Probe sagt, was tatsaechlich geht. Die
#                   beiden weichen bei managed Datenbanken oft voneinander ab.
#   NET_CHECK=0     laesst die Erreichbarkeitstests nach draussen weg (github.com,
#                   registry.npmjs.org, acme-v02.api.letsencrypt.org). Dabei werden nur
#                   Verbindungen aufgebaut, es werden keine Daten uebermittelt.
#
# Passwort: ausschliesslich ueber ~/.pgpass (chmod 600). psql laeuft mit -w und fragt
# darum nie nach - fehlt das Passwort, steht im Bericht "Verbindung nicht moeglich",
# und das ist die richtige Antwort, keine Fehlfunktion.
set -uo pipefail

case "${1:-}" in
  -h | --help) sed -n '2,34p' "$0"; exit 0 ;;
  "") ;;
  *) printf 'Unbekannte Option: %s (erlaubt: --help)\n' "$1" >&2; exit 2 ;;
esac

PROBE_WRITE="${PROBE_WRITE:-0}"
NET_CHECK="${NET_CHECK:-1}"
PROBE_PREFIX="zx_probe_$$"

# Ports, die uns interessieren: 3010/3011 will zeugnio (App und Daten-API), 3000 ist fuer
# den Sponsorenlauf vorgesehen, 3020/3021 und 3030/3031 sind fuer Benchmark und
# Pre-Inkasso reserviert. 6543 und 8000 nur, um Ueberraschungen zu sehen.
PORTS="22 80 443 3000 3010 3011 3020 3021 3030 3031 3306 5432 6543 8000"

SUMMARY=""

hdr() { printf '\n\n============================================================\n %s\n============================================================\n' "$*"; }
sub() { printf '\n-- %s\n' "$*"; }
say() { printf '%s\n' "$*"; }
ind() { sed 's/^/   /'; }
note() { SUMMARY="${SUMMARY}   - $*
"; }

# runsh <Beschriftung> <Befehlszeile> - fuehrt die Zeile in einer Subshell aus und rueckt
# die Ausgabe ein. Ein Fehlschlag ist hier eine Information, kein Abbruchgrund.
runsh() {
  local label="$1"; shift
  sub "$label"
  local out rc
  out="$(bash -c "$*" 2>&1)" && rc=0 || rc=$?
  if [ -n "$out" ]; then printf '%s\n' "$out" | ind; else say "   (keine Ausgabe)"; fi
  [ "$rc" -eq 0 ] || printf '   (Rueckgabewert %s)\n' "$rc"
  return 0
}

have() { command -v "$1" >/dev/null 2>&1; }

printf 'zeugnio.ch - Bestandsaufnahme advisori01\n'
printf 'Zeitpunkt: %s\n' "$(date -Is 2>/dev/null || date)"
printf 'Schreibprobe PROBE_WRITE=%s   Netzprobe NET_CHECK=%s\n' "$PROBE_WRITE" "$NET_CHECK"


# ============================================================================
hdr "1  Wer und wo"
# ============================================================================
runsh "Benutzer und Gruppen" 'id'
runsh "Rechnername" 'hostname -f 2>/dev/null || hostname'
runsh "Betriebssystem" 'grep -E "^(PRETTY_NAME|VERSION_ID)=" /etc/os-release 2>/dev/null; uname -srm'
runsh "Laufzeit und Last" 'uptime'
runsh "Zeitzone und Sprachumgebung" 'timedatectl 2>/dev/null | sed -n "1,6p"; echo "LANG=${LANG:-<leer>} LC_ALL=${LC_ALL:-<leer>}"'
runsh "Heimatverzeichnis" 'echo "$HOME"; ls -la "$HOME" | head -30'
runsh "Bereits angelegte Benutzer (ab UID 1000)" 'getent passwd | awk -F: "\$3>=1000 && \$3<65000 {print \$1, \$3, \$6, \$7}"'


# ============================================================================
hdr "2  Kapazitaet: Arbeitsspeicher, Auslagerung, Platte"
# ============================================================================
runsh "Arbeitsspeicher (MB)" 'free -m'
runsh "Auslagerungsdatei" 'swapon --show 2>/dev/null; echo "--- /proc/swaps:"; cat /proc/swaps'
runsh "Plattenplatz" 'df -h -x tmpfs -x devtmpfs'
runsh "Inodes" 'df -i -x tmpfs -x devtmpfs'
runsh "Prozessorkerne" 'nproc'
runsh "Grenzen des Benutzers" 'ulimit -a'

sub "Arbeitsspeicher nach Dienst (RSS in MB, nur sichtbare Prozesse)"
PS_SNAPSHOT="$(ps -eo rss=,comm= 2>/dev/null || true)"
if [ -n "$PS_SNAPSHOT" ]; then
  printf '%s\n' "$PS_SNAPSHOT" | awk '
    {
      rss = $1; name = $2
      if      (name ~ /^postgres/)                   g = "PostgreSQL"
      else if (name ~ /^mysqld/)                     g = "MySQL"
      else if (name ~ /^(node|next|npm)/)            g = "Node"
      else if (name ~ /^nginx/)                      g = "nginx"
      else if (name ~ /^(chrome|chromium|headless)/) g = "Chromium"
      else                                           g = "uebrige"
      sum[g] += rss; cnt[g]++; total += rss
    }
    END {
      for (g in sum) printf "%-12s %7.0f MB  (%d Prozesse)\n", g, sum[g]/1024, cnt[g]
      printf "%-12s %7.0f MB  gesamt sichtbar\n", "SUMME", total/1024
    }' | sort | ind
else
  say "   (ps liefert nichts)"
fi

sub "Sind Prozesse anderer Benutzer sichtbar? (hidepid)"
USERS_SEEN="$(ps -eo user= 2>/dev/null | sort -u | tr '\n' ' ')"
{
  mount | grep -E ' /proc .*proc' || true
  say "sichtbare Prozessbesitzer: ${USERS_SEEN:-<keine>}"
  if printf '%s' "$USERS_SEEN" | grep -qw postgres || printf '%s' "$USERS_SEEN" | grep -qw root; then
    say "=> /proc ist NICHT abgeschirmt: der serverweite Build-Schutz per pgrep funktioniert."
  else
    say "=> /proc ist vermutlich mit hidepid abgeschirmt: nur eigene Prozesse sichtbar."
  fi
} | ind
if printf '%s' "${USERS_SEEN:-}" | grep -qw postgres || printf '%s' "${USERS_SEEN:-}" | grep -qw root; then
  note "/proc offen -> Build-Schutz (pgrep -fa 'next build') greift ueber Benutzergrenzen."
else
  note "/proc abgeschirmt -> Build-Schutz braucht eine gemeinsame Sperrdatei statt pgrep."
fi

sub "cgroup: ist der memory-Controller an den Benutzer delegiert?"
{
  UID_NUM="$(id -u)"
  for p in "/sys/fs/cgroup/user.slice/user-$UID_NUM.slice/cgroup.controllers" \
           "/sys/fs/cgroup/user.slice/user-$UID_NUM.slice/user@$UID_NUM.service/cgroup.controllers"; do
    if [ -r "$p" ]; then printf '%s\n   -> %s\n' "$p" "$(cat "$p")"; else printf '%s\n   -> nicht lesbar\n' "$p"; fi
  done
  say "eigene cgroup: $(tr '\n' ' ' < /proc/self/cgroup 2>/dev/null)"
  say "(steht 'memory' dabei, laesst sich der Build per systemd-run --user -p MemoryMax deckeln.)"
} | ind


# ============================================================================
hdr "3  Belegte Ports"
# ============================================================================
LISTEN_SNAPSHOT="$( { ss -ltnp 2>/dev/null || ss -ltn 2>/dev/null || netstat -ltn 2>/dev/null; } || true )"

sub "Alle lauschenden TCP-Ports"
if [ -n "$LISTEN_SNAPSHOT" ]; then printf '%s\n' "$LISTEN_SNAPSHOT" | ind; else say "   (weder ss noch netstat vorhanden)"; fi

sub "Die Ports, die wir brauchen"
for p in $PORTS; do
  found="$(printf '%s\n' "$LISTEN_SNAPSHOT" | awk -v pat=":$p\$" '$4 ~ pat {print $1" "$4}' | tr '\n' ' ')"
  tcp="frei"
  if (exec 3<>/dev/tcp/127.0.0.1/"$p") 2>/dev/null; then tcp="antwortet"; fi
  if [ -n "$found" ]; then
    printf '   %-5s BELEGT   %s\n' "$p" "$found"
  elif [ "$tcp" = "antwortet" ]; then
    printf '   %-5s BELEGT   (Besitzer nicht sichtbar, aber 127.0.0.1:%s antwortet)\n' "$p" "$p"
  else
    printf '   %-5s frei\n' "$p"
  fi
done

sub "Bindet die Datenbank nach draussen?"
{
  printf '%s\n' "$LISTEN_SNAPSHOT" | awk '$4 ~ /:(5432|3306)$/'
  say "(0.0.0.0 oder * heisst: von aussen erreichbar. 127.0.0.1 ist der gewuenschte Zustand."
  say " Fuer den Supabase-Dump brauchen wir keinen Zugang von aussen - wir dumpen von hier.)"
} | ind

sub "Bestehende Verbindungen auf 3306/5432 (Frage: liegt Benchmarks DB schon hier?)"
runsh "established" 'ss -tn state established 2>/dev/null | awk "NR==1 || \$3 ~ /:(3306|5432)\$/ || \$4 ~ /:(3306|5432)\$/"'


# ============================================================================
hdr "4  Werkzeuge"
# ============================================================================
sub "Versionen"
{
  for t in bash node npm npx pm2 git curl wget flock openssl tar xz zstd jq logrotate \
           psql pg_dump pg_restore pg_dumpall mysql mysqldump nginx systemctl loginctl rsync fc-list; do
    if have "$t"; then
      v="$("$t" --version 2>&1 | head -1)"
      printf '%-12s %s\n' "$t" "${v:-vorhanden}"
    else
      printf '%-12s FEHLT\n' "$t"
    fi
  done
} | ind

runsh "nvm vorhanden?" '[ -s "$HOME/.nvm/nvm.sh" ] && echo "ja: $HOME/.nvm/nvm.sh" || echo "nein - Node wird pro Benutzer gebraucht"; ls -1 "$HOME/.nvm/versions/node" 2>/dev/null'
runsh "systemd im Benutzerkontext (PostgREST soll dort laufen)" 'systemctl --user is-system-running 2>&1; echo "--- laufende Benutzerdienste:"; systemctl --user list-units --type=service --no-pager --no-legend 2>&1 | head -20'
runsh "Linger (ueberlebt der Dienst das Abmelden und den Neustart?)" 'loginctl show-user "$(id -un)" -p Linger 2>&1; ls -1 /var/lib/systemd/linger 2>/dev/null'
runsh "Cron des Benutzers" 'crontab -l 2>&1 | head -20'

sub "Postgres-Client-Versionen auf der Maschine (entscheidet ueber den Supabase-Dump)"
{
  ls -1 /usr/lib/postgresql 2>/dev/null | sed 's/^/installiert: /' || say "/usr/lib/postgresql fehlt"
  for b in /usr/lib/postgresql/*/bin/pg_dump; do
    [ -x "$b" ] && printf '%s -> %s\n' "$b" "$("$b" --version)"
  done
  say "--- aus dem Paketspeicher nachinstallierbar (nur Abfrage, es wird nichts installiert):"
  for v in 16 17 18; do
    printf 'postgresql-client-%s: %s\n' "$v" \
      "$(apt-cache policy "postgresql-client-$v" 2>/dev/null | awk '/Kandidat|Candidate/ {print $2; f=1} END {if (!f) print "nicht im Paketspeicher"}')"
  done
  say "(Laeuft Supabase auf PG 17, verweigert pg_dump 16 den Dump. Dann brauchen wir hier"
  say " einen 17er Client - nicht zwingend einen 17er Server.)"
} | ind

sub "Systembibliotheken fuer headless Chromium (Frage fuer Benchmark, nicht fuer zeugnio)"
{
  for lib in libnss3 libnspr4 libatk-1.0 libatk-bridge-2.0 libcups libdrm libxkbcommon \
             libxcomposite libxdamage libxfixes libxrandr libgbm libpango-1.0 libcairo \
             libasound libfreetype libharfbuzz; do
    if ldconfig -p 2>/dev/null | grep -q "$lib"; then
      printf '%-22s vorhanden\n' "$lib"
    else
      printf '%-22s FEHLT\n' "$lib"
    fi
  done
  printf 'Schriften im System: %s Eintraege (fc-list)\n' "$(fc-list 2>/dev/null | wc -l)"
} | ind

if [ "$NET_CHECK" = "1" ]; then
  sub "Erreichbarkeit nach draussen (nur Verbindungsaufbau, keine Daten)"
  for host in github.com registry.npmjs.org acme-v02.api.letsencrypt.org; do
    if curl -s -o /dev/null --max-time 8 --head "https://$host" 2>/dev/null; then
      printf '   %-36s erreichbar\n' "$host"
    else
      printf '   %-36s NICHT erreichbar (Proxy? Firewall?)\n' "$host"
    fi
  done
  printf '   %-36s %s\n' "HTTPS-Proxy gesetzt?" "${https_proxy:-nein}"
fi


# ============================================================================
hdr "5  nginx und die nine-Werkzeuge"
# ============================================================================
sub "nine-Werkzeuge im Pfad"
{
  for t in nine-manage-vhosts nine-manage-databases nine-manage-users nine-manage-cron; do
    if have "$t"; then printf '%-24s %s\n' "$t" "$(command -v "$t")"; else printf '%-24s fehlt\n' "$t"; fi
  done
} | ind

runsh "nine-manage-vhosts: Hilfe" 'nine-manage-vhosts --help 2>&1 | head -60'
runsh "nine-manage-vhosts: bestehende vhosts" 'nine-manage-vhosts virtual-host list 2>&1 | head -40'
runsh "nine-manage-vhosts: Zertifikate" 'nine-manage-vhosts certificate --help 2>&1 | head -40'
runsh "nine-manage-databases: Hilfe" 'nine-manage-databases --help 2>&1 | head -60'
runsh "nine-manage-databases: bestehende Datenbanken" 'nine-manage-databases database list 2>&1 | head -40'

runsh "nginx Version" 'nginx -v 2>&1'
runsh "vhost-Dateien" 'ls -la /etc/nginx/sites-enabled/ 2>&1; echo "---"; ls -la /etc/nginx/conf.d/ 2>&1'

sub "Gerenderter vhost des Nachbarn (unsere Vorlage - enthaelt keine Geheimnisse)"
{
  shown=0
  for f in /etc/nginx/sites-enabled/*; do
    [ -r "$f" ] || continue
    printf '### %s\n' "$f"
    cat "$f"
    shown=1
    break
  done
  [ "$shown" = 1 ] || say "(keine vhost-Datei lesbar - dann bei nine anfragen)"
} | ind

sub "Die zwei Werte, die uns gehoeren: Upload-Grenze und Antwort-Zeitlimit"
{
  grep -RIn --no-messages -E 'client_max_body_size|proxy_read_timeout|proxy_send_timeout|proxy_connect_timeout|client_body_timeout|keepalive_timeout' \
    /etc/nginx/ 2>/dev/null | head -40
  say ""
  say "Steht oben nichts, gelten die nginx-Vorgaben:"
  say "  client_max_body_size 1m   -> ZU KLEIN. Der Logo-Upload erlaubt 2 MB, nginx"
  say "                               antwortet vorher mit 413, und zwar ohne dass die"
  say "                               App davon erfaehrt. Muss in unseren vhost."
  say "  proxy_read_timeout   60s  -> reicht. Die PDF-Route braucht bis 30 s; maxDuration"
  say "                               aus vercel.json ist auf diesem Server wirkungslos."
} | ind


# ============================================================================
hdr "6  PostgreSQL: Version, Rechte, Einstellungen"
# ============================================================================
if [ -n "${PGPASSWORD:-}" ]; then
  say ""
  say "!! PGPASSWORD ist gesetzt. Der Wert wird hier nicht ausgegeben, steht aber in der"
  say "!! Prozessliste jedes Benutzers. Besser: ~/.pgpass mit chmod 600."
fi

export PGHOST="${PGHOST:-127.0.0.1}"
export PGPORT="${PGPORT:-5432}"
export PGCONNECT_TIMEOUT="${PGCONNECT_TIMEOUT:-5}"
[ -n "${PGUSER:-}" ] && export PGUSER

sub "Verbindungsdaten (ohne Passwort)"
{
  printf 'PGHOST=%s PGPORT=%s PGUSER=%s PGDATABASE=%s\n' \
    "$PGHOST" "$PGPORT" "${PGUSER:-<Vorgabe: Linux-Benutzer>}" "${PGDATABASE:-<nicht gesetzt>}"
  if [ -f "$HOME/.pgpass" ]; then
    printf '~/.pgpass vorhanden, Rechte %s (600 erwartet), %s Zeilen - Inhalt wird nicht gezeigt\n' \
      "$(stat -c %a "$HOME/.pgpass")" "$(wc -l < "$HOME/.pgpass")"
  else
    say '~/.pgpass fehlt - psql laeuft mit -w und fragt nicht nach; die Abfragen unten'
    say 'bleiben dann leer. So anlegen, dass das Passwort weder in der Verlaufsdatei'
    say 'noch in der Prozessliste landet (read -s zeigt nichts an):'
    say ''
    say '  umask 077 && { printf "*:*:*:BENUTZER:"; read -rsp "Passwort: " PW; \'
    say '    printf "%s\n" "$PW"; } > ~/.pgpass; unset PW; chmod 600 ~/.pgpass'
    say ''
    say 'Nicht echo "...:PASSWORT" verwenden: Argumente stehen in /proc/<pid>/cmdline und'
    say 'sind damit fuer jedes andere Konto auf diesem Server lesbar.'
    say ''
    say 'Das > ist Absicht, kein Tippfehler. libpq nimmt die ERSTE Zeile, deren vier Felder'
    say 'passen, und hoert dann auf - ein spaeter angehaengter, korrigierter Eintrag wird'
    say 'nie gelesen. Mit >> sammeln sich Fehlversuche, und der aelteste gewinnt. Enthaelt'
    say 'die Datei Eintraege anderer Anwendungen, vorher pruefen mit:'
    say '  awk -F: "{printf \"Zeile %d: user=%s laenge=%d\\n\", NR, \$4, length(\$5)}" ~/.pgpass'
  fi
} | ind

DB=""
if have psql; then
  for cand in "${PGDATABASE:-}" "${PGUSER:-}" "$(id -un)" postgres template1; do
    [ -n "$cand" ] || continue
    if psql -w -X -q -t -d "$cand" -c 'select 1' >/dev/null 2>&1; then DB="$cand"; break; fi
  done
fi

if [ -z "$DB" ]; then
  say ""
  say "   Verbindung zur Datenbank nicht moeglich (weder ueber PGDATABASE noch postgres/template1)."
  say "   Fehlermeldung des Versuchs:"
  psql -w -X -d "${PGDATABASE:-postgres}" -c 'select version()' 2>&1 | ind || true
  say ""
  say "   Typische Ursachen: ~/.pgpass fehlt, pg_hba erlaubt diesen Benutzer nicht, oder"
  say "   die Datenbank hoert nur auf einem Unix-Socket (dann PGHOST=/var/run/postgresql"
  say "   setzen und noch einmal laufen lassen)."
  note "Datenbank NICHT erreichbar als ${PGUSER:-$(id -un)} - Abschnitt 6 fehlt, ohne ihn kein Entscheid."
else
  say ""
  say "   verbunden mit Datenbank: $DB"
  PSQL="psql -w -X -q -P pager=off -v ON_ERROR_STOP=0 -d $DB"

  runsh "Server-Version (entscheidet, ob pg_dump den Supabase-Dump schafft)" \
    "$PSQL -c \"select version();\" -c \"show server_version_num;\""

  runsh "Zeichensatz und Sortierung aller Datenbanken (muss zum Supabase-Dump passen)" \
    "$PSQL -c \"select datname, pg_encoding_to_char(encoding) as encoding, datcollate, datctype, pg_get_userbyid(datdba) as owner, pg_size_pretty(pg_database_size(datname)) as groesse from pg_database where not datistemplate order by 1;\""

  runsh "Eigenschaften der eigenen Rolle (pg_roles, NICHT pg_authid - kein Passwort-Hash)" \
    "$PSQL -c \"select rolname, rolsuper, rolcreaterole, rolcreatedb, rolcanlogin, rolinherit, rolbypassrls, rolreplication, rolconnlimit, rolvaliduntil from pg_roles where rolname = current_user;\""

  runsh "Alle Rollen mit Sonderrechten" \
    "$PSQL -c \"select rolname, rolsuper, rolcreaterole, rolcreatedb, rolbypassrls, rolcanlogin from pg_roles where rolsuper or rolcreaterole or rolcreatedb or rolbypassrls order by rolname;\""

  runsh "Existieren die Zielrollen schon?" \
    "$PSQL -c \"select coalesce(string_agg(rolname, ', ' order by rolname), '(keine davon vorhanden)') as gefunden from pg_roles where rolname in ('anon','authenticated','service_role','authenticator','supabase_admin','postgres','dbadmin');\""

  runsh "Mitgliedschaften mit admin_option (braucht es fuer 'grant service_role to ...')" \
    "$PSQL -c \"select m.rolname as mitglied, g.rolname as in_rolle, a.admin_option from pg_auth_members a join pg_roles m on m.oid = a.member join pg_roles g on g.oid = a.roleid where m.rolname = current_user or g.rolname = current_user order by 1,2;\""

  runsh "Darf ich in dieser Datenbank ein Schema anlegen? Und wo darf ich mich anmelden?" \
    "$PSQL -c \"select d.datname, has_database_privilege(current_user, d.datname, 'CREATE') as create_schema, has_database_privilege(current_user, d.datname, 'CONNECT') as connect from pg_database d where not d.datistemplate order by 1;\""

  runsh "Vorhandene Schemas und ihre Eigentuemer" \
    "$PSQL -c \"select nspname, pg_get_userbyid(nspowner) as owner, has_schema_privilege(current_user, nspname, 'CREATE') as darf_anlegen from pg_namespace where nspname not like 'pg\\_%' and nspname <> 'information_schema' order by 1;\""

  runsh "GEGENPROBE: FORCE ROW LEVEL SECURITY muss nirgends gesetzt sein" \
    "$PSQL -c \"select n.nspname, c.relname from pg_class c join pg_namespace n on n.oid = c.relnamespace where c.relrowsecurity and c.relforcerowsecurity order by 1,2;\" -c \"select case when count(*) = 0 then 'LEER - gut: der Eigentuemer-Trick fuer den service_role-Bypass traegt' else 'NICHT LEER - der Eigentuemer-Trick traegt NICHT, Architektur neu bewerten' end as befund from pg_class where relrowsecurity and relforcerowsecurity;\""

  runsh "Extensions, die 001_initial_schema.sql braucht: uuid-ossp und pgcrypto" \
    "$PSQL -c \"select name, default_version, coalesce(installed_version,'(nicht installiert)') as installiert from pg_available_extensions where name in ('uuid-ossp','pgcrypto','citext','pg_trgm','unaccent','pg_stat_statements') order by 1;\" -c \"select e.name, e.default_version, v.trusted, v.superuser, case when v.trusted then 'ohne Superuser installierbar, wenn CREATE auf der Datenbank vorliegt' else 'BRAUCHT SUPERUSER -> Ticket an nine' end as hinweis from pg_available_extensions e join pg_available_extension_versions v on v.name = e.name and v.version = e.default_version where e.name in ('uuid-ossp','pgcrypto') order by 1;\""

  runsh "Server-Einstellungen" \
    "$PSQL -c \"select name, setting, unit from pg_settings where name in ('server_version','shared_buffers','work_mem','maintenance_work_mem','effective_cache_size','max_connections','superuser_reserved_connections','TimeZone','log_min_duration_statement','ssl','listen_addresses','password_encryption','wal_level','archive_mode','max_wal_size','statement_timeout','idle_in_transaction_session_timeout','row_security','default_transaction_read_only','lc_collate','lc_ctype','server_encoding') order by 1;\""

  runsh "Wie viele Verbindungen sind offen? (max_connections wird mit allen Apps geteilt)" \
    "$PSQL -c \"select datname, usename, state, count(*) from pg_stat_activity group by 1,2,3 order by 4 desc limit 20;\" -c \"select count(*) as offen, current_setting('max_connections') as maximum from pg_stat_activity;\""

  # -------------------------------------------------------------------------
  if [ "$PROBE_WRITE" = "1" ]; then
    hdr "6b  Schreibprobe - jede in eigener Transaktion, jede mit ROLLBACK"
    say ""
    say "   CREATE ROLE, CREATE SCHEMA, ALTER ... OWNER TO, CREATE EXTENSION und"
    say "   CREATE FUNCTION sind in PostgreSQL transaktional. Nach dem ROLLBACK ist"
    say "   nichts davon uebrig; die Gegenprobe am Ende weist das nach."
    say "   Probenamen: ${PROBE_PREFIX}*"

    probe() {  # probe <Beschriftung> <SQL ohne begin/rollback>
      local label="$1"; shift
      sub "$label"
      local out rc
      out="$(printf '%s\n' 'begin;' "$*" 'rollback;' \
             | psql -w -X -q -P pager=off -v ON_ERROR_STOP=1 -d "$DB" 2>&1)" && rc=0 || rc=$?
      if [ "$rc" -eq 0 ]; then
        say "   ERLAUBT"
        [ -n "$out" ] && printf '%s\n' "$out" | ind
      else
        say "   NICHT ERLAUBT:"
        printf '%s\n' "$out" | ind
      fi
      return 0
    }

    probe "CREATE ROLE" "create role ${PROBE_PREFIX}_r nologin;"

    probe "CREATE SCHEMA" "create schema ${PROBE_PREFIX}_s;"

    probe "ALTER TABLE ... OWNER TO (daran haengt der service_role-Bypass)" \
      "create role ${PROBE_PREFIX}_r nologin;
       create schema ${PROBE_PREFIX}_s;
       create table ${PROBE_PREFIX}_s.t (i int);
       alter table ${PROBE_PREFIX}_s.t owner to ${PROBE_PREFIX}_r;
       select tableowner from pg_tables where schemaname = '${PROBE_PREFIX}_s';"

    probe "GRANT rolle TO current_user WITH ADMIN OPTION" \
      "create role ${PROBE_PREFIX}_r nologin;
       grant ${PROBE_PREFIX}_r to current_user with admin option;"

    probe "CREATE ROLE ... LOGIN NOINHERIT (so braucht es authenticator)" \
      "create role ${PROBE_PREFIX}_a login noinherit password 'x';"

    probe 'CREATE EXTENSION "uuid-ossp"' 'create extension if not exists "uuid-ossp";'

    probe "CREATE EXTENSION pgcrypto" 'create extension if not exists "pgcrypto";'

    probe "CREATE FUNCTION ... SECURITY DEFINER (braucht ensure_auth_user, Korrektur K3)" \
      "create schema ${PROBE_PREFIX}_s;
       create function ${PROBE_PREFIX}_s.f() returns int language sql security definer as 'select 1';"

    probe "ALTER DEFAULT PRIVILEGES (Grants fuer kuenftige Tabellen)" \
      "create role ${PROBE_PREFIX}_r nologin;
       alter default privileges in schema public grant select on tables to ${PROBE_PREFIX}_r;"

    sub "Gegenprobe: ist nach den ROLLBACKs wirklich nichts uebrig?"
    runsh "Reste suchen" \
      "$PSQL -c \"select 'Rolle: ' || rolname as rest from pg_roles where rolname like '${PROBE_PREFIX}%' union all select 'Schema: ' || nspname from pg_namespace where nspname like '${PROBE_PREFIX}%';\" -c \"select case when count(*) = 0 then 'SAUBER - keine Reste' else 'ACHTUNG: Reste vorhanden, bitte melden' end as befund from (select 1 from pg_roles where rolname like '${PROBE_PREFIX}%' union all select 1 from pg_namespace where nspname like '${PROBE_PREFIX}%') x;\""
  else
    say ""
    say "   (Schreibprobe uebersprungen. Zweiter Durchlauf: PROBE_WRITE=1 $0)"
  fi
fi


# ============================================================================
hdr "7  MySQL - nur die Frage, ob Benchmarks Datenbank schon hier liegt"
# ============================================================================
runsh "MySQL vorhanden?" 'mysql --version 2>&1; ls -la /var/run/mysqld/ /run/mysqld/ 2>/dev/null | head'
sub "Lauscht 3306?"
printf '%s\n' "$LISTEN_SNAPSHOT" | awk '$4 ~ /:3306$/' | ind
say ""
say "   Ob dort Benchmarks Daten liegen, ist von hier aus nicht feststellbar, ohne"
say "   Zugangsdaten zu verwenden - und das tut dieses Skript bewusst nicht. Die"
say "   Gegenprobe geht schneller von der anderen Seite: in der Benchmark-Anwendung"
say "   steht der Datenbank-Host in der Umgebung (siehe sshTunnel.js). Zeigt er auf"
say "   5.148.171.221 oder advisori01.nine.ch, liegt die Datenbank schon hier."


# ============================================================================
hdr "8  Zusammenfassung"
# ============================================================================
say ""
say "Die Antworten, auf die der Plan wartet - bitte die vollstaendige Ausgabe zurueckschicken:"
say ""
say "  A  PostgreSQL-Version des Servers              -> Abschnitt 6, 'Server-Version'"
say "  B  CREATE ROLE / SCHEMA / ALTER OWNER erlaubt? -> Abschnitt 6 (Abfrage) + 6b (Probe)"
say "  C  FORCE ROW LEVEL SECURITY leer?              -> Abschnitt 6, 'GEGENPROBE'"
say "  D  uuid-ossp und pgcrypto ohne Superuser?      -> Abschnitt 6, 'Extensions'"
say "  E  freier Arbeitsspeicher und Auslagerung      -> Abschnitt 2"
say "  F  sind 3010 und 3011 frei?                    -> Abschnitt 3"
say "  G  client_max_body_size / proxy_read_timeout   -> Abschnitt 5"
say "  H  pg_dump-Version(en) auf der Maschine        -> Abschnitt 4"
if [ -n "$SUMMARY" ]; then
  say ""
  say "Aufgefallen:"
  printf '%s' "$SUMMARY"
fi
say ""
say "Sagt Abschnitt 6b bei CREATE ROLE 'NICHT ERLAUBT', geht ein Ticket an nine: die vier"
say "Rollen anon, authenticated, service_role und authenticator anlegen UND dem"
say "Datenbankbenutzer mit WITH ADMIN OPTION zuweisen - ohne diesen Zusatz koennen wir die"
say "Rollen nicht weitergeben und stehen beim naechsten Schritt wieder an."
say ""
