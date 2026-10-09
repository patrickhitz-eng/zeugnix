# Ticket an nine.ch – Managed Server `advisori01`

**Betreff:** advisori01 / PostgreSQL – `CREATEROLE` und `CONNECT`-Weitergaberecht für `nmd_zeugnio`

---

## Kurz

Wir stellen auf `advisori01` eine zweite Anwendung bereit (`zeugnio`, Next.js + PostgREST) in
der bestehenden Datenbank `nmd_zeugnio`. Das Schema setzt vier PostgreSQL-Rollen voraus, die
wir mit den Rechten von `nmd_zeugnio` nicht selbst anlegen können. Wir bitten um drei Dinge:

```sql
-- 1) damit wir die vier Rollen selbst anlegen können
ALTER ROLE nmd_zeugnio CREATEROLE;

-- 2) damit sich die PostgREST-Verbindungsrolle verbinden darf
GRANT CONNECT ON DATABASE nmd_zeugnio TO nmd_zeugnio_rw WITH GRANT OPTION;
```

```
-- 3) Client-Paket nachinstallieren (nur der Client, der 16er Server bleibt unberührt)
postgresql-client-17
```

**Warum das unbedenklich ist:** Seit PostgreSQL 16 ist `CREATEROLE` eng gefasst – eine so
berechtigte Rolle kann nur Rollen verwalten, die sie selbst angelegt hat, und keine Rechte
weitergeben, die sie nicht selbst besitzt. Sie kann insbesondere **kein** `SUPERUSER`, **kein**
`BYPASSRLS` und **kein** `REPLICATION` vergeben. Wir brauchen ausdrücklich keines davon und
auch kein Datenbankeigentum (die vollständige Abgrenzung steht unten unter *Was wir nicht
brauchen*). Punkt 2 ist nötig, weil `PUBLIC` auf `nmd_zeugnio` bewusst kein `CONNECT` hat und
eine neu angelegte Rolle darum keines erbt; ohne ihn kann PostgREST nicht starten.

**Zeitliches:** Der Umzug hängt allein an diesen Punkten, alles Übrige ist vorbereitet. Eine
kurze Einschätzung, wann wir damit rechnen können, wäre uns sehr willkommen.

Die Details, Belege und die Alternative, falls Sie `CREATEROLE` nicht vergeben möchten, stehen
unten – zum Nachschlagen, nicht als Pflichtlektüre.

---

# Details, falls nötig

## 1) `CREATEROLE` für die Datenbankrolle `nmd_zeugnio`

Mit `CREATEROLE` legen wir die vier benötigten Rollen selbst an:

| Rolle | Attribute | Zweck |
|---|---|---|
| `anon` | `NOLOGIN NOINHERIT` | Lesezugriff ohne Anmeldung (öffentliche Zeugnisprüfung) |
| `authenticated` | `NOLOGIN NOINHERIT` | angemeldete Benutzer |
| `service_role` | `NOLOGIN NOINHERIT` | Server-Routen, Eigentümerin der Tabellen |
| `authenticator` | `LOGIN NOINHERIT` | Verbindungsrolle für PostgREST, wechselt pro Anfrage per `SET ROLE` |

Die Rechteausweitung ist durch die PG16-Begrenzung (siehe oben) auf genau diese vier Rollen
beschränkt.

## 2) `CONNECT` auf `nmd_zeugnio` weitergeben dürfen

`PUBLIC` hat auf `nmd_zeugnio` kein `CONNECT` (korrekt so, und von uns ausdrücklich gewünscht).
Eine neu angelegte Rolle erbt darum keines, und `nmd_zeugnio_rw` hält das Recht ohne
Weitergaberecht:

```
datname     | eigentuemer | rechte
nmd_zeugnio | nmd         | {nmd=CTc/nmd,nmd_zeugnio_ro=c/nmd,nmd_zeugnio_rw=Cc/nmd}
```

`Cc/nmd` statt `Cc*/nmd` – kein Sternchen, also keine Weitergabe. Ohne diesen Punkt könnte sich
die Rolle `authenticator` nicht verbinden und PostgREST nicht starten.

Falls das Weitergaberecht nicht vergeben wird, genügt uns ersatzweise ein einmaliges

```sql
GRANT CONNECT ON DATABASE nmd_zeugnio TO authenticator;
```

nachdem wir die Rolle angelegt haben. Das Weitergaberecht wäre uns lieber, weil es künftige
Tickets für denselben Vorgang erspart.

## 3) `postgresql-client-17` nachinstallieren

Die bisherige Datenbank liegt bei Supabase und läuft dort auf PostgreSQL 17. `pg_dump` 16
verweigert einen 17er Server – das ist eine harte Versionsprüfung, kein Schalter. Auf
advisori01 ist nur der 16er Client vorhanden, und `postgresql-client-17` liegt nicht im
Paketspeicher von Ubuntu 24.04. Gemessen am 7.10.2026:

```
installiert: 16
postgresql-client-16: 16.15-0ubuntu0.24.04.1
postgresql-client-17: nicht im Paketspeicher
```

Es geht ausdrücklich nur um das **Client-Paket**; der 16er Server bleibt unberührt. Beide
Versionen können nebeneinander liegen, Ubuntu legt die Binärdateien versioniert unter
`/usr/lib/postgresql/VERSION/bin/` ab.

