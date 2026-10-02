# E-Mail-Entwurf an Christoph Senn (Stand 2026-09-26)

> Antwort auf seine Frage vom 26.09.: „Kannst du mir nochmals sagen wo die Daten im
> Zeugnio gehostet werden? Wir beginnen damit…."
>
> **Vor dem Versand eine einzige Angabe bestätigen:** die AWS-Region des
> Produktions-Supabase-Projekts. Dashboard → Projekt `swnycyrhqilzmqnmclcp` → Project
> Settings → General → Region. Im Entwurf steht „Frankfurt". Das war die Empfehlung in
> unserem eigenen README (`README.md:50`), von aussen aber nicht prüfbar — Supabase
> verrät die Region in keinem Antwortheader. Steht im Dashboard **Zürich
> (`eu-central-2`)**, wird die Antwort deutlich besser: dann liegt die Datenbank schon
> heute in der Schweiz und nur noch Anwendung und Mailversand nicht. In diesem Fall die
> erste Zeile der Ist-Liste und den Satz „heute liegen die Daten nicht in der Schweiz"
> anpassen.
>
> **Gemessen am 26.09., belastbar:** Die Server-Funktionen laufen bei Vercel in `iad1`,
> also Washington D.C. Jede dynamische Route antwortet mit
> `x-vercel-id: fra1::iad1::…` — der Aufruf kommt über den Frankfurter Edge herein,
> verarbeitet wird er in den USA.
>
> **Damit rechnen:** Christoph leitet diese Mail möglicherweise an Recht/Compliance oder
> an einen Konzernkunden weiter. Deshalb keine Beschönigung, keine Zusage mit Datum.
>
> **Zwei geprüfte Grenzen, auf denen der Schluss der Mail steht:** Vercel hat **keine
> Schweizer Compute-Region** — in Europa nur Stockholm, Paris, Dublin, Frankfurt, London
> (https://vercel.com/docs/regions). Die Function Region ist auf jedem Plan umstellbar,
> mehr als Frankfurt ist damit aber nicht zu holen, und die Routing Middleware läuft
> ohnehin in allen Regionen. Und: Die **Region eines Supabase-Projekts ist nicht
> änderbar** — Zürich (`eu-central-2`) gibt es, aber nur als *neues* Projekt mit
> vollständiger Migration inklusive `auth`-Schema, neuen Keys und neuem JWT-Secret
> (= alle Sessions einmal ungültig). Deshalb ist Variante 3 unten so vorsichtig
> formuliert.

---

**Betreff:** Zeugnio – wo die Daten heute liegen, und was sich ändert

Hallo Christoph

Gerne — und ohne Umschweife: **heute liegen die Daten nicht in der Schweiz.** Genau das
ändern wir gerade. Ich sage dir aber zuerst den Ist-Zustand, damit du damit arbeiten
kannst und nicht später etwas nachziehen musst.

**Wo die Daten heute liegen**

- **Datenbank** — Supabase Cloud in einem AWS-Rechenzentrum in Frankfurt, also EU. Dort
  liegt alles Inhaltliche: Mitarbeiternamen, Beurteilungen der Vorgesetzten,
  Zeugnis-Volltexte, Firmendaten, Firmenlogos, Anmeldungen.
- **Anwendung und Server** — Vercel, ausgeführt in Washington D.C., also USA. Das ist
  der Weg, den jede Eingabe und jede PDF-Erzeugung nimmt. Ich habe es heute nachgemessen,
  es ist keine Schätzung.
- **Mailversand** (Einladungen, Benachrichtigungen) — Resend, USA. Im Betreff steht
  heute noch der Name der Mitarbeiterin oder des Mitarbeiters. Das ändern wir, dazu
  unten mehr.
- **Eingehende Mail** an unsere Support-Adresse — über Amazon in Irland.
- **Schriften, Skripte, Statistik** — seit gestern alles von unserem eigenen Server.
  Vorher lud jeder Seitenaufruf die Schriften bei Google und ein Hilfsskript bei einem
  US-Netzwerk; damit ging bei jedem Besucher die IP-Adresse in die USA. Das ist weg. Es
  gibt kein Tracking, keine Analytics, keine Werbeskripte — gab es auch vorher nie.
- **Kein KI-Dienst im Betrieb.** Das ist die Frage, die in HR-Abteilungen am häufigsten
  kommt, deshalb sage ich es ausdrücklich: Die Textprüfung in Zeugnio läuft regelbasiert
  auf unserem eigenen Server. Es geht kein Zeugnistext und kein Name an ein
  Sprachmodell, weder an OpenAI noch an Anthropic noch an sonst einen Anbieter.

**Rechtlich zulässig — aber kein Serverstandort Schweiz**

Nach dem revidierten Datenschutzgesetz dürfen Daten in die EU übermittelt werden, und in
die USA an Unternehmen, die unter dem Swiss-US Data Privacy Framework zertifiziert sind.
Wir bewegen uns also nicht im rechtsfreien Raum. Was fehlt, ist die Aussage, nach der
Konzerneinkauf und Datenschutzverantwortliche tatsächlich fragen: dass die Daten physisch
in der Schweiz liegen. Und solange das so ist, kann ich unsere Datenschutzerklärung nicht
fertig schreiben — an drei Stellen steht dort heute ein Platzhalter anstelle eines
Serverstandorts. Das ist der eigentliche Grund für den Umzug, nicht eine rechtliche
Pflicht.

**Was sich ändert**

Zeugnio zieht vollständig zu **nine.ch**, einem Schweizer Anbieter mit Rechenzentren in
der Schweiz: Anwendung, Datenbank, Dateien und Sicherungen. Der Mailversand geht auf
einen Schweizer Anbieter. Das Konzept steht seit dem 16. September, der erste Schritt ist
seit gestern live — das mit den Schriften und Skripten oben. Danach kommen Datenbank und
Dateien, zuletzt die Anmeldung.

Ein Datum nenne ich dir absichtlich nicht. Der Datenumzug ist der eine Schritt, bei dem
Eile teuer wird. Ich melde dir jeden Schritt, sobald er erledigt und geprüft ist.

Eine Grenze bleibt auch nach dem Umzug, und du sollst sie von mir hören und nicht von
jemandem, der sie dir vorhält: **E-Mail.** Sobald eine Einladung an ein Postfach bei
Microsoft 365 oder Gmail geht, liegt diese Mail in einem US-Rechenzentrum — ganz
unabhängig davon, über welchen Schweizer Versender wir sie verschickt haben. Deshalb
nehmen wir die Personendaten aus den Mails heraus: Der Name steht künftig nicht mehr im
Betreff, sondern erscheint erst hinter dem Link auf zeugnio.ch, also in der Schweiz. So
kommt es auch in die Datenschutzerklärung: Verarbeitung und Speicherung in der Schweiz,
Zustellung beim Mailanbieter des Empfängers und damit ausserhalb unseres
Einflussbereichs.

**Zu „wir beginnen damit" — eine Frage, und sie ist wichtig**

Geht es ums Ausprobieren oder um echte Mitarbeiterdaten? Davon hängt ab, was ich dir
empfehle:

1. **Ausprobieren mit erfundenen Namen** — jederzeit und ohne Vorbehalt. Dafür braucht
   es nichts abzuwarten.
2. **Echte Zeugnisse, aber erst nach dem Datenumzug** — der ruhigste Weg. Du verlierst
   nur Zeit, keine Substanz.
3. **Echte Zeugnisse jetzt** — dann hast du mit dieser Mail den Stand schriftlich und
   entscheidest bei euch, ob er für diese Daten tragbar ist. Wenn es pressiert, kann ich
   den Datenbankteil vorziehen: Unser heutiger Anbieter betreibt auch eine Zürcher
   Region, dorthin lässt sich die Datenbank vor dem eigentlichen Umzug verlegen. Das
   bringt die Zeugnisinhalte in die Schweiz, kostet aber einen eigenen Umstellungstermin
   — alle Anmeldungen werden dabei einmal zurückgesetzt, jeder müsste sich neu anmelden.
   Die Anwendung selbst bringt dieser Zwischenschritt nicht in die Schweiz: Unser
   heutiger Hosting-Anbieter hat gar keinen Schweizer Standort, nur europäische. Dafür
   braucht es den Umzug, an dem wir sind.

Sag mir, welcher der drei Fälle es ist, dann richte ich mich danach.

Und falls bei euch jemand aus Recht oder Compliance mitliest: Ich schreibe die Angaben
oben gern als eine Seite auf — Anbieter, Standorte, Rechtsgrundlage, Auftragsverarbeitung
— in einer Form, die du weitergeben kannst.

Herzliche Grüsse
Silvan
