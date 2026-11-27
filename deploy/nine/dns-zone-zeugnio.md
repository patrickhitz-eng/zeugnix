# DNS-Zone zeugnio.ch: von Vercel zu Infomaniak (Cutover 0.1)

> Stand: **17.11.2026**, direkt bei Vercels Nameservern `ns1/ns2.vercel-dns.com` gemessen
> (autoritativ, nicht über einen Resolver). Ergänzt `cutover-reihenfolge.md` 0.1a–0.1d.
> Prüfskript daneben: `zone-vergleich.ps1`.
>
> **Nachtrag 27.11.2026: Die Zone liegt jetzt auf `nsany1/nsany2.infomaniak.com`.** Der
> Infomaniak-Manager bearbeitet die Zone auf `nsany`, nicht die auf `ns11/ns12`. Die
> Registry führte `nsany`, und die .ch-Zone delegiert seit 13:37 dorthin. Vorher waren beide
> Zonen bis auf die drei Änderungen dieses Tages gleich (A, MX, SPF, `send`, `_vercel`, DKIM
> über die vollen Werte verglichen), es gab also keinen Ausfall wie am 20.11. Seither gilt:
> - CAA nur noch `0 issue "letsencrypt.org"` und `0 issuewild ";"` (Schritt 6.1).
> - `_dmarc` = `v=DMARC1; p=quarantine; adkim=r; aspf=r`.
> - Der A-Eintrag `test` ist gelöscht, `test.zeugnio.ch` gibt es nicht mehr.
> - Die Zone auf `ns11/ns12` ist verwaist. Gemessen wird bei den Servern, an die `.ch`
>   delegiert: `nslookup -type=NS zeugnio.ch a.nic.ch`. `zone-vergleich.ps1` ist mit dem
>   Umzug von Vercel zu Infomaniak erledigt; sein Vorgabewert `-Neu ns11.infomaniak.ch`
>   stimmt nicht mehr.
>
> Die Tabellen unten zeigen Vercels Zone vom 17.11., also den Stand vor dem Umzug zu
> Infomaniak am 20.11.

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
  gibt es den Transfer-Code (A1).
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
| `*` | A | Vercel-Pool wie am Apex (im Dashboard: `ALIAS` → `cname.vercel-dns-017.com`) | 1800 | **nein** |
| `_domainconnect` | CNAME | `_domainconnect.vercel-dns.com` (im Dashboard nicht sichtbar) | 3600 | **nein** |
| `@` | NS, SOA | Vercel | 86 400 / 3600 | nein, setzt Infomaniak selbst |

Nicht vorhanden: AAAA, TXT am Apex (also kein SPF), `_dmarc`, DNSSEC.

**Voller Wert für `resend._domainkey`** (öffentlicher Schlüssel, 218 Zeichen, ein Feld):

```
p=MIGfMA0GCSqGSIb3DQEBAQUAA4GNADCBiQKBgQDJeihRhf2+jGX9hTdj2F42A0tQJHw+OMCA+zH/XolqnbDszL6BXRIu+au1tjdaVsGVuPOT/zAAJJWN4nRDUGPccZV+W9hXtzKfbFP0kd1nZTbTDqq8AP8myi7BLeA27M1L7sh3+JbiLGST6zrSIayy5J0eofm3qEScWL/0F2ll3QIDAQAB
```

### Warum vier A-Einträge am Apex

Im Vercel-Dashboard steht am Apex kein A-Eintrag, sondern ein `ALIAS` auf
`cname.vercel-dns-017.com`, gesperrt und von Vercel verwaltet. Am Apex ist ein CNAME im
DNS nicht erlaubt, weil dort schon SOA und NS stehen. `ALIAS` ist Vercels Umweg: Der
Nameserver löst das Ziel selbst auf und antwortet mit dessen A-Adressen. Bei einem anderen
Anbieter trägt man darum die Adressen ein, die das Ziel liefert. `cname.vercel-dns-017.com`
liefert direkt bei seinem Nameserver denselben Pool, abwechselnd `.1` und `.65` (18.11.,
achtmal abgefragt).

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

## Ablauf: Transfer zuerst (Stand 18.11.)

