# nine.ch — Kommunikationsjournal `advisori01`

> **Warum diese Datei:** Drei Produkte ziehen auf **einen** Server, aber die Korrespondenz
> mit nine lag in drei Repositories — zeugnix (hier), `EHC-Lions_Sponsorenlauf_Web-App_2026`
> und `benchmark-app`. nine selbst unterscheidet die Produkte nicht: jedes Ticket betrifft
> die Maschine `advisori01`. Dieses Journal ist darum **servergeführt, nicht produktgeführt**.
>
> **Regel:** Jede Frage an nine und jede Antwort kommt hier rein, bevor sie in ein
> Produkt-Dokument wandert. Betreff immer mit `advisori01`, immer derselbe Absender.
>
> **Nachbarn:** `cutover-reihenfolge.md` = Reihenfolge und Gates des Umzugs ·
> `docs/setup-zeugnio-nine.html` = die Befehle · `antwort-2026-10-13.email.md` = Entwürfe.
>
> Stand: 2026-10-28, abgeglichen mit dem Postfach `silvan.schueck@advisori.ch` (Outlook).
> Erstmalig am 16.10. rückwirkend aus allen drei Repos zusammengetragen.

---

## Die Maschine

`advisori01.nine.ch` · **5.148.171.221** · kein IPv6 · nine Managed Server **nV8**
(6 vCPU, 7867 MB RAM, 100 GB) · RZ **nine-cz42** (Schweiz) · Ubuntu 24.04 LTS ·
**kein Root** · nginx 1.24.0 über `nine-manage-vhosts` · PostgreSQL 16.15 · MySQL 8.0.46 ·
Swap 2 GB · Login heute: **`www-data`** (geteilt mit den nginx-Arbeitsprozessen).

Vertragslage: **ein nine-Vertrag (Advisori)**. Advisori ist Auftragsbearbeiter für alle
Produkte, nine Unterauftragsbearbeiter. zeugnix/Patrick braucht einen Vertrag mit Advisori.

---

## Verlauf

