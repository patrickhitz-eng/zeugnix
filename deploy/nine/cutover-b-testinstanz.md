# Testinstanz für Cutover B auf `advisori01`

> **Wozu.** Die eigene Anmeldung aus PR #91 (Code oder Link per Mail statt Supabase Auth) soll im
> Browser durchgespielt werden, **bevor** die Produktion umschaltet. Dafür entsteht auf
> `advisori01` neben `zeugnio.ch` eine zweite, vollständig abgetrennte Instanz unter
> **`https://test.zeugnio.ch`**, mit einer Kopie der echten Daten aus der jüngsten Sicherung.
>
> **Wichtig vorweg.** Die Kopie enthält echte Personendaten (Mitarbeitende, Zeugnisse,
> Adressen). Sie bleibt nur so lange, wie der Test dauert: **Aufbau, Test und Abbau am selben
> Tag.** Der Abbau (Schritt 10) löscht sie mit allem anderen.
>
> Werkzeug: `deploy/nine/testinstanz.sh`. Stand: 21.11.2026.
>
> **Überholt seit B2.** Cutover B lief am 23.11. ohne Testinstanz (Entscheid Silvan). Seit B2 gibt
> es den Schalter `ZEUGNIO_AUTH` und die Supabase-Variablen im Code nicht mehr: `schalter`, T15 und
> die Supabase-Attrappen unten bewirken nichts mehr. Für eine spätere Testinstanz zuerst anpassen.
>
> **Seit 27.11.2026 gibt es `test.zeugnio.ch` nicht mehr** (DNS-Eintrag gelöscht, vhost und
> Zertifikat auf advisori01 entfernt). Die `update`-Befehle in Schritt 8 und 10 greifen damit ins
> Leere. Für eine spätere Testinstanz zuerst den A-Eintrag `test` → `5.148.171.221` im
> Infomaniak-Manager setzen, dann den vhost neu anlegen und das Zertifikat ausstellen (Ablauf wie am
> 11.11., Journal).

---

## Was neben der Produktion entsteht

| Teil | Testinstanz | Produktion (wird nicht verändert) |
|---|---|---|
| Datenbank | eigener **Wegwerf-Cluster** unter `$HOME/zeugnio-test/pg`, nur Unix-Socket, Port 5444, Datenbank `zeugnio_test` | `nmd_zeugnio` bei nine, `127.0.0.1:5432` |
| Daten-API | systemd-Benutzerdienst `postgrest-zeugnio-test`, Ports 3014 (API) und 3015 (Verwaltung) | Dienst `postgrest`, 3011 und 3012 |
| App | pm2-Prozess `zeugnio-test`, Port 3013, Branch von PR #91, Schalter `ZEUGNIO_AUTH=eigen` | pm2-Prozess `zeugnio`, Port 3010, `main`, Schalter `supabase` |
| Ordner | `$HOME/zeugnio-test` (alles darin) | `$HOME/zeugnio`, daraus wird nur **gelesen**: `.env`, `backup.key`, `backups/`, `uploads/` |
| Adresse | vhost `test.zeugnio.ch` → 3013 | vhost `zeugnio.ch` → 3010 |
| Sicherung, Cron | keine | unverändert |

Ein paar Begriffe, die unten immer wieder vorkommen:

- **Cluster:** ein eigener PostgreSQL-Datenbankserver mit eigenem Datenordner. Der Test-Cluster
  läuft neben dem PostgreSQL von nine, mit denselben Programmen (`/usr/lib/postgresql/17/bin`),
  aber als dein Benutzer und ohne Root. Genau so arbeitet schon der wöchentliche Restore-Test des Kits.
- **Unix-Socket:** eine Datei, über die Programme auf derselben Maschine mit der Datenbank
  sprechen, statt über einen Netzwerkport. Der Socket liegt in `$HOME/zeugnio-test/pg/run`, der
  Ordner hat die Rechte 700. Also kommt nur der Benutzer `www-zeugnio` heran, dieselbe Grenze,
  die heute schon `$HOME/zeugnio/shared/.env` schützt. Darum darf der Cluster ohne Passwort
  herein lassen (**trust**). Per Netz lauscht er gar nicht.
- **systemd-Benutzerdienst:** ein Programm, das systemd für deinen Benutzer am Laufen hält, auch
  wenn kein SSH-Fenster offen ist. So läuft heute schon `postgrest`.
- **pm2:** hält die Next.js-App am Laufen und startet sie nach einem Absturz neu.
- **vhost:** der Eintrag in nines nginx, der eine Adresse (hier `test.zeugnio.ch`) mit Zertifikat
  auf einen Port auf `127.0.0.1` weiterreicht.

### Was absichtlich anders ist als in der Produktion

- **Keine echten Supabase-Schlüssel.** Die Test-`.env` bekommt
  `NEXT_PUBLIC_SUPABASE_URL=https://supabase.invalid` und zwei Schlüssel, die nirgends gelten.
  Grund: Im Schalter `supabase` ruft «Konto löschen» `auth.admin.deleteUser` bei Supabase auf
  (`app/api/account/delete/route.ts`). Mit dem echten Service-Schlüssel löschte ein Test das
  **echte** Supabase-Konto einer Person, und darüber meldet sich die Produktion bis Tag B an.
  Die Endung `.invalid` ist für Namen reserviert, die nie aufgelöst werden. Ruft die App im
  Schalter `eigen` doch noch Supabase auf, scheitert das laut im Log, statt still zu gelingen.
  Das ist zugleich eine Prüfung von PR #91.
- **Eigener Signaturschlüssel.** Ein Zeugnis, das auf der Testinstanz finalisiert wird, trägt
  eine Signatur, die `zeugnio.ch` nicht kennt. Es geht dort nie als echt durch. Umgekehrt kennt
  die Testinstanz die öffentlichen Schlüssel der Produktion, damit kopierte, echt signierte
  Zeugnisse auch auf der Testadresse prüfbar bleiben.
