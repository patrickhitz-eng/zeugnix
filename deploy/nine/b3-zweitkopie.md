# B3: Zweitkopie der Sicherungen ausser Haus

> Stand: 25.11.2026 · **Entscheid Silvan 24.11.: nine Object Storage in es34 mit Versionierung, Alarm über healthchecks.io.** · **Live seit 25.11.:** Kit `587bb18` auf advisori01, Bucket `advisori-zeugnio-bucket` (es34), neue Crontab, Restore aus der Zweitkopie bestanden (26 Tabellen, Zeilenzahlen gleich). Lifecycle-Regeln gesetzt (`nctl get bucket advisori-zeugnio-bucket -o yaml`), Alarm über healthchecks.io aktiv. **B3 erledigt.** Die Abschnitte unten beschreiben den Weg dorthin und bleiben als Nachschlagewerk.
> Gehört zu `cutover-reihenfolge.md` (B3) und zum Journal `kommunikation.md`.

## Warum

Heute liegt jede Sicherung von zeugnio nur auf advisori01: in `~/zeugnio/backups/` und in nines Tagessicherung. Fällt der Server oder das Rechenzentrum nine-cz42 aus, sind Datenbank und Sicherungen zusammen weg. Ab dem 1.12. liegen dort echte Zeugnisse von Pilotfirmen.

Der eigene Standard (`advisori-hub/standards/datenschutz.md`, Punkt 9) verlangt: Backups in der Schweiz, auf zwei nine-Rechenzentren verteilt, verschlüsselt.

## 1. Ist-Zustand

**Aus Repo, Kit und Journal belegt:**

