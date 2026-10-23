/**
 * zeugnix.ch – Stichworte zu den Aufgaben in sauberen Text verwandeln
 * ----------------------------------------------------------------------------
 * Bei der Zeugniserstellung gibt HR die Hauptaufgaben als Stichworte ein, eine
 * pro Zeile (components/forms/new-certificate-form.tsx). Bisher landeten sie
 * praktisch unverändert im Zeugnis: getrimmt, leere Zeilen weg, und dann als
 * „• <Stichwort>" in den Text (lib/phrases/engine.ts). Alles andere – ob gross
 * geschrieben, ob ein Semikolon am Ende steht, ob dieselbe Aufgabe zweimal
 * dasteht – blieb so, wie es getippt wurde.
 *
 * DETERMINISTISCH, NICHT GENERIERT. Der Zeugnistext geht in den SHA-256-Hash
 * ein (lib/hash/canonicalize.ts). Derselbe Eingabetext muss darum IMMER
 * denselben Ausgabetext ergeben: keine KI, kein Zufall, keine Sortierung nach
 * Gebietsschema, keine Abhängigkeit von Uhrzeit oder Umgebung. Reine
 * Funktionen über ihrem Argument – prüfbar mit einer eingefrorenen Tabelle aus
 * Eingabe und erwarteter Ausgabe (scripts/test-task-keywords.ts).
 *
 * WIRKT NUR AUF NEUE ZEUGNISSE. Bereits finalisierte Zeugnisse behalten ihren
 * gespeicherten Text und damit ihren Hash; hier wird nichts nachträglich
 * umgeschrieben.
 */

/**
 * Listenzeichen, die Leute vorne hintippen, obwohl das Formular schon eine
 * Aufzählung daraus macht: Binde-/Gedankenstriche, Aufzählungspunkte,
 * Sternchen, Mittelpunkte und Nummerierungen wie "1." oder "2)".
 *
 * Das nachfolgende Leerzeichen ist Pflicht (oder das Zeilenende): ohne diese
 * Bedingung würde "-Beratung" seinen Bindestrich verlieren, der dort ein
 * Wortteil ist und kein Listenzeichen.
 */
const LIST_MARKER = /^(?:[-–—•*·]|\d+[.)])(?:\s+|$)/;

/**
 * R1 – Zerlegen. Getrennt wird an Zeilenumbrüchen UND an Semikola.
 *
 * Das Komma ist bewusst KEIN Trennzeichen: Aufgabenbeschreibungen enthalten
 * regelmässig legitime Kommas ("Beratung von Privat-, Firmen- und
 * institutionellen Kunden"). Am Komma zu trennen würde solche Einträge
 * zerreissen, und das lässt sich nachträglich nicht mehr reparieren.
 */
export function splitTaskInput(raw: string): string[] {
  return raw.split(/[\n;]+/);
}

/**
 * R2–R5 – ein einzelnes Stichwort säubern. Gibt "" zurück, wenn nach dem
 * Säubern nichts übrig bleibt (der Aufrufer lässt solche Einträge weg).
 */
export function normalizeTaskKeyword(raw: string): string {
  let t = raw.trim();

  // R2 – vorangestelltes Listenzeichen entfernen.
  t = t.replace(LIST_MARKER, "");

  // R3 – innen aufräumen: Whitespace-Läufe zu einem Space, kein Leerzeichen
  // VOR einem Satzzeichen, und doppelte Trennzeichen auf eines reduzieren.
  t = t
    .replace(/\s+/g, " ")
    .replace(/\s+([,;:])/g, "$1")
    .replace(/([,;:])\1+/g, "$1")
    .trim();

  // R4 – Satzzeichen am Ende entfernen. Der Punkt entsteht erst beim
  // Zusammensetzen, je nachdem ob der Eintrag am Ende der Aufzählung steht.
  t = t.replace(/[.,;:]+$/, "").trim();

  if (t.length === 0) return "";

  // R5 – nur der ERSTE Buchstabe wird angefasst.
  //
  // Weder Title Case noch Kleinschreibung sind im Deutschen brauchbar: Title
  // Case macht aus "Beratung von Geschäftskunden" ein "Beratung Von
  // Geschäftskunden", Kleinschreibung zerstört die Substantive. Wer in
  // Grossbuchstaben tippt, behält sie darum auch – das ist sichtbar und
  // korrigierbar, ein kaputtgeschriebenes Substantiv wäre es nicht.
  const first = t.charAt(0);
  const upper = first.toUpperCase();
  // Guard: "ß".toUpperCase() ist "SS" und würde die Länge verändern.
  return upper.length === 1 ? upper + t.slice(1) : t;
}

