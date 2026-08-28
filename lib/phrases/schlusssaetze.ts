/**
 * zeugnix.ch – Schlusssatz-Katalog (Christoph-Matrix)
 * ----------------------------------------------------------------------------
 * Eine Quelle der Wahrheit für den Schlusssatz, genutzt von:
 *   - der Engine (lib/phrases/engine.ts) bei der Generierung
 *   - dem Formular (components/forms/new-certificate-form.tsx) für die
 *     Live-Vorschau
 *
 * Der Schlusssatz ist EIN zusammengesetzter Block (Dank + Zukunftswünsche sind
 * eingebaut). Er wird gewählt entlang:
 *   Zeugnistyp  (schluss | zwischen)
 *   Austrittsgrund (wunsch_an | wunsch_ag | einvernehmen)   – nur bei Schluss
 *   Wertschätzungsgrad (standard | wertschaetzender | top)
 *   Opt-ins Schluss:  Bedauern (ersetzt den Satz), Reorganisation
 *   Opt-ins Zwischen: Anlass = Vorgesetztenwechsel | interner Wechsel |
 *                     Reorganisation (ersetzt den Standard-Zwischensatz)
 *
 * Gender-Tokens {{maskulin|feminin|neutral}} werden von der Engine bzw. der
 * Vorschau aufgelöst (m → 1., f → 2., d → 3. Wert).
 *
 * Leere Zellen (z.B. „Top-Mitarbeitende", wertschätzender-Zwischen, Einvernehmen)
 * sind bewusst noch nicht befüllt – die Auswahl fällt sauber auf die Standard-
 * Variante zurück. Diese Zellen werden später per Build-Time-KI ergänzt und von
 * Christoph geprüft.
 */

export type Wertschaetzung = "standard" | "wertschaetzender" | "top";
export type Grund = "wunsch_an" | "wunsch_ag" | "einvernehmen";

export interface SchlusssatzParams {
  zeugnisTyp: "schluss" | "zwischen" | "arbeitsbestaetigung";
  austrittsgrund?: Grund | null;
  wertschaetzung?: Wertschaetzung | null;
  optinBedauern?: boolean;
  optinReorg?: boolean;
  // Nur Zwischenzeugnis: Anlass des Zwischenzeugnisses. Passt den Schlusssatz an
  // (Person bleibt angestellt). Vorrang vor dem grad-basierten Standardsatz.
  optinVorgesetztenwechsel?: boolean;
  optinInternerWechsel?: boolean;
}

// ---------------------------------------------------------------------------
// Katalog – von Christoph gelieferte Formulierungen (Rest = Lücke → Fallback)
// ---------------------------------------------------------------------------

const SCHLUSS: Record<Grund, Partial<Record<Wertschaetzung, string>>> = {
  wunsch_an: {
    standard:
      "Wir danken {{ihm|ihr|ihm/ihr}} für die geleistete Arbeit und wünschen {{ihm|ihr|ihm/ihr}} für die Zukunft alles Gute und weiterhin viel Erfolg.",
    wertschaetzender:
      "Wir danken {{ihm|ihr|ihm/ihr}} für die stets sehr gute Zusammenarbeit und die wertvollen Leistungen. Für die Zukunft wünschen wir {{ihm|ihr|ihm/ihr}} alles Gute und weiterhin viel Erfolg.",
    // top: Lücke (KI-Ergänzung)
  },
  wunsch_ag: {
    // Lücke – fällt auf wunsch_an zurück (Reorg-AG siehe SCHLUSS_REORG_AG)
  },
  einvernehmen: {
    // Lücke – fällt auf wunsch_an zurück
  },
};

// Opt-in „Bedauern" ersetzt den Satz (immer als Ergänzung, auch bei anderen
// Opt-ins → hat Vorrang). Wertschätzender Grundton.
const SCHLUSS_BEDAUERN =
  "Wir bedauern {{sein|ihr|sein/ihr}} Ausscheiden und danken {{ihm|ihr|ihm/ihr}} für die stets sehr gute Zusammenarbeit und die wertvollen Leistungen und wünschen {{ihm|ihr|ihm/ihr}} für die Zukunft alles Gute und weiterhin viel Erfolg.";

