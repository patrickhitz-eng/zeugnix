# Cutover-Reihenfolge: zeugnio von Vercel/Supabase auf `advisori01`

> **Verhältnis zu den anderen Dateien.** `docs/setup-zeugnio-nine.html` ist das **Wie** —
> vierzehn Abschnitte mit den Befehlen. Diese Datei ist das **Wann und in welcher
> Reihenfolge**, mit den Bedingungen, die vor jedem Schritt erfüllt sein müssen. Wo ein
> Schritt im Runbook steht, ist er mit „§" verwiesen. `kommunikation.md` führt den
> Verkehr mit nine.
>
> Stand: **2026-10-16**, gemessen statt vermutet. Die Reihenfolge weicht an zwei Stellen
> vom Runbook ab — begründet unter „Vier harte Abhängigkeiten".

---

## Ausgangszustand, gemessen am 2026-10-16

| Sache | Messwert | Folge für die Reihenfolge |
|---|---|---|
| Produktivdomain | **`zeugnio.ch` ist live**, `zeugnix.ch` schickt 301 auf `https://www.zeugnio.ch/`. Apex **und** `www` antworten beide mit 200 | Beide Namen müssen nach dem Umzug funktionieren, sonst brechen bestehende Links und QR-Codes |
| DNS-Zone | Nameserver **`ns1/ns2.vercel-dns.com`** — die Zone liegt beim Anbieter, den wir verlassen | Zone **vor** dem Cutover wegziehen, nicht danach |
| A-Records Apex | `216.198.79.1`, `64.29.17.1` (Vercel), **TTL 1800 s** | 30 Minuten Umschaltunschärfe, solange die TTL nicht gesenkt ist |
| `www` | **CNAME** auf `f7ce91cbe36539da.vercel-dns-016.com`, TTL 60 | Muss zum A-Record auf 5.148.171.221 werden; nine erwartet A-Records für beide Namen |
| HSTS | **`max-age=63072000; includeSubDomains`**, live auf Apex und `www` (`next.config.mjs:30`) | Zwei Jahre Browser-Gedächtnis. Im Fenster ohne gültiges Zertifikat gibt es **kein „Trotzdem fortfahren"** |
| HSTS-`preload` | **nicht gesetzt**, bewusst (`next.config.mjs:27-28`) | Rettet uns: der Pin steckt nur in Browsern, die wirklich da waren — Senken wirkt also |
| CAA | **keine** | Let's Encrypt ist erlaubt, kein Blocker |
| Antwortende Region | `x-vercel-id: fra1` (Edge Frankfurt), `X-Vercel-Cache: HIT` | Sagt nur etwas über den Cache-Knoten; die Funktionsregion ist davon unberührt und bleibt zu prüfen |

---

## Vier harte Abhängigkeiten — daraus folgt die Reihenfolge

**1 · Erst der App-Benutzer, dann alles in ihm.** Den Benutzer legt
`nine-manage-vhosts user create` an, den vhost ordnet `--user` ihm zu. Beides geht als
`www-data` selbst, ohne Ticket (nine-Doku «nine-manage-vhosts with multi-user», gelesen
28.10.). Alles, was in diesem Konto liegen muss — Releases, `shared/.env`, `postgrest.conf`,
`backup.key`, pm2, systemd-User-Units, Cron — kann erst danach entstehen.
→ Runbook § 3 setzt seit dem 28.10. voraus, dass der vhost mit `www-zeugnio` schon steht
(1.2), und legt den Benutzer nicht mehr selbst an.

**2 · PostgreSQL 17 vor dem Schemavergleich.** Produktion läuft 17.6; ein `pg_dump` 16
verweigert einen 17er-Server, hart und ohne Umweg. Erst nach dem Upgrade ist der Vergleich
„Repo-Schema gegen Prod-Schema" ein echter Gleichheitsbeweis statt eine Behauptung.
Dazu das Rückfallfenster: nine lässt das 16er-Verzeichnis stehen, aber das ist ein
**Standbild vom Moment des Upgrades**. Schreibt zeugnio erst Daten auf die 17, kostet ein
Rückfall diese Daten. → Schemaarbeit und Gegenprobe gehören **in** dieses Fenster, der
Datenladevorgang beendet es.