| Datum | Kanal | Thema | Produkt | Ergebnis |
|---|---|---|---|---|
| 2026-09-14 | — | Liegt die DB auf nines Schweizer Infrastruktur oder bei Google Cloud? | EHC | **Schweizer Infrastruktur**, nicht GCP |
| 2026-09-15 | Vorfragen | PostgreSQL vorhanden / Version / Kosten · laufen schon andere Apps · **Auftragsbearbeitungsvertrag** | EHC | führte zu Ticket SVC-116462; ABV **unbeantwortet** |
| 2026-09-18 | Mail | Alles auf den Managed Server oder die drei Produkte auf deplo.io? Können sie eine Business-Instanz teilen? | alle | Betriebsantworten 18./25.09. (s. u.) |
| 2026-09-23 | **SVC-116462** | PostgreSQL 16 installieren | EHC | **installiert**; Complex Service CHF 60/Mt **pro Server, nicht pro App** |
| 2026-09-25 | Mail | Betriebsgrenzen deplo.io / On-Demand | alle | **kein PITR** (kein DB-Typ), **kein SLA** für deplo.io/On-Demand, SLA nur auf Managed Server zubuchbar, Support Mo–Fr 09–18, Abrechnung minutengenau pro Replikat |
| 2026-09-28 | — | *Entscheid intern:* deplo.io verworfen, alles auf `advisori01` | alle | drei der fünf Blocker entfallen damit |
| 2026-10-09 | Mail (Cockpit ging nicht) | Ticket `deploy/nine/ticket-nine-createrole.md`: `CREATEROLE` · `CONNECT` mit Weitergaberecht · `postgresql-client-17` | zeugnio | → Antwort Patrick Lion 2026-10-13 |
| 2026-10-?? | Mail | Mailversand vom Server · Chromium ohne Root · Node-Dienst nach Reboot | zeugnio + Benchmark | → Antwort Lars 2026-10-13 |
| **2026-10-13** | Mail | **Antwort Patrick Lion** | zeugnio | PG 17 möglich (PGDG statt Canonical), **admin-Benutzer statt Einzelrechte**; Wahl: 16→17 upgraden **oder** zweite 17er-Umgebung. Dazu die Bitte, auf „überbordende AI-Quellen/Zitate" zu verzichten |
| **2026-10-13** | Mail | **Antwort Lars** | Benchmark + zeugnio | (1) Mailversand vom Server **abgeraten** → Spezialanbieter oder SMTP über reguläres Postfach; (2) **Chromium im User-Space möglich**, machen andere Kunden auch; (3) **pm2 + systemd-User-Unit** ist der Weg |
| 2026-10-13 | SVC-117420 | **Unsere Antwort** an Patrick Lion | zeugnio | Gewählt wurde darin die **zweite 17er-Umgebung parallel**, nicht das Upgrade aus dem Entwurf, dazu die Frage nach den Kosten |
| **2026-10-14** | SVC-117420 | **Antwort Patrick Lion** — Verfahren und Kosten des Upgrades | zeugnio | Upgrade über das **PostgreSQL-Standardverfahren**: die 16er-Umgebung wird **gestoppt, aber nicht entfernt**, alle Daten werden übernommen, danach Prüffenster, **Rückfall auf 16 möglich**. **Upgrade und admin-Benutzer kostenlos**; **Parallelbetrieb wäre kostenpflichtig** (nach Aufwand). Bisher hier als 16.10. geführt |
| 2026-10-16 | *eigene Messung* | DNS und Mailweg von `advisori.ch`, `zeugnix.ch`, `zeugnio.ch` | zeugnio | s. „Mailweg und DNS" — Lars' Weg 2 (SMTP über `@advisori.ch`) ist damit **erledigt**, und die A-Records zeigen noch nicht auf den Server |
| 2026-10-23 | SVC-117438 | Ports von aussen, Upload-Grösse der Vorlage, zwölf Chromium-Bibliotheken | Benchmark | **Nemat, 23.10.:** von aussen sind **nur 22, 80 und 443** erreichbar · `proxy_letsencrypt_https` setzt `client_max_body_size 64m` · die zwölf Bibliotheken sind **systemweit installiert**. Am 26.10. geschlossen |
| 2026-10-23 | SVC-118041 | SSH-Anmeldungen mit dem Railway-Tunnelschlüssel seit 21.10. | Benchmark | **Marco Streich, 26.10.:** Liste in `/home/www-data/railway-ssh-connections.log`, alle Anmeldungen kamen von Railway-IPs, **auf dem Datenbankserver nichts Auffälliges**. Dazu der Hinweis auf Deploio. Wartet auf unsere Antwort |
| 2026-10-26 | SVC-117420 | **automatisch geschlossen** | zeugnio | Zehn Tage ohne Antwort von uns. Mail A (`antwort-2026-10-13.email.md`) öffnet es wieder |

---

## Beantwortet — nicht mehr fragen

