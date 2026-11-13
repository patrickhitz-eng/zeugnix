# zeugnio.ch: Postfach in Microsoft 365, SPF, DKIM, DMARC (F1)

> Schritt F1 aus `.claude/plans/2026-11-03-outreach-dezember.md`. Reine Konfiguration in
> DNS und Microsoft 365, kein Code. Ausnahme: die Datenschutzseite (Schritt 8).
> Stand der Messung: **13.11.2026** (`Resolve-DnsName` gegen 1.1.1.1). Ersetzt die
> Fassung vom 25.09.2026.

## Kurz erklärt: vier Einträge, vier Aufgaben

- **MX** (Mail Exchanger) sagt fremden Mailservern, wohin sie Mails **an** `@zeugnio.ch`
  zustellen. Pro Domain gibt es genau einen Posteingang.
- **SPF** (Sender Policy Framework) ist eine Liste der Server, die Mails **mit Absender**
  `@zeugnio.ch` verschicken dürfen. Geprüft wird die unsichtbare Umschlagadresse
  (Return-Path), nicht das sichtbare «Von».
- **DKIM** (DomainKeys Identified Mail) heisst: Der sendende Server signiert jede Mail, und
  der öffentliche Schlüssel dazu steht im DNS. Der Empfänger prüft damit, ob die Mail
  unterwegs verändert wurde und ob sie wirklich von der Domain kommt.
- **DMARC** verbindet beides mit dem sichtbaren «Von». Eine Mail besteht DMARC nur, wenn SPF
  **oder** DKIM besteht **und** die geprüfte Domain zum «Von» passt (Fachwort:
  *Alignment*). Ausserdem sagt DMARC dem Empfänger, was er mit Mails tun soll, die
  durchfallen (`none`, `quarantine`, `reject`), und wohin er Berichte schickt.

Ohne DMARC am Apex kann jeder Mails mit «Von: …@zeugnio.ch» verschicken. Kein Empfänger
hat dann einen Anhaltspunkt, das zu prüfen. Grosse Postfächer wie Gmail und Outlook
stufen Mails ohne SPF, DKIM und DMARC ausserdem als verdächtig ein. Für Outreach-Mails
heisst das: Sie landen im Spam.

## Ist-Zustand am 13.11.

| Name | Typ | Wert | Bedeutung |
|---|---|---|---|
| `zeugnio.ch` | NS | `ns1/ns2.vercel-dns.com` | Zone liegt noch bei Vercel, der Umzug zu Infomaniak (Cutover 0.1) ist noch nicht passiert |
| `zeugnio.ch` | MX | `10 inbound-smtp.eu-west-1.amazonaws.com` | Posteingang ist der **Empfang von Resend** (AWS Irland) |
| `zeugnio.ch` | TXT (SPF) | **fehlt** | |
| `_dmarc.zeugnio.ch` | TXT | **fehlt** | |
| `resend._domainkey.zeugnio.ch` | TXT | DKIM-Schlüssel von Resend | ✓ Resend signiert mit `d=zeugnio.ch` |
| `send.zeugnio.ch` | MX + TXT | `feedback-smtp.eu-west-1.amazonses.com`, `v=spf1 include:amazonses.com ~all` | ✓ Umschlagadresse und Bounces von Resend |
| `autodiscover.zeugnio.ch` | – | trifft nur den Wildcard `*` auf Vercel | |
| M365-Mandant | – | `zeugnio.ch` ist in **keinem** Mandanten registriert (`getuserrealm`: `Unknown`) | |

Zum Vergleich `advisori.ch` im selben M365-Mandanten: MX `advisori-ch.mail.protection.outlook.com`,
SPF `include:spf.protection.outlook.com -all`, DMARC `p=none`, **kein DKIM von Microsoft**.
Der zweite MX `send.advisori.ch` vom 16.10. ist inzwischen weg.