**3 · Zertifikat und A-Record hängen voneinander ab.** Let's Encrypt prüft über HTTP-01 auf
Port 80 — die Domain muss also **schon** auf den Server zeigen, bevor das Zertifikat
ausgestellt werden kann. Zwischen „A-Record umgelegt" und „Zertifikat da" gibt es darum ein
Fenster ohne gültiges Zertifikat, und HSTS macht daraus eine harte Downtime.
→ **Das ist das einzige Fenster mit echter Vorlaufzeit.** Rechnung weiter unten.

**4 · Die Zone liegt beim Anbieter, den wir verlassen.** Solange `zeugnio.ch` von Vercels
Nameservern beantwortet wird, hängt unsere Fähigkeit, auf nine zu zeigen, an einem
Vercel-Konto. Das ist kein Theoriefall: ein gekündigtes oder herabgestuftes Projekt nimmt
die Zone mit.
→ Zone wegziehen ist **Phase 0**, nicht Nacharbeit.

---

## Phase 0 — ohne nine, kann heute anfangen

| # | Schritt | Gate danach |
|---|---|---|
| **0.1** | **DNS-Zone von Vercel wegziehen.** Erst alle heutigen Einträge abschreiben (Apex 2 × A, `www` CNAME, MX auf `inbound-smtp.eu-west-1.amazonaws.com`, `_dmarc` `p=none`), beim Zielanbieter identisch nachbauen, **dann** die Nameserver beim Registrar umstellen. Der CNAME auf `*.vercel-dns-016.com` funktioniert auch aus einer fremden Zone, solange das Vercel-Projekt existiert — er bleibt also vorerst stehen | `dig NS zeugnio.ch` zeigt den neuen Anbieter, Seite läuft unverändert weiter |
| **0.2** | **TTL der Apex-A-Records auf 300 senken** (`www` liegt schon auf 60). Erst nach 0.1, damit es nicht zweimal gemacht wird | autoritative Antwort zeigt TTL 300 |
| **0.3** | **HSTS auf `max-age=300` ohne `includeSubDomains`** in `next.config.mjs:31` und **nach Vercel deployen**. Jeder Browser, der danach vorbeikommt, ersetzt den Zweijahreswert. Darum: **mindestens zwei Tage vor dem Cutover**, besser eine Woche | Antwort von `www.zeugnio.ch` trägt `max-age=300` |
| 0.4 | `deploy/nine/check-advisori01.sh` auf dem Server laufen lassen, heute noch als `www-data`. Liefert RAM, Ports, nginx-Vorgaben, DB-Rechte — Gate für die Serverschritte | Ausgabe liegt vor |
| 0.5 | `install-postgrest.sh` erstmals ohne Prüfsumme laufen lassen, Prüfsumme **von Hand** mit der Release-Seite vergleichen, Wert bei `PINNED_SHA256` eintragen und einchecken | Prüfsumme steht im Repo |
| 0.6 | Serverweite Build-Sperre im EHC-Repo nachtragen (`/tmp/nine-next-build.lock`). Ohne sie können zwei `next build` gleichzeitig laufen — auf 7,8 GB ist das der wahrscheinlichste Selbstschaden | Sperre in beiden Repos |

**0.1 ist entschieden (3.11.):** Infomaniak, und weil Vercel auch Registrar ist, zieht die
Domain mit. Ablauf unten unter «Entscheid zur DNS-Zone». **0.3** liegt als Code-Änderung im
Branch `fix/umzug-vorbereitung` und wirkt, sobald er auf Vercel deployt ist.

---

## Phase 1 — eine Mail an nine, der Rest selbst