- **Alle anderen Geheimnisse neu:** `ZEUGNIO_AUTH_SECRET`, `DATA_API_JWT_SECRET`, `CRON_SECRET`.
  Aus der Produktion kommen nur `RESEND_API_KEY`, `EMAIL_FROM` und `EMAIL_REPLY_TO`, damit die
  Anmelde-Mails wirklich ankommen. Stripe und Object Storage fehlen ganz.
- **Datenbankname `zeugnio_test`.** Die Rollen heissen wie in der Produktion (`nmd_zeugnio`,
  `authenticator`, `service_role` …), weil Auszug und Migrationen sie beim Namen nennen. Die
  Datenbank heisst anders: Ein Befehl, der aus Versehen doch bei der Produktion landet, scheitert
  dort an «database "zeugnio_test" does not exist».

---

## Voraussetzungen

1. **Dieser PR (`feat/cutover-b-testinstanz`) ist in `main` gemergt.** Er bringt die kleinen
   Änderungen, ohne die zwei Instanzen nicht nebeneinander laufen: `ecosystem.config.cjs`
   nimmt pm2-Name und Port aus der Umgebung des Kits, die Hooks `post-migrate` und `check`
   kennen den Dienst `postgrest-zeugnio-test`, und `scripts/migrate.mjs` versteht einen Socket.
   Für die Produktion ändert sich dabei nichts (gleicher Name, gleicher Port, gleicher Dienst).
2. **Der Branch von PR #91 hat `main` danach hereingeholt** (Merge von `origin/main` in
   `claude/cutover-b-eigene-anmeldung-c24dfc`). Das Kit klont für die Testinstanz genau diesen
   Branch. Fehlt dort der Stand aus Punkt 1, bricht das Deployment vor dem Umschalten ab
   («muss genau eine App namens zeugnio-test enthalten»). Geprüft wird das in Schritt 2.
3. **Die Produktion läuft sauber.** Fenster www-zeugnio:

   ```bash
   curl -sS http://127.0.0.1:3010/api/health; echo
   systemctl --user is-active postgrest
   pm2 describe zeugnio | grep -m1 -w status
   ```

   Erwartet: das Lebenszeichen mit `"status":"ok"`, dann `active`, dann `online`. Weicht eines
   ab, heute keine Testinstanz: Erst muss die Produktion wieder stehen.

   Zusätzlich die ganze Prüfung des Kits:

   ```bash
   $HOME/kit/deploy.sh zeugnio --check
   tac "$HOME/zeugnio/logs/backup.log" | sed '/Start backup/q' | grep -F '[backup] FEHLER'
   ```

   **Stand 21.11.:** `--check` endet **nicht** mit «Alles bereit.», sondern mit «Fehler: Nicht
   alle Voraussetzungen erfuellt». Das ist bekannt und hier in Ordnung, wenn es genau **eine**
   WARNUNG-Zeile gibt, nämlich `backup: FEHLER … rc=3`. Der Mechanismus: Das Object Storage
   (B3 in `kommunikation.md`) ist noch nicht bestellt, die Produktion verlangt aber eine
   Zweitkopie (`BACKUP_OFFSITE="required"`). `db-backup.mjs` legt die Sicherung jede Stunde
   trotzdem verschlüsselt auf den Server, meldet die fehlende Zweitkopie aber mit Rückgabewert 3.
   `kit-cron.sh` hält jeden Rückgabewert ausser 0 als `FEHLER` in `backup.status` fest, und
   `--check` wertet jede solche Zeile als Warnung. Der zweite Befehl zeigt die Fehlerzeilen des
   letzten Sicherungslaufs. Erwartet ist genau eine, sie beginnt mit
   `[backup] FEHLER: Keine Zweitkopie`. Steht dort etwas anderes (Journal, Uploads), oder gibt es
   bei `--check` eine weitere WARNUNG-Zeile, ist das eine echte Abweichung: hier aufhören. Ist B3
   erledigt, gilt wieder «Alles bereit.».
4. **Zeit:** rund 45 Minuten Aufbau (davon 10 Minuten Build), 30 bis 60 Minuten Test,
   5 Minuten Abbau. Nicht gleichzeitig ein Deployment der Produktion starten: Es würde auf die
   serverweite Build-Sperre warten, und zwei Builds brauchen zusammen zu viel Arbeitsspeicher.

### Die drei Fenster

| Name unten | So öffnen | Wofür |
|---|---|---|
| **PowerShell** | auf dem eigenen Rechner, Eingabezeile `PS C:\…>` | Datei hochladen, von aussen prüfen |
| **Fenster www-zeugnio** | PowerShell: `ssh www-zeugnio@advisori01.nine.ch` | fast alles |
| **Fenster www-data** | PowerShell: `ssh www-data@advisori01.nine.ch` | nur der vhost (Schritt 8 und 10) |

`sudo nine-manage-vhosts` läuft im Fenster www-data ohne Passwortabfrage (so beim Umzug am
20.11. erlebt). Fragt `sudo` nach einem Passwort, bist du im falschen Fenster: Im Fenster
www-zeugnio geht `sudo` nicht. In diesem Ablauf wird kein Passwort gebraucht.

---

## Schritt 1: kit.conf auf den Server

Das Kit auf dem Server ist eine Kopie des Kit-Repos auf deinem Rechner. Die Konfiguration der
Testinstanz liegt dort unter `apps/zeugnio-test/kit.conf` (Commit im Kit-Repo). Sie enthält
keine Geheimnisse, nur Fakten: Name, Port 3013, Branch von PR #91, keine Sicherung.

**PowerShell**, zwei Befehle:

