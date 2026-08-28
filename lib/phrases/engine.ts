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
 *   - generierter Volltext (wird gespeichert; Hash entsteht beim Finalisieren
 *     aus diesem Body, siehe lib/hash/canonicalize.ts)
 *
 * Designentscheidungen:
 *   - Bausteine werden nach Score, Geschlecht und Mitarbeitertyp gefiltert
 *   - Pro Kategorie wird bei mehreren Varianten zufällig (deterministisch
 *     mit Seed) gewählt, um Wiederholungen zu vermeiden
 *   - Platzhalter-Substitution mit Schweizer Namensregeln
 *   - Keine plumpen Aneinanderreihungen: Sätze werden mit Übergängen verbunden
 */

import { SKILLS, type SkillMeta } from "./skills";
import { pickSchlusssatz } from "./schlusssaetze";

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
  // Grammatikalische Zeitform des Bausteins. Nur die Beurteilungs-Bausteine
  // (Skill-Katalog) existieren in beiden Formen; Einleitung/Schluss bleiben
  // 'praesens' (Default), siehe DB-Spalten-Default. Fehlt der Wert (Alt-Daten,
  // Tests), zählt der Baustein als 'praesens'.
  tempus?: "praesens" | "praeteritum";
}

export interface EmployeeData {
  firstName: string;
  lastName: string;
  gender: "m" | "f" | "d";
  functionTitle: string;
  entryDate: string;
  exitDate?: string;
  dateOfBirth?: string;
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
    | "wunsch_mitarbeiter"
    | "arbeitsbestaetigung";
  // Neues, sauber getrenntes Datenmodell (Christoph-Matrix). Optional, damit
  // Alt-Aufrufer weiter funktionieren; steuert u.a. den Arbeitsbestätigungs-Zweig
  // und den Schlusssatz aus dem Katalog (lib/phrases/schlusssaetze.ts).
  zeugnisTyp?: "schluss" | "zwischen" | "arbeitsbestaetigung";
  austrittsgrund?: "wunsch_an" | "wunsch_ag" | "einvernehmen" | null;
  wertschaetzung?: "standard" | "wertschaetzender" | "top" | null;
  optinBedauern?: boolean;
  optinReorg?: boolean;
  optinVorgesetztenwechsel?: boolean;
  optinInternerWechsel?: boolean;
  tasks: string[];
  thankEmployee: boolean;
  location: string;
  date: string;
  companyName: string;
  companyAddress?: string;
  // Optionale Wechsel-Details (nur bei Wechsel-Typen relevant; speisen die
  // _detail-Schlussbausteine via {neue_funktion}/{neue_firma}/{wechsel_datum}).
  newFunctionTitle?: string;
  newCompanyName?: string;
  transitionDate?: string;
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

/**
 * Löst Geschlechter-Tokens der Form {{maskulin|feminin|neutral}} auf.
 * Die Katalog-Bausteine sind als gender='d' gespeichert und tragen diese Tokens;
 * die Auswahl erfolgt hier nach dem Geschlecht der Person:
 *   m → 1. Wert, f → 2. Wert, d → 3. Wert (Beidnennung mit Schrägstrich).
 * Fehlt ein Wert (unvollständiges Token), wird der maskuline Wert als Fallback
 * genommen, damit nie eine leere Stelle entsteht.
 */
function resolveGenderTokens(text: string, gender: "m" | "f" | "d"): string {
  const idx = gender === "m" ? 0 : gender === "f" ? 1 : 2;
  return text.replace(/\{\{([^{}]*)\}\}/g, (_match, inner: string) => {
    const parts = inner.split("|");
    return (parts[idx] ?? parts[0] ?? "").trim();
  });
}

function substitute(
  template: string,
  employee: EmployeeData,
  cert?: CertificateData,
): string {
  return resolveGenderTokens(template, employee.gender)
    .replace(/\{vorname\}/g, employee.firstName)
    .replace(/\{nachname\}/g, employee.lastName)
    .replace(/\{funktion\}/g, employee.functionTitle)
    .replace(/\{eintritt\}/g, formatDate(employee.entryDate))
    .replace(/\{austritt\}/g, employee.exitDate ? formatDate(employee.exitDate) : "")
    .replace(
      /\{geburtsdatum\}/g,
      employee.dateOfBirth ? formatDate(employee.dateOfBirth) : "",
    )
    .replace(/\{neue_funktion\}/g, cert?.newFunctionTitle ?? "")
    .replace(/\{neue_firma\}/g, cert?.newCompanyName ?? "")
    .replace(
      /\{wechsel_datum\}/g,
      cert?.transitionDate ? formatDate(cert.transitionDate) : "",
    );
}

// Skill-Metadaten (Reihenfolge + Thema) für die themengruppierte Generierung.
const SKILL_BY_KEY = new Map<string, SkillMeta>(SKILLS.map((s) => [s.key, s]));

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
  tempus?: "praesens" | "praeteritum",
): PhraseBlock | null {
  const employeeType = employee.isManager ? "fuehrungskraft" : "mitarbeiter";
  // Alt-Daten/Einleitung/Schluss ohne tempus-Wert gelten als 'praesens'.
  const matchesTempus = (b: PhraseBlock) =>
    !tempus || (b.tempus ?? "praesens") === tempus;

  const filter = (gender: "m" | "f" | "d") =>
    blocks.filter(
      (b) =>
        b.category === category &&
        b.rating === rating &&
        b.employee_type === employeeType &&
        b.gender === gender &&
        (subcategory ? b.subcategory === subcategory : true) &&
        matchesTempus(b),
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
        (subcategory ? b.subcategory === subcategory : true) &&
        matchesTempus(b),
    );
    candidates = fallback;
  }

  // Lückenschutz: fehlt eine Präteritum-Variante im Katalog, lieber die
  // Präsens-Fassung zeigen als gar keinen Baustein.
  if (candidates.length === 0 && tempus === "praeteritum") {
    return findPhrase(blocks, category, rating, employee, subcategory, "praesens");
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

/**
 * Liefert den fertigen Satz für EINE bewertete Eigenschaft (Skill) – exakt so,
 * wie ihn generateCertificate im Beurteilungsteil erzeugt (gleiche Auswahl via
 * findPhrase, gleiche Substitution, gleiches Anhängen der Freitext-Anmerkung).
 * Rein und ohne DB/Server-Abhängigkeit: die Bausteine kommen als Argument,
 * daher auch clientseitig für die Live-Vorschau im Beurteilungsformular nutzbar.
 * Gibt null zurück, wenn kein passender Baustein existiert.
 */
export function previewSkillPhrase(params: {
  phraseBlocks: PhraseBlock[];
  skillKey: string;
  theme: string;
  rating: Evaluation["rating"];
  employee: EmployeeData;
  tempus: "praesens" | "praeteritum";
  freeText?: string | null;
  cert?: CertificateData;
}): string | null {
  const phrase = findPhrase(
    params.phraseBlocks,
    params.skillKey,
    params.rating,
    params.employee,
    params.theme,
    params.tempus,
  );
  if (!phrase) return null;
  let text = substitute(phrase.text, params.employee, params.cert);
  const extra = params.freeText?.trim();
  if (extra) text += " " + extra;
  return text;
}

// ============================================================================
// Hauptfunktion: Zeugnistext generieren
// ============================================================================

export interface GenerationResult {
  text: string;
  warnings: string[];
}

export function generateCertificate(
  employee: EmployeeData,
  certificate: CertificateData,
  evaluations: Evaluation[],
  phraseBlocks: PhraseBlock[],
): GenerationResult {
  // ----- Arbeitsbestätigung -----
  // Rein bestätigend: Funktion + Dauer (+ optionale Aufgaben), OHNE qualitativen
  // Beurteilungsteil. Läuft daher an der Baustein-/Skill-Logik vorbei.
  if (certificate.zeugnisTyp === "arbeitsbestaetigung") {
    const secs: string[] = [];
    const name = `${employee.firstName} ${employee.lastName}`;
    const geb = employee.dateOfBirth
      ? `, geboren am ${formatDate(employee.dateOfBirth)},`
      : "";
    const ongoing = !employee.exitDate;
    const zeitraum = ongoing
      ? `ist seit dem ${formatDate(employee.entryDate)}`
      : `war vom ${formatDate(employee.entryDate)} bis ${formatDate(employee.exitDate!)}`;
    secs.push(
      `${name}${geb} ${zeitraum} als ${employee.functionTitle} in unserem Unternehmen tätig.`,
    );
    if (
      employee.employmentPercentage != null &&
      employee.employmentPercentage < 100
    ) {
      secs.push(
        `Das Arbeitspensum ${ongoing ? "beträgt" : "betrug"} ${employee.employmentPercentage}%.`,
      );
    }
    if (certificate.tasks.length > 0) {
      secs.push(
        ongoing ? "Zu den Hauptaufgaben gehören:" : "Zu den Hauptaufgaben gehörten:",
      );
      secs.push(certificate.tasks.map((t) => `• ${t}`).join("\n"));
    }
    secs.push(
      `Diese Arbeitsbestätigung wird auf Wunsch von ${name} ausgestellt.`,
    );
    secs.push(`${certificate.location}, ${formatDate(certificate.date)}`);
    return { text: secs.join("\n\n"), warnings: [] };
  }

  const warnings: string[] = [];
  const sections: string[] = [];

  // Zwischenzeugnis wird während des laufenden Arbeitsverhältnisses ausgestellt
  // (Gegenwart), alle anderen Typen rückblickend nach Austritt (Vergangenheit).
  const tempus: "praesens" | "praeteritum" =
    certificate.type === "zwischen" ? "praesens" : "praeteritum";

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
    sections.push(substitute(intro.text, employee, certificate));
  } else {
    warnings.push(`Kein Einleitungs-Baustein für Typ '${certificate.type}' gefunden`);
    sections.push(
      `${employee.firstName} ${employee.lastName} war als ${employee.functionTitle} in unserem Unternehmen tätig.`,
    );
  }

  // ----- Aufgabenbeschreibung -----
  if (certificate.tasks.length > 0) {
    const verb = tempus === "praesens" ? "gehören" : "gehörten";
    const taskIntro =
      employee.gender === "m"
        ? `Zu seinen Hauptaufgaben ${verb}:`
        : employee.gender === "f"
          ? `Zu ihren Hauptaufgaben ${verb}:`
          : `Zu den Hauptaufgaben ${verb}:`;
    sections.push(taskIntro);
    sections.push(certificate.tasks.map((t) => `• ${t}`).join("\n"));
  }

  // ----- Beurteilungs-Sektionen (themengruppiert nach Skill-Katalog) -----
  // Nur die tatsächlich bewerteten Skills aus dem Katalog, sortiert nach der
  // Katalog-Reihenfolge (Thema → Skill) und je Thema zu einem Absatz
  // zusammengefasst. Kategorien ausserhalb des Katalogs (z. B. Bausteine aus
  // dem alten Schema) werden übersprungen und gewarnt.
  const ratedSkills = evaluations
    .map((ev) => ({ ev, meta: SKILL_BY_KEY.get(ev.category) }))
    .filter(
      (x): x is { ev: Evaluation; meta: SkillMeta } => x.meta !== undefined,
    )
    .sort((a, b) => a.meta.order - b.meta.order);

  for (const e of evaluations) {
    if (!SKILL_BY_KEY.has(e.category)) {
      warnings.push(`Unbekannte Beurteilungs-Kategorie '${e.category}' übersprungen`);
    }
  }
  if (ratedSkills.length === 0) {
    warnings.push("Keine bewerteten Skills aus dem Katalog vorhanden.");
  }

  // Je Thema einen eigenen Absatz bilden (Reihenfolge folgt aus 'order').
  let currentTheme: string | null = null;
  let themeBuffer: string[] = [];
  const flushTheme = () => {
    if (themeBuffer.length > 0) {
      sections.push(themeBuffer.join(" "));
      themeBuffer = [];
    }
  };
  for (const { ev, meta } of ratedSkills) {
    if (meta.theme !== currentTheme) {
      flushTheme();
      currentTheme = meta.theme;
    }
    const text = previewSkillPhrase({
      phraseBlocks,
      skillKey: meta.key,
      theme: meta.theme,
      rating: ev.rating,
      employee,
      tempus,
      freeText: ev.freeText,
      cert: certificate,
    });
    if (text) {
      themeBuffer.push(text);
    } else {
      warnings.push(`Kein Baustein für ${meta.key} / ${ev.rating}`);
    }
  }
  flushTheme();

  // ----- Schlussformulierung -----
  // Schluss ist nicht gegen die Bewertung skaliert (immer rating='gut').
  const pick = (subcategory: string) =>
    findPhrase(phraseBlocks, "schluss", "gut", employee, subcategory);
  // Detail-Variante ('<typ>_detail', mit {neue_funktion}/{neue_firma}/
  // {wechsel_datum}) nur wählen, wenn ALLE von ihr genutzten Felder gesetzt
  // sind – sonst der generische Baustein, damit nie leere Platzhalter entstehen.
  const pickWithDetail = (
    baseSub: string,
    detailSub: string,
    detailReady: boolean,
  ): PhraseBlock | null =>
    detailReady ? pick(detailSub) ?? pick(baseSub) : pick(baseSub);

  let closing = "";
  if (
    certificate.zeugnisTyp === "schluss" ||
    certificate.zeugnisTyp === "zwischen"
  ) {
    // Neues Modell (Christoph-Matrix): Schlusssatz aus dem TS-Katalog, gewählt
    // nach Austrittsgrund × Wertschätzungsgrad + Opt-ins (Bedauern/Reorg).
    const tmpl = pickSchlusssatz({
      zeugnisTyp: certificate.zeugnisTyp,
      austrittsgrund: certificate.austrittsgrund ?? null,
      wertschaetzung: certificate.wertschaetzung ?? null,
      optinBedauern: certificate.optinBedauern,
      optinReorg: certificate.optinReorg,
      // Zwischenzeugnis-Anlass: passt den Schlusssatz an (VG-/interner Wechsel).
      optinVorgesetztenwechsel: certificate.optinVorgesetztenwechsel,
      optinInternerWechsel: certificate.optinInternerWechsel,
    });
    closing = tmpl
      ? substitute(tmpl, employee, certificate)
      : `Wir danken ${employee.firstName} ${employee.lastName} für die geleistete Arbeit und wünschen für die Zukunft alles Gute.`;
  } else if (certificate.type === "schluss" && certificate.thankEmployee) {
    const cl = pick("schluss_dank");
    closing = cl
      ? substitute(cl.text, employee, certificate)
      : `Wir danken ${employee.firstName} ${employee.lastName} für die geleistete Arbeit und wünschen für die Zukunft alles Gute.`;
  } else if (certificate.type === "zwischen") {
    const cl = pick("zwischen");
    closing = cl
      ? substitute(cl.text, employee, certificate)
      : `Dieses Zwischenzeugnis wird auf Wunsch von ${employee.firstName} ${employee.lastName} ausgestellt.`;
  } else if (certificate.type === "reorganisation") {
    const cl = pick("reorganisation");
    closing = cl
      ? substitute(cl.text, employee, certificate)
      : `Das Arbeitsverhältnis endet aufgrund einer Reorganisation. Wir wünschen für die Zukunft alles Gute.`;
  } else if (certificate.type === "funktionswechsel") {
    const cl = pickWithDetail(
      "funktionswechsel",
      "funktionswechsel_detail",
      !!(certificate.newFunctionTitle && certificate.newCompanyName),
    );
    closing = cl ? substitute(cl.text, employee, certificate) : "";
  } else if (certificate.type === "interner_wechsel") {
    const cl = pickWithDetail(
      "interner_wechsel",
      "interner_wechsel_detail",
      !!(certificate.newFunctionTitle && certificate.transitionDate),
    );
    closing = cl ? substitute(cl.text, employee, certificate) : "";
  } else {
    // vorgesetztenwechsel, wunsch_mitarbeiter, wunsch_mitarbeiterin
    const cl = pick(certificate.type);
    closing = cl ? substitute(cl.text, employee, certificate) : "";
  }

  if (closing) sections.push(closing);

  // ----- Ort/Datum -----
  sections.push(`${certificate.location}, ${formatDate(certificate.date)}`);

  // ----- Volltext bauen -----
  const fullText = sections.join("\n\n");

  return { text: fullText, warnings };
}