| # | Schritt | Entsperrt |
|---|---|---|
| **1.1** | **Mail A an Patrick Lion** in SVC-117420: Upgrade auf 17 mit admin-Benutzer, Terminvorschlag, Rolle des Nachtdumps (A1/A4). Entwurf oben in `antwort-2026-10-13.email.md` | Phase 2.2 und 2.3 |
| **1.2** | **Benutzer `www-zeugnio` und vhost `zeugnio.ch` selbst anlegen**, zunächst ohne Zertifikat. Befehle unter der Tabelle | Phase 2.1 — **und damit alles Übrige** |
| **1.3** | **Zertifikat vor der DNS-Umschaltung, ohne DNS-01.** Die nine-Doku kennt nur HTTP-01. Let's Encrypt folgt dabei aber Weiterleitungen (auf Port 80 oder 443). In Phase 3 testen: Vercel leitet `/.well-known/acme-challenge/*` auf `http://zeugnio.ch.advisori01.nine.ch/.well-known/acme-challenge/*` weiter, dann `certificate create`. Offen ist, ob `nine-manage-vhosts` vorher selbst prüft, ob die Domain auf den Server zeigt. Lehnt es ab, nine nach DNS-01 fragen oder das Fenster aus Phase 5 hinnehmen | entscheidet die Form von Phase 5 |

**Befehle zu 1.2**, als `www-data` auf advisori01. Zuerst nachsehen, was schon da ist:

```bash
nine-manage-vhosts virtual-host list
```

Gibt es noch keinen vhost für `zeugnio.ch`, den Benutzer und den vhost anlegen. Den `www`-Alias
und die Testadresse `zeugnio.ch.advisori01.nine.ch` legt nine dabei von selbst an:

```bash
sudo nine-manage-vhosts user create www-zeugnio --no-password
```

```bash
sudo nine-manage-vhosts virtual-host create zeugnio.ch --template=proxy --template-variable PROXYPORT=3010 --user=www-zeugnio
```

`--no-password` heisst: keine Anmeldung mit Passwort. Hinein kommt man mit
`sudo nine-su www-zeugnio` und trägt dort den eigenen SSH-Schlüssel in
`~/.ssh/authorized_keys` ein. Danach Linger prüfen (`loginctl show-user www-zeugnio`).

1.2 ist der kritische Pfad und liegt jetzt bei uns. Auf nine wartet nur noch 1.1.

**Stand 29.10.:**
- **1.1:** nine hat geantwortet. Das Upgrade ist **gratis Mo–Fr 09:00–17:30** (sonst mind. CHF 500), und der Nachtdump läuft als **Superuser**. Einen Termin schlägt nine nicht vor, **den nennen wir**.
- **1.2:** erledigt. Der vhost `zeugnio.ch` steht, noch ohne Zertifikat.
- **2.1:** erledigt.

**Stand 30.10.: Upgrade erledigt** (nine, 08:43, ohne auf unseren Termin zu warten).
- **In Ordnung:** Albis Run läuft, die Health-Prüfung meldet die Datenbank ok. `pg_dump` 17.11 liegt systemweit.
- **Admin-Benutzer** heisst `pgadmin` und ist kein Superuser. **2.2 wartet darum auf A9:** die ADMIN-Option und `CONNECT` auf `nmd_zeugnio`, angefragt am 30.10.
- **Fallback, falls nine ablehnt:** `pgadmin` legt eine eigene Datenbank mit eigenem Eigentümer an. Die SQL-Dateien 900 bis 903 nennen `nmd_zeugnio` nur in Kommentaren. Zu ändern wären dann `.env`, `postgrest.conf` und das Runbook.

**Stand 3.11.: A9 erteilt** (Daniel Wilhelm, 11:32). `pgadmin` hat die ADMIN-Option auf
`nmd_zeugnio` und die `_ro`/`_rw`-Rollen. `CONNECT` erwähnt die Antwort nicht: beim ersten
Login mit `pgadmin` auf `nmd_zeugnio` prüfen. Damit ist **2.2 entsperrt**. Der Fallback
entfällt.

**Stand 6.11.: 2.2 doch noch blockiert.** Geprüft: Die ADMIN-Option sitzt (`admin_option = t`
auf allen sechs `nmd_*`-Rollen), aber `pgadmin` hat **kein `CONNECT`** auf `nmd_zeugnio`
und `nmd_albisrun` («User does not have CONNECT privilege»). `900_nine_bootstrap.sql` läuft
mit `-d nmd_zeugnio`, braucht also die Verbindung. Ursache: Die Mitgliedschaften stehen
auf `INHERIT FALSE, SET FALSE`, Eigentümer der Datenbank ist nines `nmd`. Selbst lösen
können wir das nicht sauber. Nachfrage in SVC-117420 **verschickt am 6.11. um 08:44**
(Befund und Begründung, bewusst ohne SQL). Was wir eigentlich brauchen:
`GRANT nmd_zeugnio_rw TO pgadmin WITH INHERIT TRUE, SET TRUE` und
`GRANT CONNECT ON DATABASE nmd_zeugnio TO nmd_zeugnio_rw WITH GRANT OPTION`. Nach nines
Antwort den Test aus dem Journal (6.11.) wiederholen: Anmeldung als `pgadmin` mit
`-d nmd_zeugnio`.