// Opt-in „Reorganisation" – arbeitnehmer- vs. arbeitgeberinitiiert.
const SCHLUSS_REORG_DEFAULT =
  "Im Zusammenhang mit einer Reorganisation danken wir {{ihm|ihr|ihm/ihr}} für die stets sehr gute Zusammenarbeit und die wertvollen Leistungen und wünschen {{ihm|ihr|ihm/ihr}} für die Zukunft alles Gute und weiterhin viel Erfolg.";
const SCHLUSS_REORG_AG =
  "Dieses Arbeitsverhältnis wurde im Rahmen einer Reorganisation beendet. Wir danken {{ihm|ihr|ihm/ihr}} für die geleistete Arbeit und wünschen {{ihm|ihr|ihm/ihr}} für die Zukunft alles Gute und weiterhin viel Erfolg.";

const ZWISCHEN: Partial<Record<Wertschaetzung, string>> = {
  standard:
    "Dieses Zwischenzeugnis wird auf Wunsch {{des Mitarbeiters|der Mitarbeiterin|des/der Mitarbeitenden}} ausgestellt. Wir danken {vorname} {nachname} für die bisherige wertvolle Mitarbeit und wünschen {{ihm|ihr|ihm/ihr}} alles Gute und weiterhin viel Erfolg.",
  // wertschaetzender / top: Lücke (KI-Ergänzung)
};

// Zwischenzeugnis – Anlass-Varianten. Beim Zwischenzeugnis BLEIBT die Person
// angestellt; der gewählte Anlass verändert nur den Schlusssatz und ersetzt den
// Standard-Zwischensatz oben. Basis = Christoph-abgesegnete Bausteine aus
// Migration 010 (phrase_blocks: vorgesetztenwechsel / interner_wechsel), hier
// für den Zwischen-Kontext gespiegelt/angepasst.
// ENTWURF – finale Formulierung + Freigabe durch Christoph noch ausstehend.
const ZWISCHEN_VORGESETZTENWECHSEL =
  "Dieses Zwischenzeugnis wird aufgrund eines Vorgesetztenwechsels ausgestellt. Wir danken {vorname} {nachname} für die bisherige sehr wertvolle Unterstützung bestens und hoffen, noch lange auf {{seine|ihre|seine/ihre}} geschätzte Mitarbeit zählen zu dürfen.";
const ZWISCHEN_INTERNER_WECHSEL =
  "Dieses Zwischenzeugnis wird aufgrund eines internen Wechsels ausgestellt. Wir danken {vorname} {nachname} bestens für die bisherige wertvolle Mitarbeit und wünschen {{ihm|ihr|ihm/ihr}} viel Freude und Erfolg im neuen Aufgabengebiet.";
const ZWISCHEN_REORG =
  "Dieses Zwischenzeugnis wird im Zuge einer Reorganisation ausgestellt. Wir danken {vorname} {nachname} für die bisherige wertvolle Mitarbeit und wünschen {{ihm|ihr|ihm/ihr}} weiterhin viel Erfolg.";

// ---------------------------------------------------------------------------
// Auswahl
// ---------------------------------------------------------------------------

/**
 * Liefert die Schlusssatz-Vorlage (mit {{m|f|d}}-Tokens und {vorname}/{nachname})
 * für die gegebene Kombination – oder null, wenn kein Satz zutrifft (Aufrufer
 * nutzt dann einen eigenen Fallback). Für schluss/zwischen wird über sinnvolle
 * Fallbacks stets ein Satz geliefert.
 */
