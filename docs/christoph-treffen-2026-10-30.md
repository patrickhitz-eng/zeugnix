# Treffen mit Christoph Senn (2026-10-30)

> Erstes persönliches Treffen nach mehreren Teams-Calls. Anlass war Christophs Mail vom
> 26.10.: Das Tool ist bei First im Einsatz, wie geht es mit Marktbearbeitung und weiteren
> Interessenten weiter? Silvan hat ihm die PowerPoint versprochen und mit dem Recap-Mail
> (unten) geschickt.

## Entscheid

**Outreach startet im Dezember 2026.** Dann sind die Budgetrunden abgeschlossen. Die
Firmen wissen, ob sie Stellen abbauen oder aufstocken und wie viel Recruiting ansteht.

## Besprochene Punkte (Silvan prüft und meldet sich)

| # | Punkt | Bezug zum heutigen Stand |
|---|---|---|
| 1 | **Lohntransparenz:** Arbeitgeber erfasst den Lohn, wer neu einsteigt, sieht die ungefähre Bandbreite. Kein Lohnpokern, wirkt als Ansporn. Lohnbänder definieren, Einteilung ±10–15 %. | Neu. zeugnio kennt heute keine Lohndaten. |
| 2 | **Bewusst Weggelassenes:** Defizite stehen meist nicht im Zeugnis, sie werden weggelassen. Das soll erfasst, ausgewertet und gespeichert werden können. | Neu. Hängt mit Christophs PDF zu negativen Tatsachen zusammen (Bundesgericht: «wahr, klar, vollständig»), das noch unbewertet ist. |
| 3 | **Mastervorlage pro Firma** als hinterlegte Maske. Die Bedienung muss so weit gehen, dass niemand mehr nach Word muss. | Teilweise da: Fusszeile pro Firma (`supabase/027_company_certificate_footer.sql`) und Word-Export (`lib/docx/certificate.ts`). Eine ganze Vorlage pro Firma gibt es noch nicht. |
| 4 | **Kombi-Abos** mit Kombi-Rabatt, wie bei Versicherungen oder Personio (dort DocuSign, qualifizierte Unterschrift über Swisscom und KI im Paket). | Preismodell offen, Stripe nur als Stub. |
| 5 | **Weitere Mehrwerte:** Für welche Auswertungen würde ein Arbeitgeber bezahlen? Wie landen wir die «Lucky Punches»? | Offene Frage. |
| 6 | **Gratisangebot:** Die Freebies sind begrenzt, für die meisten nutzbar, für manche nicht. | Als Feststellung notiert, nicht als Entscheid. |

## Rohnotizen (unverändert)

```text
Lohntransparenzgesetz

Als Arbeitsgeber den Lohn eintippen und der neue gseht in etwa in welcher range dass er ist. Dann hast du die Polerei nicht und es treibt auch an.

Lohnbänder definieren und dann einteilen plus minus 10-15%.

Was wir weggelassen? Wenn man Defizite hat wird es meistens nicht geschrieben und darum weggelassen und das müsste auch analzysiert und gespeichert werden können.

Eine Mastervorlage die für jede Firma vorgegeben ust als hinterlegte Maske. Die Benutzerfreundlichkeit muess soweit gehen, dass man es nicht mehr zu word runternehmen muss.

Kombo-Abo versionen mit Kombo-Rabatt und so spielchen wie bei den Versicherungen oder personio. Die haben solche Docu-Sign, qualifizierte Unterschrift über Swisscom und KI dabei.

Was gibt es sonst noch für Mehrwerte, die ein Arbeitgeber bezahlen würde bei der Analyse. Wie bekommen wir die lucky Punches.

Die Free-bees sind begrenzt, für die meisten nutzbar aber für manche auch nicht.

Dezember mit dem Outreach raus. Budgetrunden dann gemacht, man weiss ob man reduzieren oder erhöhen muss, Recruiting etc.
```

## Recap-Mail

**Betreff:** zeugnio: Recap unseres Treffens vom 30. Oktober
**Von:** silvan.schueck@advisori.ch · **Anhang:** PowerPoint

Hallo Christoph