Im Infomaniak-Manager lässt sich keine Zone für eine fremde Domain anlegen, nur ein Transfer
(Silvan, 18.11., CHF 5.40). Darum gilt die Reihenfolge 0.1a, 0.1d, 0.1b, 0.1c: erst
übertragen, dann die Zone füllen, dann die Nameserver umstellen. Dabei geht es um drei
verschiedene Dinge:

- **Registrar:** bei wem die Domain registriert ist und bezahlt wird. Heute Vercel, nach
  Teil A Infomaniak.
- **Nameserver:** welche Server die Registry für `zeugnio.ch` nennt. Heute die von Vercel.
- **Zone:** die Einträge auf diesen Servern.

Der Transfer wechselt nur den Registrar. Bleiben die Nameserver dabei bei Vercel, merkt
niemand etwas davon. Erst Teil C schaltet auf die neue Zone um.

**Schritt 0, erledigt 18.11.:** Im Vercel-Dashboard (Team «advisori GmbH» → Domains →
`zeugnio.ch` → DNS Records) stehen 13 Zeilen, alle in der Tabelle oben.

### Teil A: Domain übertragen (0.1d)

| # | Schritt | Prüfung |
|---|---|---|
| A1 | Vercel, Team «advisori GmbH» → Domains → `zeugnio.ch`: Transfer-Code (Auth-Code) anzeigen lassen. **Die Domain in Vercel nicht entfernen.** Dieser Eintrag trägt die Zone, über die `zeugnio.ch` läuft, bis Teil C fertig ist | Code liegt vor |
| A2 | Infomaniak → Domain übertragen → `zeugnio.ch`, Code eingeben, bezahlen. Konto und Inhaber: advisori GmbH. **Fragt das Formular nach DNS oder Nameservern: die bestehenden behalten** (`ns1.vercel-dns.com`, `ns2.vercel-dns.com`). Bietet es nur «DNS von Infomaniak» an: abbrechen. Sonst zeigt `zeugnio.ch` sofort auf eine leere Zone, und Seite und Anmeldemails sind weg | — |
| A3 | Prüfen mit den zwei Befehlen unten: Registrar ist Infomaniak, die Nameserver sind weiter die von Vercel, und Vercel beantwortet die Zone noch. `zeugnio.ch` lädt im Browser | alles erfüllt |

> **Gelernt am 20.11. (so ist es passiert):**
> - **Der Transfer setzt die Nameserver selbst.** Infomaniak hat ungefragt `nsany1/nsany2.infomaniak.com` eingetragen. Diese Server liefern nur eine Parkzone aus: kein A, kein MX, `v=spf1 -all` und `_dmarc` `p=reject`. Das heisst: Seite weg, und jede Mail von `zeugnio.ch` wird abgewiesen. Gleich nach dem Transfer im Manager unter **Domain → DNS-Server bearbeiten** prüfen und auf `ns1/ns2.vercel-dns.com` zurückstellen.
> - **Die Registry veröffentlicht verzögert.** RDAP zeigt die Datenbank, also jede Änderung sofort. Die Zone, die `a.nic.ch` ausliefert, kommt erst eine Weile später. Am 20.11. zeigte RDAP um 11:01 wieder Vercel, `a.nic.ch` veröffentlichte gegen 11:20 trotzdem noch `nsany`. Zurückstellen kann einen Ausfall also verkürzen, aber nicht sicher verhindern. Ob es geklappt hat, zeigt nur `nslookup -norecurse -type=NS zeugnio.ch a.nic.ch`, nicht RDAP.
> - **Die Zone liegt auf `ns11/ns12.infomaniak.ch`,** nicht auf `nsany`. Für B3 also `-Neu ns11.infomaniak.ch`, und für C1 genau diese zwei Namen eintragen. **Überholt seit 27.11.:** Der Infomaniak-Manager bearbeitet die Zone auf `nsany1/nsany2.infomaniak.com`, und die .ch-Zone delegiert seit 13:37 dorthin; `ns11/ns12` ist verwaist (Nachtrag oben).
> - **Eingabe bei Infomaniak:** Der DKIM-Eintrag geht nur über den Typ «DKIM», nicht über TXT; Ergebnis ist derselbe TXT-Wert. Die Vorgabe-TTL ist 3600, die 300 also bei jedem Eintrag von Hand setzen.