```powershell
ssh www-zeugnio@advisori01.nine.ch "mkdir -p kit/apps/zeugnio-test"
scp "$HOME\advisori-advisori01-kit\apps\zeugnio-test\kit.conf" www-zeugnio@advisori01.nine.ch:kit/apps/zeugnio-test/kit.conf
```

**Prüfung, Fenster www-zeugnio:**

```bash
grep -E '^(APP_NAME|PORT|BRANCH|PRE_DEPLOY_BACKUP|BACKUP_OFFSITE)=' "$HOME/kit/apps/zeugnio-test/kit.conf"
```

Erwartet: `zeugnio-test`, `3013`, `claude/cutover-b-eigene-anmeldung-c24dfc`, `never`, `off`.

---

## Schritt 2: Checkout und Vorprüfung

Das Skript und die Migrationen 906/907 kommen aus einem eigenen Checkout des PR-#91-Branches
**innerhalb** des Testordners. So verschwindet er beim Abbau mit.

**Fenster www-zeugnio:**

```bash
mkdir -p "$HOME/zeugnio-test" && chmod 700 "$HOME/zeugnio-test"
git clone --quiet --depth 1 --branch claude/cutover-b-eigene-anmeldung-c24dfc https://github.com/patrickhitz-eng/zeugnix.git "$HOME/zeugnio-test/setup"
bash "$HOME/zeugnio-test/setup/deploy/nine/testinstanz.sh" vorpruefung
```

`vorpruefung` verändert nichts. Sie prüft: Stand des Branches (enthält er `main` aus
Voraussetzung 1, ist der Checkout aktuell), die kit.conf, ob `.env`, `backup.key` und eine
Sicherung der Produktion lesbar sind und wie alt die jüngste ist, PostgreSQL 17, PostgREST, pm2,
`systemctl --user`, ob die Ports 3013, 3014 und 3015 frei sind, Platz und Arbeitsspeicher.

Zum Arbeitsspeicher: Gemessen wird `MemAvailable`, also was der Kernel ohne Auslagern noch
hergeben kann. Gebraucht werden rund 4100 MB: die Testinstanz im Betrieb rund 1000 MB (Cluster,
PostgREST, App) und der Build bis 3072 MB (Speicherdeckel `BUILD_MEMORY_MAX`, 3G). Der Deckel
schützt die Produktion nur, wenn der Server so viel wirklich frei hat. Sonst ist der Speicher weg,
bevor der Build seinen Deckel erreicht, und dann greift nicht der Deckel, sondern der
**OOM-Killer** des ganzen Servers (das Notprogramm des Kernels, das bei vollem Speicher einen
Prozess beendet). Der wählt sein Opfer selbst, im schlechtesten Fall das PostgreSQL von nine und
damit alle Produkte. Darum ist zu wenig Speicher hier ein Fehler, keine Warnung.

**Prüfung:** letzte Zeile `==> Vorpruefung ok.` Meldet sie «FEHLT: … ist main in den
PR-#91-Branch gemergt?», ist Voraussetzung 2 noch nicht erfüllt. Meldet sie «zu wenig
Arbeitsspeicher frei», heute keine Testinstanz (oder warten, bis ein laufender Build fertig ist,
und neu prüfen). In beiden Fällen hier aufhören.

---

## Schritt 3: Wegwerf-Cluster mit der Kopie der Produktion

**Fenster www-zeugnio:**

```bash
bash "$HOME/zeugnio-test/setup/deploy/nine/testinstanz.sh" aufbau-db
```

Was dabei passiert, der Reihe nach:

1. `initdb` legt den Cluster in `$HOME/zeugnio-test/pg/data` an. In `postgresql.conf` steht
   danach: kein Netz (`listen_addresses = ''`), Socket in `$HOME/zeugnio-test/pg/run`, Port 5444.
   `pg_hba.conf` (die Datei, die regelt, wer sich wie anmelden darf) erlaubt nur den Socket.
2. Der Cluster startet als **vorübergehender systemd-Dienst** `zeugnio-test-pg` (`systemd-run`).
   Er gehört damit nicht zum SSH-Fenster und läuft weiter, wenn du es schliesst. Nach einem
   Neustart des Servers ist er weg und kommt mit `start` zurück (siehe «Im Betrieb»).
3. **Rollen.** Eine Rolle ist in PostgreSQL ein Benutzer oder eine Gruppe von Rechten. Rollen
   gehören zum Cluster, nicht zur Datenbank, darum nimmt `pg_dump` sie nicht mit, obwohl der
   Auszug sie überall nennt («gehört nmd_zeugnio_rw», «darf service_role»). Das Skript legt sie
   so an, wie nine und `supabase/900_0_nine_rollen.sql` sie in der Produktion angelegt haben:
   - `nmd` (gehört die Datenbank), `nmd_zeugnio_rw` (Schreibrolle, besitzt Tabellen und
     Funktionen), `nmd_zeugnio_ro` (Leserolle),
   - `nmd_zeugnio` mit Anmeldung, wechselt beim Anmelden sofort in `nmd_zeugnio_rw` (genau so
     verhält sich der Anmeldebenutzer der Produktion),
   - dann läuft **`900_0_nine_rollen.sql` aus dem Repo selbst**: `anon`, `authenticated`,
     `service_role`, `authenticator` mit Anmeldung, und die Mitgliedschaften (authenticator darf
     in die drei wechseln, erbt aber nichts; das CONNECT erbt er über die Leserolle).
   - Die Datenbank `zeugnio_test` bekommt die Rechte, die nine vorgibt: kein CONNECT und kein
     TEMPORARY für alle, CONNECT nur für Lese- und Schreibrolle. So scheitert eine Migration
     hier an denselben fehlenden Rechten wie in der Produktion (vgl. 037 am 15.11.).
