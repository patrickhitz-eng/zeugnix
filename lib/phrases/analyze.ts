/**
 * zeugnix.ch – Analyse-Engine (MVP-Stub)
 * ----------------------------------------------------------------------------
 * Übersetzt einen Zeugnistext in Klartext-Bewertung.
 *
 * Dieser MVP arbeitet rein regelbasiert mit einer Stichwort-Heuristik.
 * Für die Produktivversion empfohlen:
 *   - LLM-gestützte Klassifikation pro Satz/Absatz
 *   - Trainings-Set aus tatsächlichen Zeugnissen (anonymisiert)
 *   - Kalibrierung mit HR-Profis und Arbeitsrechtlern
 *
 * Liefert:
 *   - overall_rating: ungenuegend | genuegend | gut | sehr_gut
 *   - overall_score: 1.0 - 6.0
 *   - confidence_level: hoch | mittel | tief
 *   - category_scores: { [category]: rating }
 *   - strengths, weaknesses, warnings
 *   - summary
 */

export interface AnalysisResult {
  overall_rating: "ungenuegend" | "genuegend" | "gut" | "sehr_gut";
  overall_score: number;
  confidence_level: "hoch" | "mittel" | "tief";
  category_scores: Record<string, "ungenuegend" | "genuegend" | "gut" | "sehr_gut" | "unklar">;
  strengths: string[];
  weaknesses: string[];
  closing_formula_rating: "stark" | "neutral" | "schwach" | "nicht_erkannt";
  warnings: string[];
  summary: string;
}

// Schweizer Zeugnis-Bewertungs-Heuristik
const PATTERNS = {
  sehr_gut: [
    "stets zu unserer vollsten zufriedenheit",
    "ausserordentlich",
    "ausgezeichnet",
    "hervorragend",
    "vorbildlich",
    "übertraf",
    "übertroffen",
    "ausnahmslos",
    "vollständig erfüllt",
  ],
  gut: [
    "stets zu unserer zufriedenheit",
    "voll zu unserer zufriedenheit",
    "sehr gut",
    "stets sicher",
    "kompetent",
    "zuverlässig",
    "engagiert",
    "termingerecht",
    "selbständig",
  ],
  genuegend: [
    "zu unserer zufriedenheit",
    "im grossen und ganzen",
    "in der regel",
    "gut",
    "ordentlich",
    "gewissenhaft",
    "bemühte sich",
  ],
  ungenuegend: [
    "bemühte sich, die anforderungen",
    "im rahmen seiner möglichkeiten",
    "lernte ihn als",
    "verliess das unternehmen im gegenseitigen einvernehmen",
  ],
};

const WARNING_PHRASES: Array<{ pattern: string; warning: string }> = [
  {
    pattern: "bemühte sich",
    warning: "'Bemühte sich' deutet typischerweise auf ungenügende Leistung hin.",
  },
  {
    pattern: "im rahmen seiner möglichkeiten",
    warning:
      "'Im Rahmen seiner Möglichkeiten' relativiert die Leistung kritisch.",
  },
  {
    pattern: "im grossen und ganzen",
    warning:
      "'Im grossen und ganzen' ist eine relativierende Formulierung mit kritischem Beigeschmack.",
  },
  {
    pattern: "lernten wir als",
    warning:
      "'Lernten wir als' ohne Wertung am Schluss kann eine Auslassung andeuten.",
  },
];

function ratingToScore(r: AnalysisResult["overall_rating"]): number {
  return { sehr_gut: 5.5, gut: 4.5, genuegend: 3.5, ungenuegend: 2.0 }[r];
}

function pickBestRating(text: string): {
  rating: AnalysisResult["overall_rating"];
  hits: number;
} {
  const lower = text.toLowerCase();
  let best: AnalysisResult["overall_rating"] = "genuegend";
  let bestScore = -1;

  for (const [rating, patterns] of Object.entries(PATTERNS) as Array<
    [AnalysisResult["overall_rating"], string[]]
  >) {
    let score = 0;
    for (const p of patterns) {
      if (lower.includes(p)) score++;
    }
    // gewichten: höhere Bewertungen brauchen mehr Belege, um Sandwich-Formulierungen
    // nicht falsch zu interpretieren
    const weighted =
      rating === "sehr_gut" ? score * 1.5 : rating === "ungenuegend" ? score * 1.3 : score;
    if (weighted > bestScore) {
      best = rating;
      bestScore = weighted;
    }
  }

  return { rating: best, hits: Math.max(0, bestScore) };
}

