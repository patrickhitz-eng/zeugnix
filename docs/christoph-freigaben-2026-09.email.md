# E-Mail-Entwurf an Christoph Senn (Stand 2026-09-16)

> Entwurf zum Kopieren, Kürzen, Anpassen. Drei Punkte, alle mit konkreter Aktion.
> Wortlaut-Quelle für Punkt 1+2: `lib/phrases/schlusssaetze.ts`.

---

**Betreff:** Zeugnio – drei Freigaben von dir (Zwischenzeugnis-Sätze, Austrittsgrund, Schrift-Offerten)

Hallo Christoph

Kurz zum Stand und dann drei Punkte, bei denen ich auf dich angewiesen bin.

**Stand:** Die Sicherheitsarbeit ist abgeschlossen. Der Echtheitsnachweis deckt jetzt nicht mehr nur den Zeugnistext, sondern auch Arbeitgeber, Dokumenttitel und die Unterzeichnenden – ein ausgetauschter Briefkopf fällt bei der Prüfung also auf. Dazu kommen eine verifizierte Aussteller-Domain, eine E-Mail-Freigabe durch die Unterzeichnenden und eine kryptografische Signatur, mit der sich ein Zeugnis auch ohne unsere Datenbank als „von Zeugnio ausgestellt" nachweisen lässt – Letztere ist fertig gebaut und wird mit dem nächsten Deploy scharf geschaltet. Für handschriftlich unterschriebene Zeugnisse gibt es jetzt genügend Platz über der Unterschriftslinie.

---

**1. Zwischenzeugnis: Schlusssatz je nach Anlass (Freigabe Wortlaut)**

Bisher bekam jedes Zwischenzeugnis denselben Schlusssatz, auch wenn als Anlass ein Vorgesetztenwechsel oder ein interner Wechsel gewählt war. Das ist behoben. Die drei Sätze sind allerdings mein Entwurf und im Code als solcher markiert – sie sind an dich angelehnt (Bausteine aus der Matrix), aber für den Zwischenzeugnis-Kontext umformuliert, weil die Person ja im Unternehmen bleibt:

*Vorgesetztenwechsel:*
„Dieses Zwischenzeugnis wird aufgrund eines Vorgesetztenwechsels ausgestellt. Wir danken [Vorname Nachname] für die bisherige sehr wertvolle Unterstützung bestens und hoffen, noch lange auf seine geschätzte Mitarbeit zählen zu dürfen."

*Interner Wechsel:*
„Dieses Zwischenzeugnis wird aufgrund eines internen Wechsels ausgestellt. Wir danken [Vorname Nachname] bestens für die bisherige wertvolle Mitarbeit und wünschen ihm viel Freude und Erfolg im neuen Aufgabengebiet."

*Reorganisation:*
„Dieses Zwischenzeugnis wird im Zuge einer Reorganisation ausgestellt. Wir danken [Vorname Nachname] für die bisherige wertvolle Mitarbeit und wünschen ihm weiterhin viel Erfolg."

Die weibliche und die neutrale Form erzeugt das System automatisch. Der Reorganisations-Satz ist komplett neu: In deiner Matrix bedeutet „Reorganisation" einen Austritt, was beim Zwischenzeugnis nicht passt.

**Was ich brauche:** Freigabe oder deine Korrektur der drei Formulierungen. Eine Textänderung ist bei uns ein Zweizeiler, also gerne rigoros redigieren.

---

**2. Zwei Lücken in der Schlusssatz-Matrix (inhaltlicher Entscheid)**

Zwei Zellen sind bis heute leer und fallen auf den Standardsatz zurück:

*a) Top-Mitarbeitende.* Es gibt „standard" und „wertschätzender", aber die höchste Stufe fehlt. Wer also überdurchschnittlich beurteilt wird, bekommt am Ende denselben Satz wie alle anderen.

*b) Austrittsgrund.* Wir unterscheiden im Formular zwischen Kündigung durch die Mitarbeitenden, Kündigung durch die Firma und einvernehmlicher Auflösung – im Schlusssatz kommt das aber nicht an, alle drei ergeben denselben Text.

Bei (b) ist die Frage nicht nur sprachlich: Eine arbeitgeberseitige Kündigung ausdrücklich zu benennen ist in der Schweiz zulässig, wird in der Praxis aber oft bewusst weggelassen, weil es der Person schadet. Ich würde daher vorschlagen, die Firmenkündigung neutral zu halten („Das Arbeitsverhältnis endet per …") und nur bei der einvernehmlichen Auflösung eine eigene Formulierung zu führen.

**Was ich brauche:** Deine Haltung zu (b) – benennen oder neutral halten – und, wenn du magst, je einen Satz für die beiden Lücken. Sonst baue ich dir einen Vorschlag.

---

**3. Markenschriften: Offerten (bei dir hängig)**

Zur Erinnerung der Stand, damit du nichts suchen musst: Wir fahren zweigleisig. Zeugnio hat eine lizenzfreie Grundschrift, und die Hausschrift kommt nur bei den Zeugnissen der jeweiligen Konzernmarke zum Einsatz. Nötig sind sechs kommerzielle Familien: Minion (First und IAB, Titel), Rotis Sans (First, Text), Akkurat (IAB, Text), Coco Sharp (Comply2gether), Campton (Prokuration), Chambers Sans (CSL). Jeweils nur Regular und Bold – kursiv brauchen wir dank deinem Merkblatt nicht.

Der entscheidende Punkt bei jeder Offerte: Wir erzeugen die PDFs auf dem Server und betten die Schrift in jedes Dokument ein. Weder eine Desktop- noch eine Webfont-Lizenz deckt das ab; das ist überall eine separate Server- bzw. Electronic-Document-Lizenz, und bei keiner der sechs Familien ist sie öffentlich bepreist. Bitte lass dir das pro Anbieter ausdrücklich bestätigen, sonst vergleichen wir Preise für die falsche Nutzungsart.

**Was ich brauche:** Den Stand der Offerten, oder eine Nachricht, wenn ich den Anbietern selbst schreiben soll.

---

Für alles drei gilt: Punkt 1 und 2 sind reine Textarbeit und innerhalb eines Tages live. Punkt 3 bestimmt, wann wir die Marken-Typografie angehen können.

Herzliche Grüsse
Silvan