4. **Einspielen.** Die jüngste Sicherung aus `$HOME/zeugnio/backups` wird mit `backup.key`
   entschlüsselt (`$HOME/kit/decrypt.mjs`) und direkt, über eine Pipe, in `zeugnio_test`
   eingespielt. Unverschlüsselt liegt der Auszug nie auf der Platte. Alles läuft in **einer**
   Transaktion: Scheitert eine Anweisung, ist nichts eingespielt. Nennt der Auszug eine Rolle,
   die es noch nicht gibt, legt das Skript sie ohne Anmeldung an und beginnt von vorn (wie
   der Restore-Test des Kits).
5. Zum Schluss Zahlen, keine Inhalte: Tabellen, Migrationen, Benutzer, Firmen, Zeugnisse, und
   ob 906 schon drin ist (muss `false` sein).

**Prüfung:** `==> Fertig.` am Ende. Die Zahl der Zeugnisse und Benutzer passt zur Produktion
(am 20.11.: 20 Zeugnisse final oder widerrufen, 23 Benutzer, seither eher mehr).

Dann die Gegenprobe der Rechte, dieselbe wie im Cutover A (5.4), hier gegen die Kopie:

```bash
bash "$HOME/zeugnio-test/setup/deploy/nine/testinstanz.sh" db-pruefen
```

**Prüfung:** Abschnitte «MUSS LEER SEIN» sind leer, «MUSS t sein» zeigt `t`, Abschnitt 2 zeigt
die Mitgliedschaften wie im Kopf beschrieben. Weicht etwas ab, stimmt die Nachbildung der
Rollen nicht, und der Test sagte über die Produktion wenig. Dann hier aufhören.

---

## Schritt 4: .env der Testinstanz

**Fenster www-zeugnio:**

```bash
bash "$HOME/zeugnio-test/setup/deploy/nine/testinstanz.sh" env
```

Das Skript liest `$HOME/zeugnio/shared/.env` und schreibt `$HOME/zeugnio-test/shared/.env`
(Rechte 600). Es zeigt nur **Namen** und woher jeder Wert kommt, nie einen Wert. Nach einer
festen Liste, nicht nach Gefühl: Was nicht auf der Liste steht, kommt nicht mit, auch kein
Schlüssel, der später in der Produktion dazukommt.

| Wert | Woher |
|---|---|
| `NEXT_PUBLIC_SITE_URL` | `https://test.zeugnio.ch` (steht in den Mail-Links und QR-Codes der Testinstanz) |
| `ZEUGNIO_AUTH` | `eigen` |
| `ZEUGNIO_AUTH_SECRET`, `DATA_API_JWT_SECRET`, `CRON_SECRET` | neu erzeugt |
| `DATABASE_URL` | Socket des Test-Clusters (`…@localhost:5444/zeugnio_test?host=…/pg/run`) |
| `DATA_API_URL` | `http://127.0.0.1:3014` |
| `ZEUGNIO_SIGNING_PRIVATE_KEY` | neu erzeugt, Test-Schlüssel (Key-ID wird angezeigt, sie ist öffentlich) |
| `ZEUGNIO_SIGNING_PUBLIC_KEYS` | nur die öffentlichen Schlüssel der Produktion |
| `ZEUGNIO_UPLOAD_DIR` | `$HOME/zeugnio-test/uploads`, eine Kopie der Logos |
| Supabase-Werte, `ZEUGNIO_OWN_AUTH=1` | Attrappe (siehe oben) |
| `RESEND_API_KEY`, `EMAIL_FROM`, `EMAIL_REPLY_TO` | aus der Produktion |
| `STRIPE_*`, `S3_*` und alles andere | weggelassen |

Zu `DATABASE_URL`: Der Socket-Ordner steht im Parameter `host=`, so wie ihn PostgreSQLs
eigene Bibliothek liest (und seit diesem PR auch `scripts/migrate.mjs`). `localhost` und das
Passwort davor sind nur für `check-env` da, das eine Adresse mit Host und Passwort verlangt.
Das Passwort ist ein Zufallswert ohne Bedeutung. Liest ein Werkzeug `host=` nicht, versucht es
`localhost:5444`, dort lauscht nichts, und es scheitert laut. Die Produktion auf 5432 erreicht
es so nie.

Zum Schluss läuft `scripts/check-env.mjs` gegen die neue Datei, dieselbe Prüfung, mit der das
Deployment beginnt.

**Prüfung:** `OK, mit 2 Hinweis(en).` Erwartet sind genau diese zwei: Adresse
`test.zeugnio.ch` und kein Object Storage. Ein `FEHLER:` heisst: So würde auch das Deployment
abbrechen.

---

## Schritt 5: Daten-API der Testinstanz

**Fenster www-zeugnio:**

```bash
bash "$HOME/zeugnio-test/setup/deploy/nine/testinstanz.sh" postgrest
```

1. `deploy/nine/postgrest-conf.mjs` schreibt `$HOME/zeugnio-test/shared/postgrest.conf`, mit
   denselben Regeln wie für die Produktion, aber Ports 3014 und 3015, Verbindung über den Socket
   als `authenticator` und dem neuen `DATA_API_JWT_SECRET` aus der Test-`.env`. Das **JWT** ist
   der signierte Ausweis, den die App jeder Anfrage an die Daten-API mitgibt. Das Geheimnis muss
   in `.env` und `postgrest.conf` gleich sein, sonst antwortet die API auf alles mit 401. Das
   Skript prüft beides ohne Werte anzuzeigen: gleich in beiden Dateien, verschieden von der
   Produktion.
2. Die Unit-Datei `deploy/nine/postgrest-zeugnio-test.service` kommt nach
   `$HOME/.config/systemd/user/`, der Dienst startet. Er wird absichtlich **nicht** `enable`t: Er
   soll nach einem Neustart des Servers nicht von selbst starten, weil dann auch der Test-Cluster
   fehlt.

**Prüfung:** `bereit: http://127.0.0.1:3015/ready`. Gegenprobe, dass die Produktion unberührt ist:

```bash
systemctl --user is-active postgrest postgrest-zeugnio-test
systemctl --user show postgrest --property=ActiveEnterTimestamp
```

Zweimal `active`. Der Dienst `postgrest` der Produktion läuft seit einem Zeitpunkt vor dem Test.

---

## Schritt 6: Anmeldetabellen (906), Probe (907), Schema neu einlesen

**Fenster www-zeugnio:**

```bash
bash "$HOME/zeugnio-test/setup/deploy/nine/testinstanz.sh" anmeldung-db
```

1. `906_auth_eigen.sql` als `nmd_zeugnio`, genau so, wie es am Tag B in der Produktion laufen
   wird. Es legt `auth.login_requests` und `auth.sessions` an und die Funktionen `auth_*`, die
   nur `service_role` aufrufen darf. In der Datenbank liegen Link, Code und Sitzung nur als
   **HMAC**: ein Prüfwert, der sich aus dem Wert und einem Geheimnis (`ZEUGNIO_AUTH_SECRET`)
   berechnen lässt, aber nicht zurück. Ein Auszug taugt so nicht zum Anmelden.
2. `907_auth_eigen_verify.sql`: prüft Rechte und Verhalten in einer Transaktion, die mit
   ROLLBACK endet. Ändert nichts.
3. `systemctl --user reload postgrest-zeugnio-test`. PostgREST hält das Datenbankschema im
   Zwischenspeicher (**Schema-Cache**). Ohne Neuladen kennt es die neuen Funktionen nicht und
   antwortet auf `/rpc/auth_*` mit 404. Dann kann sich niemand anmelden. Am Tag B gilt dasselbe
   für den Dienst `postgrest`.
4. `postgrest-probe.mjs --auth-eigen` gegen die Test-API: Zeilensicherheit, `auth.uid()`,
   falsches Geheimnis, und dass PostgREST die `auth_*`-Funktionen kennt und nur `service_role`
   sie aufrufen darf.

**Prüfung:** `907: alle Pruefungen bestanden`, danach in der Probe keine Zeile mit `FEHLER`.
Scheitert 906, ist das ein **Befund für PR #91**: In der Produktion scheiterte es an derselben
Stelle. Meldung notieren, nicht von Hand nachbessern.

`908_auth_abgleich.sql` läuft hier nicht. Es gleicht die Benutzer mit einem CSV-Auszug aus
Supabase ab (mit Adressen) und gehört zum Tag B selbst. Die Kopie hat die Benutzer so, wie sie
in der jüngsten Sicherung stehen.

---

## Schritt 7: App deployen

**Fenster www-zeugnio:**

```bash
bash "$HOME/zeugnio-test/setup/deploy/nine/testinstanz.sh" vor-deploy && $HOME/kit/deploy.sh zeugnio-test
```

`vor-deploy` prüft unmittelbar vorher, ob Cluster und Daten-API laufen und ob der
Arbeitsspeicher für den Build reicht. Die Vorprüfung aus Schritt 2 liegt eine halbe Stunde
zurück, und seither belegen Cluster und PostgREST Speicher. Deren Anteil ist in `MemAvailable`
jetzt schon abgezogen, darum braucht es hier nur noch den Build (bis 3072 MB) und 500 MB Reserve,
zusammen 3572 MB. Das `&&` heisst: Das Deployment startet nur, wenn `vor-deploy` ohne Fehler
endet. Meldet es «zu wenig Arbeitsspeicher frei», nicht deployen (siehe Schritt 2).

Das ist dasselbe Kit wie für die Produktion, mit `apps/zeugnio-test/kit.conf`: frischer Klon
des PR-#91-Branches nach `$HOME/zeugnio-test/releases/…`, `.env` verknüpft, `check-env`,
`npm ci`, Build (wartet auf die serverweite Build-Sperre, Speicherdeckel 3 GB), Prüfung der
Ecosystem-Datei (muss `zeugnio-test` ergeben), Migrationen (es sollten keine offen sein),
Start mit pm2 als `zeugnio-test` auf Port 3013, Lebenszeichen abwarten. Dauert rund 10 Minuten.

**Prüfung:** Letzte Zeile `==> Fertig: … laeuft.` Dann:

```bash
pm2 list
curl -sS http://127.0.0.1:3013/api/health; echo
curl -sS http://127.0.0.1:3010/api/health; echo
$HOME/kit/deploy.sh zeugnio-test --check
```