| Thema | Antwort | Quelle |
|---|---|---|
| App-Benutzer anlegen | **Machen wir selbst** als `www-data`: `sudo nine-manage-vhosts user create <name>`, den vhost mit `--user=<name>` zuordnen. Linger automatisch an, eigener crontab, eigener `~/.ssh/authorized_keys`. **Der App-Benutzer darf nines Werkzeuge nicht benutzen** | SVC-116462 + nine-Doku «multi-user» (28.10.) |
| Ports von aussen | **nur 22, 80 und 443** — 5432 und 3306 sind damit zu | Nemat, SVC-117438, 23.10. |
| nginx | installiert, **kostenlos**, vhosts über `nine-manage-vhosts`; Templates `proxy` / `proxy_letsencrypt_https_redirect`; Testadresse `<domain>.advisori01.nine.ch` | SVC-116462 |
| Zertifikate | Let's Encrypt gratis, braucht nur beide A-Records (Apex + `www`) | SVC-116462 |
| PostgreSQL-Kosten | **CHF 60/Mt für den ganzen Server**, Grenzkosten je weiterer App = CHF 0 | SVC-116462 |
| Kapazität | nV8-Empfehlung gilt für **vier** Apps, inkl. ~2 GB Build | SVC-116462 |
| Ausgehender Netzverkehr | **keine Einschränkungen** — GitHub:22, npm, **SMTP direkt** | SVC-116462 |
| Node-Betrieb | **nvm + PM2 ist nines eigene Empfehlung**; systemd-User-Unit + `loginctl enable-linger` (letzteres fehlt in ihrer Doku) | SVC-116462 + Lars (3) |
| Chromium ohne Root | **User-Space-Installation möglich**, andere Kunden machen das so | Lars (2) |
| Mailversand | vom Server **abgeraten** (Postfix nicht managed, IP ohne Sendereputation) — technisch aber **nicht gesperrt** | Lars (1) + SVC-116462 |
| Swap | **2 GB sind vorhanden** (gemessen 2026-10-07) | eigene Messung |
| `client_max_body_size` | global **64m** (`nginx.conf:42`) — reicht für 2-MB-Logos | eigene Messung |
| Object Storage | RZ **nine-es34**, CHF 0.03/GB/Mt | SVC-116462 |
| PostgREST als Container | gegenstandslos — statisch geliefertes Binary als systemd-User-Dienst | Entscheid 28.09. |
| PG-Upgrade 16 → 17 | **Standardverfahren**; 16 wird gestoppt und **behalten**, Rückfall möglich. **Kostenlos**, der admin-Benutzer ebenfalls. Nur **Parallelbetrieb** wäre kostenpflichtig | Patrick Lion 16.10. |

---

## Offen — nach Zuständigkeit, nicht nach Produkt

### A) Braucht Root → Ticket an nine

| # | Bitte | Für | Stand |
|---|---|---|---|
| A1 | **PG 16 → 17 upgraden** (statt zweiter Umgebung) **+ admin-Benutzer** | zeugnio | Verfahren und Kosten geklärt (14.10.), unsere Antwort fehlt; Ticket am 26.10. automatisch geschlossen. **28.10.:** Mail A in `antwort-2026-10-13.email.md`, liegt als Entwurf in Outlook. Albis Run ist produktiv, darum Termin von nine vorschlagen lassen |
| A2 | ~~vhost `zeugnio.ch` + App-Benutzer `www-zeugnio`~~ | zeugnio | **Kein Ticket mehr: machen wir selbst** (`cutover-reihenfolge.md` 1.2). Gehört weiterhin vor das Deployment |
| A3 | ~~vhost `benchmark.ag` + App-Benutzer `www-benchmark`~~ | Benchmark | `www-benchmark` besteht (Kit `MIGRATION.md`) |
| A4 | **Als welche Rolle läuft der Nachtdump?** | zeugnio | offen seit 07.10., **steht in Mail A**. Die Frage nach selbst angelegten Datenbanken entfällt, zeugnio nutzt `nmd_zeugnio` |
| A5 | **`proxy_read_timeout` ≥ 600 s für `/report/*`** auf dem Benchmark-vhost. Default 60 s, nines Konfiguration | Benchmark | zu stellen |
| A6 | ~~Bestätigen, dass Port 5432 (und 3306) für alle Quellen gesperrt bleibt~~ | alle | **beantwortet 23.10.** (SVC-117438): von aussen nur 22, 80, 443 |
| A7 | ~~MySQL-Datenbank für Benchmark (`nmd_`-Präfix)~~ | Benchmark | `nmd_advisori_bench` besteht (Hub-Register) |
| A8 | **Kann `nine-manage-vhosts` das Zertifikat über DNS-01 prüfen** statt HTTP-01? | zeugnio | **zurückgestellt:** zuerst die Weiterleitung aus `cutover-reihenfolge.md` 1.3 testen, nur bei Misserfolg fragen |

