# E-Mail-Authentifizierung: SPF und DMARC nachtragen

> Teil von Etappe 0 des CH-Migrationsplans. Reine DNS-Arbeit, kein Code.
> Stand der Messung: 2026-09-25 (`Resolve-DnsName`).

## Was heute da ist

| Name | Typ | Wert | Bewertung |
|---|---|---|---|
| `zeugnio.ch` | MX | `inbound-smtp.eu-west-1.amazonaws.com` | Eingehende Mail liegt bei AWS SES in Irland — im Migrationsplan als offener Punkt geführt |
| `zeugnio.ch` | TXT (SPF) | **fehlt** | ✗ |
| `_dmarc.zeugnio.ch` | TXT | **fehlt** | ✗ |
| `send.zeugnio.ch` | TXT (SPF) | `v=spf1 include:amazonses.com ~all` | ✓ Return-Path von Resend |
| `send.zeugnio.ch` | MX | `feedback-smtp.eu-west-1.amazonses.com` | ✓ Bounces |
| `resend._domainkey.zeugnio.ch` | TXT | DKIM-Public-Key | ✓ signiert mit `d=zeugnio.ch` |
| `_dmarc.zeugnix.ch` | TXT | `v=DMARC1; p=none;` | Altdomain, kein SPF |

Der Versand funktioniert also und ist DKIM-signiert. Die Lücke ist eine andere: Weil am
Apex weder SPF noch DMARC steht, kann **jeder** Mails mit Absender `@zeugnio.ch`
verschicken, ohne dass ein Empfänger etwas prüfen könnte. Für ein Produkt, das
Fälschungssicherheit verkauft und dessen Einladungsmails Zeugnis-Links enthalten, ist das
die falsche Reihenfolge.

## Was einzutragen ist

**1. SPF am Apex** — verhindert Spoofing über den Envelope-Absender.

```
Name:  zeugnio.ch   (bzw. @)
Typ:   TXT
Wert:  v=spf1 include:amazonses.com ~all
```

`~all` (Softfail) statt `-all`, bis geklärt ist, ob noch etwas anderes mit Absender
`@zeugnio.ch` verschickt — ein Newsletter-Werkzeug, ein Ticketsystem, eine Mailbox bei
einem anderen Anbieter. Erst wenn die DMARC-Berichte zwei Wochen lang keine fremden
Quellen zeigen, auf `-all` verschärfen.

**2. DMARC am Apex** — macht die Prüfung für Empfänger verbindlich und liefert Berichte.

```
Name:  _dmarc.zeugnio.ch
Typ:   TXT
Wert:  v=DMARC1; p=none; rua=mailto:dmarc@zeugnio.ch; fo=1; adkim=r; aspf=r
```

Start mit `p=none`: beobachten, nicht blockieren. Nach zwei bis vier Wochen ohne
Fremdquellen auf `p=quarantine`, später `p=reject`.

Die `rua`-Adresse muss tatsächlich gelesen werden. Liegt sie auf einer **anderen**
Domain (z. B. `@advisori.ch`), verlangt der Standard dort eine Freigabe, sonst verwerfen
die meisten Berichterstatter die Reports stillschweigend:

```
Name:  zeugnio.ch._report._dmarc.advisori.ch
Typ:   TXT
Wert:  v=DMARC1
```

**3. Altdomain `zeugnix.ch` abdichten** — von dort versendet niemand mehr, die QR-Codes
älterer Zeugnisse zeigen aber weiterhin darauf. Eine Domain ohne SPF ist ein bequemes
Absenderkleid für Phishing mit dem alten Markennamen:

```
Name:  zeugnix.ch    TXT   v=spf1 -all
Name:  _dmarc.zeugnix.ch   TXT   v=DMARC1; p=reject; rua=mailto:dmarc@zeugnio.ch
```

Das betrifft nur E-Mail. Die 301-Weiterleitung von `zeugnix.ch/verify/...` bleibt davon
unberührt und muss dauerhaft bestehen bleiben.

## Prüfen

```powershell
Resolve-DnsName zeugnio.ch -Type TXT | Select-Object -Expand Strings
Resolve-DnsName _dmarc.zeugnio.ch -Type TXT | Select-Object -Expand Strings
```

Danach eine Testmail aus der Anwendung an je eine Gmail-, Outlook- und Bluewin-Adresse
schicken und im Kopf der empfangenen Mail `spf=`, `dkim=` und `dmarc=` nachlesen. Alle
drei müssen `pass` zeigen. Das ist auch der Test, der vor dem Wechsel des Mailanbieters
in der Schweiz wiederholt wird.
