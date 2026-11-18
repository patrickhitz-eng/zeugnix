# DNS-Zone zeugnio.ch: von Vercel zu Infomaniak (Cutover 0.1)

> Stand: **17.11.2026**, direkt bei Vercels Nameservern `ns1/ns2.vercel-dns.com` gemessen
> (autoritativ, nicht über einen Resolver). Ergänzt `cutover-reihenfolge.md` 0.1a–0.1d.
> Prüfskript daneben: `zone-vergleich.ps1`.

## Kurz erklärt

- Die **Zone** ist die Liste aller DNS-Einträge von `zeugnio.ch`. Die **Nameserver** sind
  die Server, die diese Liste beantworten. Die Registry für `.ch` verweist auf sie.
- Beim Wechsel der Nameserver merkt sich jeder Resolver die alte Antwort, bis ihre TTL
  abläuft. Vercel liefert die NS-Einträge mit **TTL 86 400 s, also einem Tag**. Bis zu 24
  Stunden fragen darum manche Resolver noch Vercel und andere schon Infomaniak.
- Daraus folgen zwei Regeln:
  1. Die neue Zone ist **vor** dem Wechsel identisch mit der alten. Das prüft
     `zone-vergleich.ps1`.
  2. In den **24 Stunden nach** dem Wechsel wird an keiner der beiden Zonen etwas geändert.
     Eine Änderung nur auf einer Seite hiesse: Die Hälfte der Welt sieht etwas anderes.
     Beim MX hiesse das, dass Mails auf zwei Systeme verteilt werden.
- DNSSEC ist nicht aktiv (kein DS-Eintrag bei `.ch`, gemessen 17.11.). Es braucht also
  keinen Schlüsseltausch.

## Wo die Domain liegt (geklärt 18.11.)

- **Gekauft über Vercel** am 24.07.2026 (Vercel-Beleg, zusammen mit `zeugnio.com`).
  Verwaltet wird sie im Vercel-Team **«advisori GmbH»** (Kennung `advisori-gmb-h`). Dort
  geschehen Schritt 0, 5 und 8.
- **Registrar laut Registry:** Key-Systems GmbH. Über Key-Systems registriert Vercel
  `.ch`-Domains. Bei `.com` ist es Name.com.
- **Das Projekt «zeugnix»** liegt in einem anderen Team, «patrickhitz-eng's projects». Es
  benutzt die Domain aus dem Team «advisori GmbH». Die zwei `_vercel`-TXT in der Zone sind
  Vercels Bestätigung dafür. In der Domainliste von Patricks Team erscheint `zeugnio.ch`
  darum nicht. Wer dort sucht, findet nur `zeugnix.ch`.

### zeugnio.com

Mitgekauft und im selben Team: Nameserver Vercel, Registrar Name.com, läuft bis
**24.07.2027**. Die Domain zeigt auf kein Deployment (Vercel antwortet 404
`DEPLOYMENT_NOT_FOUND`). Für den Umzug spielt sie keine Rolle. Vor 6.4 braucht es aber einen
Entscheid: zu Infomaniak übertragen oder auslaufen lassen. Kündigt man Vercel, ohne zu
entscheiden, läuft sie im Juli 2027 aus.

## Was bei Vercel steht und was mitkommt

`@` heisst Apex, also `zeugnio.ch` selbst. Bei Infomaniak bleibt das Namensfeld dafür leer.

| Name | Typ | Wert | TTL heute | Neu bei Infomaniak |
|---|---|---|---|---|
| `@` | A | `216.198.79.1` | 1800 | **ja, TTL 300** |
| `@` | A | `216.198.79.65` | 1800 | **ja, TTL 300** |
| `@` | A | `64.29.17.1` | 1800 | **ja, TTL 300** |
| `@` | A | `64.29.17.65` | 1800 | **ja, TTL 300** |
| `@` | MX | `10 inbound-smtp.eu-west-1.amazonaws.com` | 3600 | ja (F1 ersetzt ihn später) |
| `@` | CAA | `0 issue "letsencrypt.org"` | 60 | ja |
| `@` | CAA | `0 issue "pki.goog"` | 60 | ja |
| `@` | CAA | `0 issue "sectigo.com"` | 60 | ja |
| `www` | CNAME | `f7ce91cbe36539da.vercel-dns-016.com` | 60 | ja, TTL 300 |
| `test` | A | `5.148.171.221` | 60 | ja, TTL 300 |
| `send` | MX | `10 feedback-smtp.eu-west-1.amazonses.com` | 3600 | ja |
| `send` | TXT | `v=spf1 include:amazonses.com ~all` | 3600 | ja |
| `resend._domainkey` | TXT | DKIM-Schlüssel von Resend, voller Wert unten | 3600 | ja. **Ohne ihn kommen keine Anmeldemails an** |
| `_vercel` | TXT | `vc-domain-verify=zeugnio.ch,f3a6e670919930ccc526` | 60 | ja |
| `_vercel` | TXT | `vc-domain-verify=www.zeugnio.ch,01ea6ff70b4bb504056a` | 60 | ja |
| `*` | A | Vercel-Pool wie am Apex | 1800 | **nein** |
| `_domainconnect` | CNAME | `_domainconnect.vercel-dns.com` | 3600 | **nein** |
| `@` | NS, SOA | Vercel | 86 400 / 3600 | nein, setzt Infomaniak selbst |