**Stand 6.11. nachmittags: 2.2 entsperrt.** Daniel Wilhelm (11:25): Mit der ADMIN-Option
darf `pgadmin` sich die Mitgliedschaft selbst nochmals geben, diesmal mit `INHERIT`. Gemacht
und geprüft: `grant nmd_zeugnio_rw to pgadmin with inherit true`, danach Anmeldung als
`pgadmin` in `nmd_zeugnio` ok (Journal 6.11.). Vor dem Einspielen von 900 noch zu klären:
- **Wer 900 ausführt.** 900 ist für `nmd_zeugnio` mit `CREATEROLE` geschrieben (Runbook § 5),
  diese Bestellung an nine ist überholt. Läuft 900 stattdessen als `pgadmin`, nimmt der
  Block mit `current_user` den falschen Benutzer: `service_role`, `anon` und `authenticated`
  gingen an `pgadmin` statt an `nmd_zeugnio`. Ablauf und Runbook § 5 neu festlegen.
- **`CONNECT` für `authenticator`.** Weitergeben kann `pgadmin` das Recht weiterhin nicht.
  Derselbe Weg geht aber: `authenticator` wird erbendes Mitglied von `nmd_zeugnio_ro`
  (`INHERIT TRUE, SET FALSE`). Haken: Tabellen, die `nmd_zeugnio_rw` in `public` anlegt,
  bekommen automatisch `SELECT` für `nmd_zeugnio_ro`. `authenticator` würde das mit erben
  und hätte vor dem Rollenwechsel eigene Leserechte. Darum vorher prüfen, unter welcher
  Rolle die Migrationen die Tabellen anlegen.

**Stand 6.11. abends: 2.2 geplant und gebaut, wartet auf den Merge.** Die Prüfabfrage
(Journal 6.11.) hat beide Punkte geklärt:
- **Ablauf:** `900_0_nine_rollen.sql` (neu) als `pgadmin` legt die vier Rollen an und vergibt
  die Mitgliedschaften. Dann setzt `pgadmin` die Passwörter für `nmd_zeugnio` und
  `authenticator` mit `\password`. Danach läuft `900` als `nmd_zeugnio`, ohne den alten
  Abschnitt 1. `nmd_zeugnio` wechselt beim Anmelden in `nmd_zeugnio_rw`
  (`role=nmd_zeugnio_rw`). Darum gehen die Mitgliedschaften an `_rw`, nicht an den
  Anmeldebenutzer.
- **`CONNECT` für `authenticator`:** über `nmd_zeugnio_ro` (erben ja, wechseln nein). Das
  geerbte `SELECT` ist vertretbar, weil `authenticator` ohnehin in `service_role` wechseln
  darf. Begründung im Kopf von `900_0`.
- **Neu für 2.3, entschieden am 6.11.: Regel statt Eigentum.** Das alte `901` brach ab. Für
  `ALTER … OWNER TO service_role` braucht `service_role` `CREATE` auf `public`, und das kann
  nur nines `nmd` vergeben. Jetzt heisst die Datei `901_nine_rechte.sql`. Die Tabellen bleiben
  bei `nmd_zeugnio_rw`, und `service_role` bekommt pro Tabelle die Regel
  `service_role_alles` sowie die vier Datenrechte (Runbook § 7). Kein Ticket bei nine.
  Nach jeder Migration mit neuer Tabelle `901` nochmals laufen lassen.
- **Lokal geprüft (PGlite, nines Rollenlage):** 900_0, 900, alle 31 Migrationen, 901 (zweimal),
  902 und 903 laufen durch. `service_role` sieht alles, `authenticated` nur die eigenen Zeilen,
  `anon` schreibt nicht. Dabei kam ein alter Fehler in 903 ans Licht: Die Rechteabfrage über den
  Tabellennamen brach an `auth.users` ab. Sie läuft jetzt über die Objektkennung.