### B) Kaufmännisch / rechtlich → eigener Kanal

| # | Punkt | Stand |
|---|---|---|
| B1 | **Auftragsbearbeitungsvertrag** mit nine | seit 15.09. offen, nie beantwortet. Blockiert die Datenschutzerzählung, nicht den Umzug |
| B2 | Schriftliche Standortbestätigung (DB, Backups lokal + remote, Object Storage, Logs) | offen |
| B3 | **Object Storage bestellen** — Bucket **und** Bucket-Benutzer im Cockpit, zwei Buckets (zeugnio, EHC) | offen |
| B4 | SLA-Preis, Reaktionszeit, Pikett | offen |

### C) Machen wir selbst → kein Ticket

Linux-Benutzer und vhosts anlegen (`nine-manage-vhosts`) · Datenbanken und DB-Benutzer
anlegen (`nine-manage-databases`) · Datenbankinhalt, Rollen, Rechte (mit A1) · Ports ·
Prozesse, pm2, systemd-User-Units · Cron · Deployment · Chromium in den User-Space ·
Mailanbieter (mailomat.swiss) · DNS — beides geprüft am 16.10., siehe „Mailweg und DNS".

---

## Die Trennung auf der Maschine

Vier Schichten, pro Produkt eine Spalte. Das Muster ist im EHC-Repo erprobt und wird
vervielfacht, nicht neu erfunden.

| Schicht | zeugnio | EHC-Sponsorenlauf | Benchmark |
|---|---|---|---|
| **1 · Linux-Benutzer** | `www-zeugnio` **(fehlt → selbst, `cutover-reihenfolge.md` 1.2)** | `www-albisrun` ✓ | `www-benchmark` ✓ |
| **2 · Datenbank** | PG `nmd_zeugnio` ✓ | PG `nmd_albisrun` ✓ | MySQL `nmd_advisori_bench` ✓ |
| **3 · Port (nur Loopback)** | 3010 App · 3011 PostgREST | 3000 | **8000** (+ `127.0.0.1:3307` falls SSH-Tunnel) |
| **4 · vhost + Zertifikat** | `zeugnio.ch` (+ `www`) | `albisrun.ch` (+ `www`) | `benchmark.ag` (`BASE_URL`) |

**Schicht 1 ist die eigentliche Grenze.** Daran hängen Dateien, Prozesse, systemd-Instanz,
pm2, Cron und Geheimnisse. Solange zeugnio in `www-data` sitzt, wären `shared/.env`,
`postgrest.conf` (JWT-Secret) und `backup.key` für den Benutzer lesbar, der **jeden** vhost
der Maschine ausliefert.

**Zu Schicht 2:** Die Mandantentrennung ist bei Postgres schon gemacht — `PUBLIC` hat auf
keiner Datenbank `CONNECT`, nine vergibt es einzeln. Aber: **Rollen sind clusterweit.**
zeugnios `anon`/`authenticated`/`service_role`/`authenticator` existieren nach dem Anlegen
auf der ganzen Instanz (ohne Rechte sonstwo). Bei MySQL irrelevant.

**Cron-Fenster, damit sich die Sicherungen nicht überlagern:**

| Zeit | Was |
|---|---|
| 02:00–03:00 | **nines eigener Dump** (10 Tage, Restore macht der Kunde, **kein PITR**) |
| 03:30 | EHC DB-Backup |
| 00:22 | EHC logrotate |
| → frei | zeugnio stündlich + logrotate: **nicht** 02:00–03:30 ansetzen |

---

## Mailweg und DNS (gemessen 2026-10-16)