- `pm2 list` zeigt **zwei** Prozesse, `zeugnio` und `zeugnio-test`, beide `online`.
- 3013 (Test) meldet `ok`, `datenquelle: eigene`, `signatur: ok`.
- 3010 (Produktion) antwortet wie vorher.
- `--check` endet mit `Alles bereit.` Der Hook `check` meldet dort
  «PostgREST (postgrest-zeugnio-test) laeuft und meldet sich bereit (http://127.0.0.1:3015/ready)».
  Die Warnung «noch kein Auszug» ist richtig: Die Testinstanz sichert nichts.

---

## Schritt 8: test.zeugnio.ch auf die Testinstanz

Heute zeigt der vhost `test.zeugnio.ch` auf Port 3010, also auf die Produktion (seit der
Vollprobe vom 11.11.). Jetzt auf 3013.

**Fenster www-data:**

```bash
sudo nine-manage-vhosts virtual-host list
```

Bei `test.zeugnio.ch` die Vorlage ablesen. Erwartet `proxy_letsencrypt_https` (so am 11.11.
eingerichtet, Journal in `kommunikation.md`). Steht dort eine andere, im nächsten Befehl genau
diese einsetzen, damit Zertifikat und Weiterleitung auf HTTPS bleiben:

```bash
sudo nine-manage-vhosts virtual-host update test.zeugnio.ch --template=proxy_letsencrypt_https --template-variable PROXYPORT=3013
```

**Prüfung, PowerShell:**

```powershell
curl.exe -sS https://test.zeugnio.ch/api/auth/status
curl.exe -sS -o NUL -w "%{http_code}`n" https://zeugnio.ch/api/auth/status
```

- `test.zeugnio.ch` antwortet `{"angemeldet":false}`. Die Route gibt es nur im Branch von PR #91,
  die Antwort kommt also von der Testinstanz.
- `zeugnio.ch` antwortet `404`: Die Produktion läuft unverändert auf `main`.

---

## Schritt 9: Testfälle im Browser

### Regeln während des Tests

- **Nur mit eigenen Adressen anmelden.** Jede eingetippte Adresse bekommt eine echte Mail, auch
  die einer Kundin, die in der Kopie steht.
- **Nichts auslösen, was Mails an andere schickt:** keine Einladungen an Vorgesetzte, keine
  Team-Einladungen, keine bestehenden Zeugnisse bearbeiten oder finalisieren.
- Für Datenbank-Gegenproben gibt es `testinstanz.sh psql`. Es geht immer an den Test-Cluster,
  als `nmd_zeugnio`, und zeigt keine Adressen, wenn man sie nicht abfragt.
- Ein privates Browserfenster pro Durchgang, damit keine alten Cookies mitspielen. Das
  **Cookie** ist der kleine Wert, den der Browser bei jeder Anfrage mitschickt. Hier heisst es
  `__Host-zeugnio_session` und gilt nur für `test.zeugnio.ch`, nie für `zeugnio.ch`.

### A. Anmeldung per Code

1. `https://test.zeugnio.ch/login`, eigene Adresse (die, mit der du in der Produktion angemeldet
   bist), Code anfordern.
2. Die Mail kommt von `noreply@zeugnio.ch`. **Der Link darin beginnt mit
   `https://test.zeugnio.ch/auth/link?t=`.** Zeigt er auf `zeugnio.ch`, hier aufhören: Dann
   stimmt `NEXT_PUBLIC_SITE_URL` im Build nicht.
3. Den 6-stelligen Code eingeben. Erwartet: Dashboard mit deinen Firmen aus der Kopie.

Gegenprobe, **Fenster www-zeugnio:**

```bash
bash "$HOME/zeugnio-test/setup/deploy/nine/testinstanz.sh" psql -c "select count(*) as sitzungen from auth.sessions"
bash "$HOME/zeugnio-test/setup/deploy/nine/testinstanz.sh" psql -c "select attempts, used_at is not null as eingeloest, expires_at > now() as noch_gueltig from auth.login_requests order by created_at desc limit 3"
```

Erwartet: 1 Sitzung; die jüngste Anforderung `eingeloest = t`.

### B. Anmeldung per Link

1. Abmelden (oder neues privates Fenster), wieder anfordern.
2. Den **Link** in der Mail anklicken. Erwartet: Seite mit der teilweise verdeckten Adresse und
   einem Knopf. Erst der Knopf meldet an. (Linkscanner wie Microsoft Defender rufen jeden Link
   vorab auf. Würde schon das Öffnen einlösen, wäre der Link tot, bevor du klickst.)
3. Knopf drücken. Erwartet: angemeldet.
4. Den **Code** aus derselben Mail im Anmeldeformular eingeben. Erwartet: abgelehnt. Link und
   Code gehören zur selben Anforderung, wer das eine einlöst, verbraucht beide.
5. Denselben Link noch einmal öffnen und den Knopf drücken. Erwartet: abgelehnt.

### C. Falscher Code und Sperre

1. Neuen Code anfordern.
2. Fünfmal einen falschen Code eingeben. Jedes Mal eine Fehlermeldung.
3. Jetzt den **richtigen** Code. Erwartet: abgelehnt. Nach fünf Fehlversuchen ist die
   Anforderung tot (906: `auth.login_max_tries() = 5`), sonst liessen sich die eine Million
   möglichen Codes durchprobieren.
4. Neuen Code anfordern und richtig eingeben. Erwartet: angemeldet.

Gegenprobe: dieselbe Abfrage wie in A. Die gesperrte Anforderung zeigt `attempts = 5`,
`eingeloest = f`.

Optional und **zum Schluss**, weil es die Adresse eine Stunde sperrt: sechs Anforderungen für
dieselbe Adresse innerhalb einer Stunde. Die sechste wird gebremst (5 pro Stunde und Adresse,
`RATE_LIMITS` in `lib/auth/config.ts`). Das schützt fremde Postfächer davor, mit Anmelde-Mails
zugeschüttet zu werden.

### D. Abmelden

1. Angemeldet «Abmelden» drücken.
2. `https://test.zeugnio.ch/app/dashboard` aufrufen. Erwartet: Weiterleitung auf `/login`.
3. In den Entwicklerwerkzeugen des Browsers (F12 → Anwendung bzw. Speicher → Cookies) fehlt
   `__Host-zeugnio_session`.

Gegenprobe: `sitzungen` aus A ist um eins kleiner.

### E. Sitzung auf einem zweiten Gerät

1. Am Rechner angemeldet bleiben. Auf dem Handy (am besten über mobile Daten, nicht über das
   WLAN) ebenfalls anmelden.
2. Gegenprobe, **Fenster www-zeugnio:**

   ```bash
   bash "$HOME/zeugnio-test/setup/deploy/nine/testinstanz.sh" psql -c "select user_id, count(*) as sitzungen from auth.sessions group by user_id"
   ```

   Erwartet: deine Benutzer-ID mit 2 Sitzungen.
3. Auf dem Handy abmelden. Am Rechner die Seite neu laden. Erwartet: am Rechner weiter
   angemeldet, in der Abfrage nur noch 1 Sitzung. Abmelden beendet nur die eigene Sitzung.

### F. Konto löschen