/**
 * Vergleichsschlüssel für R6. Gross-/Kleinschreibung und Whitespace sind für
 * die Dublettenprüfung unerheblich; Satzzeichen hat R4 bereits entfernt.
 */
function dedupeKey(item: string): string {
  return item.toLowerCase().replace(/\s+/g, " ").trim();
}

/**
 * R6 – Dubletten entfernen. Der ERSTE Treffer bleibt stehen, samt seiner
 * Schreibweise; die Reihenfolge der Eingabe bleibt erhalten (nicht sortieren –
 * die Reihenfolge ist eine Aussage von HR über die Wichtigkeit).
 */
export function dedupeTaskKeywords(items: string[]): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const item of items) {
    const key = dedupeKey(item);
    if (key.length === 0 || seen.has(key)) continue;
    seen.add(key);
    out.push(item);
  }
  return out;
}

/**
 * R1–R6 zusammen: aus rohem Formulartext die gesäuberte, dublettenfreie Liste.
 * Nimmt einen String (Textarea) oder ein bereits zerlegtes Array (DB-Spalte
 * certificates.tasks, die Alt-Daten in ihrer ursprünglichen Form enthält).
 */
export function cleanTaskKeywords(input: string | string[]): string[] {
  const parts = Array.isArray(input)
    ? input.flatMap((entry) => splitTaskInput(String(entry ?? "")))
    : splitTaskInput(input);
  return dedupeTaskKeywords(parts.map(normalizeTaskKeyword).filter((t) => t.length > 0));
}

/**
 * Aufzählungszeichen der Aufgabenliste.
 *
 * Es steht im Zeugnistext und geht damit in den Hash ein. Es bleibt "•", wie
 * es der Generator seit jeher setzt – ein anderes Zeichen würde nichts
 * verbessern und die Zeugnisse vor und nach der Umstellung unnötig
 * unterschiedlich aussehen lassen.
 */
export const TASK_BULLET = "•";

/**
 * R7 – die gesäuberten Stichworte zur Aufzählung zusammensetzen.
 *
 * Ein Block, dessen Zeilen mit EINFACHEN Umbrüchen verbunden sind. Der
 * Generator übergibt ihn als einen Abschnitt (Abschnitte sind durch doppelte
 * Umbrüche getrennt), damit die Aufzählung im Dokument als ein Absatz
 * zusammenbleibt und nicht zwischen den Punkten auseinandergerissen wird.
 *
 * Entschieden gegen Fliesstext ("A, B und C."): Auftraggeber, 23.10.2026. Die
 * Aufzählung ist im Schweizer Arbeitszeugnis die gewohnte Form und bleibt beim
 * Lesen schneller erfassbar; die gemessenen 25pt, die Fliesstext gespart
 * hätte, sind das nicht wert.
 */
export function taskBulletBlock(items: string[]): string {
  return items.map((item) => `${TASK_BULLET} ${item}`).join("\n");
}

/**
 * R1–R7 in einem Schritt: aus der rohen Eingabe der fertige Aufzählungsblock.
 * Gibt "" zurück, wenn nach dem Säubern nichts übrig bleibt – der Aufrufer
 * lässt dann auch die Überschrift weg, damit nie ein „Zu ihren Hauptaufgaben
 * gehörten:" ohne Aufzählung darunter stehen bleibt.
 */
export function formatTaskBlock(input: string | string[]): string {
  return taskBulletBlock(cleanTaskKeywords(input));
}
