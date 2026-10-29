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

**0.1 braucht einen Entscheid, den nur du treffen kannst** — siehe `TODO(human)` unten.

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

**Am Tag des Upgrades** (Albis Run ist dabei kurz weg):
1. Gleich danach Albis Run durchklicken. Ab da ist der Rückfall auf 16 praktisch zu.
2. `pg_dump --version` zeigt 17, als `www-albisrun` und als `www-zeugnio`.
3. `~/kit/deploy.sh zeugnio --check` meldet `pg_dump (PostgreSQL) 17`.
4. Am Morgen danach prüfen, ob das Albis-Run-Backup von 03:30 durchgelaufen ist.

---

## Phase 2 — Server-Bootstrap (nach 1.1 **und** 1.2)

| # | Schritt | Runbook |
|---|---|---|
| 2.1 | In `www-zeugnio`: eigener SSH-Zugang, **Linger prüfen**, Kit nach `~/kit`, Ordner, nvm + Node 22, PM2 mit `pm2.service` aus dem Kit, `.env`, `backup.key`, `backup-s3.env`, `deploy.sh --check`. **Kein Deploy-Key**, solange das Repo öffentlich ist (HTTPS). Cron und logrotate erst nach dem ersten Deploy, **ausserhalb 00:00–04:00** | § 3 (korrigiert 28.10.) |
| 2.2 | Datenbank: `nmd_zeugnio` existiert. Mit dem **admin-Benutzer** die Connect-Grants setzen und `900_nine_bootstrap.sql` einspielen — Rollen ohne Präfix, `authenticator` **NOINHERIT** | § 4, § 5 |
| 2.3 | **Im Rückfallfenster des Upgrades:** Prod-Schema mit `pg_dump` **17** ziehen, Diff gegen `001–025` als Pflicht-Gate, einspielen, `901` (Eigentum/Rechte), `902` (Auth-Brücke), `903` (Gegenprobe) | § 6–§ 8 |
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
| 6.4 | Vercel und Supabase stilllegen | erst nach einer Frist, in der der Rückweg offen bleibt |

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

## Was diese Datei bewusst nicht entscheidet

Den Zielanbieter der DNS-Zone. Das ist kein technischer, sondern ein betrieblicher
Entscheid — er hängt daran, wo `zeugnio.ch` registriert ist und wen Advisori ohnehin
bewirtschaftet.

```
TODO(human) — Phase 0.1: Zielanbieter der DNS-Zone eintragen

Zur Wahl stehen grob drei Wege, mit je einem Nachteil:

  a) Beim Registrar selbst (dort, wo zeugnio.ch registriert ist).
     Wenig Aufwand, ein Konto weniger. Dafuer oft eine duerftige
     Oberflaeche und manchmal keine kurzen TTLs.

  b) Ein schweizerischer DNS-Anbieter (z. B. Infomaniak, Hostpoint).
     Passt zur Standortaussage, gute Oberflaeche, kurze TTLs.
     Dafuer ein weiteres Konto und eine weitere Rechnung.

  c) nine selbst, falls sie DNS anbieten.
     Alles an einem Ort - und genau das ist der Nachteil:
     Server und Zone beim gleichen Anbieter nehmen dir den
     unabhaengigen Umschalthebel, den wir gerade erst
     zurueckgewinnen (Abhaengigkeit 4).

Eintragen: Anbieter, wer das Konto haelt, und ob kurze TTLs (300 s)
moeglich sind. Danach wird 0.1 ausfuehrbar.
```