Nicht mit deinem eigenen Konto, sondern mit einem neuen: eine zweite eigene Adresse (zum
Beispiel eine Plus-Adresse deines Postfachs). Die Registrierung ist offen
(`lib/site-config.ts`), ein unbekanntes Konto entsteht also beim ersten Einlösen.

1. Mit der zweiten Adresse anmelden (Code). Erwartet: neues, leeres Konto.
2. Mit derselben Adresse auch auf dem Handy anmelden.
3. Am Rechner unter `/app/daten` das Konto löschen und dafür die Adresse eintippen.
   Erwartet: gelöscht, abgemeldet.
4. Auf dem Handy die Seite neu laden. Erwartet: abgemeldet. Die Löschung beendet alle Sitzungen
   des Kontos, nicht nur die am Rechner.
5. Gegenprobe wie in E: Die Benutzer-ID des Testkontos taucht nicht mehr auf.

### G. Zurückschalten auf supabase

Das ist der Rückweg für Tag B: Schalter zurück, Neustart, kein neuer Build.

**Fenster www-zeugnio:**

```bash
bash "$HOME/zeugnio-test/setup/deploy/nine/testinstanz.sh" schalter supabase
```

Das Skript setzt `ZEUGNIO_AUTH="supabase"` in der Test-`.env`, startet `zeugnio-test` neu und
prüft, dass `/api/auth/anfordern` jetzt 404 antwortet.

Im Browser, noch mit der Sitzung aus A bis E:

1. `/app/dashboard` neu laden. Erwartet: Weiterleitung auf `/login`. Die eigene Sitzung zählt
   im Schalter `supabase` nicht.
2. `/login` zeigt wieder das Formular von Supabase. Ein Versuch dort scheitert. **Das ist hier
   richtig:** Die Testinstanz hat absichtlich keine Supabase-Schlüssel (siehe oben). In
   `pm2 logs zeugnio-test` stehen dazu Fehler mit `supabase.invalid`, das ist erwartet.

Zurück:

```bash
bash "$HOME/zeugnio-test/setup/deploy/nine/testinstanz.sh" schalter eigen
```

3. `/app/dashboard` neu laden. Erwartet: wieder angemeldet, ohne neuen Code. Cookie und
   Sitzungszeile haben das Hin und Her überlebt. Ist man abgemeldet, als Befund notieren.

Danach einmal im Schalter `eigen` die Logs ansehen:

```bash
pm2 logs zeugnio-test --lines 200 --nostream | grep -ci "supabase.invalid"
```

Erwartet: Die Zahl wächst nicht mehr, solange `eigen` gilt (vorher einmal ablesen, ein paar
Seiten im Browser aufrufen, nochmals ablesen). Steigt sie, ruft die App im Schalter `eigen`
noch Supabase auf: ein Befund für PR #91, denn nach Tag B soll keine Anfrage mehr an Supabase
gehen.

### Befunde festhalten

Was abweicht, mit Testfall, Uhrzeit und Meldung notieren und als Kommentar in PR #91 eintragen
(ohne Adressen und ohne Codes).

---

## Schritt 10: Abbau, gleich nach dem Test

Zuerst den vhost zurück auf die Produktion, so wie er vorher war.

**Fenster www-data:**

```bash
sudo nine-manage-vhosts virtual-host update test.zeugnio.ch --template=proxy_letsencrypt_https --template-variable PROXYPORT=3010
```

(Gleiche Vorlage wie in Schritt 8 abgelesen.) Soll `test.zeugnio.ch` ganz verschwinden, ist das
ein eigener Entscheid (offen in `cutover-reihenfolge.md`, Phase 6), nicht Teil dieses Abbaus.

Dann alles Übrige. **Fenster www-zeugnio**, zuerst ohne `--ja`: Das zeigt nur, was weg käme.

```bash
cd "$HOME"
bash "$HOME/zeugnio-test/setup/deploy/nine/testinstanz.sh" abbau
bash "$HOME/zeugnio-test/setup/deploy/nine/testinstanz.sh" abbau --ja
```

Mit `--ja`, der Reihe nach:

1. `pm2 delete zeugnio-test`, dann `pm2 save` (die Liste für den Autostart enthält danach nur
   noch `zeugnio`). Die pm2-Logs der Testinstanz werden gelöscht, sie können Daten enthalten.
2. Dienst `postgrest-zeugnio-test` gestoppt, Unit-Datei entfernt.
3. Test-Cluster gestoppt.
4. `$HOME/zeugnio-test` gelöscht: Datenkopie, Test-`.env` mit den Testgeheimnissen,
   `postgrest.conf`, Logos-Kopie, Versionen, Checkout, Protokolle.
5. `$HOME/kit/apps/zeugnio-test` gelöscht (das Original bleibt im Kit-Repo auf deinem Rechner).
6. Gegenprobe, und ob die Produktion auf 3010 weiter antwortet.

**Prüfung, Fenster www-zeugnio:**

```bash
ls -d "$HOME/zeugnio-test" 2>&1
pm2 list
systemctl --user list-units --all 'postgrest*' 'zeugnio-test*' --no-pager
curl -sS http://127.0.0.1:3010/api/health; echo
```

Erwartet: «No such file or directory»; in pm2 nur `zeugnio`; bei systemd nur `postgrest`;
die Produktion antwortet `ok`.

**Prüfung, PowerShell:**

