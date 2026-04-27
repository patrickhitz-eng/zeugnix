/**
 * zeugnix.ch – Baustein-Engine (Phrase Engine)
 * ----------------------------------------------------------------------------
 * Übersetzt strukturierte Beurteilungen in flüssigen Schweizer Zeugnistext.
 *
 * Eingaben:
 *   - employee: Stammdaten (Name, Geschlecht, Funktion etc.)
 *   - certificate: Typ (Schluss/Zwischen/...), Aufgabenliste, Schlussoptionen
 *   - evaluations: Liste der Beurteilungen pro Kategorie
 *   - phraseBlocks: Bausteinbibliothek aus DB
 *
 * Ausgabe:
 *   - generierter Volltext
 *   - struktureller CanonicalContent für Hash-Berechnung
 *
 * Designentscheidungen:
 *   - Bausteine werden nach Score, Geschlecht und Mitarbeitertyp gefiltert
 *   - Pro Kategorie wird bei mehreren Varianten zufällig (deterministisch
 *     mit Seed) gewählt, um Wiederholungen zu vermeiden
 *   - Platzhalter-Substitution mit Schweizer Namensregeln
 *   - Keine plumpen Aneinanderreihungen: Sätze werden mit Übergängen verbunden
 */

import type { CanonicalContent } from "@/lib/hash/canonicalize";

// ============================================================================
// Typen
// ============================================================================

export interface PhraseBlock {
  id: string;
  category: string;
  subcategory: string | null;
  employee_type: "mitarbeiter" | "fuehrungskraft";
  gender: "m" | "f" | "d";
  rating: "ungenuegend" | "genuegend" | "gut" | "sehr_gut";
  variant: number;
  text: string;
}

export interface EmployeeData {
  firstName: string;
  lastName: string;
  gender: "m" | "f" | "d";
  functionTitle: string;
  entryDate: string;
  exitDate?: string;
  employmentPercentage?: number;
  isManager: boolean;
}

export interface CertificateData {
  type:
    | "schluss"
    | "zwischen"
    | "funktionswechsel"
    | "vorgesetztenwechsel"
    | "interner_wechsel"
    | "reorganisation"
    | "wunsch_mitarbeiterin"
    | "wunsch_mitarbeiter";
  tasks: string[];
  thankEmployee: boolean;
  location: string;
  date: string;
  companyName: string;
  companyAddress?: string;
}

export interface Evaluation {
  category: string;
  subcategory?: string;
  rating: "ungenuegend" | "genuegend" | "gut" | "sehr_gut";
  freeText?: string;
}

// ============================================================================
// Helper: Platzhalter-Substitution
// ============================================================================

function substitute(template: string, employee: EmployeeData): string {
  return template
    .replace(/\{vorname\}/g, employee.firstName)
    .replace(/\{nachname\}/g, employee.lastName)
    .replace(/\{funktion\}/g, employee.functionTitle)
    .replace(/\{eintritt\}/g, formatDate(employee.entryDate))
    .replace(/\{austritt\}/g, employee.exitDate ? formatDate(employee.exitDate) : "")
    .replace(/\{geburtsdatum\}/g, ""); // optional, falls vorhanden
}

function formatDate(iso: string): string {
  const [y, m, d] = iso.split("-");
  return `${d}.${m}.${y}`;
}

// ============================================================================
// Helper: Baustein-Auswahl
// ============================================================================

/**
 * Sucht passenden Baustein in der Bibliothek.
 * Fallback-Kette: exact gender → 'd' → kein Match.
 */
function findPhrase(
  blocks: PhraseBlock[],
  category: string,
  rating: Evaluation["rating"],
  employee: EmployeeData,
  subcategory?: string,
): PhraseBlock | null {
  const employeeType = employee.isManager ? "fuehrungskraft" : "mitarbeiter";

  const filter = (gender: "m" | "f" | "d") =>
    blocks.filter(
      (b) =>
        b.category === category &&
        b.rating === rating &&
        b.employee_type === employeeType &&
        b.gender === gender &&
        (subcategory ? b.subcategory === subcategory : true),
    );

  let candidates = filter(employee.gender);
  if (candidates.length === 0) candidates = filter("d");

  // Auch unter Mitarbeiter-Typ suchen, falls Manager-Variante fehlt
  if (candidates.length === 0 && employee.isManager) {
    const fallback = blocks.filter(
      (b) =>
        b.category === category &&
        b.rating === rating &&
        b.employee_type === "mitarbeiter" &&
        (b.gender === employee.gender || b.gender === "d") &&
        (subcategory ? b.subcategory === subcategory : true),
    );
    candidates = fallback;
  }

  if (candidates.length === 0) return null;

  // Deterministische "zufällige" Auswahl – seed aus Name+Kategorie
  const seed = hashString(employee.lastName + category + rating);
  return candidates[seed % candidates.length];
}

function hashString(s: string): number {
  let h = 0;
  for (let i = 0; i < s.length; i++) {
    h = ((h << 5) - h + s.charCodeAt(i)) | 0;
  }
  return Math.abs(h);
}