| Was | Wie heute |
|---|---|
| Wer sichert | Kit-Crontab von `www-zeugnio`, seit 20.11. (Journal) |
| Wie oft | stündlich um :15, von 05 bis 23 Uhr; dazu nines eigener Dump 02–03 Uhr (10 Tage, kein Point-in-Time-Recovery) |
| Was | `pg_dump` mit Eigentümern → gzip → AES-256 (`openssl`, PBKDF2 200'000 Runden) mit `shared/backup.key`. Dazu das Journal der Zeugnisse und das Logo-Archiv, Letzteres nur, wenn sich ein Logo geändert hat |
| Wohin | nur lokal `~/zeugnio/backups/`, 14 Tage (`BACKUP_KEEP_DAYS`) |
| Zweitkopie | keine. `backup-s3.env` ist leer, also endet **jeder** stündliche Lauf mit Rückgabewert 3 (`FEHLER` in `logs/backup.status`) |
| Restore-Test | So 07:50 `--from-s3`. Ohne Bucket scheitert er jeden Sonntag. Der letzte grüne Test lief von Hand am 21.11. aus einer lokalen Sicherung |
| Alarm | keiner. Den Fehler sieht nur, wer `deploy.sh zeugnio --check` ausführt |
| Schlüssel | `backup.key` auf dem Server, Kopie bei dir (Fingerabdruck `ef3fe2bf0a70`, Abgleich seit 21.11. offen) |

**Nur auf dem Server prüfbar.** Dieser Befehl liest nur und gibt keine Geheimnisse aus. PowerShell, als `www-zeugnio`:

```powershell
ssh www-zeugnio@advisori01.nine.ch "timedatectl | sed -n '1,6p'; echo ---; crontab -l | grep -v '^#'; echo ---; cat ~/zeugnio/logs/backup.status ~/zeugnio/logs/restore-test.status; echo ---; ls -1t ~/zeugnio/backups | head -4; du -sh ~/zeugnio/backups ~/zeugnio/shared/uploads; df -h ~ | tail -1; echo ---; git -C ~/kit log --oneline -1; git -C ~/kit status --short | head; test -s ~/zeugnio/shared/backup-s3.env && echo 's3-env befuellt' || echo 's3-env leer'"
```

Erwartet: Zeitzone (sie entscheidet, ob «05:15» Zürcher Zeit oder UTC ist), die Crontab vom 20.11., `backup.status` mit `FEHLER … rc=3`, Kit `e88fd08` ohne lokale Änderungen und `s3-env leer`.

## 2. Anbieter: Vorschlag

Recherche vom 24.11.2026. Alle Preise sind **laufende Monatskosten**.

| | **nine Object Storage** | Infomaniak Object Storage | Exoscale SOS |
|---|---|---|---|
| Preis | CHF 0.03/GB + CHF 0.02/GB Download, keine Grundgebühr | ca. CHF 0.012/GB, Download inklusive | €0.0184/GB + Download |
| Standort | nine-es34 (NTT Rümlang). Der Server steht in cz42 (Altstetten) | Schweiz | Genf oder Zürich |
| AVV | Teil der AGB (Ziff. 9.3), gilt also schon | Vorlage vorhanden, neuer Vertrag | Vorlage vorhanden, neuer Vertrag. Konzernmutter A1 (Österreich) |
| verschlüsselt gespeichert | AES-256 | unklar | ja |
| Aufbewahrung per Regel | ja, nur über `nctl` oder die API | ja | ja |
| Schlüssel ohne Löschrecht | **nein**, es gibt nur `reader` und `writer` | nicht dokumentiert | ja |
| Versionierung | ja | ja (dazu Object Lock) | ja (dazu Object Lock) |

**Vorschlag: nine, Bucket in es34.**
- Es erfüllt den eigenen Standard wörtlich.
- Das Konto besteht schon (Albis Run hat seit 19.10. einen Bucket), und der AVV ist Teil der AGB.
- Kosten: Die Kopien von zeugnio sind zusammen rund 0.2 GB. nine rechnet pro angefangenem GB, also etwa **CHF 0.03 pro Monat, laufend**.

**Der Haken bei nine:** Server und Zweitkopie liegen beim selben Anbieter und im selben Konto. Und der Schlüssel auf dem Server darf im Bucket auch löschen. Wer den Server übernimmt, könnte also die Kopien entfernen. Abgefangen wird das mit der **Versionierung**: Ein Löschen hinterlässt nur eine Löschmarke, und die alte Version bleibt 14 Tage abrufbar. Ob ein `writer` auch einzelne Versionen endgültig löschen kann, dokumentiert nine nicht. Die Frage steht als Entwurf unten.

**Ein zweiter Anbieter** (Exoscale mit einem Schlüssel ohne Löschrecht oder Infomaniak mit Object Lock) kostet bei dieser Grösse fast nichts. Er bringt aber einen neuen Vertrag und einen neuen Empfänger in die Datenschutzerklärung. Mein Rat: erst nach den Piloten, wenn nine die Frage nach dem Versionslöschen mit «ja» beantwortet.

## 3. Was das Kit jetzt kann (Commit `587bb18`)

- **Aufbewahrung über Ordner im Bucket.**
  - Eine Lifecycle-Regel löscht Objekte nach Alter, kennt aber nur Präfixe. Ein «behalte eine pro Woche» gibt es nicht.
  - Darum schreibt die Crontab jede Sicherung in einen eigenen Ordner, und jeder Ordner bekommt seine eigene Regel. Das Kit selbst löscht im Bucket nichts.

  | Lauf | Ordner | Regel | ergibt |
  |---|---|---|---|
  | Mo–Sa 05:15 | `zeugnio/taeglich/` | 14 Tage | 14 Tagesstände |
  | So 05:15 | `zeugnio/woechentlich/` | 56 Tage | 8 Wochenstände |
  | 06:15–23:15 | `zeugnio/stuendlich/` | 3 Tage | stündlich, letzte 3 Tage |
  | vor einer Migration, von Hand | `zeugnio/anlass/` | 30 Tage | |
  | alte Versionen | `zeugnio/` | 14 Tage nach dem Löschen | Rückweg nach einem böswilligen Löschen |

  Die Läufe um 05:15 schreiben das Logo-Archiv jeden Tag neu (`--full`). Sonst entfernte die Regel es nach 14 Tagen ohne neues Logo.
- **Länger als 70 Tage bleibt nichts:** höchstens 56 Tage plus 14 als alte Version. Das gehört ins Löschkonzept.
- **Verschlüsselung:** Hochgeladen wird nur, was schon auf dem Server mit `backup.key` verschlüsselt ist. nine sieht nie den Inhalt. Der Schlüssel liegt auf dem Server (er muss dort verschlüsseln) und bei dir; nine bekommt ihn nie.
- **Überwachung an drei Stellen:**
  1. `~/kit/deploy.sh zeugnio --check` zeigt jetzt je Ordner die neueste Kopie im Bucket und ihr Alter. Ist eine zu alt, erscheint eine Warnung.
  2. Ein **Totmannschalter** (Vorschlag: healthchecks.io).
     - Nach jedem Lauf meldet der Server `…/0` (gut) oder `…/3` (Teilfehler). Bleibt die Meldung aus, weil Cron steht oder der Server weg ist, schickt der Dienst dir eine Mail. Das kann keine Statusdatei auf dem Server.
     - Übertragen werden nur Zeitpunkt, Rückgabewert und die IP des Servers, keine Personendaten.
     - Gratisplan, Betreiber in Lettland, Server in Deutschland. Eine Alternative ohne neuen Dienst gibt es nicht: Dann musst du selbst nachsehen.
  3. Der Restore-Test am Sonntag, neu mit Zeilenabgleich: `restore-test.sh --counts` für die zurückgespielte Kopie und `db-counts.mjs` für die laufende Datenbank. Beide zählen mit derselben Abfrage (`lib/zeilen.sql`).
- **Lokal geprüft** mit einem Wegwerf-PostgreSQL 17 und einem nachgebauten S3:
  - Die Ordner stimmen.
  - `latest` findet die neueste Kopie über alle Ordner.
  - `stand` zeigt Anzahl und Alter.
  - Herunterladen, Entschlüsseln und Einspielen funktionieren, die Zeilenzahlen sind gleich.
  - **Nicht geprüft:** die Signatur gegen den echten nine-Speicher. Das zeigt erst der Schritt 4.5.

## 4. Ablauf, sobald du entschieden hast

Die Schritte führst du aus, ich begleite jeden einzeln. Zugangsdaten gehören in deine Ablage, nie in den Chat und nie ins Repo.

1. **Bucket anlegen** im Cockpit (cockpit.nine.ch), Standort **nine-es34**, Name `advisori-zeugnio-bucket` (angelegt 24.11.), **Versionierung an**.
   - Den Standort kann man später nicht mehr ändern.
2. **Zwei Bucket-Benutzer** in es34:
   - `zeugnio-backup-server` mit der Rolle `writer`, für advisori01.
   - `zeugnio-backup-notfall` mit der Rolle `reader`, nur für deinen Rechner im Ernstfall.
   - Beide Schlüsselpaare in deine Ablage.
3. **Lifecycle-Regeln** über `nctl`, nines Befehlszeile. Im Cockpit gibt es diese Einstellung nicht.
   - Installieren: das Windows-Archiv der neuesten Version von github.com/ninech/nctl/releases laden und entpacken. Dann `nctl auth login` (Anmeldung wie im Cockpit).
   - Zuerst die Hilfe ansehen, damit wir die Flags gegen deine Version prüfen:
   ```powershell
   nctl update bucket --help
   ```
   - Dann die fünf Regeln. In PowerShell trennt `;` Befehle, darum steht jede Regel in einfachen Anführungszeichen. `update` ergänzt Regeln pro Präfix, ersetzt also keine anderen:
   ```powershell
   nctl update bucket advisori-zeugnio-bucket --lifecycle-policy 'prefix=zeugnio/stuendlich/;expire-after-days=3;is-live=true' --lifecycle-policy 'prefix=zeugnio/taeglich/;expire-after-days=14;is-live=true' --lifecycle-policy 'prefix=zeugnio/woechentlich/;expire-after-days=56;is-live=true' --lifecycle-policy 'prefix=zeugnio/anlass/;expire-after-days=30;is-live=true' --lifecycle-policy 'prefix=zeugnio/;expire-after-days=14;is-live=false'
   ```
   ```powershell
   nctl get bucket advisori-zeugnio-bucket -o yaml
   ```
   - In der Ausgabe stehen die fünf Regeln, `versioning: true` und die zwei Benutzer.
   - `is-live=false` gilt für alte Versionen. Die 14 Tage laufen ab dem Moment, in dem eine Version durch Löschen oder Ablauf zur alten wird.
   - Format laut nctl-Quelle (`internal/bucket/lifecycle.go`), aus der Doku übernommen; an der Version auf deinem Rechner noch nicht geprüft.
4. **Kit auf den Server bringen.** Das Kit-Repo hat kein Remote, darum geht es als Bundle: ein ganzes Repo in einer Datei. PowerShell:

   ```powershell
   git -C "$HOME\advisori-advisori01-kit" bundle create "$HOME\advisori01-kit.bundle" main
   ```
   ```powershell
   scp "$HOME\advisori01-kit.bundle" www-zeugnio@advisori01.nine.ch:kit.bundle
   ```
   ```powershell
   ssh www-zeugnio@advisori01.nine.ch "git -C ~/kit pull --ff-only ~/kit.bundle main && git -C ~/kit log --oneline -1 && rm ~/kit.bundle"
   ```
   Erwartet: `587bb18` (oder neuer). `--ff-only` bricht ab, statt etwas zu vermischen, falls auf dem Server jemand im Kit geändert hat.
**Ab hier in einer SSH-Sitzung auf dem Server.** Grund: Ein einzelner `ssh … "node …"` startet eine nicht-interaktive Shell. Ubuntus `.bashrc` bricht dort früh ab, also lädt nvm nicht, und `node` fehlt. In einer richtigen Sitzung ist es da. Zuerst in PowerShell:
```powershell
ssh www-zeugnio@advisori01.nine.ch
```
Die folgenden Befehle sind Bash auf advisori01.

5. **Zugang eintragen und prüfen.** Falls die Datei leer ist, kommt die Vorlage hinein, dann öffnest du den Editor:
   ```bash
   test -s ~/zeugnio/shared/backup-s3.env || cp ~/kit/templates/backup-s3.env.example ~/zeugnio/shared/backup-s3.env; chmod 600 ~/zeugnio/shared/backup-s3.env; nano ~/zeugnio/shared/backup-s3.env
   ```
   Einzutragen sind `S3_BUCKET`, `S3_ACCESS_KEY_ID` und `S3_SECRET_ACCESS_KEY` vom Benutzer `zeugnio-backup-server`. `S3_ENDPOINT` steht schon auf es34. Dann:
   ```bash
   node ~/kit/lib/s3.mjs zeugnio list; echo rc=$?; ~/kit/restore-test.sh zeugnio --check
   ```
   `rc=0` und «Object Storage erreichbar» heisst: Signatur und Zugang stimmen.
6. **Erste Sicherung ausser Haus:**
   ```bash
   cd ~/zeugnio/current && node ~/kit/db-backup.mjs zeugnio --tier taeglich --full; echo rc=$?
   ```
   Erwartet `rc=0` und zwei, drei Zeilen «Zweitkopie: …/zeugnio/taeglich/…».
7. **Neue Crontab** (die alte wird vorher gesichert):
   ```bash
   crontab -l > ~/zeugnio/crontab.vorher-b3 && crontab ~/kit/cron/zeugnio.crontab && crontab -l | grep db-backup
   ```
   Zurück: `crontab ~/zeugnio/crontab.vorher-b3`.
8. **Totmannschalter** (falls du healthchecks.io willst).
   - Konto anlegen und zwei Checks einrichten:
     - `zeugnio-backup`: Cron-Plan `15 5-23 * * *`, Zeitzone wie auf dem Server, Gnadenfrist 30 min.
     - `zeugnio-restore-test`: `50 7 * * 0`, 1 h.
   - Je eine Ping-Adresse pro Datei, jeweils eine Zeile:
   ```bash
   mkdir -p ~/zeugnio/shared/ping && chmod 700 ~/zeugnio/shared/ping && nano ~/zeugnio/shared/ping/backup.url && nano ~/zeugnio/shared/ping/restore-test.url && chmod 600 ~/zeugnio/shared/ping/*.url
   ```
   Die nächste volle Viertelstunde zeigt im Dashboard den ersten Ping.
9. **Restore-Test aus der Zweitkopie, mit Zeilenabgleich.** Direkt nach einer frischen Sicherung, damit niemand dazwischen schreibt:
   ```bash
   cd ~/zeugnio/current && node ~/kit/db-backup.mjs zeugnio --reason b3-probe && node ~/kit/db-counts.mjs zeugnio > /tmp/zeilen-prod.tsv && ~/kit/restore-test.sh zeugnio --from-s3 --counts /tmp/zeilen-restore.tsv && diff /tmp/zeilen-prod.tsv /tmp/zeilen-restore.tsv && echo ZEILEN-GLEICH; rm -f /tmp/zeilen-*.tsv
   ```
   - Erwartet: «RESTORE-TEST OK» mit der Datei `…b3-probe…` (sie liegt im Bucket unter `zeugnio/anlass/`) und `ZEILEN-GLEICH`.
   - Weicht eine Tabelle ab, zeigt `diff` nur Tabellennamen und Zahlen, keine Inhalte.
   - Eine leere Zahl auf der Produktionsseite heisst: Die App-Rolle darf diese Tabelle nicht lesen.
10. **Nachführen:** Journal, `cutover-reihenfolge.md` (B3 erledigt), Hub (Steckbrief zeugnio, `infra/nine.md`), Kit-README «nie auf advisori01 gelaufen» korrigieren.

## 5. Wo du nachsiehst, ob es läuft

| Wo | Was du siehst |
|---|---|
| Mail von healthchecks.io | nur wenn etwas schiefgeht: ein Lauf mit Fehler oder eine ausgebliebene Meldung |
| `~/kit/deploy.sh zeugnio --check` in einer SSH-Sitzung | Abschnitt «Zweitkopie»: je Ordner Anzahl, neueste Kopie, Alter. Abschnitt «Cron-Jobs»: `backup` und `restore-test` mit `ok` |
| Cockpit → Object Storage → Bucket | Belegung. Die Objekte selbst siehst du mit einem S3-Programm und dem `reader`-Schlüssel |

## 6. Ernstfall: advisori01 ist weg

Im Kit-README, Abschnitt «Ernstfall». Kurz:
1. Mit dem `reader`-Schlüssel die neueste Kopie aus `zeugnio/stuendlich/` holen (Datenbank) und die neueste aus `zeugnio/taeglich/` (Logo-Archiv `.uploads.tar.gz.enc`).
2. Mit deiner Kopie von `backup.key` entschlüsseln. Unter Windows reicht Node: `decrypt.mjs --out`.
3. Einspielen: zuerst `900_nine_bootstrap.sql`, dann den Auszug.

## 7. Antwort von nine (SVC-119656, 25.11.)

- Ein `writer` darf einzelne Objektversionen endgültig löschen. Die Versionierung schützt also nur vor versehentlichem Löschen, nicht vor jemandem mit dem Schlüssel auf dem Server.
- Object Lock oder eine Rolle «schreiben ohne löschen» ist nicht geplant (Feature-Request aufgenommen).
- **Entscheid Silvan 26.11.:** Restrisiko für den Pilotstart akzeptiert. Letzte Linie ausserhalb der Reichweite von `www-zeugnio` ist nines Tagessicherung (10 Tage). Nach den Piloten neu prüfen: zweiter Anbieter mit Schlüssel ohne Löschrecht (Exoscale Zürich), als zusätzliches Upload-Ziel im Kit.
- **Nachtrag 27.11. (Sophie Kwass):** Kein Benutzer auf dem Server kann nines Tagessicherung löschen, die letzte Linie hält also. `www-data` kann sie lesen, andere Benutzer haben keinen Zugriff. Nach nines Doku «Datensicherungen und Wiederherstellung» hängt `sudo nine-backup mount-repository` alle Stände schreibgeschützt unter `/mnt/restore.…` ein (`sudo nine-backup snapshots` listet sie); zurückgespielt wird mit `cp` oder `rsync` aus einer zweiten Sitzung. **Folge:** Wer `www-data` übernimmt, liest die Sicherungen aller Apps samt `shared/.env` und `backup.key`. Den Zugang zu `www-data` darum schützen wie Root. **Aufbewahrung:** Die Doku nennt 7 Tage als Standard, hier stehen 10; Nachfrage im Ticket.

## Offen danach

- **Datenschutzerklärung:** nachgezogen am 25.11.: Rümlang beim Empfänger nine, Abschnitt 6 (Sicherungen höchstens rund zehn Wochen), Abschnitt 9 und FAQ.
- **Löschkonzept:** In Sicherungen bleiben gelöschte Daten höchstens etwa 70 Tage (siehe 3).
- **Schlüsselabgleich:** erledigt 26.11. Silvans Kopie liegt als Datei auf dem Laptop, Fingerabdruck `ef3fe2bf0a70` wie auf dem Server.