Nicht vorhanden: AAAA, TXT am Apex (also kein SPF), `_dmarc`, DNSSEC.

**Voller Wert für `resend._domainkey`** (öffentlicher Schlüssel, 218 Zeichen, ein Feld):

```
p=MIGfMA0GCSqGSIb3DQEBAQUAA4GNADCBiQKBgQDJeihRhf2+jGX9hTdj2F42A0tQJHw+OMCA+zH/XolqnbDszL6BXRIu+au1tjdaVsGVuPOT/zAAJJWN4nRDUGPccZV+W9hXtzKfbFP0kd1nZTbTDqq8AP8myi7BLeA27M1L7sh3+JbiLGST6zrSIayy5J0eofm3qEScWL/0F2ll3QIDAQAB
```

### Warum vier A-Einträge am Apex

Vercel beantwortet den Apex nicht mit festen Werten. Jede Antwort enthält zwei von vier
Adressen, zufällig gemischt (17.11. zehnmal abgefragt). Wer heute `zeugnio.ch` aufruft,
landet auf einer dieser vier. Mit allen vier in der neuen Zone geht der Verkehr bis zum
Fenster genau dorthin, wo er heute hingeht. Das Prüfskript fragt Vercel darum zwölfmal
und akzeptiert jede Adresse aus diesem Pool, aber keine fremde.

### Warum der Wildcard wegfällt

Bei Vercel beantwortet `*` jeden Namen mit dem Vercel-Pool, auch `_dmarc`, `autodiscover`
oder `mail`. Gebraucht werden aber nur `www` und `test`: Andere Subdomains kommen im Code
und in der Doku nicht vor (Suche am 17.11.). Ohne Wildcard antworten unbekannte Namen mit
«gibt es nicht». F1 legt `autodiscover` und `_dmarc` danach gezielt an.

### CAA: neu gemessen

Die CAA-Einträge sagen, welche Zertifizierungsstellen für `zeugnio.ch` Zertifikate
ausstellen dürfen. Am 16.10. stand «keine» in `cutover-reihenfolge.md`. Das war vermutlich
eine Lücke der Messung: Windows kann CAA weder mit `Resolve-DnsName` noch mit `nslookup`
abfragen. Am 17.11. haben Vercels Nameserver, Cloudflare und Google übereinstimmend drei
Einträge gezeigt. Let's Encrypt ist erlaubt, also bleibt das Zertifikat im Fenster (5.7)
möglich. Die Zertifikate bei Vercel sind von Let's Encrypt und gelten bis 24./25.12.2026,
also über das Fenster hinaus.

- **Jetzt:** alle drei übernehmen, damit nichts anders ist als heute.
- **Nach dem Umzug (6.1):** auf `0 issue "letsencrypt.org"` reduzieren. `pki.goog` und
  `sectigo.com` braucht nur Vercel.
- Kann der Infomaniak-Manager keine CAA-Einträge anlegen, geht es auch ohne. Dann darf
  jede Stelle ausstellen. Das ist lockerer als heute, behindert aber nichts. Das Skript
  meldet es als Hinweis, nicht als Fehler.

## Ablauf