// ============================================================================
// Hauptfunktion: Zeugnistext generieren
// ============================================================================

export interface GenerationResult {
  text: string;
  canonical: CanonicalContent;
  warnings: string[];
}

export function generateCertificate(
  employee: EmployeeData,
  certificate: CertificateData,
  evaluations: Evaluation[],
  phraseBlocks: PhraseBlock[],
): GenerationResult {
  const warnings: string[] = [];
  const sections: string[] = [];

  // ----- Einleitung -----
  const introCategory = certificate.type === "zwischen" ? "zwischen" : "schluss";
  const intro = findPhrase(
    phraseBlocks,
    "einleitung",
    "gut",
    employee,
    introCategory,
  );
  if (intro) {
    sections.push(substitute(intro.text, employee));
  } else {
    warnings.push(`Kein Einleitungs-Baustein für Typ '${certificate.type}' gefunden`);
    sections.push(
      `${employee.firstName} ${employee.lastName} war als ${employee.functionTitle} in unserem Unternehmen tätig.`,
    );
  }

  // ----- Aufgabenbeschreibung -----
  if (certificate.tasks.length > 0) {
    const taskIntro =
      employee.gender === "m"
        ? `Zu seinen Hauptaufgaben gehörten:`
        : employee.gender === "f"
          ? `Zu ihren Hauptaufgaben gehörten:`
          : `Zu den Hauptaufgaben gehörten:`;
    sections.push(taskIntro);
    sections.push(certificate.tasks.map((t) => `• ${t}`).join("\n"));
  }

  // ----- Beurteilungs-Sektionen -----
  // Geordnete Reihenfolge: fachliche_leistung → arbeitsweise → arbeitsqualitaet
  // → zielerreichung → fuehrungsverhalten (falls Manager) → verhalten
  const orderedCategories = [
    "fachliche_leistung",
    "arbeitsweise",
    "arbeitsqualitaet",
    "zielerreichung",
    ...(employee.isManager ? ["fuehrungsverhalten"] : []),
    "verhalten",
  ];

  const evalsParagraph: string[] = [];
  for (const cat of orderedCategories) {
    const ev = evaluations.find((e) => e.category === cat);
    if (!ev) {
      warnings.push(`Keine Beurteilung für Kategorie '${cat}'`);
      continue;
    }
    const phrase = findPhrase(phraseBlocks, cat, ev.rating, employee);
    if (phrase) {
      let text = substitute(phrase.text, employee);
      if (ev.freeText) {
        text += " " + ev.freeText.trim();
      }
      evalsParagraph.push(text);
    } else {
      warnings.push(`Kein Baustein für ${cat} / ${ev.rating} / ${employee.gender}`);
    }
  }
  sections.push(evalsParagraph.join(" "));

  // ----- Schlussformulierung -----
  let closing = "";
  if (certificate.type === "schluss" && certificate.thankEmployee) {
    const closingPhrase = findPhrase(
      phraseBlocks,
      "schluss",
      "gut", // Schlussformulierung ist nicht gegen Bewertung skaliert hier vereinfacht
      employee,
      "schluss_dank",
    );
    if (closingPhrase) {
      closing = substitute(closingPhrase.text, employee);
    } else {
      closing = `Wir danken ${employee.firstName} ${employee.lastName} für die geleistete Arbeit und wünschen für die Zukunft alles Gute.`;
    }
  } else if (certificate.type === "zwischen") {
    const cl = findPhrase(phraseBlocks, "schluss", "gut", employee, "zwischen");
    closing = cl
      ? substitute(cl.text, employee)
      : `Dieses Zwischenzeugnis wird auf Wunsch von ${employee.firstName} ${employee.lastName} ausgestellt.`;
  } else if (certificate.type === "reorganisation") {
    const cl = findPhrase(phraseBlocks, "schluss", "gut", employee, "reorganisation");
    closing = cl
      ? substitute(cl.text, employee)
      : `Das Arbeitsverhältnis endet aufgrund einer Reorganisation. Wir wünschen für die Zukunft alles Gute.`;
  } else {
    const cl = findPhrase(phraseBlocks, "schluss", "gut", employee, certificate.type);
    closing = cl ? substitute(cl.text, employee) : "";
  }

  if (closing) sections.push(closing);

  // ----- Ort/Datum -----
  sections.push(`${certificate.location}, ${formatDate(certificate.date)}`);

  // ----- Volltext bauen -----
  const fullText = sections.join("\n\n");

  // ----- Canonical Content -----
  const canonical: CanonicalContent = {
    type: certificate.type,
    company: {
      name: certificate.companyName,
      address: certificate.companyAddress,
    },
    employee: {
      firstName: employee.firstName,
      lastName: employee.lastName,
      gender: employee.gender,
      functionTitle: employee.functionTitle,
      entryDate: employee.entryDate,
      exitDate: employee.exitDate,
    },
    body: evalsParagraph.join(" "),
    closing,
    date: certificate.date,
    location: certificate.location,
  };

  return { text: fullText, canonical, warnings };
}