Nicht geprüft ist, was Vercel nach dem Transfer mit der Zone macht. Erwartet ist, dass
Vercel die Domain als fremd registrierte Domain mit Vercel-Nameservern weiterführt und die
Zone weiter beantwortet, wie bei jeder Domain, die anderswo gekauft wurde und auf Vercel
zeigt. Darum gleich A3 prüfen und Teil B direkt anschliessen. Antwortet Vercel nicht mehr,
Teil B und C sofort durchziehen, ohne zu warten.

```powershell
$r = Invoke-RestMethod https://rdap.nic.ch/domain/zeugnio.ch; $r.entities.vcardArray[1] | Where-Object { $_[0] -eq 'org' } | ForEach-Object { 'Registrar: ' + $_[3] }; $r.nameservers.ldhName | ForEach-Object { 'Nameserver: ' + $_ }
```

```powershell
Resolve-DnsName zeugnio.ch -Type A -Server ns1.vercel-dns.com
```

Vor dem Transfer (18.11.) zeigt der erste Befehl `Registrar: Key-Systems GmbH` und die zwei
Vercel-Nameserver. Der zweite zeigt zwei Adressen aus dem Pool.

### Teil B: Zone bei Infomaniak füllen (0.1b)

| # | Schritt | Prüfung |
|---|---|---|
| B1 | Infomaniak → `zeugnio.ch` → DNS-Zone. **Vorgaben entfernen:** Eine neue Zone kann Einträge von Infomaniak enthalten, zum Beispiel eine Parkseite, MX, SPF oder `autoconfig`. Alles löschen, was nicht in der Tabelle oben steht | Zone enthält nur die Tabelle |
| B2 | Die Einträge aus der Tabelle eintragen, mit der TTL aus der letzten Spalte (wo nichts steht, die Vorgabe von Infomaniak) | — |
| B3 | Prüfskript laufen lassen (Befehl unten). `-Neu` ist der erste Nameserver, den Infomaniak für die Zone nennt | Skript meldet **BEREIT** |

### Teil C: Nameserver umstellen (0.1c)

| # | Schritt | Prüfung |
|---|---|---|
| C1 | **Infomaniak** → `zeugnio.ch` → Nameserver auf die von Infomaniak umstellen. Nach dem Transfer geht das bei Infomaniak, nicht mehr bei Vercel | — |
| C2 | **24 Stunden nichts ändern**, weder bei Vercel noch bei Infomaniak. Danach prüfen: `Resolve-DnsName zeugnio.ch -Type NS -Server 1.1.1.1` zeigt Infomaniak, `zeugnio.ch` lädt, ein Anmeldelink kommt an | alles drei erfüllt |
| C3 | F1 (`docs/dns-spf-dmarc.md`) direkt bei Infomaniak: M365-Bestätigung, MX, `autodiscover`, SPF, DKIM, DMARC | wie in F1 beschrieben |
| C4 | Die Domain bleibt im Vercel-Team «advisori GmbH» stehen, bis 6.4. Das Projekt braucht sie, solange Vercel `zeugnio.ch` ausliefert. Die `_vercel`-TXT dazu stehen jetzt in der Infomaniak-Zone | — |

**Zeitplan:** Teil A bis C am **Do 19.11.** in einem Zug, weil ein `.ch`-Transfer mit Code
meist schnell durch ist. Dann endet die Parallelzeit am Fr 20.11., F1 kann ab Freitag laufen,
und am Di 24.11. gilt überall TTL 300. Steht das bis Fr 20.11. nicht, gilt der Ausweg: TTL
am Apex bei Vercel auf 300 senken, das Fenster mit Vercel-DNS fahren und alles Übrige nach
dem Umzug, aber vor 6.4 erledigen.

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
vermutlich bei ihm. In Vercel war `zeugnix.ch` darum nur als externe Domain geführt (Projekt am
25.11. gelöscht). **Überholt 21.11.:** `zeugnix.ch` wird nicht umgeleitet, sondern aufgegeben
(`cutover-reihenfolge.md`, 6.4).
