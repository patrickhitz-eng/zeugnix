# B2: Supabase ganz ablösen (Ablauf ab 25.11.2026)

> **Stand 25.11.2026:** Schritte 1–3 erledigt (Prüfung grün, Abgleich 23 = 23, Projekt gelöscht). Offen: Schritt 4 und 5.

Seit Cutover B (23.11.2026, Release `20261123-124517`) meldet zeugnio selbst an. Supabase wird zur
Laufzeit nicht mehr gebraucht. Übrig sind drei Dinge, und sie müssen in dieser Reihenfolge
geschehen:

| # | Was | Wer | Frühestens |
|---|---|---|---|
| 1 | 48-Stunden-Ruhe prüfen (Logs, Anmeldungen) | Silvan | Mi 25.11. ab 13 Uhr |
| 2 | Abgleich der Konten nine ↔ Supabase | Silvan (ein Befehl) | zusammen mit 1 |
| 3 | Supabase-Projekt `zeugnio` löschen | Patrick oder Silvan, **nach Silvans Ja** | nach 1 und 2 |
| 4 | PR #102 mergen, deployen, alte Zeilen aus `shared/.env` | Claude (Merge), Silvan (Server) | nach 3, am selben Tag |
| 5 | AVV-Anhang 3, AVV-Kunden, Journal, Hub | Silvan / Claude | nach 4 |

**Warum diese Reihenfolge?** PR #102 stellt die Datenschutzerklärung auf «Anmeldung bei nine» und
streicht Supabase als Empfänger. Das darf erst live gehen, wenn Supabase wirklich keine
Personendaten mehr hält. Dort liegen heute noch die 23 Benutzerkonten (E-Mail-Adressen) in
Supabase Auth und Supabases eigene Tagessicherungen. Beides verschwindet erst mit dem Löschen des
Projekts. Umgekehrt entfernt #102 den Rückweg auf Supabase im Code; darum zuerst die 48 Stunden
abwarten.

---

## 1. 48-Stunden-Ruhe prüfen (ab Mi 25.11., 13 Uhr)

**Was du prüfst und warum:** Der Code schreibt nur bei Fehlern eine Zeile mit `[auth]`
(Anmeldung), `[email]` (Versand über Resend) oder `[rate-limit]`. Eine ruhige Log-Datei heisst
also: Niemand ist beim Anmelden gescheitert. E-Mail-Adressen erscheinen in den Logs nicht, `lib/log.ts`
ersetzt sie durch `[email]`.

**PowerShell** (dein Rechner), Verbindung öffnen, Passphrase gibst du selbst ein:

```powershell
ssh www-zeugnio@advisori01.nine.ch
```

Die folgenden Befehle laufen danach **im Server-Fenster (bash)**, einer nach dem anderen.

**a) Läuft die App ohne ungeplante Neustarts?**

```bash
pm2 describe zeugnio | grep -E "status|restarts|uptime|created at"
```

Erwartet: `status online`, `restarts` 0 (oder nur so viele, wie du seit dem 23.11. selbst
deployt hast). Ein Neustart, den du nicht ausgelöst hast, heisst meist Speicherlimit (1 GB) oder
Absturz, dann weiter bei c).

**b) Fehlerzeilen zu Anmeldung und Mail seit dem Umschalten**

```bash
pm2 logs zeugnio --lines 20000 --nostream | grep -E "\[auth\]|\[email\]|\[rate-limit\]" | tail -40
```

```bash
pm2 logs zeugnio --lines 20000 --nostream | grep -cE "\[auth\]|\[email\]|\[rate-limit\]"
```

Erwartet: keine Zeile, Zähler `0`. Einzelne Zeilen sind noch kein Alarm; entscheidend ist, was
drinsteht:

| Zeile | Bedeutung | Was tun |
|---|---|---|
| `[email] Resend API error: 403` | Resend-Schlüssel abgelehnt | Alarm, nicht weiter mit 3 |
| `[email] Resend API error: 429` | Resend drosselt | zählen; gehäuft: Alarm |
| `[auth] Anmelde-Mail nicht verschickt` | Mail ging nicht raus | Ursache steht dahinter |
| `[auth] Sitzung nicht nachschlagbar` | PostgREST oder DB weg | Alarm |
| `[rate-limit]` | Schutz gegen Massenanfragen griff | gehäuft von einer Adresse: Spam-Versuch |

**c) Sonstige Fehler**

```bash
pm2 logs zeugnio --err --lines 2000 --nostream | grep -vE "^\s*$" | tail -40
```

Erwartet: nichts Neues seit Mo 23.11. 12:46 (die Zeilen tragen Datum und Uhrzeit vorne).

**d) Wie liefen die Anmeldungen? (nur Zahlen, keine Adressen)**

```bash
psql -w -X -h 127.0.0.1 -U nmd_zeugnio -d nmd_zeugnio -c "select date(created_at) as tag, count(*) as angefordert, count(used_at) as eingeloest, count(*) filter (where used_at is null and expires_at < now()) as verfallen, count(*) filter (where attempts >= auth.login_max_tries()) as viele_fehlversuche from auth.login_requests where created_at > '2026-11-23 11:45+00' group by 1 order by 1"
```