Wir brauchen ihn für zwei Schritte: den Schemavergleich zwischen der alten und der neuen
Datenbank – damit wir belegen können, dass der Umzug nichts verändert hat – und den
Datenauszug selbst. Beides geht mit `pg_dump` gegen die alte Umgebung.

Falls Sie den PGDG-Paketspeicher nicht auf dem Server haben möchten, können wir das Paket auch
selbst in unser Heimatverzeichnis entpacken und `LD_LIBRARY_PATH` setzen; dann braucht es von
Ihnen nichts. Sagen Sie uns in diesem Fall bitte kurz, dass wir diesen Weg nehmen sollen.

## Belege – was wir gemessen haben

Alles lesend, am 7.10.2026, als `nmd_zeugnio` über `127.0.0.1:5432`.

```
rolname        | rolcanlogin | rolcreaterole | rolcreatedb | rolsuper | rolconfig
nmd_zeugnio    | t           | f             | f           | f        | {role=nmd_zeugnio_rw}
nmd_zeugnio_ro | f           | f             | f           | f        |
nmd_zeugnio_rw | f           | f             | f           | f        |
```

Empirisch, jeweils in einer eigenen Transaktion mit `ROLLBACK` (keine Reste, nachgeprüft):

```
create schema zx_probe                      ERLAUBT
create extension if not exists "uuid-ossp"  ERLAUBT
create extension if not exists pgcrypto     ERLAUBT
create role zx_probe_role nologin           VERWEIGERT -> ERROR: permission denied to create role
```

## Warum die Rollennamen nicht mit `nmd_` präfigiert werden können

Das ist uns bewusst eine unschöne Bitte, darum die Begründung im Detail. Zwei Stellen im Schema
nennen die Namen wörtlich:

1. Die Funktion `public.enforce_certificate_immutability()` prüft
   `current_user = 'service_role'`. Sie hängt an einem Trigger auf `certificates` und
   entscheidet, ob eine Änderung an einem finalisierten Zeugnis zulässig ist. Ein anderer
   Rollenname lässt diesen Vergleich scheitern – **ohne Fehlermeldung**, mit falschem Verhalten
   statt Abbruch.
2. Drei Migrationen entziehen und vergeben Ausführungsrechte namentlich
   (`REVOKE EXECUTE ... FROM anon`, `GRANT EXECUTE ... TO authenticated`). `REVOKE` scheitert an
   einer nicht existierenden Rolle, das Schema liesse sich also gar nicht aufbauen.

Dieselben Migrationen laufen bereits in der bisherigen Umgebung. Sie umzuschreiben würde die
Gleichheit der beiden Datenbanken aufgeben, und genau diese Gleichheit ist die Voraussetzung
für einen überprüfbaren Umzug.

Uns ist bewusst, dass Rollen in PostgreSQL **clusterweit** sind und die vier Namen damit auf der
ganzen Instanz belegt wären. Falls das aus Ihrer Sicht ein Problem ist – etwa weil eine andere
Datenbank auf derselben Instanz dieselben Namen brauchen könnte – sagen Sie es uns bitte; wir
finden dann einen anderen Weg. Die vier Rollen haben keine Rechte auf anderen Datenbanken und
bekommen auch keine.

## Alternative, falls `CREATEROLE` nicht vergeben wird

Dann legen Sie die vier Rollen bitte selbst an und machen `nmd_zeugnio` mit `ADMIN OPTION` zum
Mitglied, damit wir Mitgliedschaften und Rechte danach selbst verwalten können:

```sql
CREATE ROLE anon           NOLOGIN NOINHERIT;
CREATE ROLE authenticated  NOLOGIN NOINHERIT;
CREATE ROLE service_role    NOLOGIN NOINHERIT;
CREATE ROLE authenticator  LOGIN   NOINHERIT PASSWORD NULL;

GRANT anon, authenticated, service_role TO authenticator;
GRANT anon, authenticated, service_role, authenticator TO nmd_zeugnio WITH ADMIN OPTION;
GRANT CONNECT ON DATABASE nmd_zeugnio TO authenticator;
```

Das Passwort für `authenticator` setzen wir anschliessend selbst über `\password`, es muss Ihnen
nicht bekannt sein.

`NOINHERIT` ist bei `authenticator` wesentlich und keine Kosmetik: PostgREST verbindet sich mit
dieser Rolle und wechselt pro Anfrage per `SET ROLE`. Würde sie erben, liefe der Teil jeder
Anfrage *vor* dem Rollenwechsel mit den Rechten von `service_role` – also an der Zeilensicherheit
vorbei.

## Was wir ausdrücklich **nicht** brauchen

Zur Abgrenzung, damit nichts Unnötiges vergeben wird:

- **kein** `SUPERUSER`, **kein** `BYPASSRLS`, **kein** `REPLICATION`, **kein** `CREATEDB`
- **kein** `TEMPORARY` auf der Datenbank – wir haben die eine Stelle umgebaut, die eine
  temporäre Tabelle brauchte
- **kein** Datenbankeigentum – `search_path` setzen wir pro Migration in der Sitzung
- **keine** Lese-Rolle für die Sicherung – `nmd_zeugnio_ro` gibt es bereits
- **keine** Änderung an `PUBLIC`-Rechten oder an der Trennung zu `nmd_albisrun`; die ist korrekt
  eingerichtet und soll so bleiben
- **keine** Erweiterung – `uuid-ossp` und `pgcrypto` sind als *trusted* markiert und von uns
  selbst installierbar
