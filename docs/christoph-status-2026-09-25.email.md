# E-Mail-Entwurf an Christoph Senn (Stand 2026-09-25)

> Nachfass zur Mail vom 16.09. (`docs/christoph-freigaben-2026-09.email.md`).
> Kurzer Stand plus zwei Fragen. Vor dem Versand prüfen: Ist der Signaturschlüssel
> inzwischen aktiv? Heute liefert `https://zeugnio.ch/api/signing-keys` noch
> `"keys": []` — der letzte Absatz unter „Stand bei uns" ist entsprechend formuliert.

---

**Betreff:** Zeugnio – kurzer Stand, und wie läuft es bei dir?

Hallo Christoph

Seit meiner Mail vom 16. September ist bei uns einiges gelaufen. Kurz der Stand, und
zwei Fragen an dich.

**Konntest du Zeugnio schon jemandem zum Testen geben?**

Mich interessiert weniger ein Urteil als die Beobachtung: Wer hat es in die Finger
bekommen, an welcher Stelle ist die Person hängen geblieben, und was hat sie erwartet,
das nicht da war. Auch halbfertige Rückmeldungen sind mir lieber als gar keine. Falls es
am Zugang hängt, sag mir einfach, wie viele Zugänge du brauchst, dann richte ich sie ein
und lege eine Seite mit den drei, vier Dingen dazu, die geprüft werden sollten.

**Die drei Punkte vom 16. September sind noch offen:**

1. Freigabe oder Korrektur der drei Zwischenzeugnis-Schlusssätze (Vorgesetztenwechsel,
   interner Wechsel, Reorganisation).
2. Deine Haltung beim Austrittsgrund: die arbeitgeberseitige Kündigung benennen oder
   neutral halten.
3. Der Stand der Schrift-Offerten — mit der ausdrücklichen Bestätigung, dass die Lizenz
   serverseitig erzeugte PDFs mit eingebetteter Schrift abdeckt.

Punkt 1 und 2 sind bei uns reine Textarbeit und innerhalb eines Tages live. Sie warten
nur auf dein Wort. Wenn dir die Formulierungen zu viel Aufwand sind: Sag mir deine
Haltung in einem Satz, den Rest formuliere ich und lege ihn dir nochmals vor.

**Stand bei uns**

Der Schlusssatz beim Zwischenzeugnis richtet sich jetzt nach dem Anlass — das war
vorher ein stiller Fehler: Die Anlass-Auswahl im Formular hatte auf den Schlusssatz gar
keine Wirkung. Behoben und live, die Formulierungen sind weiterhin mein Entwurf.

Der grössere Brocken: **Wir holen Zeugnio in die Schweiz.** Datenbank, Anwendung,
Dateien und Mailversand liegen heute in den USA, künftig auf Schweizer Infrastruktur
(nine.ch, Rechenzentren in Zürich). Das Konzept steht, die ersten Schritte setze ich
diese Woche um. Zwei Gründe: HR-Abteilungen und Konzerneinkauf fragen nach dem
Serverstandort, bevor sie ein Produkt überhaupt prüfen. Und unsere Datenschutzerklärung
lässt sich erst dann ohne Platzhalter fertigstellen — heute steht dort an drei Stellen
ein Platzhalter statt eines Serverstandorts.

Noch offen aus der letzten Mail: die kryptografische Signatur ist gebaut, aber in der
Produktion noch nicht scharf geschaltet. Das hole ich nach, bevor breiter getestet wird
— erst danach trägt jedes neue Zeugnis das Siegel, mit dem es sich auch ohne unsere
Datenbank als von Zeugnio ausgestellt nachweisen lässt.

Melde dich, wenn dir ein kurzer Call lieber ist als eine Antwortmail.

Herzliche Grüsse
Silvan