```bash
psql -w -X -h 127.0.0.1 -U nmd_zeugnio -d nmd_zeugnio -c "select count(*) as sitzungen_gueltig, count(distinct user_id) as personen from auth.sessions where expires_at > now()"
```

Erwartet: Die meisten Anforderungen sind eingelöst. Viele «verfallen» ohne «eingelöst» heisst:
Mails kommen nicht an oder landen im Spam. Lauter Anforderungen an einem Tag, fast keine
eingelöst: Jemand probiert Adressen durch.

**e) Von aussen** (PowerShell, neues Fenster):

```powershell
curl.exe -s https://zeugnio.ch/api/health
```

Erwartet: `"status":"ok"` und `"datenquelle":"eigene"`.

**f) Selbst einmal anmelden**, per Link und per Code, und ein PDF öffnen.

**Grün** ist es, wenn a) bis f) unauffällig sind. Dann weiter mit 2.

---

## 2. Abgleich der Konten nine ↔ Supabase

**Warum:** Nach dem Löschen sind die Supabase-Konten weg. Jedes Konto, das dort existiert, muss
darum auf advisori01 vorhanden sein. Der Abgleich 908 am 23.11. ergab 23 = 23. Zur Sicherheit
vergleichen wir nicht nur die Zahl, sondern einen Fingerabdruck (MD5) über alle Konto-IDs und
alle E-Mail-Adressen. So sieht niemand eine Adresse, und trotzdem fällt jede Abweichung auf.

**Supabase-Seite, gelesen am 24.11.2026 (Claude, nur lesend):**

| Prüfung | Ergebnis |
|---|---|
| Konten in `auth.users` | 23, alle mit E-Mail |
| Neue Konten seit dem Schreibschutz (20.11. 16:27) | 0 (letztes angelegt am 19.11.) |
| Letzte Anmeldung über Supabase | 20.11.2026, 16:40 Schweizer Zeit |
| Tabellen in `public` | 22, alle mit 0 Zeilen |
| Storage | 3 Buckets (`certificates`, `uploads`, `reports`), 0 Dateien |
| Edge Functions | keine |
| MD5 der Konto-IDs | `d11b0ec203713d947f487fd57d7234e1` |
| MD5 der E-Mail-Adressen (klein geschrieben, Sortierung `C`) | `5a2e9ec9612bd224f4f86c839417492c` |

**nine-Seite** (im Server-Fenster aus 1). Gezählt werden nur Konten, die schon vor Cutover B
(23.11., 12:45) existierten; wer sich seither zum ersten Mal angemeldet hat, steht nicht bei Supabase:

```bash
psql -w -X -h 127.0.0.1 -U nmd_zeugnio -d nmd_zeugnio -c "select count(*) as konten, md5(string_agg(id::text, ',' order by id)) as md5_ids, md5(string_agg(lower(email), ',' order by lower(email) collate "C"))) as md5_emails from auth.users where created_at < '2026-11-23 11:45+00'"
```

| Ergebnis | Bedeutung |
|---|---|
| `23`, beide MD5 gleich wie oben | Alles da. Weiter mit 3. |
| IDs gleich, E-Mails verschieden | Jemand hat seit dem Umzug die Adresse geändert. Unkritisch, kurz melden. |
| IDs verschieden oder nicht 23 | **Stopp.** Nicht löschen; Claude vergleicht die einzelnen IDs. |

**Exportieren muss vorher nichts.** Die Zeugnisdaten, Logos und Sicherungen liegen seit dem
20.11. auf advisori01, die Konten ebenfalls (siehe Abgleich). Ein zusätzlicher Auszug aus Supabase
wäre nur eine weitere Kopie der E-Mail-Adressen, also genau das, was wir loswerden wollen.
Mailvorlagen und Einstellungen von Supabase Auth braucht die eigene Anmeldung nicht.

---

## 3. Supabase-Projekt löschen (Patrick oder Silvan, nach Silvans Ja)

Das Projekt gehört der Supabase-Organisation von Patrick. In derselben Organisation liegen
**andere Projekte, die weiterlaufen müssen** (u. a. «XELLENZ Intranet», «Revisionsassistent»).
Darum nur das eine Projekt löschen, **nie die Organisation**.

| Merkmal | Wert |
|---|---|
| Projektname | `zeugnio` |
| Projekt-Ref (steht in der Adresszeile) | `swnycyrhqilzmqnmclcp` |
| Region | `eu-central-1` (Frankfurt) |

1. Auf supabase.com anmelden, das Projekt **`zeugnio`** öffnen. In der Adresszeile muss
   `swnycyrhqilzmqnmclcp` stehen.
2. **Project Settings → General**, ganz unten **Delete project**.
3. Den Projektnamen `zeugnio` eintippen und bestätigen.

**Was dabei verschwindet** (laut Supabase-Doku «Deleting Your Project» und «Database Backups»):
die Datenbank mit den 23 Konten, die Anmeldesitzungen und Auth-Protokolle, die Buckets, alle
API-Schlüssel und **alle Sicherungen** («we permanently remove all associated data, including
any backups»). Rückgängig machen geht nicht. Die Abrechnung für das Projekt endet sofort.

