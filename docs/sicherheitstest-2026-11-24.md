# Sicherheitstest zeugnio, 24.11.2026

Stand: `main` @ `a9efb46` (PR #105), live auf advisori01 unter https://zeugnio.ch.
Auftrag: Prüfung aus Angreifersicht, gewünscht vom Betreiber. Zuerst der Code (Whitebox), dann
vorsichtig von aussen: nur lesende Anfragen, wenige pro Minute, kein Brute Force, keine Last,
nichts verändert. Was nur mit zwei Konten prüfbar ist, steht als Testanleitung in Abschnitt 5.

> Dieser Bericht enthält keine Geheimnisse und keine Personen- oder Kundendaten. Das Repo ist
> öffentlich. Firmennamen in Beispielen sind erfunden.

> **Stand 27.11.2026: Alle Befunde H1–H4, M1–M5 und T1–T11 sind behoben** (M1 war schon dicht,
> T4/T5 mit B2). Der Bericht kam erst danach ins Repo, damit nie eine offene Anleitung öffentlich
> stand. Die Zuordnung zu den PRs steht in Abschnitt 6, die Funde aus der Fix-Arbeit in Abschnitt 7.
> Die Abschnitte 1–5 beschreiben den Zustand vom 24.11. und sind bewusst unverändert.

## 1. Kurzfassung

Die Grundmauern halten. Ein Fremder ohne Konto kommt an keine Daten. Die Anmeldung ist sauber
gebaut: Codes und Tokens werden nur gehasht gespeichert, es gibt keine Kontenaufzählung, die
Sitzungs-Cookies sind richtig gesetzt, und PostgREST ist von aussen nicht erreichbar. Auch
zwischen zwei Organisationen hat der Code-Review keine Lücke gefunden (IDOR, also der Zugriff
auf fremde Datensätze über deren ID). Jede ID-Route prüft die Rechte, bevor sie etwas tut. Das
muss mit zwei echten Konten noch bestätigt werden (Abschnitt 5).

Die Schwächen liegen beim **Kernversprechen «echt und unverändert»**, nicht beim Datenschutz:

| # | Schwere | Befund |
|---|---|---|
| H1 | **hoch** | Ein Vorgesetzten-Link bricht das Siegel eines finalisierten oder widerrufenen Zeugnisses wieder auf |
| H2 | **hoch** | Die Prüfung zeigt den versiegelten Text nicht. Ein überklebtes PDF gilt darum als «echt» |
| H3 | **hoch** | Selbst ausgestelltes Zeugnis einer fremden Firma erscheint als «Aussteller bestätigt» |
| H4 | **hoch** | Next.js 15.5.19 und sharp 0.34.5 haben kritische Sicherheitsmeldungen, und der Bildoptimierer ist aktiv |
| M1 | mittel | Die IP-Rate-Limits hängen davon ab, dass nginx `X-Real-IP` überschreibt. Das ist nicht belegt |
| M2 | mittel | Die Domain-Prüfung ist zu schwach (eine Mailadresse genügt, Subdomains, Public Suffixes) |
| M3 | mittel | Die Freigabe durch Unterzeichnende ist nicht an den Text gebunden |
| M4 | mittel | Tokens für Vorgesetzte und Freigaben liegen im Klartext und stehen im URL-Pfad |
| M5 | mittel | Mail-Flut und aufgebrauchtes Resend-Kontingent über die offene Registrierung |
| T1–T11 | tief | siehe Abschnitt 3 |

**Reihenfolge vor dem 1.12.:** H4 (ein Update, wenig Aufwand), H1 (klein, im Code klar
abgegrenzt), M1 messen (eine Minute, Anleitung in 5.4). Danach H3 und H2. Das sind
Produktentscheide: Was darf die Prüfseite als «bestätigt» anzeigen?

## 2. Befunde hoch und mittel

### H1 (hoch): Vorgesetzten-Link bricht das Siegel auf

**Beleg**
- `app/api/certificates/[id]/invite/route.ts:36-75`: Die Route legt eine Einladung an, ohne den
  Status des Zeugnisses zu prüfen, auch bei `final` oder `revoked`. Sie gibt den Link mit dem Token
  an den Aufrufer zurück (`:125`, `invite_url`). Die RLS-Regel «Edit manager invitations»
  (`supabase/033_organisationen_rollen.sql:473-475`) verlangt nur das Recht «bearbeiten».
- `app/api/evaluations/submit/route.ts:102-105`: Die Route setzt den Status mit dem
  **Service-Client** auf `manager_submitted`, ohne Statusfilter.
- `supabase/029_certificate_text_immutability.sql:141`: Der Trigger, der finalisierte Zeugnisse
  schützt, lässt `current_user = 'service_role'` ungeprüft durch. PostgREST wechselt für den
  Service-Client per `SET ROLE` genau in diese Rolle.

**Mechanismus.** Der Schutz finalisierter Zeugnisse sitzt in einem Datenbank-Trigger. Ein Trigger
ist eine Funktion, die Postgres vor jeder Änderung einer Zeile automatisch ausführt. Dieser hier
macht eine Ausnahme für die «vertraute» Serverrolle. Die öffentliche Abgabe-Route der
Vorgesetzten arbeitet aber genau mit dieser Rolle, und wer sie aufrufen darf, entscheidet allein
der Token. Damit wird die Ausnahme zur Hintertür.

**Ausnutzung.** Voraussetzung ist ein Konto mit dem Recht «bearbeiten» in der Firma. Das Recht
«versiegeln» braucht es nicht.
1. `POST /api/certificates/<id>/invite` auf ein finalisiertes Zeugnis, mit der eigenen Adresse als
   Vorgesetzte Person. Die Antwort enthält den Link.
2. `POST /api/evaluations/submit` mit diesem Token. Der Status springt von `final`/`revoked` auf
   `manager_submitted`.
3. Jetzt greift weder der Text-Schutz noch die Löschsperre. `DELETE /api/certificates/<id>`
   (`route.ts:36-44`) prüft nur `final`/`revoked`. Das Zeugnis verschwindet ohne Eintrag im
   Prüfregister, und das `audit_log` wird mitgelöscht (Kaskade).

Folgen: Das echte PDF zeigt bei der Prüfung «unbekannt», sieht also gefälscht aus. Ein
widerrufenes Zeugnis verliert seinen Widerruf. Wer zusätzlich «versiegeln» darf, kann den Text
ändern und neu versiegeln. Das passiert auch ohne böse Absicht: Antwortet die vorgesetzte Person
erst nach dem Finalisieren, ist das Siegel still weg.

**Fix** (ein PR, klein)
- In `invite`, `evaluations/submit` und auf der Seite `app/(public)/app/invitations/[token]`
  gesperrte Zeugnisse abweisen (`isCertificateLocked`, gibt es schon).
- Das Status-Update in `submit` an den Status binden:
  `.in("status", ["draft","pending_manager","manager_submitted"])`.
- Beim Finalisieren offene Einladungen auf «abgelaufen» setzen.
- Im Trigger die pauschale `service_role`-Ausnahme durch eine enge ersetzen, zum Beispiel nur
  `final → revoked`, oder nur eine eigene Wartungsrolle. Das ist eine Migration (038 ff.), auf
  advisori01 von Hand einzuspielen.
- `audit_log` nicht mehr per Kaskade löschen.

### H2 (hoch, Design): Die Prüfung zeigt den versiegelten Text nicht

**Beleg**
- `components/forms/verify-uploader.tsx:94-101` liest jede Textschicht des PDFs aus, unabhängig von
  Farbe, Position und Verdeckung. `app/api/verify/route.ts` hasht diesen Text.
- Die Antwort an den Prüfer (`VerifiedCertificateFields`, `lib/hash/canonicalize.ts:339 ff.`)
  zeigt Name, Firma, Datum und Unterzeichnende, **aber nicht den Zeugnistext**.
- Die QR-Prüfung (`/api/verify/hash`) sieht das PDF gar nicht. Sie bestätigt nur, dass es zu diesem
  Hash ein Zeugnis gibt.

**Mechanismus.** Ein PDF hat zwei Ebenen, das sichtbare Bild und eine Textschicht darunter. Die
Prüfung vergleicht nur die Textschicht. Wer ein echtes zeugnio-PDF hat (zum Beispiel die
Arbeitnehmerin selbst), legt ein weisses Rechteck über einen Satz und schreibt darüber einen
neuen. Die alte Textschicht bleibt erhalten, also meldet die Prüfung «registriert und
unverändert, kryptografisch signiert». Beim QR-Code geht es noch einfacher: Der Code bleibt
gleich, egal was auf dem Papier steht.

**Ausnutzung.** Dafür reicht ein gewöhnlicher PDF-Editor. Und es geht genau um den Angriff,
gegen den das Produkt schützen soll: ein geschöntes Zeugnis.

**Fix**
- Auf der Prüfseite den **versiegelten Text anzeigen**, bei der QR-Prüfung und beim Upload. Dazu
  der Hinweis: «Vergleichen Sie diesen Text mit dem vorliegenden Dokument.» Der Text liegt schon
  in `canonical_content`. Datenschutz: Wer den QR-Code oder das PDF hat, hat den Text ohnehin.
- Optional zusätzlich den SHA-256 der ausgegebenen PDF-Datei speichern und beim Upload als
  «Datei unverändert» melden. Das setzt voraus, dass die PDF-Ausgabe deterministisch ist, also
  aus demselben Zeugnis immer byte-gleich dieselbe Datei entsteht.

### H3 (hoch): Self-Issue mit «Aussteller bestätigt»

**Beleg**
- `app/api/certificates/[id]/finalize/route.ts:120-124`: Das Finalisieren verlangt keine
  verifizierte Domain.
- `app/api/certificates/[id]/signoff/route.ts:39-47`: Die Freigabe geht an **eine beliebige
  Adresse**, die das Konto selbst eintippt. `/api/signoffs/[token]/submit` braucht keine
  Anmeldung.
- `components/forms/verify-uploader.tsx:218-222`: `issuerConfirmed = verifiedDomain ||
  signatory1ConfirmedAt || signatory2ConfirmedAt`. Eine bestätigte Freigabe genügt also für
  «Aussteller bestätigt». Gleich in `verify-hash-result.tsx`.

**Ausnutzung.** Konto registrieren, Firma «Beispiel Holding AG» mit Unterzeichner «CEO» anlegen,
Zeugnis finalisieren. Dann die Freigabe an die eigene Gmail-Adresse schicken und bestätigen.
`/verify` zeigt «Registriert und unverändert · Aussteller bestätigt» ohne gelbe Warnung. Nur eine
kleine graue Zeile sagt «Aussteller-Domain nicht verifiziert». Ohne den Freigabe-Schritt warnt
die Seite deutlich, das ist gut gebaut. Die Freigabe hebelt genau diese Warnung aus.

**Fix**
- Eine Freigabe zählt nur als Bestätigung, wenn die Domain der Freigabe-Adresse einer
  **verifizierten** Firmen-Domain entspricht. Sonst: «Unterzeichnende Person nicht
  verifiziert».
- Das Badge «Kryptografisch signiert · über zeugnio ausgestellt» so formulieren, dass es nicht
  wie «vom Arbeitgeber ausgestellt» klingt.
- Produktentscheid: ohne verifizierte Domain gar nicht versiegeln, oder ein sichtbarer Vermerk
  «Aussteller nicht verifiziert» im PDF.

### H4 (hoch): Next.js und sharp mit kritischen Sicherheitsmeldungen

**Beleg.** `npm audit --omit=dev`: 1 kritisch (Paket `next`), 6 hoch, 29 mittel. Installiert sind
`next` 15.5.19 und `sharp` 0.34.5. Die relevanten Meldungen:
- GHSA-2464-fhr4-w9xw, kritisch: Codeausführung ohne Anmeldung im Bildoptimierer bei SVG.
  Betrifft ≤ 15.5.27 auf glibc-Linux, behoben in 15.5.28. Der Server ist glibc-Linux.
- GHSA-2xp9-vwfh-vxw4, kritisch: dasselbe bei AVIF über libheif, behoben in 15.5.24.
- sharp: libvips, libheif und librsvg, behoben ab 0.35.5.
- GHSA-p3m5-59mp-jv5r (DoS über Server Actions) trifft zeugnio nicht. Es gibt kein
  `"use server"`.

**Von aussen gemessen.** `GET /_next/image?url=%2Fgibtsnicht.png&w=64&q=75` antwortet mit
`400 The requested resource isn't a valid image`. Der Optimierer läuft also und holt lokale
Pfade. Fremde URLs lehnt er ab (`"url" parameter is not allowed`).

**Ausnutzbarkeit.** Die Meldungen nennen die genauen Bedingungen nicht. Ein Angreifer müsste dem
Optimierer eine SVG- oder AVIF-Datei von einem lokalen Pfad unterschieben. Die Logos sind auf
PNG/JPEG geprüft (Magic Bytes, also die ersten Bytes der Datei), und eine AVIF-Datei kann nicht
mit einer PNG-Signatur beginnen. Einen Weg habe ich darum nicht gefunden. Trotzdem «hoch»: Eine
Lücke dieser Klasse (Codeausführung auf dem Server) schliesst man mit einem Update, statt darauf
zu wetten, dass sie unerreichbar ist.

**Fix**
- `next` auf 15.5.29 (Tag `backport`) und `sharp` auf ≥ 0.35.5 heben.
- Zusätzlich `images: { unoptimized: true }` in `next.config.mjs`. zeugnio braucht den Optimierer
  nur für den unsichtbaren Trust-Strip. Damit verschwindet die ganze Angriffsfläche.
- Achtung Lockfile-Falle: lokal npm 11, Server npm 10. Nach dem Update die `optional`-Flags prüfen
  im `package-lock.json`, sonst bricht der Build auf dem Server mit `EBADPLATFORM` ab.
- Bei der Gelegenheit: tiptap ≥ 3.30.4 und prosemirror-view ≥ 1.42.3 (XSS beim Einfügen im
  Editor, trifft nur die eigene Sitzung), postcss (nur beim Build).

### M1 (mittel, nicht belegt): IP-Rate-Limits und `X-Real-IP`

**Beleg.** `lib/client-ip.ts:22-23` vertraut `x-real-ip` ohne Bedingung. Der Kommentar sagt, nginx
setze den Kopf. Im Repo und im Journal gibt es dafür keine Messung. Gemessen wurde am 13.11. nur
`X-Forwarded-Host`.

**Mechanismus.** nginx reicht Kopfzeilen des Browsers unverändert an Next weiter, ausser die
Konfiguration überschreibt sie mit `proxy_set_header X-Real-IP $remote_addr;`. Fehlt diese Zeile,
schreibt der Angreifer bei jeder Anfrage eine andere erfundene IP in den Kopf. Jedes IP-Limit
zählt dann für jede Anfrage neu: Anmeldung 20/h, Code-Einlösen 20/h, Prüfung, Analyse,
Abgabe-Links.

Was dann noch hält: das Limit pro Mailadresse (5/h) und der Fehlversuchszähler pro Code.

**Prüfung.** Anleitung in 5.4, ein PowerShell-Block. **Fix, falls offen:** im vhost
`proxy_set_header X-Real-IP $remote_addr;` (bei nine per Ticket oder als `www-data`).

### M2 (mittel): Die Domain-Prüfung ist zu schwach

**Beleg.** `app/api/companies/[id]/domain/route.ts:82-117`, `lib/company/domain.ts:133`
(`candidate.endsWith("." + declared)`).
- Eine einzige Mailadresse an der Domain genügt, auch an einer Subdomain. Wer zuerst kommt, hat
  die Domain. Die echte Personalabteilung bekommt später 409, weil der Index eindeutig ist.
- Public Suffixes werden nicht abgewiesen. Mit `x@firma.co.uk` liesse sich `co.uk` beanspruchen,
  mit einem Gratis-M365-Mandanten `onmicrosoft.com`.
- Die Freemail-Liste ist lückenhaft (z. B. protonmail.ch, outlook.de, hotmail.fr, posteo.de,
  mailbox.org).

**Ausnutzung.** Jeder Mitarbeitende einer echten Firma kann deren Domain für sein eigenes Konto
verifizieren. Danach stellt er Zeugnisse mit «Domain verifiziert · firma.ch» aus, auch für sich
selbst.

**Fix**
- Domain-Status nur per DNS-TXT-Eintrag. Das kann nur, wer die Zone der Firma verwaltet.
- Die Prüfung per Mailadresse als schwächere Stufe anders beschriften.
- Einträge der Public Suffix List abweisen, die Freemail-Liste ergänzen.

### M3 (mittel): Freigabe nicht an den Text gebunden

**Beleg.** `app/api/signoffs/[token]/submit/route.ts` speichert nur Status, Zeit, IP und
Browserkennung, keinen Hash des gezeigten Texts und keinen Namen. Keine Route setzt Freigaben
zurück, wenn der Text oder die Unterzeichnenden geändert werden. `lib/verify/certificate-fields.ts:183-192`
zeigt öffentlich «bestätigt am …».

**Ausnutzung.** Die Unterzeichnerin gibt Text A frei. Danach ändert die Personalabteilung auf
Text B und finalisiert. Die Prüfseite meldet B als «bestätigt».

**Fix.** Mit der Freigabe den Hash des gezeigten Texts und den Namen speichern. Bestätigt ist nur,
was beim Finalisieren denselben Hash hat. Alternativ alle Freigaben bei jeder Text- oder
Namensänderung zurücksetzen.

### M4 (mittel, bekannt): Tokens im Klartext und im URL-Pfad

**Beleg.** `manager_invitations.token` und `certificate_signoffs.token` liegen im Klartext. Die
Team-Einladungen sind schon gehasht (`lib/team/invitations.ts`), dort ist es richtig gelöst. Die
Links tragen den Token im Pfad: `/app/invitations/<token>`, `/app/signoffs/<token>`,
`POST /api/signoffs/<token>/submit`.

**Wer kommt an sie heran?**
- Eine Datenbank-Sicherung oder ein Auszug liefert gültige Links. Mit H1 sind sie sogar ein
  Schreibrecht.
- Das nginx-Zugriffsprotokoll schreibt den Pfad mit. Das Format ist nicht im Repo, also nicht
  belegt.
- `Referrer-Policy: strict-origin-when-cross-origin` schickt den vollen Pfad bei Anfragen
  innerhalb der Seite mit. Nur `/auth/link` hat `no-referrer`.
- RLS lässt auch Mitglieder mit nur «lesen» die Token-Spalten lesen (`033:471`, `:495`). Die App
  gibt sie aber nicht heraus, und PostgREST ist nicht offen.

**Fix.** SHA-256 speichern wie bei den Team-Einladungen. Ein Token wird dann nur einmal beim
Versand angezeigt und danach über seinen Hash nachgeschlagen. Dazu `Referrer-Policy: no-referrer`
für `/app/invitations/:path*` und `/app/signoffs/:path*` und Tokens im nginx-Log maskieren.

### M5 (mittel): Mail-Flut über die offene Registrierung

**Beleg.** `lib/auth/config.ts:50-53` (5/h pro Adresse, 20/h pro IP). `lib/auth/anfordern.ts:76-79`
bildet den IP-Schlüssel aus der vollen Adresse, ohne IPv6 auf /64 zu gruppieren.
`supabase/906_auth_eigen.sql:248-256`: Jede gültige Adresse bekommt eine echte Mail.

**Ausnutzung.** Mit einem IPv6-/64-Netz hat ein Angreifer praktisch unbegrenzt viele Adressen.
Damit verschickt er Mails an beliebig viele fremde Adressen (pro Adresse rund 120/Tag). Das
schadet dem Ruf der Absenderdomain. Ist das Resend-Kontingent aufgebraucht, bekommt niemand mehr
einen Anmeldecode, und das ist ein Ausfall der Anmeldung. Mit M1 geht es sogar ohne IPv6.

**Fix.** IPv6 auf /64 gruppieren. Dazu eine globale Obergrenze für Anmelde-Mails pro Stunde und
Tag, mit Warnung im Log. Als Reserve, wenn die Rate steigt, eine Rechenaufgabe für den Browser
(Proof of Work) oder ein datenschutzfreundliches Captcha.

## 3. Befunde tief und Hinweise

| # | Befund | Beleg | Fix |
|---|---|---|---|
| T1 | Ausser den 4 `/api/auth/*`-Routen prüft keine schreibende API den `Origin`. Der Schutz gegen CSRF (fremde Seite löst Aktion im Namen des Opfers aus) hängt allein an `SameSite=Lax`, und `req.json()` nimmt auch `text/plain` an. Heute gibt es keine fremde Subdomain, also tief | `lib/auth/origin.ts`, z. B. `app/api/team/invitations/route.ts` | `isAllowedOrigin` zentral in `middleware.ts` für alle Nicht-GET unter `/api/*`, ausser `cron` und `stripe/webhook` |
| T2 | Login-CSRF: Die Maske `an•••@gmail.com` zeigt nur 2 Zeichen. Ein Angreifer schickt dem Opfer seinen eigenen Anmeldelink. Das Opfer arbeitet danach im Konto des Angreifers | `lib/auth/tokens.ts:84-90`, `app/auth/link/page.tsx:81-94` | mehr vom lokalen Teil zeigen, oder «bereits angemeldet als …» |
| T3 | 6-stelliger Code: höchstens rund 25 Versuche pro Stunde und Adresse. Über einen Monat etwa 1,8 % Chance auf ein bestimmtes Konto, mit rund 3600 Mails ans Opfer, also sehr laut | `supabase/906_auth_eigen.sql:317-366` | 8 Stellen oder Tageslimit für Fehlversuche |
| T4 | Fehlt `ZEUGNIO_AUTH`, gilt still `supabase`. Die Vorlage `env.production.example:50` steht noch auf `supabase` | `lib/auth/config.ts:25-27`, `scripts/check-env.mjs:206` | in Produktion `eigen` als Vorgabe oder Abbruch. Vor oder mit B2 erledigen |
| T5 | Das dauerhafte Rate-Limit braucht `SUPABASE_SERVICE_ROLE_KEY`. Fehlt der Schlüssel, zählt es still nur noch im Speicher, und jeder Neustart setzt es zurück. **B2 will genau diese Variable entfernen** | `lib/rate-limit.ts:130`, `:153-159` | `check_rate_limit` über `serviceDataApi()` aufrufen wie `lib/auth/store.ts`. Vor B2 |
| T6 | `/api/health` nennt bei Fehlern fehlende Variablen, Signaturschlüssel und Rechtezustand, für alle sichtbar. Heute nur `ok`-Felder | `app/api/health/route.ts` | öffentlich nur ok/Fehler, Details nur mit geheimem Kopf |
| T7 | Abgabe der Vorgesetzten: Eingaben ungeprüft, Liste unbegrenzt. Löscht **alle** Beurteilungen des Zeugnisses, auch die Selbstbeurteilung. Gibt DB-Fehlertexte an Anonyme zurück | `app/api/evaluations/submit/route.ts:21-80` | Schema mit Längengrenzen, nur eigene `invitation_id` ersetzen, generische Fehler |
| T8 | Die Seite für Vorgesetzte schickt Geburtsdatum und Pensum im Seiten-Payload an den Browser | `app/(public)/app/invitations/[token]/page.tsx` (~95) | nur benötigte Felder laden |
| T9 | Die Kanonisierung entfernt jedes «- » (auch Gedankenstriche). «Leistung – sehr gut» ergibt also denselben Hash wie «Leistung sehr gut» | `lib/hash/canonicalize.ts:73-81` | bei der nächsten Hash-Version (v3) enger fassen. Kleine Wirkung |
| T10 | `/api/verify` und `/api/analyze` begrenzen die Textlänge nicht. nginx erlaubt 64 MB. Im Fehlerfall geht der ganze Text als GET-Filter an PostgREST, und die Antwort nennt eine interne ID und `err.message` | `app/api/verify/route.ts` | `text.length > 200 000` abweisen, generische Fehler |
| T11 | Ein Org-Admin kann für eine fremde Benutzer-UUID eine `company_members`-Zeile anlegen. Die Teamseite lädt dann per Service-Client deren Mail und Namen. Dafür braucht es die UUID, und einen Weg zu ihr habe ich nicht gefunden | `033:442`, `app/api/team/members/[userId]/route.ts`, `app/(authed)/app/team/page.tsx:244-266` | Mitgliedschaft in der Org im `WITH CHECK` und in der Route prüfen |

**Hinweise (kein Handlungsdruck)**
- `test.zeugnio.ch` antwortet noch mit 200. Build-Kennung und ETag sind gleich wie bei
  `zeugnio.ch`, es ist also ein **zweiter Name für die Produktion** und keine Testkopie mit
  eigenen Daten. Die Anmelderouten weisen dort fremde `Origin` ab, Cookies sind an den Host
  gebunden. Trotzdem vhost, DNS-Eintrag und Zertifikat entfernen, wenn nicht mehr gebraucht.
- DMARC steht auf `p=none` (nur beobachten). Nach 2–4 Wochen sauberer Berichte `quarantine`.
  Es gibt keinen CAA-Eintrag (er würde festlegen, welche Stelle Zertifikate ausstellen darf) und
  kein `/.well-known/security.txt`.
  **Korrektur 27.11.:** CAA gab es schon, mit drei Einträgen (`letsencrypt.org`, `pki.goog`,
  `sectigo.com`). Die Messung hatte eine Lücke: Windows kann CAA nicht abfragen.
- HSTS 7 Tage ohne `includeSubDomains`. Das ist bewusst so bis zur ersten Zertifikats-Erneuerung.
- Die statische Startseite liefert `script-src 'self' 'unsafe-inline'` ohne Nonce. Das ist
  bekannt (`middleware.ts:82-88`) und vertretbar, weil sie keine Nutzereingaben zeigt. Die
  dynamischen Seiten haben Nonce plus `strict-dynamic`.
- Sitzungen verlängern sich bei Nutzung immer weiter (30 Tage, täglich erneuert), ohne absolute
  Obergrenze. «Überall abmelden» gibt es nur über die Kontolöschung.
- `CRON_SECRET` wird mit `!==` verglichen statt zeitkonstant (`timingSafeEqual`). Der Effekt ist
  vernachlässigbar.
- `901_nine_rechte.sql` vergibt auf `certificate_register` und `deletion_log` wieder Rechte, die
  036 entzogen hatte. RLS ohne Regeln liefert trotzdem nichts. Aufräumen.
- `app/api/stripe/webhook` ist ein Platzhalter ohne Signaturprüfung. Bevor er etwas auslöst,
  muss er `stripe.webhooks.constructEvent` mit dem Rohtext verwenden.
- Bei der Abgabe der Vorgesetzten (`evaluations/submit`) können zwei gleichzeitige Abgaben
  sich überholen, weil «schon abgegeben?» und das Schreiben getrennte Schritte sind.

## 4. Was hält (geprüft, ohne Befund)

**Von aussen gemessen (24.11., rund 40 lesende Anfragen)**
- TLS nur 1.2 und 1.3; 1.0 und 1.1 werden abgelehnt. Let's Encrypt gültig bis 18.02.2027. HTTP
  leitet per 301 auf HTTPS, `www` per 308 auf den Apex.
- Header: `X-Frame-Options DENY`, `nosniff`, `Referrer-Policy`, `Permissions-Policy`, COOP,
  CSP mit `frame-ancestors 'none'`, `object-src 'none'`, `base-uri` und `form-action`. Kein
  `X-Powered-By`, keine nginx-Version.
- Ohne Anmeldung: `/app/*` → 307 auf `/login?next=…`, `/api/certificates/<id>/pdf` → 401,
  `/api/auth/status` → `{"angemeldet":false}`.
- `/.env` und `/.git/HEAD` → 403. Keine Quellkarten (`.js.map` → 404). Kein offenes Verzeichnis.
  `/rest/v1/*` → 404 der App, PostgREST ist also nicht durchgereicht. Kein CORS-Freibrief.
- `/api/verify/hash`: strenge 64-Hex-Prüfung, unbekannter Hash → `unknown`, kaputtes JSON → 400.

**Im Code**
- **PostgREST** lauscht nur auf 127.0.0.1:3011, `next start` ebenfalls auf 127.0.0.1. Von aussen
  offen sind laut nine nur die Ports 22, 80 und 443.
- **Identität:** Die App liest `sub` und `role` des PostgREST-Tokens nur aus der serverseitigen
  Sitzung, nie aus einem Cookie. HS256 mit 60 Sekunden Laufzeit, pro Anfrage neu ausgestellt. Im
  Modus `eigen` wird kein `sb-`-Cookie akzeptiert.
- **Anmeldung**
  - Link- und Sitzungstoken haben 32 Byte aus einem kryptografischen Zufallsgenerator, der Code
  kommt aus `randomInt`.
  - Gespeichert wird alles nur als HMAC-SHA256, der Code gebunden an die Mailadresse.
  - Das Einlösen ist einmalig und atomar.
  - Antworten verraten nicht, ob ein Konto existiert.
  - Der Link verwendet nur `NEXT_PUBLIC_SITE_URL`, nie den `Host`-Kopf.
  - `next` ist gegen offene Weiterleitungen gesichert.
- **Cookie** `__Host-zeugnio_session`: HttpOnly, Secure, SameSite=Lax, Path=/, bei jeder Anmeldung
  neu ausgestellt (keine Session Fixation). Beim Abmelden wird die Zeile auf dem Server gelöscht.
- **DB-Rechte:** Die Tabellen im Schema `auth` sind gesperrt. Alle SECURITY-DEFINER-Funktionen
  setzen `search_path`. Die Auth-Funktionen darf nur `service_role` ausführen.
- **Mandantentrennung**
  - Jede ID-Route unter `app/api/**` nutzt den Benutzer-Client und prüft
  `zeugnio_permissions`, bevor sie etwas tut. Service-Client-Aufrufe kommen erst nach dieser
  Prüfung.
  - Firmen lassen sich nicht in eine fremde Org legen oder verschieben (`org_immutable`).
  - Schreibrouten übernehmen nur freigegebene Felder. `status`, `hash`, `signature` und
  `company_id` setzt nur der Server.
- **Team-Einladungen:** gehashter Token, an die Mailadresse gebunden, mit Ablauf und Widerruf.
- **Tokens für Vorgesetzte und Freigaben:** 32 Byte Zufall, Ablauf und Einmaligkeit werden auf dem
  Server geprüft. Die Zeugnis-ID kommt aus der Token-Zeile, nie aus dem Body.
- **Logos**
  - Upload braucht das Recht «Firma», höchstens 2 MB, nur PNG/JPEG nach Magic Bytes, kein SVG,
    Zufallsname.
  - Ausgeliefert wird nur über einen strengen UUID- und Dateinamen-Filter mit Pfadprüfung,
    `nosniff`. Kein Path Traversal (Ausbruch aus dem Ordner über `../`).
- **Kein SSRF** (Server holt auf Anweisung eines Angreifers eine fremde Adresse):
  - `logo_url` lässt sich nicht über die API setzen.
  - Externe Logos sind nur per https vom festen Host erlaubt, ohne Weiterleitungen, mit
    Zeitlimit und Grössengrenze.
  - Das PDF entsteht mit @react-pdf, nicht über HTML oder einen Browser.
- **Kein** `dangerouslySetInnerHTML`, `eval`, `child_process` und kein SQL aus Strings. Die
  Mailvorlagen maskieren alle eingesetzten Werte. Der CSV-Export entschärft Formelzeichen.
- **Siegel**
  - Die Prüfung rechnet den Hash selbst aus dem Text nach und prüft die Ed25519-Signatur gegen
    diesen Hash. Einem Hash im PDF vertraut sie nicht.
  - Der private Schlüssel kommt nur aus der Umgebung. `/api/signing-keys` zeigt nur öffentliche
    Schlüssel.
  - Finalisieren läuft über den Benutzer-Token, der Trigger greift dort also.
- **Cron:** Ohne `CRON_SECRET` lehnt die Route ab (fail closed). `/api/analyze` arbeitet mit
  Regeln und ruft keine externe KI auf.

## 5. Testanleitungen (mit Konto, für den Betreiber)

Die Tests verändern Daten. Darum **zuerst lokal** (`npm run dev` gegen eine Wegwerf-PG17 aus dem
Repo) oder in der Produktion **nur mit erfundenen Firmen**. Ein finalisiertes Zeugnis lässt sich
nicht löschen, nur widerrufen. Für Anmeldungen keine erfundenen Mailadressen verwenden, sondern
eigene Postfächer oder Plus-Adressen (`name+a1@…`), sonst entstehen Bounces.

**Konten:** A1 = Admin von Org A mit Firma CA. A2 = Rolle `hr` in CA, ohne «versiegeln».
B1 = Admin von Org B. Auf der A-Seite IDs notieren: Zeugnis `certA` (final), Mitarbeiterin
`empA`, Team-Einladung `invA`. Die Requests lassen sich im Browser über die Entwicklertools
(Konsole, `fetch(...)`) mit der jeweiligen Sitzung absetzen. Der `Origin` stimmt dann von selbst.

### 5.1 IDOR zwischen zwei Organisationen (als B1)
Erwartet für jede Anfrage: 403 oder 404, und nichts ändert sich.
- `GET /api/certificates/certA/pdf`, `GET /api/certificates/certA/docx`
- `PUT /api/certificates/certA/text` mit `{"edited_text":"x"}`
- `POST /api/certificates/certA/finalize`, `/revoke`, `/invite` mit `{"manager_email":"…"}`,
  `/signoff` mit `{"slot":1,"email":"…"}`
- `POST /api/employees/empA/delete`
- `PATCH /api/companies/CA` mit `{"name":"x"}`, `POST /api/companies/CA/domain`,
  `POST /api/companies/CA/logo` (PNG), `GET /api/companies/CA/export`,
  `POST /api/companies/CA/delete`
- `POST /api/team/invitations` mit `{"organizationId":"<orgA>","email":"…","role":"hr","companyIds":["CA"]}`
- `PATCH /api/team/members/<A2>` mit `{"organizationId":"<orgA>","orgRole":"admin"}`
- `PATCH /api/team/organization` mit `{"organizationId":"<orgA>","name":"x"}`
- `DELETE /api/team/invitations/invA`, `POST /api/team/organization/delete`
- Seite `/app/company/CA` → darf keine Daten zeigen.

### 5.2 Rollen (als A2)
Erwartet 403: `finalize` und `revoke` auf CA, `POST /api/employees/empA/delete`,
`PATCH /api/companies/CA`, `POST /api/companies/CA/delete`,
`PATCH /api/team/members/<A2>` mit `{"organizationId":"<orgA>","access":{"CA":"hr_leitung"}}`.

### 5.3 H1 nachstellen (als A2, lokal)
1. `POST /api/certificates/certA/invite` mit `{"manager_email":"<eigene Adresse>"}`. Heute 200
   mit `invite_url`, nach dem Fix 409.
2. `POST /api/evaluations/submit` mit `{"token":"<aus der URL>","evaluations":[{"category":"leistung","rating":5}]}`.
   Heute springt der Status auf `manager_submitted`, nach dem Fix 409.
3. `DELETE /api/certificates/certA`. Heute gelöscht, nach dem Fix 400.
4. Das alte PDF muss danach weiter als echt erkannt werden.

### 5.4 M1: Überschreibt nginx `X-Real-IP`? (PowerShell, eine Minute)
Die Prüf-API erlaubt 20 Anfragen pro Minute und IP. Der Test schickt 22 Anfragen mit derselben
erfundenen IP aus dem Dokumentationsbereich 203.0.113.0/24, danach eine mit einer anderen.

PowerShell:
```powershell
$body = '{"hash":"0000000000000000000000000000000000000000000000000000000000000000"}'; foreach ($ip in @('203.0.113.7')*22 + @('203.0.113.8')) { try { $r = Invoke-WebRequest -UseBasicParsing -Method Post -Uri 'https://zeugnio.ch/api/verify/hash' -ContentType 'application/json' -Headers @{ 'X-Real-IP' = $ip } -Body $body; "$ip $($r.StatusCode)" } catch { "$ip $($_.Exception.Response.StatusCode.value__)" } }
```
So liest du das Ergebnis:
- **Die letzte Zeile (`203.0.113.8`) zeigt 200:** nginx reicht den gefälschten Kopf durch, M1 ist
  offen.
- **Auch die letzte Zeile zeigt 429:** Die Limits zählen deine echte IP, M1 ist erledigt.
- **Nie 429:** Das Limit läuft nur im Speicher oder ist höher, dann `pm2 logs zeugnio` ansehen.

Danach eine Minute warten, bevor du selbst prüfst.

### 5.5 H3 nachstellen (als B1, lokal oder mit erfundener Firma)
1. Firma «Beispiel Holding AG» mit einem Unterzeichner anlegen und ein Zeugnis finalisieren.
2. `POST /api/certificates/<id>/signoff` mit `{"slot":1,"email":"<eigene Privatadresse>"}`, dann
   den Link aus der Mail bestätigen.
3. PDF auf `/verify` hochladen. Heute erscheint «Aussteller bestätigt», nach dem Fix «Aussteller
   nicht bestätigt».

### 5.6 Team-Einladung an fremde Adresse
A1 lädt eine Adresse ein. B1 (andere Anmeldeadresse) ruft `POST /api/team/invitations/accept` mit
dem Token auf. Erwartet: 403.

## 6. Fix-PRs (Stand 27.11.2026, alle gemergt)

| Befund | PR | Inhalt | Migration |
|---|---|---|---|
| H4 | #107 | next 15.5.29, sharp 0.35.5, Bildoptimierer aus (`images.unoptimized`). tiptap/prosemirror folgen separat (Peer-Pins) | – |
| H1 | #109 | Statusprüfung in `invite`, `submit` und auf der Seite; offene Einladungen beim Finalisieren schliessen; Siegel-Trigger ohne `service_role`-Ausnahme, Einladungssperre in der DB | 038 |
| H2, H3 | #110 | Prüfseite zeigt den versiegelten Text; «Aussteller bestätigt» nur mit bestätigter Domain | – |
| M1 | #121 | Gemessen 26.11.: nginx setzt `X-Real-IP $remote_addr`, gezählt wird die echte IP. Kein Fix nötig; Kopie der vhosts in `docs/nginx/` | – |
| M2 | #114 | Domain in drei Stufen: Mailadresse an exakt der Domain = bestätigt, DNS-TXT `_zeugnio.<domain>` = freiwillig «Domain geprüft», nichts = Warnung; Freemail-Liste | 039 |
| M3 | #117 | Freigabe speichert Hash des gezeigten Texts und den Namen; «bestätigt» nur bei gleichem Hash | 041 |
| M4 | #116 | Vorgesetzten- und Freigabe-Tokens nur noch als SHA-256; `no-referrer` auf den Token-Seiten | 040 |
| M5 | #115 | IPv6 pro /64; globale Obergrenze für Anmelde-Mails (30/h, 80/Tag); Rate-Limit-Zähler laufen sauber ab | 042 |
| T1, T10 | #126 | Herkunftsprüfung zentral in der Middleware für alle schreibenden `/api/*`; Längengrenze und generische Fehler für `/api/verify` und `/api/analyze`; Stripe-Platzhalter stillgelegt | – |
| T2, T3, T6 | #129 | Anmeldeseite zeigt das Zielkonto deutlicher, Kontowechsel nur mit Bestätigung; höchstens 10 eingetippte Codes pro Adresse und Tag; `/api/health` öffentlich nur `ok`; `CRON_SECRET` zeitkonstant verglichen | – |
| T4, T5 | #102 (B2), nachgeprüft in #129 | kein `ZEUGNIO_AUTH`, keine Supabase-Variablen mehr; Rate-Limit über die eigene Daten-API; Rest im Testinstanz-Werkzeug entfernt | – |
| T7, T8 | #127, #131 | Abgabe der Vorgesetzten und Selbstbeurteilung atomar, mit Schema, ersetzen nur eigene Einträge, generische Fehler; Einladungsseite lädt nur nötige Felder | 043, 046 |
| T9 | #128 | Siegel-Version v3 bindet jeden Strich; v1/v2 werden unverändert geprüft | – |
| T11 | #125 | Firmenzugang nur für Mitglieder derselben Organisation (DB, Route, Teamseite); von 901 wieder vergebene Rechte entzogen | 044 |

Hinweise aus Abschnitt 3 ohne Code-PR liegen beim Betreiber: `test.zeugnio.ch` abbauen, DMARC auf
`quarantine`, CAA-Eintrag und `security.txt`, absolute Höchstdauer für Sitzungen (Produktentscheid).

**Stand 27.11.:** `test.zeugnio.ch` abgebaut, DMARC `p=quarantine`, CAA auf `letsencrypt.org`
reduziert (plus `issuewild ";"`), `security.txt` seit 27.11. live (PR #136, gemergt und deployt, von aussen
geprüft). Offen bleibt die Höchstdauer für Sitzungen. Einzelheiten im Journal `deploy/nine/kommunikation.md`, 27.11.

## 7. Funde während der Fix-Arbeit

| Fund | PR | Inhalt |
|---|---|---|
| Freigabe-Links verlangten eine Anmeldung | #122 | Die Middleware gab `/app/signoffs` nicht frei; externe Unterzeichnende landeten auf `/login` |
| Anmeldung per Link scheiterte mit 403 | #129 | `Referrer-Policy: no-referrer` auf `/auth/link` liess den Browser `Origin: null` senden. Jetzt `strict-origin`. Die Anmeldung per Code war nicht betroffen |
| Kontolöschung liess die Mailadresse in `auth.users` stehen | #132 (909) | Die Server-Rolle durfte dort nicht löschen, die Löschfunktion übersprang den Schritt still. 909 vergibt das Recht und räumte auf; auf advisori01 eingespielt und nachgeprüft |
| Selbstbeurteilung mit derselben Schwäche wie T7 | #131 | gleich gehärtet wie die Abgabe der Vorgesetzten (046) |