```powershell
curl.exe -sS -o NUL -w "%{http_code}`n" https://test.zeugnio.ch/api/auth/status
```

Erwartet `404`: Die Testadresse zeigt wieder auf die Produktion.

Zum Schluss eine Zeile ins Journal `deploy/nine/kommunikation.md`: Datum, Testinstanz auf- und
abgebaut, Ergebnis der Testfälle A bis G.

---

## Im Betrieb

| Lage | Befehl (Fenster www-zeugnio) |
|---|---|
| Was läuft, wie alt ist die Kopie? | `bash "$HOME/zeugnio-test/setup/deploy/nine/testinstanz.sh" status` |
| Server wurde neu gestartet | `bash "$HOME/zeugnio-test/setup/deploy/nine/testinstanz.sh" start` |
| Pause über Nacht (Daten bleiben, besser: abbauen) | `bash "$HOME/zeugnio-test/setup/deploy/nine/testinstanz.sh" stopp` |
| PR #91 hat neue Commits | `git -C "$HOME/zeugnio-test/setup" pull --ff-only`, dann `bash "$HOME/zeugnio-test/setup/deploy/nine/testinstanz.sh" anmeldung-db` (906 ist wiederholbar), dann `bash "$HOME/zeugnio-test/setup/deploy/nine/testinstanz.sh" vor-deploy && $HOME/kit/deploy.sh zeugnio-test` |
| Frische Kopie der Daten | `bash "$HOME/zeugnio-test/setup/deploy/nine/testinstanz.sh" aufbau-db --neu`, dann `start`, dann `anmeldung-db` |
| Logs der App | `pm2 logs zeugnio-test --lines 100 --nostream` |
| Logs der Daten-API | `journalctl --user -u postgrest-zeugnio-test -n 50 --no-pager` |
| Logs des Clusters | `ls "$HOME/zeugnio-test/pg/log"`, dann die Datei des Tages mit `tail -50` |

Nach einem Neustart des Servers startet pm2 `zeugnio-test` von selbst (es steht nach dem Deploy
in der Autostart-Liste), Cluster und Daten-API aber nicht. Bis `start` gelaufen ist, zeigt die
Testadresse Fehler. Die Produktion betrifft das nicht.

## Fehlerbilder

| Meldung | Bedeutung | Abhilfe |
|---|---|---|
| `vorpruefung`: «FEHLT: … ist main in den PR-#91-Branch gemergt?» | Voraussetzung 2 fehlt | `main` in den Branch mergen (Session von PR #91), dann `git -C "$HOME/zeugnio-test/setup" pull --ff-only` |
| `vorpruefung`: «GitHub hat einen neueren Stand» | Checkout veraltet | `git -C "$HOME/zeugnio-test/setup" pull --ff-only`; scheitert das (flacher Klon), `rm -rf "$HOME/zeugnio-test/setup"` und Schritt 2 neu |
| `vorpruefung` oder `vor-deploy`: «zu wenig Arbeitsspeicher frei» | Der Build könnte den Server so füllen, dass der OOM-Killer die Produktion trifft | nicht weitermachen; läuft ein anderer Build (`pgrep -fa 'next build'`), warten und neu prüfen; sonst `free -m` ansehen |
| `start`, `stopp`, `abbau`: «verwaiste postmaster.pid entfernt» | Der Test-Cluster wurde hart beendet (OOM-Kill, Absturz, harter Neustart). Die alte PID kann inzwischen einem Prozess der Produktion gehören, darum bekommt sie kein Signal | nichts, das Skript räumt die Datei weg und macht weiter |
| `start`, `stopp`, `abbau`: «postgres-Prozesse des Test-Clusters laufen noch» | Reste eines abgestürzten Test-Clusters hängen noch am gemeinsamen Speicher | den angezeigten Befehl `kill …` mit den genannten PIDs ausführen (sie gehören nachweislich zum Test-Cluster), dann denselben Befehl wiederholen |
| `aufbau-db`: «Einspielen gescheitert» | eine Anweisung im Auszug scheitert, nichts eingespielt | Meldung lesen; ganz in `$HOME/zeugnio-test/pg/log/restore.err` |
| `postgrest`: «meldet sich nicht bereit» | Socket, Rechte von `authenticator` oder Konfiguration | `journalctl --user -u postgrest-zeugnio-test -n 50 --no-pager` |
| `anmeldung-db`: 906 scheitert | Befund für PR #91 | Meldung in PR #91 eintragen |
| Deploy: «muss genau eine App namens zeugnio-test enthalten» | Branch ohne den Stand aus `main` | Voraussetzung 2 |
| Deploy: «Hook pre-install ist gescheitert» | `check-env` lehnt die Test-`.env` ab | Ausgabe darüber lesen, dann `env --neu`, `postgrest --neu` |
| Browser: 502 auf `test.zeugnio.ch` | App auf 3013 läuft nicht, oder vhost falsch | `status`; `pm2 logs zeugnio-test` |
| Browser: «Anfrage von fremder Herkunft abgelehnt» | Herkunft passt nicht zu `NEXT_PUBLIC_SITE_URL` | über `https://test.zeugnio.ch` aufrufen, nicht über eine IP oder `localhost` |
| Keine Anmelde-Mail | Versand bei Resend gescheitert | `pm2 logs zeugnio-test --lines 200 --nostream`, darin nach `[auth]` und `[email]` suchen |

## Dateien

| Datei | Zweck |
|---|---|
| `deploy/nine/testinstanz.sh` | Aufbau, Betrieb, Abbau |
| `deploy/nine/testinstanz-env.mjs` | leitet die Test-`.env` ab, ohne Werte anzuzeigen |
| `deploy/nine/postgrest-zeugnio-test.service` | Unit der Test-Daten-API |
| `deploy/nine/postgrest-conf.mjs` | schreibt `postgrest.conf`, neu mit Ports und Verbindung aus der Umgebung |
| `deploy/nine/ecosystem.config.cjs` | pm2-Name aus dem Ordner von `APP_DIR`, Port aus `PORT` |
| `deploy/nine/hooks/post-migrate.sh`, `check.sh` | Dienst und Verwaltungsport je nach `APP_NAME` |
| `scripts/migrate.mjs` | versteht `host=` (Socket) in `DATABASE_URL` |
| Kit-Repo: `apps/zeugnio-test/kit.conf` | Kit-App `zeugnio-test` |
