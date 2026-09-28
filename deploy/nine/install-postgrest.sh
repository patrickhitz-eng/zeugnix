#!/usr/bin/env bash
# Installiert PostgREST als statisch gelinktes Binary unter ~/opt/postgrest.
#
# Warum ein Binary und kein Container: auf dem Managed Server bei nine gibt es kein Root und
# damit kein Docker. PostgREST ist als statisch gelinktes Programm verfuegbar und braucht nichts
# weiter als eine Konfigurationsdatei - darum faellt diese Einschraenkung hier nicht ins Gewicht.
#
# usage: POSTGREST_SHA256=<pruefsumme> ./install-postgrest.sh
#        ./install-postgrest.sh            (laedt herunter, zeigt die Pruefsumme, installiert NICHT)
#
# ABLAUF IN ZWEI SCHRITTEN, UND ZWAR MIT ABSICHT:
# Der erste Aufruf ohne POSTGREST_SHA256 laedt das Archiv, rechnet die Pruefsumme aus und hoert
# dann auf. Diese Pruefsumme wird mit der Angabe auf der Release-Seite von PostgREST verglichen -
# von Hand, von einem Menschen. Erst der zweite Aufruf mit der bestaetigten Pruefsumme installiert.
# Die Pruefsumme aus derselben Quelle zu laden, aus der auch das Archiv kommt, waere keine
# Pruefung, sondern nur ein zweiter Download.
#
# Nach der Installation die bestaetigte Pruefsumme unten bei PINNED_SHA256 eintragen und
# einchecken. Dann laeuft jede spaetere Installation in einem Schritt und ist nachvollziehbar.
set -euo pipefail

VERSION="${POSTGREST_VERSION:-v13.0.7}"
# Nach der ersten bestaetigten Installation hier eintragen (siehe oben).
PINNED_SHA256="${PINNED_SHA256:-}"

ARCHIVE="postgrest-${VERSION}-linux-static-x86-64.tar.xz"
URL="https://github.com/PostgREST/postgrest/releases/download/${VERSION}/${ARCHIVE}"
TARGET_DIR="${TARGET_DIR:-$HOME/opt/postgrest}"
WORK_DIR="$(mktemp -d)"

log() { printf '\n==> %s\n' "$*"; }
fail() { printf '\nFehler: %s\n' "$*" >&2; exit 1; }
cleanup() { rm -rf -- "$WORK_DIR"; }
trap cleanup EXIT

command -v curl >/dev/null || fail "curl fehlt."
command -v sha256sum >/dev/null || fail "sha256sum fehlt."
command -v tar >/dev/null || fail "tar fehlt."
command -v xz >/dev/null || fail "xz fehlt (Paket xz-utils)."

expected="${POSTGREST_SHA256:-$PINNED_SHA256}"

log "Herunterladen: $URL"
curl -fsSL --max-time 300 -o "$WORK_DIR/$ARCHIVE" "$URL" \
  || fail "Download fehlgeschlagen. Stimmt die Version $VERSION? Ist der Server nach draussen verbunden?"

actual="$(sha256sum "$WORK_DIR/$ARCHIVE" | cut -d' ' -f1)"
log "Pruefsumme des Archivs"
printf '  %s  %s\n' "$actual" "$ARCHIVE"

if [ -z "$expected" ]; then
  cat <<INFO

Keine erwartete Pruefsumme angegeben - hier ist Schluss, es wurde nichts installiert.

Naechster Schritt:
  1. Die Pruefsumme oben mit der Angabe auf
     https://github.com/PostgREST/postgrest/releases/tag/${VERSION}
     vergleichen.
  2. Stimmt sie, erneut aufrufen:
       POSTGREST_SHA256=$actual $0
  3. Danach den Wert in diesem Skript bei PINNED_SHA256 eintragen und einchecken.
INFO
  exit 0
fi

if [ "$actual" != "$expected" ]; then
  fail "Pruefsumme weicht ab.
  erwartet: $expected
  erhalten: $actual
Nichts installiert. Das ist entweder eine andere Version - oder ein Grund, genau hinzusehen."
fi

log "Pruefsumme stimmt - auspacken"
tar -xJf "$WORK_DIR/$ARCHIVE" -C "$WORK_DIR"
[ -f "$WORK_DIR/postgrest" ] || fail "Im Archiv liegt kein 'postgrest' - Aufbau des Archivs geaendert?"

mkdir -p "$TARGET_DIR"
# Erst daneben legen, dann umbenennen: ein laufender Dienst soll nie eine halb geschriebene
# Datei vorfinden. Das Umbenennen innerhalb desselben Dateisystems ist unteilbar.
install -m 0755 "$WORK_DIR/postgrest" "$TARGET_DIR/postgrest.new"
mv -f "$TARGET_DIR/postgrest.new" "$TARGET_DIR/postgrest"
printf '%s  %s\n' "$actual" "$ARCHIVE" > "$TARGET_DIR/INSTALLED.sha256"
printf '%s\n' "$VERSION" > "$TARGET_DIR/VERSION"

log "Installiert"
"$TARGET_DIR/postgrest" --version

cat <<NEXT

Weiter:
  1. Konfiguration anlegen (Vorlage: deploy/nine/postgrest.conf.example):
       cp deploy/nine/postgrest.conf.example ~/zeugnio/shared/postgrest.conf
       chmod 600 ~/zeugnio/shared/postgrest.conf
     und darin db-uri und jwt-secret ausfuellen.
  2. Dienst einrichten:
       mkdir -p ~/.config/systemd/user
       cp deploy/nine/postgrest.service ~/.config/systemd/user/postgrest.service
       systemctl --user daemon-reload
       systemctl --user enable --now postgrest
  3. Erreichbarkeit pruefen (darf nur lokal antworten):
       curl -sS http://127.0.0.1:3012/ready
     Und die Gegenprobe, die wichtiger ist als die Probe selbst - von aussen darf NICHTS
     antworten:
       curl -sS --max-time 5 http://5.148.171.221:3011/ || echo "gut: von aussen tot"

Achtung: PostgREST zu aktualisieren ist ab jetzt unsere Aufgabe, nicht die von nine. Version
und Pruefsumme stehen in diesem Skript und in ~/opt/postgrest/VERSION.
NEXT