export function pickSchlusssatz(p: SchlusssatzParams): string | null {
  const grad: Wertschaetzung = p.wertschaetzung ?? "standard";

  if (p.zeugnisTyp === "schluss") {
    if (p.optinBedauern) return SCHLUSS_BEDAUERN;
    if (p.optinReorg)
      return p.austrittsgrund === "wunsch_ag"
        ? SCHLUSS_REORG_AG
        : SCHLUSS_REORG_DEFAULT;

    const grund: Grund = p.austrittsgrund ?? "wunsch_an";
    const byGrund = SCHLUSS[grund] ?? {};
    return (
      byGrund[grad] ??
      byGrund.standard ??
      SCHLUSS.wunsch_an[grad] ??
      SCHLUSS.wunsch_an.standard ??
      null
    );
  }

  if (p.zeugnisTyp === "zwischen") {
    // Anlass-Opt-ins haben Vorrang vor dem grad-basierten Standard-Zwischensatz
    // (analog zu Bedauern/Reorg beim Schlusszeugnis). Reihenfolge wie in
    // deriveLegacyType: Vorgesetztenwechsel vor internem Wechsel, Reorg zuletzt.
    if (p.optinVorgesetztenwechsel) return ZWISCHEN_VORGESETZTENWECHSEL;
    if (p.optinInternerWechsel) return ZWISCHEN_INTERNER_WECHSEL;
    if (p.optinReorg) return ZWISCHEN_REORG;
    return ZWISCHEN[grad] ?? ZWISCHEN.standard ?? null;
  }

  // arbeitsbestaetigung: eigener Satz direkt in der Engine
  return null;
}

/** Optionale Person für die Vorschau: echte Gender-/Namensauflösung. */
export interface SchlusssatzSubject {
  firstName: string;
  lastName: string;
  gender: "m" | "f" | "d";
}

/**
 * Schlusssatz-Vorschau. Ohne `subject` neutral (3. Token-Wert „ihm/ihr",
 * Namensplatzhalter als [Name]). Mit `subject` wird wie in der Engine aufgelöst:
 * m → 1., f → 2., d → 3. Wert, echte Namen eingesetzt. So zeigt die Vorschau auf
 * der Detailseite denselben Satz, den „Generieren" später bäckt.
 */
export function schlusssatzPreview(
  p: SchlusssatzParams,
  subject?: SchlusssatzSubject,
): string | null {
  const tmpl = pickSchlusssatz(p);
  if (!tmpl) return null;
  const genderIdx = subject
    ? subject.gender === "m"
      ? 0
      : subject.gender === "f"
        ? 1
        : 2
    : 2;
  const resolved = tmpl.replace(/\{\{([^{}]*)\}\}/g, (_m, inner: string) => {
    const parts = inner.split("|");
    return (parts[genderIdx] ?? parts[0] ?? "").trim();
  });
  if (subject) {
    return resolved
      .replace(/\{vorname\}/g, subject.firstName)
      .replace(/\{nachname\}/g, subject.lastName);
  }
  return resolved
    .replace(/\{vorname\}\s*\{nachname\}/g, "[Name]")
    .replace(/\{vorname\}/g, "[Vorname]")
    .replace(/\{nachname\}/g, "[Nachname]");
}

/**
 * Leitet den Legacy-`certificates.type` aus Zeugnistyp + Opt-ins ab. EINZIGE
 * Quelle dieser Ableitung – genutzt beim Anlegen (new-certificate-form) und beim
 * nachträglichen Ändern der Schlusssatz-Optionen (PATCH .../schlusssatz), damit
 * beide Wege exakt denselben Typ (und damit Intro/Tempus/Wechsel-Zweig in der
 * Engine) erzeugen.
 */
export function deriveLegacyType(
  zeugnisTyp: "schluss" | "zwischen" | "arbeitsbestaetigung",
  optins: {
    optinReorg?: boolean;
    optinVorgesetztenwechsel?: boolean;
    optinInternerWechsel?: boolean;
  },
): string {
  if (zeugnisTyp === "arbeitsbestaetigung") return "arbeitsbestaetigung";
  if (zeugnisTyp === "zwischen") {
    if (optins.optinVorgesetztenwechsel) return "vorgesetztenwechsel";
    if (optins.optinInternerWechsel) return "interner_wechsel";
    return "zwischen";
  }
  return optins.optinReorg ? "reorganisation" : "schluss";
}