**Nicht pausieren statt löschen:** Pausiert behält Supabase die Daten, die Datenschutzerklärung
von #102 wäre dann falsch.

**Gegenprobe** (PowerShell): Die Projektadresse antwortet nicht mehr (bis 24 h, bis das DNS
nachzieht):

```powershell
curl.exe -s -o NUL -w "%{http_code}" https://swnycyrhqilzmqnmclcp.supabase.co/auth/v1/health
```

Vorher kommt `401` (Schlüssel fehlt), nachher ein Fehler oder `404`. Claude kann zusätzlich lesend
prüfen, dass `zeugnio` nicht mehr in der Projektliste steht.

---

## 4. PR #102 mergen und deployen (am Tag des Löschens)

**a) Claude** (nach deinem Ja): setzt in `app/legal/privacy/page.tsx` das Stand-Datum `UPDATED`
auf den Tag des Deploys, holt `main` nochmals in den Branch, prüft `typecheck`, `build` und die
Tests, nimmt den PR aus dem Entwurf und merged ihn.

**b) Silvan, Deploy** (Server-Fenster als `www-zeugnio`):

```bash
~/kit/deploy.sh zeugnio main
```

`deploy.sh` prüft dabei mit `check-env.mjs` die Pflichtvariablen. Die alten Supabase-Zeilen in
der `.env` stören nicht, sie erzeugen nur einen Hinweis. Fehlt eine Pflichtvariable
(`DATA_API_URL`, `DATA_API_JWT_SECRET`, `ZEUGNIO_AUTH_SECRET`, `RESEND_API_KEY`,
`NEXT_PUBLIC_SITE_URL`, `CRON_SECRET`), rollt `deploy.sh` zurück.

**c) Von aussen prüfen** (PowerShell):

```powershell
curl.exe -s https://zeugnio.ch/api/health
```

```powershell
(curl.exe -s https://zeugnio.ch/legal/privacy) -match "Supabase"
```

Erwartet: Health `ok` mit `datenquelle: eigene`; die zweite Zeile ergibt `False`. Danach einmal
anmelden (Link und Code).

**d) Alte Zeilen aus `~/zeugnio/shared/.env` entfernen** (erst nach dem Deploy: Die alte Version
vor #102 hat diese Variablen beim Start noch verlangt). Betroffen sind genau diese vier Namen:

- `NEXT_PUBLIC_SUPABASE_URL`
- `NEXT_PUBLIC_SUPABASE_ANON_KEY`
- `SUPABASE_SERVICE_ROLE_KEY`
- `ZEUGNIO_AUTH` (nur diese Zeile, **nicht** `ZEUGNIO_AUTH_SECRET`)

Zuerst nur die **Namen** anzeigen, die betroffen sind (die Werte erscheinen nicht):

```bash
grep -oE "^(export +)?[A-Z_]*SUPABASE[A-Z_]*=|^(export +)?ZEUGNIO_AUTH=" ~/zeugnio/shared/.env
```

Dann genau diese Zeilen löschen. `sed -i` schreibt die Datei neu und behält die Rechte; das `=`
direkt nach `ZEUGNIO_AUTH` sorgt dafür, dass `ZEUGNIO_AUTH_SECRET` stehen bleibt:

```bash
sed -i -E "/^(export +)?(NEXT_PUBLIC_SUPABASE_URL|NEXT_PUBLIC_SUPABASE_ANON_KEY|SUPABASE_SERVICE_ROLE_KEY|ZEUGNIO_AUTH)=/d" ~/zeugnio/shared/.env
```

Gegenprobe: Der erste Befehl gibt nichts mehr aus, Rechte und Pflichtvariablen stimmen:

```bash
grep -oE "^(export +)?[A-Z_]*SUPABASE[A-Z_]*=|^(export +)?ZEUGNIO_AUTH=" ~/zeugnio/shared/.env; stat -c "%a %U" ~/zeugnio/shared/.env
```

```bash
cd ~/zeugnio/current && node --env-file=.env scripts/check-env.mjs
```

Erwartet: keine Ausgabe beim `grep`, `600 www-zeugnio`, `check-env` ohne Befund. Die laufende App
muss nicht neu starten: Sie liest diese Variablen nicht mehr.

---

## 5. Danach

- **AVV-Anhang 3** ohne Supabase nachführen und **AVV-Kunden informieren** (AVV § 6). Der AVV wird
  in einer eigenen Session überarbeitet.
- **Vercel 6.4b:** Im pausierten Vercel-Projekt stehen noch Umgebungsvariablen mit den alten
  Supabase-Schlüsseln. Nach dem Löschen des Supabase-Projekts sind sie wertlos; sie verschwinden
  mit dem Löschen des Vercel-Projekts.
- **Journal** (`kommunikation.md`), **`cutover-reihenfolge.md`**, **Hub** (Register, Steckbrief)
  und `CLAUDE.md` nachführen.