Lars hat zwei Wege angeboten: einen Spezialanbieter **oder** SMTP über ein regulär
konfiguriertes Postfach wie `website@advisori.ch` — „damit stimmen dann auch SPF und
DKIM". Der zweite Weg ist mit dieser Messung **vom Tisch**.

| Domain | MX (Posteingang) | SPF | DKIM | DMARC | A-Record |
|---|---|---|---|---|---|
| `advisori.ch` | `advisori-ch.mail.protection.outlook.com` → **Microsoft 365**; dazu `send.advisori.ch`, das **nicht auflöst** | `include:spf.protection.outlook.com -all` | — | `p=none` | — |
| `zeugnix.ch` (live) | **keiner** — die Domain empfängt keine Mail | Apex keiner; `send.zeugnix.ch`: `include:amazonses.com ~all` | `resend._domainkey` vorhanden (1024 bit) | `p=none` | `216.150.1.1` (Vercel) |
| `zeugnio.ch` (Ziel) | `inbound-smtp.eu-west-1.amazonaws.com` → **AWS Irland** | **keiner** | **keiner** | **keiner** | `216.198.79.1`, `64.29.17.1` (Vercel) |

**Drei Folgerungen:**

1. **Weg 2 würde die Schweiz-Aussage brechen.** advisori.chs Postfächer liegen in Exchange
   Online — jede Einladung und jeder Magic Link liefe über Microsoft. Dazu steht der
   SPF-Satz auf `-all` und erlaubt **nur** Microsoft: mailomat.swiss dürfte unter
   `@advisori.ch` gar nicht senden, solange Advisori seinen SPF nicht ändert. Der
   **Entscheid mailomat.swiss auf `zeugnio.ch` bleibt und ist jetzt belegt**, nicht nur
   bevorzugt.
2. **Für `zeugnio.ch` ist der Mailweg ein Neubau.** SPF, DKIM und DMARC fehlen vollständig.
   Zu migrieren ist nichts: die Resend-Einträge hängen an `zeugnix.ch` und bleiben bis zur
   Umschaltung gültig. `send.zeugnix.ch` mit `include:amazonses.com` zeigt, dass Resend
   unter der Haube über Amazon SES versendet — also auch der heutige Weg nicht schweizerisch.
3. **Die A-Records von `zeugnio.ch` zeigen auf Vercel, nicht auf `advisori01`.** Let's
   Encrypt kann darum heute kein Zertifikat ausstellen. Der vhost (A2) wird zuerst **ohne**
   Zertifikat angelegt und über nines Testadresse `zeugnio.advisori01.nine.ch` geprüft;
   die Umschaltung der A-Records ist ein eigener Schritt mit eigener Reihenfolge.

Zwei Nebenbefunde, beide nicht dringend:

- `advisori.ch` führt **zwei MX auf derselben Priorität 10**, und einer davon
  (`send.advisori.ch`) hat gar keinen Eintrag. Etwa die Hälfte der Zustellversuche läuft
  damit erst in einen nicht auflösbaren Host und fällt dann auf Microsoft zurück — Mail
  kommt an, aber verzögert. Gehört der Advisori-IT gemeldet, nicht nine.
- Der **Posteingang von `zeugnio.ch` liegt bei AWS in Irland**. Eine Zeile im Verzeichnis
  der Bearbeitungstätigkeiten, unabhängig vom Serverumzug.

---

## Benchmark ist das Risiko für die anderen zwei

Nicht wegen des Umzugs, sondern wegen des Codes. Gehört entschieden, **bevor** Benchmark
auf dieselbe Maschine kommt wie echte Mitarbeiterdaten:

1. **Chromium unbegrenzt.** `controllers/companyController.js:2687` startet **pro
   `/report/:id/pdf`-Request einen frischen Browser** — kein Pool, keine Queue, kein
   Semaphor. N parallele PDF-Abrufe = N Chromium-Instanzen à 300–500 MB. Dazu eine
   langlebige Singleton-Instanz für die Login-Prüfung. Auf 7,8 GB mit drei Apps trifft der
   OOM-Killer im schlechtesten Fall **PostgreSQL** — also zeugnio *und* den Sponsorenlauf.