**Im Code hängt nichts am Resend-Empfang.** Es gibt keine Webhook-Route für eingehende
Mails. Die App setzt nur `EMAIL_FROM` (Standard `noreply@zeugnio.ch`) und optional
`EMAIL_REPLY_TO` (`lib/email/send.ts:40-41`). Antwortet heute jemand auf eine
Einladungsmail, landet die Antwort im Resend-Empfang, also im Resend-Dashboard, und nicht
in einem Postfach, das jemand liest.

## Wie es danach aussieht

Zwei Systeme senden unter `@zeugnio.ch`, eines empfängt:

| Weg | System | Umschlag (SPF) | Signatur (DKIM) | DMARC besteht über |
|---|---|---|---|---|
| Mails **an** `@zeugnio.ch` | Microsoft 365 (Mandant advisori) | – | – | – |
| Silvan und Support schreiben | Microsoft 365 | `zeugnio.ch` → `include:spf.protection.outlook.com` | `selector1/2._domainkey.zeugnio.ch` | SPF **und** DKIM |
| App: Anmeldelinks, Einladungen | Resend, später mailomat.swiss (Cutover 6.3) | `send.zeugnio.ch` (bleibt) | `resend._domainkey.zeugnio.ch` (bleibt) | DKIM (`d=zeugnio.ch` passt zum «Von») |

Darum steht im Apex-SPF **nur Microsoft**. Resend braucht dort keinen Eintrag, weil seine
Umschlagadresse auf `send.zeugnio.ch` liegt und das eigene SPF dort reicht. Die App-Mails
bestehen DMARC über die Resend-Signatur. Kommt mailomat.swiss dazu, wird dessen `include`
im Apex-SPF ergänzt (Cutover 6.3).

## Adressen

| Adresse | Art in M365 | Lizenz | Zweck |
|---|---|---|---|
| `silvan@zeugnio.ch` | zusätzliche Adresse (Alias) auf Silvans bestehendem advisori-Postfach | keine neue | Outreach-Absender |
| `support@zeugnio.ch` | freigegebenes Postfach (Shared Mailbox), Silvan mit «Vollzugriff» und «Senden als» | keine (bis 50 GB) | Support, Antwortadresse der App |
| `dmarc@zeugnio.ch` | Alias auf `support@` | keine | DMARC-Berichte |

Wichtig für den Alias `silvan@`: Damit Outlook **mit** dieser Adresse senden kann und nicht
mit der Hauptadresse, muss im Mandanten «Senden von Aliasen» eingeschaltet sein. Das geht
im Exchange-Admin-Center oder per PowerShell mit `Set-OrganizationConfig -SendFromAliasEnabled $true`.
Sonst geht jede Outreach-Mail als `…@advisori.ch` raus.

`noreply@zeugnio.ch` bekommt **kein** Postfach. Wer darauf antwortet, erhält eine
Unzustellbarkeitsmeldung. Damit Antworten trotzdem ankommen, setzt Schritt 7 in Vercel
`EMAIL_REPLY_TO=support@zeugnio.ch`.

## Wer was tut

Alle Schritte laufen über Silvans Konten (Vercel-Dashboard, M365-Admin). Nötig ist im
M365-Mandanten die Rolle **Globaler Administrator** oder **Domänennamenadministrator**.
Hat Silvan sie nicht, macht Patrick bzw. die advisori-IT die Schritte 2, 3 und 5.

**Wo die DNS-Einträge hinkommen:** Solange die Nameserver auf Vercel zeigen, ins
Vercel-Dashboard (Domains → zeugnio.ch → DNS Records; Name leer lassen = Apex). Beim
Zonenumzug (Cutover 0.1a) werden sie mit abgeschrieben. Steht der Umzug in den nächsten
zwei, drei Tagen an, zuerst umziehen und F1 gleich bei Infomaniak eintragen; sonst F1 jetzt
bei Vercel. Die Einträge laufen bei beiden Anbietern gleich.

## Ablauf