**Stand 7.11.: 2.2 erledigt** (PR #51 gemergt, auf advisori01 ausgeführt, Journal 7.11.).
- `900_0` als `pgadmin`: Die vier Rollen und sieben Mitgliedschaften entsprechen den
  Erwartungen, `authenticator` hat `CONNECT`.
- Die Passwörter von `nmd_zeugnio` und `authenticator` sind neu gesetzt (`\password`).
  Eingetragen sind sie in `~/.pgpass` und `DATABASE_URL` von `www-zeugnio`. Die Anmeldung als
  `authenticator` funktioniert. Den Wert für `postgrest.conf` braucht erst 2.4.
- `900` als `nmd_zeugnio` ist ohne Fehler durchgelaufen. `auth` und `extensions` gehören
  `nmd_zeugnio_rw`, und `auth.uid()` liest den gestellten Anspruch.
- Zwei Meldungen waren erwartet oder harmlos: der Hinweis zum `search_path` (die Datenbank
  gehört `nmd`) und Warnungen beim `GRANT` auf die Funktionen der Erweiterungen. Diese gehören
  dem Superuser, und `PUBLIC` darf sie ohnehin ausführen. Die Zeile ist aus 900 entfernt, 903
  prüft das Recht jetzt.
- **Als Nächstes 2.3:** `migrate.mjs`, `901_nine_rechte.sql`, `902`, `903`.

**Stand 7.11.: 2.3 erledigt** (Journal 7.11.).
- `migrate.mjs`: 31 Migrationen, `001` bis `032` ohne `007`, alle ok.
- `901` hat die Regel `service_role_alles` auf 17 Tabellen angelegt. `902` hat Trigger und `ensure_auth_user` angelegt.
- `903` ist in allen Abschnitten grün. Alle 18 Objekte in `public` gehören `nmd_zeugnio_rw`. `authenticated` sieht mit fremder ID nichts. `phrase_blocks` hat 1329 Zeilen.
- **Offen vor Cutover A:**
  - Der Abgleich mit dem Prod-Schema (Runbook § 6, braucht das Supabase-Datenbankpasswort).
  - Der Vergleich der Zeilenzahl von `phrase_blocks` mit der Produktion.
  - Die Probe in 13c mit echten Daten. Mit 0 Zeugnissen beweist sie noch wenig; lokal ist sie mit Daten grün.
- **Als Nächstes 2.4:** PostgREST mit `authenticator`. Das Passwort steht in Silvans Ablage.

**Am Tag des Upgrades** (Albis Run ist dabei kurz weg; am 30.10. so abgehakt, nur die Sicherung von 03:30 ist erst am 31.10. prüfbar):
1. Gleich danach Albis Run durchklicken. Ab da ist der Rückfall auf 16 praktisch zu.
2. `pg_dump --version` zeigt 17, als `www-albisrun` und als `www-zeugnio`.
3. `~/kit/deploy.sh zeugnio --check` meldet `pg_dump (PostgreSQL) 17`.
4. Am Morgen danach prüfen, ob das Albis-Run-Backup von 03:30 durchgelaufen ist.

---

## Phase 2 — Server-Bootstrap (nach 1.1 **und** 1.2)

| # | Schritt | Runbook |
|---|---|---|
| 2.1 | In `www-zeugnio`: eigener SSH-Zugang, **Linger prüfen**, Kit nach `~/kit`, Ordner, nvm + Node 22, PM2 mit `pm2.service` aus dem Kit, `.env`, `backup.key`, `backup-s3.env`, `deploy.sh --check`. **Kein Deploy-Key**, solange das Repo öffentlich ist (HTTPS). Cron und logrotate erst nach dem ersten Deploy, **ausserhalb 00:00–04:00** | § 3 (korrigiert 28.10.) |
| 2.2 | Datenbank: `nmd_zeugnio` existiert. Als `pgadmin`: `900_0_nine_rollen.sql` (Rollen ohne Präfix, `authenticator` **NOINHERIT**, `CONNECT` über `_ro`), dann `\password` für `nmd_zeugnio` und `authenticator`. Als `nmd_zeugnio`: `900_nine_bootstrap.sql` | § 4, § 5 |
| 2.3 | Schema **aus dem Repository**: `migrate.mjs` (alle `0xx` ausser `007`), dann `901` (Rechte, Regel für `service_role`), `902` (Auth-Brücke), `903` (Gegenprobe). Der Abgleich mit dem Prod-Schema (`pg_dump` 17, nur vergleichen, nie einspielen) ist Pflicht vor Cutover A und braucht das Supabase-Datenbankpasswort. Das Rückfallfenster des Upgrades ist seit 30.10. zu | § 6–§ 8 |
| 2.4 | PostgREST: Binary mit eingetragener Prüfsumme, `shared/postgrest.conf` chmod 600, **systemd-User-Unit** (bewusst nicht PM2) | § 9 |
| 2.5 | Erstes Deployment auf der Testadresse `zeugnio.ch.advisori01.nine.ch` | § 10 |

**Stand 29.10.: 2.1 erledigt.** `~/kit/deploy.sh zeugnio --check` mit Kit e88fd08:
- Node v22.23.4, npm 10.9.9, pm2 7.1.1. Der Dienst `pm2` ist aktiv.
- Der memory-Controller ist delegiert, der Speicherdeckel für Builds greift also.
- `.env`, `backup.key` und `backup-s3.env` haben Rechte 600, `uploads/` ist da.
- GitHub ist über HTTPS lesbar.
- Offen sind nur die erwarteten Punkte: `postgrest.conf` fehlt (2.4), es gibt noch keinen Auszug, und es läuft noch keine Version.
- `pg_dump` ist noch 16.15. Ab dem Upgrade braucht es 17.
- Die `.env` hat einen **eigenen Signaturschlüssel**; der Vercel-Schlüssel `44df4953c533a8f7` steht als zurückgezogener in `ZEUGNIO_SIGNING_PUBLIC_KEYS`.
- Das Passwort von `nmd_zeugnio` ist neu, `CRON_SECRET` und der Resend-Schlüssel gelten nur für den Server. In Vercel wurde nichts geändert.

**Geheimnisse erst ab 2.1, und nur in `/home/www-zeugnio`.** Solange wir in `www-data`
arbeiten, wären sie für das Konto lesbar, das jeden vhost der Maschine ausliefert.

---

## Phase 3 — Probe, bevor DNS irgendetwas sieht

| # | Schritt | Gate |
|---|---|---|
| 3.1 | **Vollprobe auf der Testadresse:** Zeugnis → Einladung → Beurteilung → finalisieren → PDF mit Logo, QR und Inter (Helvetica im PDF heisst: Schriften fehlen) → `/verify` mit einem **echten Bestands-Hash** → PDF-Worker aus `/pdfjs/` | § 11 |
| 3.2 | **Restore-Übung.** Nie gelaufen. nines Dump wiederherstellen, in eine Wegwerf-Datenbank, Zeilenzahlen und Prüfsummen vergleichen | **Cutover-Gate** |
| 3.3 | Mailweg: solange Resend läuft, bleibt alles wie heute. mailomat.swiss ist **bewusst nach** dem Cutover — siehe „Mailweg und DNS" in `kommunikation.md` | — |

---

## Phase 4 — T-2 bis T-1

| # | Schritt |
|---|---|
| 4.1 | Nachsehen, ob die kleinen Werte wirklich angekommen sind: `max-age=300` in der Antwort, TTL 300 autoritativ |
| 4.2 | Vercel-Cron aus. Rollback-Werte aufschreiben: alte A-Records, alter CNAME, alte TTL, alter HSTS-Wert — auf Papier, nicht im Kopf |
| 4.3 | Datenprobe trocken: `pg_dump --data-only` **über den Session-Pooler** (`aws-0-<region>.pooler.supabase.com:5432` — der direkte DB-Host ist IPv6-only, und `advisori01` hat kein IPv6), einmal in eine Wegwerf-Datenbank laden, Dauer messen |

---

## Phase 5 — das Fenster (Di–Do, früh, 45–75 min)

| # | Schritt | Umkehrbar? |
|---|---|---|
| 5.1 | Supabase schreibgeschützt: `default_transaction_read_only = on` für die drei Rollen, bestehende Verbindungen beenden | ja |
| 5.2 | `pg_dump --data-only` über den Pooler | ja |
| 5.3 | Laden. `auth.users` separat, davor `disable trigger on_auth_user_created`. Logos herunterziehen, `logo_url` umschreiben | ja, aber: **beendet das PG-16-Rückfallfenster** |
| 5.4 | **Integritätsprüfung als Abbruchkriterium:** Prüfsummen über `hash`, `canonical_content`, `signature`. Abweichung = Abbruch, keine Diskussion | — |
| 5.5 | `.env` final, `DATA_API_URL` setzen, `pm2 restart`, Smoke **auf der Testadresse** | ja |
| 5.6 | **A-Record Apex und `www` auf 5.148.171.221** (ein A statt Vercels zwei; `www` vom CNAME zum A). Kein AAAA — nine hat kein IPv6 | ja, Rückweg dauert eine TTL |
| 5.7 | `sudo nine-manage-vhosts certificate create --virtual-host=zeugnio.ch`, danach `virtual-host update zeugnio.ch --template=proxy_letsencrypt_https_redirect` (fällt weg, wenn 1.3 geklappt hat) | ja |
| 5.8 | Smoke auf der echten Domain, beide Namen | — |

**Das Downtime-Fenster liegt zwischen 5.6 und 5.7** und rechnet sich so: bis zu einer TTL
DNS-Verbreitung (300 s, wenn 0.2 gemacht ist — sonst 1800 s) plus ein bis zwei Minuten
Ausstellung. Realistisch **fünf bis zehn Minuten**, in denen `zeugnio.ch` kein gültiges
Zertifikat hat. Wegen HSTS sieht ein Browser, der die Domain in den letzten zwei Jahren
besucht hat, in diesem Fenster eine Fehlerseite **ohne Klickmöglichkeit**. Darum sind 0.2
und 0.3 keine Feinarbeit, sondern Voraussetzung — und darum ist 1.3 die Frage, die das
Fenster ganz wegnehmen könnte.

---

## Phase 6 — danach, in dieser Reihenfolge

| # | Schritt | Warum nicht früher |
|---|---|---|
| 6.0 | **Datenschutzerklärung umstellen:** `RECIPIENTS` in `app/legal/privacy/page.tsx` ändern. Vercel fällt weg, Supabase bleibt nur für die Anmeldung, neu kommt nine (Zürich-Altstetten, Sicherungen Rümlang, Notfall-Support aus Kanada). Das Stand-Datum nachführen. Kunden mit Auftragsbearbeitungsvertrag den Tag des Umzugs per E-Mail melden (AVV § 6) | Die Erklärung muss den Ist-Zustand beschreiben; vor dem Fenster stimmt die neue Fassung noch nicht |
| 6.1 | CAA-Eintrag setzen (`issue "letsencrypt.org"`) | vorher würde er die Ausstellung behindern, wenn er falsch sitzt |
| 6.2 | HSTS zurück auf zwei Jahre, `includeSubDomains`, weiter **ohne** `preload` | erst wenn das Zertifikat sicher erneuert wird |
| 6.3 | mailomat.swiss: SMTP in Supabase Auth bzw. im eigenen Versand, dazu **SPF, DKIM, DMARC für `zeugnio.ch` neu bauen** — heute ist dort nichts. In `RECIPIENTS` Resend durch mailomat.swiss ersetzen (mailXpert GmbH, Zürich) | Mailwechsel im Cutover-Fenster wäre eine zweite Baustelle |
| 6.4 | Vercel und Supabase stilllegen. **Vorher** `zeugnix.ch` auf advisori01 umleiten (siehe «Entscheid zur DNS-Zone») | erst nach einer Frist, in der der Rückweg offen bleibt; ohne die Umleitung wären alte Links und QR-Codes auf `zeugnix.ch` tot |

---

## Rollback, je Phase

| Bis | Rücknahme |
|---|---|
| Phase 2.2 | nichts zu tun, Produktion läuft unberührt auf Vercel |
| Phase 2.3 | PG 16 reaktivieren lassen — **gilt nur, solange nichts auf die 17 geschrieben wurde** |
| Phase 5.5 | `.env` zurück, `pm2 restart`, Supabase `read_only` aufheben. Die Rücknahmezeilen gehören ins Runbook, nicht ins Gedächtnis |
| Phase 5.6/5.7 | A-Records zurück auf Vercels zwei IPs, `www` zurück auf den CNAME. Wirkt nach einer TTL |
| Abbruchkriterien | Zertifikat nicht in 20 min · `/verify` nicht 200 · echte QR-URL tot · PDF > 30 s · Login bricht · Fehlerrate > 1 % über 10 min |

---

## Entscheid zur DNS-Zone (Phase 0.1, Silvan 3.11.2026)

**Infomaniak wird Registrar und DNS-Anbieter von `zeugnio.ch`.** Die Domain wurde am
24.07.2026 **über Vercel gekauft**. Vercel ist also nicht nur DNS-Anbieter, sondern auch
Registrar. Darum zieht die Domain selbst mit um, nicht nur die Zone. Verworfen: der
Registrar selbst (das wäre Vercel), nine (Abhängigkeit 4) und Hostpoint (gleichwertig, kein
Grund für ein drittes Konto). Kontoinhaber bei Infomaniak: advisori, Domaininhaber
advisori GmbH (Marktstart-Schritt 14).

**Eine Regel trägt alles:** Die neue Zone steht vollständig, **bevor** die Nameserver auf
sie zeigen. Ob der Registrar-Wechsel vor oder nach dem Nameserver-Wechsel kommt, ist egal.

| # | Schritt | Gate |
|---|---|---|
| 0.1a | Bei Vercel (Dashboard → Domains → zeugnio.ch) **alle** Einträge abschreiben. Gemessen am 3.11.: Apex A auf Vercel (Wert für fremde DNS aus dem Vercel-Projekt übernehmen), `www` CNAME `f7ce91cbe36539da.vercel-dns-016.com`, MX `inbound-smtp.eu-west-1.amazonaws.com`, TXT `resend._domainkey` (DKIM von Resend, ohne ihn scheitern die Anmeldemails), `send` mit MX `feedback-smtp.eu-west-1.amazonses.com` und TXT `v=spf1 include:amazonses.com ~all`. Dazu ein **Wildcard** `*` auf Vercel: nur übernehmen, wenn eine Subdomain wirklich gebraucht wird | Liste vollständig, mit dem Vercel-Dashboard abgeglichen |
| 0.1b | Bei Infomaniak die Zone mit genau diesen Einträgen anlegen, TTL der Apex-A-Records gleich auf 300 (ersetzt 0.2) | Abfrage direkt beim Infomaniak-Nameserver liefert dieselben Antworten wie Vercel |
| 0.1c | Nameserver auf Infomaniak umstellen. **Kein DNSSEC aktiv** (kein DS-Eintrag, gemessen 3.11.), der Wechsel braucht also keinen Schlüsseltausch | `NS zeugnio.ch` zeigt Infomaniak, Seite und Anmeldemail laufen |
| 0.1d | Domain mit dem Transfer-Code aus Vercel zu Infomaniak übertragen, automatische Verlängerung und Zwei-Faktor-Anmeldung an | RDAP bei `rdap.nic.ch` zeigt das neue Registrierungsereignis |

Lässt Infomaniak die Zone erst nach dem Transfer anlegen, gilt die Reihenfolge 0.1a, 0.1d
(Nameserver bleiben bei Vercel), 0.1b, 0.1c.

**`zeugnix.ch` gehört mit dazu.** Die Altdomain hat eine eigene Zone (Nameserver
`ch.pro.io`, `nl.pro.io`, `p.dnh.net`) und zeigt mit A `216.150.1.1` auf Vercel, das per 301
auf `www.zeugnio.ch` weiterleitet. Ältere Links und QR-Codes nutzen sie. Bevor Vercel in 6.4
abgeschaltet wird, muss `zeugnix.ch` auf advisori01 zeigen und dort weiterleiten
(vhost-Alias oder eigener Redirect-vhost). Wer die Zone von `zeugnix.ch` verwaltet, ist offen.
