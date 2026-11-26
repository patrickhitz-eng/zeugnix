/**
 * zeugnix.ch – Kontaktzeilen des Briefkopfs
 * ----------------------------------------------------------------------------
 * Früher stand jede Angabe auf einer eigenen Zeile (Strasse, PLZ Ort, Telefon,
 * E-Mail, Website). Mit dem Firmennamen waren das sechs Zeilen, und die rechte
 * Spalte bestimmte die Höhe des ganzen Briefkopfs. Gebündelt sind es drei:
 *
 *   Neugasse 6, 6300 Zug
 *   041 123 45 67 · info@beispiel.ch
 *   www.beispiel.ch
 *
 * Eine Stelle für PDF und HTML-Vorschau, damit die beiden nicht
 * auseinanderlaufen. Client-tauglich (keine Server-Imports).
 *
 * Der Briefkopf liegt ausserhalb der Body-/Meta-Sentinels und geht nicht in den
 * Echtheits-Hash ein. Die Darstellung darf sich also ändern, ohne dass ein
 * bestehendes Zeugnis bei der Prüfung anders aussieht.
 */

export interface LetterheadContact {
  address?: string | null;
  postalCode?: string | null;
  city?: string | null;
  phone?: string | null;
  email?: string | null;
  website?: string | null;
}

const SEPARATOR = " · ";

function clean(value: string | null | undefined): string {
  return (value ?? "").trim();
}

/** Website ohne Protokoll und Schrägstrich am Ende: «https://www.x.ch/» → «www.x.ch». */
export function displayWebsite(url: string | null | undefined): string {
  return clean(url).replace(/^https?:\/\//i, "").replace(/\/+$/, "");
}

/** Bis zu drei Zeilen: Adresse, Telefon · E-Mail, Website. Leere Zeilen entfallen. */
export function letterheadContactLines(c: LetterheadContact): string[] {
  const cityLine = [clean(c.postalCode), clean(c.city)].filter(Boolean).join(" ");
  const addressLine = [clean(c.address), cityLine].filter(Boolean).join(", ");
  const reachLine = [clean(c.phone), clean(c.email)].filter(Boolean).join(SEPARATOR);
  return [addressLine, reachLine, displayWebsite(c.website)].filter(Boolean);
}