2. **Verwaiste Prozesse.** `browser.close()` steht im geraden Try-Pfad
   (`companyController.js:2746`); wirft etwas davor, springt die Ausführung in den Catch
   (`:2775`) **ohne close**. Die Instanz bleibt stehen.
3. **Puppeteer-Konfiguration zeigt ins Leere.** `PUPPETEER_SKIP_CHROMIUM_DOWNLOAD='true'`
   und `PUPPETEER_EXECUTABLE_PATH='/nix/var/nix/profiles/default/bin/chromium'`
   (`nixpacks.toml:8-9`) — ein Nix-Pfad, der auf Ubuntu 24.04 nicht existiert, und in
   `.env.example` steht kein einziges `PUPPETEER_*`. Mit Lars' Antwort ist der Weg:
   Skip-Flag weg, Puppeteer lädt seinen Chrome ins Heimatverzeichnis, Systembibliotheken
   (`nss`, `freetype`, `harfbuzz`, `fonts-liberation`) ebenfalls dorthin entpacken und
   `LD_LIBRARY_PATH` setzen.
4. **Uploads liegen relativ zum Arbeitsverzeichnis** (`routes/index.js:15,156`,
   `server.js:83,86`, gitignored). Mit dem Release-Symlink-Muster von `deploy.sh` wäre
   `uploads/` **bei jedem Release weg** → muss ein Symlink nach `shared/uploads` werden.
5. **Node-Version nirgends gepinnt** (kein `engines`, keine `.nvmrc`, `nixpacks.toml`
   pinnt nicht). Puppeteer 24.x braucht ≥ 18.
6. **DB-Benutzer `DB_USER` hat Default `root`** (`db.js:8`) — muss gesetzt werden,
   bevor etwas auf dieser Maschine startet.

Gegenmittel, das kein nine-Ticket braucht: Semaphor/Queue vor der PDF-Route,
`browser.close()` in ein `finally`, und der Build/Prozess unter
`systemd-run --user -p MemoryMax` gedeckelt.

**Und unabhängig vom Umzug:** benchmark.ag verspricht öffentlich „keine Datenübertragung
ins Ausland", der Code widerspricht an fünf Stellen (Bilanzdaten an Anthropic/OpenAI,
Resend, Google Fonts). Ein Serverumzug löst davon keinen Punkt. Eigener Entscheid.

---

## Zwei Dinge, die nicht im Git stehen

- **Benchmarks Umzugsplan `_docs/UMZUG_SCHWEIZ.md` ist nicht getrackt.** Er wird aus sechs
  Stellen im Code referenziert, `services/fontEmbed.js:5` nennt den Ort: „in the ICM
  workspace". Umgesetzt als Commits: Schritt 0.1 und 0.3 (09.10.), Schritt 0.2 nur auf
  Branch `fix/konten-statt-ki-pruefung`, **nicht in main**.
- **Überholt seit Oktober:** Benchmarks MySQL liegt inzwischen als `nmd_advisori_bench` auf
  `advisori01`; die App bei Railway erreicht sie über einen SSH-Tunnel (SVC-118041). Die
  ursprüngliche Notiz bleibt als Verlauf: **Benchmarks MySQL liegt (noch) nicht auf `advisori01`.** Die IP 5.148.171.221 in
  `sshTunnel.js:14` ist ein Kommentar-Beispiel; `SSH_HOST` und `DB_HOST` in `.env.example`
  sind leer, `db-backup/README.md` arbeitet durchgehend mit `NEW_HOST`-Platzhaltern. Der
  Tunnel-Code entstand am 23.09.2026 als Vorbereitung. Die frühere Notiz „liegt
  möglicherweise schon bei nine" ist damit **nicht belegt** — von Silvan zu bestätigen.