Die Reihenfolge verhindert, dass Mails verloren gehen: erst die Postfächer, dann der MX.

| # | Schritt | Wo | Prüfung danach |
|---|---|---|---|
| 1 | **Resend-Empfang ansehen.** Resend-Dashboard → Receiving (bzw. Inbound): Gibt es empfangene Mails, eine Weiterleitung oder einen Webhook? Echte Kundenmails von Hand an `support@` weiterleiten, sobald es existiert | Resend | Liste ist leer oder gesichtet |
| 2 | **Domain in M365 hinzufügen:** admin.microsoft.com → Einstellungen → Domänen → Domäne hinzufügen → `zeugnio.ch`. Prüfart «TXT-Eintrag». **«Ich füge die DNS-Einträge selbst hinzu»** wählen, Vercel ist kein automatisch verbundener Anbieter. Als Dienst nur «Exchange und Exchange Online Protection» ankreuzen | M365 + Vercel: TXT `MS=ms…` am Apex | M365 meldet «Domäne bestätigt». Der TXT bleibt stehen |
| 3 | **Adressen anlegen** wie in der Tabelle oben. «Senden von Aliasen» prüfen | M365 / Exchange-Admin-Center | Postfächer erscheinen in der Liste |
| 4 | **MX umstellen, Autodiscover und SPF setzen.** Die Werte zeigt M365 im Assistenten. **MX aus dem Assistenten abschreiben, nicht raten:** Neue Domänen bekommen oft die Form `zeugnio-ch.<kürzel>.mx.microsoft` statt `zeugnio-ch.mail.protection.outlook.com`. Dann den alten MX `inbound-smtp.eu-west-1.amazonaws.com` **löschen** (zwei MX mit gleicher Priorität verteilen die Mails auf beide Systeme). Dazu CNAME `autodiscover` → `autodiscover.outlook.com` und TXT am Apex `v=spf1 include:spf.protection.outlook.com ~all` | Vercel | `Resolve-DnsName zeugnio.ch -Type MX` zeigt nur Microsoft. Testmail von einer privaten Adresse an `silvan@zeugnio.ch` kommt in Outlook an |
| 5 | **DKIM bei Microsoft einschalten:** security.microsoft.com → E-Mail und Zusammenarbeit → Richtlinien → E-Mail-Authentifizierung → DKIM → `zeugnio.ch`. Microsoft zeigt zwei CNAME (`selector1._domainkey`, `selector2._domainkey`) mit Zielen im Mandanten. **Beide genau so** in Vercel eintragen, warten, bis sie auflösen (Minuten bis eine Stunde), dann «Aktivieren» | Defender + Vercel | Status «Gültig, signiert DKIM-Signaturen für diese Domäne» |
| 6 | **DMARC setzen:** TXT `_dmarc` = `v=DMARC1; p=none; rua=mailto:dmarc@zeugnio.ch; fo=1` | Vercel | `Resolve-DnsName _dmarc.zeugnio.ch -Type TXT` liefert den Wert |
| 7 | **Antwortadresse der App:** In Vercel (Project → Settings → Environment Variables, Production) `EMAIL_REPLY_TO=support@zeugnio.ch` setzen und neu deployen. Auf advisori01 dieselbe Variable in die `.env` | Vercel, advisori01 | Antwort auf eine Einladungsmail landet in `support@` |
| 8 | **Datenschutzseite nachziehen** (siehe unten). Erst committen, wenn Schritt 4 gelaufen ist | Repo, PR | Seite nennt Microsoft für den Empfang |
| 9 | **Gegenprobe**, siehe «Prüfen» | Gmail, Outlook.com, Bluewin | alles `pass` |