Vielen Dank für den spannenden und angenehmen Austausch heute. Nach den vielen Teams-Calls
hat es mich sehr gefreut, dich endlich einmal persönlich zu treffen.

Wie versprochen findest du die PowerPoint im Anhang.

Entschieden haben wir, dass wir im Dezember mit dem Outreach starten. Dann sind die
Budgetrunden abgeschlossen. Die Firmen wissen, ob sie Stellen abbauen oder aufstocken und
wie viel Recruiting ansteht.

Diese Punkte haben wir besprochen:

1. **Lohntransparenz:** Der Arbeitgeber erfasst den Lohn, und wer neu einsteigt, sieht
   ungefähr, in welcher Bandbreite er liegt. Das erspart das Pokern um den Lohn und spornt
   zugleich an. Dafür definiert die Firma Lohnbänder und teilt die Mitarbeitenden mit rund
   ±10–15 % ein.
2. **Was bewusst weggelassen wird:** Defizite stehen meist nicht im Zeugnis, sie werden
   einfach weggelassen. Auch das sollte sich in zeugnio festhalten, auswerten und speichern
   lassen.
3. **Mastervorlage pro Firma:** Jede Firma bekommt eine fest hinterlegte Vorlage als
   Maske. Die Bedienung muss so gut sein, dass niemand das Zeugnis mehr in Word
   nachbearbeiten muss.
4. **Kombi-Abos:** Abo-Varianten mit Kombi-Rabatt, ähnlich wie bei Versicherungen oder bei
   Personio. Dort sind DocuSign, die qualifizierte Unterschrift über Swisscom und KI im
   Paket enthalten.
5. **Weitere Mehrwerte:** Für welche zusätzlichen Auswertungen würde ein Arbeitgeber
   bezahlen, und wo landen wir die «Lucky Punches»?
6. **Gratisangebot:** Die Freebies bleiben begrenzt. Für die meisten reichen sie, für
   manche aber nicht.

Ich schaue mir diese Punkte genauer an und gebe dir Bescheid.

Liebe Grüsse
Silvan

## Antwort vom 3.11. (Entwurf)