export function analyzeText(text: string): AnalysisResult {
  const lower = text.toLowerCase();

  // Globale Bewertung
  const overall = pickBestRating(text);

  // Konfidenz: wie viele Treffer
  const confidence: AnalysisResult["confidence_level"] =
    overall.hits >= 3 ? "hoch" : overall.hits >= 1 ? "mittel" : "tief";

  // Per-Kategorie (auf Stichwörter reduzieren – simpler Demo-Algorithmus)
  const categories = [
    "fachliche_leistung",
    "arbeitsweise",
    "arbeitsqualitaet",
    "zielerreichung",
    "verhalten",
  ];
  const category_scores: AnalysisResult["category_scores"] = {};

  for (const cat of categories) {
    const keywords: Record<string, string[]> = {
      fachliche_leistung: ["fachkenntnis", "fachwissen", "fachlich", "qualifikation"],
      arbeitsweise: ["arbeitsweise", "selbständig", "gewissenhaft", "termin"],
      arbeitsqualitaet: ["qualität", "präzise", "sorgfält"],
      zielerreichung: ["ziele", "zielerreichung", "übertraf", "erreichte"],
      verhalten: ["verhalten", "kollegen", "vorgesetzten", "kunden"],
    };

    const sentences = text.split(/(?<=[.!?])\s+/);
    const relevant = sentences.filter((s) =>
      keywords[cat].some((k) => s.toLowerCase().includes(k)),
    );
    if (relevant.length > 0) {
      category_scores[cat] = pickBestRating(relevant.join(" ")).rating;
    } else {
      category_scores[cat] = "unklar";
    }
  }

  // Stärken/Schwächen heuristisch
  const strengths: string[] = [];
  const weaknesses: string[] = [];

  for (const phrase of PATTERNS.sehr_gut) {
    if (lower.includes(phrase)) strengths.push(`Formulierung "${phrase}" deutet auf sehr gute Leistung hin.`);
  }
  if (strengths.length === 0) {
    for (const phrase of PATTERNS.gut.slice(0, 5)) {
      if (lower.includes(phrase)) strengths.push(`Formulierung "${phrase}" deutet auf gute Leistung hin.`);
    }
  }
  // Begrenzen
  strengths.splice(5);

  // Warnungen
  const warnings: string[] = [];
  for (const w of WARNING_PHRASES) {
    if (lower.includes(w.pattern)) warnings.push(w.warning);
  }

  // Schlussformel-Bewertung
  let closing: AnalysisResult["closing_formula_rating"] = "nicht_erkannt";
  if (
    lower.includes("bedauern") &&
    (lower.includes("sehr") || lower.includes("ausserordentlich"))
  ) {
    closing = "stark";
  } else if (lower.includes("danken") && lower.includes("alles gute")) {
    closing = "neutral";
  } else if (
    lower.includes("verliess das unternehmen im gegenseitigen einvernehmen")
  ) {
    closing = "schwach";
    warnings.push(
      "Schlussformel 'im gegenseitigen Einvernehmen' kann auf ein nicht freiwilliges Ende hindeuten.",
    );
  }

  // Schwächen aus Warnungen ableiten
  for (const w of warnings) weaknesses.push(w);

  const summary = buildSummary(overall.rating, confidence, closing);

  return {
    overall_rating: overall.rating,
    overall_score: ratingToScore(overall.rating),
    confidence_level: confidence,
    category_scores,
    strengths,
    weaknesses,
    closing_formula_rating: closing,
    warnings,
    summary,
  };
}

function buildSummary(
  rating: AnalysisResult["overall_rating"],
  confidence: AnalysisResult["confidence_level"],
  closing: AnalysisResult["closing_formula_rating"],
): string {
  const ratingLabel = {
    sehr_gut: "sehr gut",
    gut: "gut",
    genuegend: "genügend",
    ungenuegend: "kritisch",
  }[rating];

  const confidenceText =
    confidence === "hoch"
      ? "Die Bewertung stützt sich auf mehrere klare Indikatoren."
      : confidence === "mittel"
        ? "Die Bewertung basiert auf wenigen, aber eindeutigen Indikatoren."
        : "Die Indikatoren sind schwach – das Ergebnis sollte mit Vorsicht interpretiert werden.";

  const closingText =
    closing === "stark"
      ? "Die Schlussformel ist warm und drückt echtes Bedauern aus – ein positives Signal."
      : closing === "schwach"
        ? "Die Schlussformel ist auffällig kühl oder relativierend."
        : closing === "neutral"
          ? "Die Schlussformel ist Standard."
          : "Eine eindeutige Schlussformel wurde nicht erkannt.";

  return `Gesamteindruck: ${ratingLabel}. ${confidenceText} ${closingText}`;
}