| # | Schritt | Prüfung |
|---|---|---|
| 0 | Vercel, oben links das Team **«advisori GmbH»** wählen, dann **Domains → `zeugnio.ch` → DNS Records** mit der Tabelle oben vergleichen. Per DNS findet man nur Namen, nach denen man fragt. Das Dashboard zeigt alle | keine Zeile im Dashboard, die oben fehlt |
| 1 | Im Infomaniak-Manager `zeugnio.ch` hinzufügen und die DNS-Zone anlegen. Lässt der Manager die Zone erst nach dem Transfer zu, gilt die Reihenfolge 0.1a, 0.1d, 0.1b, 0.1c aus `cutover-reihenfolge.md` | Manager zeigt die Zone und ihre zwei Nameserver |
| 2 | **Vorgaben entfernen.** Eine neu angelegte Zone kann Einträge von Infomaniak enthalten, zum Beispiel eine Parkseite, MX, SPF oder `autoconfig`. Alles löschen, was nicht in der Tabelle oben steht | Zone enthält nur die Tabelle |
| 3 | Die Einträge aus der Tabelle eintragen, mit der TTL aus der letzten Spalte (wo nichts steht, die Vorgabe von Infomaniak) | — |
| 4 | Prüfskript laufen lassen (Befehl unten). `-Neu` ist der erste Nameserver, den der Manager nennt | Skript meldet **BEREIT** |
| 5 | Vercel, Team «advisori GmbH» → Domains → `zeugnio.ch` → Nameservers: die zwei von Infomaniak eintragen. Das Skript zeigt sie am Schluss an | — |
| 6 | **24 Stunden nichts ändern**, weder bei Vercel noch bei Infomaniak. Danach prüfen: `Resolve-DnsName zeugnio.ch -Type NS -Server 1.1.1.1` zeigt Infomaniak, `zeugnio.ch` lädt, ein Anmeldelink kommt an | alles drei erfüllt |
| 7 | F1 (`docs/dns-spf-dmarc.md`) direkt bei Infomaniak: M365-Bestätigung, MX, `autodiscover`, SPF, DKIM, DMARC | wie in F1 beschrieben |
| 8 | Transfer der Domain (0.1d) mit dem Transfer-Code aus Vercel (Team «advisori GmbH»), spätestens vor 6.4 | RDAP bei `rdap.nic.ch` zeigt den neuen Registrar |

**Zeitplan:** Wechsel bis **Do 19.11.** Dann endet die Parallelzeit am Fr 20.11., F1 kann
ab Freitag laufen, und am Di 24.11. gilt überall TTL 300. Steht die Zone bis Fr 20.11.
nicht, gilt der Ausweg: TTL am Apex bei Vercel auf 300 senken, das Fenster mit Vercel-DNS
fahren und die Zone nach dem Umzug, aber vor 6.4 wegziehen.

## Prüfskript

In Windows PowerShell:

```powershell
powershell -ExecutionPolicy Bypass -File "$HOME\Desktop\zeugnix-1\deploy\nine\zone-vergleich.ps1" -Neu ns11.infomaniak.ch
```

`-ExecutionPolicy Bypass` gilt nur für diesen einen Aufruf. Ohne den Schalter führt Windows
Skripte je nach Einstellung gar nicht aus. Nennt der Manager andere Nameserver als `ns11.infomaniak.ch`, den Wert hinter
`-Neu` ersetzen.

Das Skript liest nur. Es fragt Vercel und den neuen Server direkt und prüft fünf Dinge:

1. Der neue Server ist für `zeugnio.ch` zuständig.
2. `@`, `www`, `test`, `send`, `resend._domainkey` und `_vercel` antworten gleich. Beim
   Apex genügt jede Auswahl aus Vercels Pool.
3. Namen, die bei Vercel nur den Wildcard treffen, sind neu leer.
4. Der Apex-A hat höchstens TTL 300.
5. CAA ist gleich wie bei Vercel, oder fehlt, sperrt aber Let's Encrypt nicht aus.

Geprüft am 17.11. mit Vercels zweitem Nameserver als «neu»: Es meldete genau die zwei
gewollten Unterschiede, Wildcard und TTL 1800. Gegen `ns11.infomaniak.ch` brach es ab,
weil die Zone dort noch nicht existiert.

**Nur vor dem Wechsel gültig.** Nach F1 stehen `autodiscover` und `_dmarc` bewusst in der
Zone, und das Skript meldet sie dann als Abweichung.

## Im Fenster (5.6) und der Rückweg

Bei Infomaniak, nicht mehr bei Vercel:

| | Umschalten (5.6) | Rückweg |
|---|---|---|
| `@` A | die vier Vercel-Adressen löschen, `5.148.171.221` eintragen | `5.148.171.221` löschen, die vier Adressen aus der Tabelle oben wieder eintragen |
| `www` | CNAME löschen, A `5.148.171.221` | A löschen, CNAME `f7ce91cbe36539da.vercel-dns-016.com` |

Das sind die Rückweg-Werte für 4.2. Ausgedruckt gehören sie neben den Laptop.

## Nicht Teil davon

`zeugnix.ch` hat eine eigene Zone bei der **Metanet AG**, die auch Registrar ist (RDAP und
SOA, 18.11.). Dieselben Nameserver haben Patricks andere Domains, das Konto liegt also
vermutlich bei ihm. In Vercel ist `zeugnix.ch` darum nur als externe Domain geführt. Die
Domain muss vor 6.4 auf advisori01 zeigen, siehe `cutover-reihenfolge.md`, «Entscheid zur
DNS-Zone».