**Verschärfen, nicht jetzt:** Nach zwei bis vier Wochen DMARC-Berichte ohne fremde
Absender `~all` auf `-all` und `p=none` auf `p=quarantine` stellen, später auf `p=reject`.
Vorher prüfen, ob etwas Drittes mit `@zeugnio.ch` sendet, zum Beispiel das CRM, ein
Newsletter-Werkzeug oder Stripe-Belege. Die Berichte sind XML-Dateien. Lesbar werden sie
mit einem Auswerter, zum Beispiel dem kostenlosen von dmarcian oder Postmark. Die Berichte
enthalten nur IP-Adressen und Zählungen, keine Mailinhalte.

## Datenschutzseite (Schritt 8)

`RECIPIENTS` in `app/legal/privacy/page.tsx:32-37`. Heute steht bei Resend «Versand … und
Empfang von E-Mails an Adressen @zeugnio.ch». Nach Schritt 4 stimmt das nicht mehr:

- Bei Resend den Empfang streichen. Übrig bleibt «Versand von E-Mails (Anmeldelinks,
  Einladungen, Freigaben)».
- **Microsoft neu aufnehmen**, Aufgabe «Empfang von E-Mails an Adressen @zeugnio.ch und
  Korrespondenz mit Kundinnen und Kunden». Den **Speicherort** nicht raten: In
  admin.microsoft.com → Einstellungen → Organisationseinstellungen → Organisationsprofil →
  «Datenspeicherort» nachsehen (laut `standards/datenschutz.md` im Hub noch offen).
  Vertragspartner (Microsoft Ireland Operations Ltd.) und Rechtsgrundlage ebenfalls aus dem
  M365-Vertrag übernehmen.

Die Seite ist noch nicht juristisch geprüft. Die neue Zeile gehört in dieselbe Prüfung.

## Prüfen

In Windows PowerShell:

```powershell
Resolve-DnsName zeugnio.ch -Type MX -Server 1.1.1.1
Resolve-DnsName zeugnio.ch -Type TXT -Server 1.1.1.1 | Select-Object -Expand Strings
Resolve-DnsName _dmarc.zeugnio.ch -Type TXT -Server 1.1.1.1 | Select-Object -Expand Strings
Resolve-DnsName selector1._domainkey.zeugnio.ch -Type CNAME -Server 1.1.1.1
```

Danach zwei Testmails an je eine Gmail-, Outlook.com- und Bluewin-Adresse:

1. **Aus Outlook** mit Absender `silvan@zeugnio.ch`.
2. **Aus der App**, zum Beispiel ein Anmeldelink.

Im Kopf der empfangenen Mail steht `Authentication-Results`. In Gmail findest du ihn über
⋮ → «Original anzeigen». Für die Outlook-Mail müssen `spf=pass`, `dkim=pass` und
`dmarc=pass` dastehen. Für die App-Mail genügen `dkim=pass` mit `header.d=zeugnio.ch` und
`dmarc=pass`; SPF prüft dort `send.zeugnio.ch`. Diese Probe wird beim Wechsel zu
mailomat.swiss wiederholt.

## Altdomain zeugnix.ch (nicht Teil von F1)

Die Altdomain hat eine eigene Zone bei einem anderen Anbieter (`ch.pro.io`, `nl.pro.io`,
`p.dnh.net`), der Verwalter ist offen. Von dort sendet niemand mehr. Ohne SPF ist die
Domain aber ein bequemes Absenderkleid für Phishing mit dem alten Markennamen. Sobald
der Zugang geklärt ist:

```
zeugnix.ch          TXT   v=spf1 -all
_dmarc.zeugnix.ch   TXT   v=DMARC1; p=reject; rua=mailto:dmarc@zeugnio.ch
```

Für eine `rua`-Adresse auf einer anderen Domain verlangt der Standard eine Freigabe in der
Empfängerdomain, sonst verwerfen die meisten Berichterstatter die Berichte:
`zeugnix.ch._report._dmarc.zeugnio.ch  TXT  v=DMARC1`. Die 301-Weiterleitung von
`zeugnix.ch/verify/…` bleibt davon unberührt und muss bestehen bleiben.