Grundlage ist der Outreach-Plan vom 3.11. (`.claude/plans/2026-11-03-outreach-dezember.md`, nicht
in Git). Geprüft am 3.11.:
- **Lohngleichheitsanalyse** nach dem Gleichstellungsgesetz: ab 100 Mitarbeitenden, alle vier
  Jahre, befristet bis 1.7.2032 ([BJ](https://www.bj.admin.ch/de/verwirklichung-der-lohngleichheit)).
- **EU-Richtlinie 2023/970** zur Lohntransparenz: gilt in der EU ab 7.6.2026. Laut
  [EFTA-Factsheet](https://www.efta.int/eea-lex/32023l0970) noch nicht ins EWR-Abkommen
  übernommen.

**Betreff:** AW: zeugnio: Recap unseres Treffens vom 30. Oktober
**Anhang:** `zeugnio-Bausteine-Entwurf-2026-11-03.docx` (Kopie von `docs/bausteine-uncodiert-entwurf-2026-11-03.docx`)

Hallo Christoph

Wie versprochen melde ich mich zu den Punkten von Freitag. Ich habe sie mir angeschaut und
daraus einen Plan für den Start im Dezember gemacht.

**Der Plan in Kürze**

- Am **Dienstag, 1. Dezember**, starte ich mit dem Outreach in der Deutschschweiz und in
  Liechtenstein. Ich spreche alle Firmen an. Besonders interessant sind grössere Firmen mit HR,
  Behörden und Branchen mit vielen Austritten.
- Wir starten mit **Pilotfirmen**. Sie nutzen zeugnio bis 31. März 2027 gratis und geben uns
  dafür in einem Gespräch Feedback. Bis Ende Januar wollen wir möglichst viele Firmen gewinnen,
  die mindestens ein Zeugnis finalisiert haben.
- Bis zum Start sollen vier Dinge fertig sein:
  - mehrere Benutzer pro Firma mit Rollen
  - eine Mastervorlage pro Firma
  - Export und Löschen der eigenen Daten
  - überarbeitete Bausteine für «genügend» und «ungenügend»
- **Eine Korrektur zu meinen Folien:** Der Umzug in die Schweiz zu nine ist vorbereitet, aber
  noch nicht abgeschlossen. Die Umschaltung ist für Ende November geplant, also vor dem Start.
  Danach liegen Datenbank und Anwendung in Zürich.

**Zu den sechs Punkten**

1. **Lohntransparenz:** Ein Schweizer «Lohntransparenzgesetz» gibt es nicht.
   - Am nächsten kommt die Lohngleichheitsanalyse nach dem Gleichstellungsgesetz: Pflicht ab
     100 Mitarbeitenden, alle vier Jahre, befristet bis 2032.
   - Die EU-Richtlinie zur Lohntransparenz gilt in der EU seit Juni 2026. Ins EWR-Abkommen und
     damit für Liechtenstein ist sie nach meinem Stand noch nicht übernommen.

   Lohnbänder in zeugnio sind machbar. Ich würde sie im Dezember und Januar mit den Pilotfirmen
   konkretisieren, statt sie auf Verdacht zu bauen.
2. **Bewusst Weggelassenes:** Geplant für Dezember. HR hält intern fest, was bewusst nicht ins
   Zeugnis kommt und warum. Diese Notiz landet nie im Zeugnis.
   - Das passt zu deinem PDF zu negativen Tatsachen: Wenn ein Zeugnis wahr und vollständig sein
     muss, hilft im Streitfall eine saubere Begründung.
   - Dazu kommen neue, uncodierte Bausteine für «genügend» und «ungenügend». Den Entwurf
     findest du im Anhang zur Durchsicht.
3. **Mastervorlage pro Firma:** Kommt vor dem Start. Die Admin-Person legt pro Firma fest:
   - Stil und Marke
   - Fusszeile und Unterzeichnende
   - Standardwerte, zum Beispiel für den Schlusssatz
   - ob der Hash im Dokument steht

   HR übernimmt die Vorlage und kann sie nicht ändern. Fehlt aus deiner Sicht etwas, damit
   niemand mehr nach Word muss?
4. **Kombi-Abos:** Das Preismodell legen wir bis Ende März fest, wenn die Pilotphase endet. Eine
   qualifizierte elektronische Unterschrift, etwa über Swisscom oder Skribble, prüfe ich als
   Zusatz zum Abo.
5. **Weitere Mehrwerte:** Meine Kandidaten sind:
   - Zeugnisse von Bewerbenden entschlüsseln und prüfen
   - Zwischenzeugnisse automatisch anstossen, etwa bei einem Vorgesetztenwechsel
   - eine Prüfung auf Widersprüche und Codes
   - Auswertungen über alle Zeugnisse, etwa Notenverteilung und Austrittsgründe
   - Zeugnisse auf Französisch, Italienisch und Englisch
   - ein Zugang für ehemalige Mitarbeitende zu ihrem Zeugnis

   Welche davon würde First bezahlen? Dieselbe Frage stelle ich auch den Pilotfirmen.
6. **Gratisangebot:** Erstellen bleibt gratis. Wo die Grenze liegt, entscheiden wir mit den
   Erfahrungen aus der Pilotphase.

**Benutzer und Rollen**

Jeder Kunde bekommt eine Organisation mit einer oder mehreren Firmen.
- Die Admin-Person, zum Beispiel die Head of HR, lädt Kolleginnen und Kollegen über ihre
  Mailadresse ein.
- Sie vergibt pro Firma eine Rolle:
  - **HR:** erstellt und bearbeitet Zeugnisse
  - **Freigabe:** darf zusätzlich finalisieren
  - **Lesen:** darf nur ansehen
- Sie kann festlegen, dass nur Adressen der eigenen Firmendomain eingeladen werden dürfen.

Für First hiesse das: eine Organisation, darunter die fünf Marken.

**Eine Frage an dich:** Ich würde First in Gesprächen nur mündlich erwähnen, ohne Namen oder Logo
in Unterlagen. Ist das für dich in Ordnung?

Liebe Grüsse
Silvan
