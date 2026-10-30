/**
 * zeugnix.ch – Schlusssatz-Katalog (Christoph-Matrix)
 * ----------------------------------------------------------------------------
 * Eine Quelle der Wahrheit für den Schlusssatz, genutzt von:
 *   - der Engine (lib/phrases/engine.ts) bei der Generierung
 *   - der Schlusssatz-Steuerung (components/forms/schlusssatz-controls.tsx)
 *     für die Live-Vorschau
 *   - der Route PATCH .../schlusssatz, die den Satz im Zeugnistext tauscht
 *
 * Der Schlusssatz ist EIN zusammengesetzter Block (Dank + Zukunftswünsche sind
 * eingebaut). Er wird gewählt entlang:
 *   Zeugnistyp  (schluss | zwischen)
 *   Austrittsgrund (wunsch_an | wunsch_ag | einvernehmen)   – nur bei Schluss
 *   Wertschätzungsgrad (standard | wertschaetzender | top)
 *   Opt-ins Schluss:  Reorganisation (eigener Satz je Grund und Grad),
 *                     Bedauern (Zusatz zum Satz, je Grad)
 *   Opt-ins Zwischen: Anlass = Vorgesetztenwechsel | interner Wechsel |
 *                     Reorganisation (eigener Satz je Grad)
 *
 * Jede Kombination ergibt einen eigenen Satz; ein Wechsel einer einzelnen
 * Auswahl ändert den Satz immer (geprüft in scripts/test-schlusssaetze.ts).
 * Die bisherigen Sätze von Christoph bleiben die Standard- bzw. wertschätzende
 * Fassung; neu sind die Top-Fassungen (Foliensatz 30.10.2026) und die eigenen
 * Sätze für Wunsch des Arbeitgebers und Einvernehmen. Ton-Freigabe durch
 * Christoph steht für die neuen Sätze noch aus.
 *
 * Gender-Tokens {{maskulin|feminin|neutral}} werden von der Engine bzw. der
 * Vorschau aufgelöst (m → 1., f → 2., d → 3. Wert).
 */

export type Wertschaetzung = "standard" | "wertschaetzender" | "top";
export type Grund = "wunsch_an" | "wunsch_ag" | "einvernehmen";
export type ZwischenAnlass =
  | "wunsch"
  | "vorgesetztenwechsel"
  | "interner_wechsel"
  | "reorganisation";

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

// Gender-Tokens, damit die Sätze unten lesbar bleiben.
const IHM = "{{ihm|ihr|ihm/ihr}}";
const IHN = "{{ihn|sie|ihn/sie}}";
const ER = "{{er|sie|er/sie}}";
const SEIN = "{{sein|ihr|sein/ihr}}";
const SEINE = "{{seine|ihre|seine/ihre}}";
const SEINEN = "{{seinen|ihren|seinen/ihren}}";
const SEINER = "{{seiner|ihrer|seiner/ihrer}}";
const NAME = "{vorname} {nachname}";

// Ein Schlusssatz besteht aus einem optionalen Kontextsatz (Reorganisation)
// und dem Kern (Dank + Wünsche). Das Bedauern wird dazwischen bzw. danach
// eingefügt, siehe BEDAUERN.
interface Satz {
  kontext?: string;
  kern: string;
}

// ---------------------------------------------------------------------------
// Schlusszeugnis
// ---------------------------------------------------------------------------

const SCHLUSS: Record<Grund, Record<Wertschaetzung, Satz>> = {
  wunsch_an: {
    standard: {
      kern: `Wir danken ${IHM} für die geleistete Arbeit und wünschen ${IHM} für die Zukunft alles Gute und weiterhin viel Erfolg.`,
    },
    wertschaetzender: {
      kern: `Wir danken ${IHM} für die stets sehr gute Zusammenarbeit und die wertvollen Leistungen. Für die Zukunft wünschen wir ${IHM} alles Gute und weiterhin viel Erfolg.`,
    },
    top: {
      kern: `Wir bedauern ${SEINEN} Entscheid sehr, danken ${IHM} herzlich für die stets ausgezeichnete Zusammenarbeit und die hervorragenden Leistungen und wünschen ${IHM} für ${SEINE} berufliche und private Zukunft alles Gute und weiterhin viel Erfolg.`,
    },
  },
  wunsch_ag: {
    standard: {
      kern: `Wir danken ${IHM} für die geleistete Arbeit und wünschen ${IHM} für den weiteren beruflichen Weg alles Gute und viel Erfolg.`,
    },
    wertschaetzender: {
      kern: `Wir danken ${IHM} für die stets sehr gute Zusammenarbeit und die wertvollen Leistungen und wünschen ${IHM} für den weiteren beruflichen Weg alles Gute und viel Erfolg.`,
    },
    // Die Weiterempfehlung beantwortet die Frage jedes Lesers («warum?»):
    // nicht wegen der Leistung – ohne den Grund zu nennen.
    top: {
      kern: `Wir bedauern sehr, dass wir das Arbeitsverhältnis nicht fortsetzen können. Wir danken ${IHM} herzlich für die stets ausgezeichnete Zusammenarbeit und die hervorragenden Leistungen, empfehlen ${IHN} uneingeschränkt weiter und wünschen ${IHM} für ${SEINE} berufliche und private Zukunft alles Gute und weiterhin viel Erfolg.`,
    },
  },
  einvernehmen: {
    standard: {
      kern: `Wir danken ${IHM} für die geleistete Arbeit und wünschen ${IHM} für die berufliche Zukunft alles Gute und viel Erfolg.`,
    },
    wertschaetzender: {
      kern: `Wir danken ${IHM} für die stets sehr gute Zusammenarbeit und die wertvollen Leistungen und wünschen ${IHM} für die berufliche Zukunft alles Gute und viel Erfolg.`,
    },
    top: {
      kern: `Wir bedauern ${SEIN} Ausscheiden sehr, danken ${IHM} herzlich für die stets ausgezeichnete Zusammenarbeit und die hervorragenden Leistungen und wünschen ${IHM} für ${SEINE} berufliche und private Zukunft alles Gute und weiterhin viel Erfolg.`,
    },
  },
};

// Opt-in „Reorganisation": eigener Satz je Austrittsgrund und Grad.
const KERN_REORG: Record<Wertschaetzung, string> = {
  standard: `Wir danken ${IHM} für die geleistete Arbeit und wünschen ${IHM} für die Zukunft alles Gute und weiterhin viel Erfolg.`,
  wertschaetzender: `Wir danken ${IHM} für die stets sehr gute Zusammenarbeit und die wertvollen Leistungen und wünschen ${IHM} für die Zukunft alles Gute und weiterhin viel Erfolg.`,
  top: `Wir bedauern dies sehr, danken ${IHM} herzlich für die stets ausgezeichnete Zusammenarbeit und die hervorragenden Leistungen und wünschen ${IHM} für ${SEINE} berufliche und private Zukunft alles Gute und weiterhin viel Erfolg.`,
};

const REORG_AN = `Im Zusammenhang mit einer Reorganisation verlässt ${ER} unser Unternehmen auf eigenen Wunsch.`;
const REORG_EINVERNEHMEN =
  "Im Zusammenhang mit einer Reorganisation endet das Arbeitsverhältnis im gegenseitigen Einvernehmen.";
const REORG_AG = "Dieses Arbeitsverhältnis wurde im Rahmen einer Reorganisation beendet.";

const SCHLUSS_REORG: Record<Grund, Record<Wertschaetzung, Satz>> = {
  wunsch_an: {
    standard: { kontext: REORG_AN, kern: KERN_REORG.standard },
    wertschaetzender: { kontext: REORG_AN, kern: KERN_REORG.wertschaetzender },
    top: { kontext: REORG_AN, kern: KERN_REORG.top },
  },
  einvernehmen: {
    standard: { kontext: REORG_EINVERNEHMEN, kern: KERN_REORG.standard },
    wertschaetzender: { kontext: REORG_EINVERNEHMEN, kern: KERN_REORG.wertschaetzender },
    top: { kontext: REORG_EINVERNEHMEN, kern: KERN_REORG.top },
  },
  wunsch_ag: {
    standard: { kontext: REORG_AG, kern: KERN_REORG.standard },
    wertschaetzender: { kontext: REORG_AG, kern: KERN_REORG.wertschaetzender },
    // Top sagt offen, was codierte Zeugnisse nur andeuten.
    top: {
      kontext: `Das Arbeitsverhältnis endet infolge einer Reorganisation, nicht aus Gründen in ${SEINER} Person oder Leistung.`,
      kern: `Wir bedauern dies sehr, danken ${IHM} herzlich für die stets ausgezeichnete Zusammenarbeit und die hervorragenden Leistungen und empfehlen ${IHN} uneingeschränkt weiter. Für ${SEINE} berufliche und private Zukunft wünschen wir ${IHM} alles Gute und weiterhin viel Erfolg.`,
    },
  },
};

// Opt-in „Bedauern" ergänzt den Satz, statt ihn zu ersetzen – so wirken
// Austrittsgrund und Grad weiter. Bei Top steckt das Bedauern schon im Kern,
// darum kommt dort ein eigener Abschluss dazu.
const BEDAUERN: Record<Wertschaetzung, { text: string; stelle: "vor" | "nach" }> = {
  standard: { text: `Wir bedauern ${SEIN} Ausscheiden.`, stelle: "vor" },
  wertschaetzender: { text: `Wir bedauern ${SEIN} Ausscheiden sehr.`, stelle: "vor" },
  top: { text: `Mit ${IHM} verlieren wir eine hervorragende Fachkraft.`, stelle: "nach" },
};

// ---------------------------------------------------------------------------
// Zwischenzeugnis – die Person BLEIBT angestellt, darum nie ein Bedauern.
// ---------------------------------------------------------------------------

const ZWISCHEN: Record<ZwischenAnlass, Record<Wertschaetzung, string>> = {
  // Ausblick statt Abschiedsformel: «alles Gute» ohne Ausblick wird als
  // Trennungssignal gelesen. «Auf Wunsch von {Name}» statt «des Mitarbeiters»,
  // weil der Satz auch für Kader/GF gilt.
  wunsch: {
    standard: `Dieses Zwischenzeugnis wird auf Wunsch von ${NAME} ausgestellt. Wir danken ${IHM} für die bisherige wertvolle Mitarbeit und freuen uns auf die weitere erfolgreiche Zusammenarbeit.`,
    wertschaetzender: `Dieses Zwischenzeugnis wird auf Wunsch von ${NAME} ausgestellt. Wir danken ${IHM} für die bisherige sehr wertvolle und engagierte Mitarbeit und freuen uns auf die weitere erfolgreiche Zusammenarbeit.`,
    top: `Dieses Zwischenzeugnis wird auf Wunsch von ${NAME} ausgestellt. Wir danken ${IHM} herzlich für die bisherige ausgezeichnete Zusammenarbeit und die hervorragenden Leistungen und freuen uns, weiterhin auf ${SEINE} wertvolle Mitarbeit zählen zu dürfen.`,
  },
  // Standard = Christophs Baustein aus Migration 010, für den Zwischen-Kontext
  // gespiegelt.
  vorgesetztenwechsel: {
    standard: `Dieses Zwischenzeugnis wird aufgrund eines Vorgesetztenwechsels ausgestellt. Wir danken ${NAME} für die bisherige sehr wertvolle Unterstützung bestens und hoffen, noch lange auf ${SEINE} geschätzte Mitarbeit zählen zu dürfen.`,
    wertschaetzender: `Dieses Zwischenzeugnis wird aufgrund eines Vorgesetztenwechsels ausgestellt. Wir danken ${NAME} bestens für die bisherige sehr gute Zusammenarbeit und die wertvollen Leistungen und hoffen, noch lange auf ${SEINE} geschätzte Mitarbeit zählen zu dürfen.`,
    top: `Dieses Zwischenzeugnis wird aufgrund eines Vorgesetztenwechsels ausgestellt. Wir danken ${NAME} herzlich für die bisherige ausgezeichnete Zusammenarbeit und die hervorragenden Leistungen und hoffen, noch lange auf ${SEINE} sehr geschätzte Mitarbeit zählen zu dürfen.`,
  },
  interner_wechsel: {
    standard: `Dieses Zwischenzeugnis wird aufgrund eines internen Wechsels ausgestellt. Wir danken ${NAME} bestens für die bisherige wertvolle Mitarbeit und wünschen ${IHM} viel Freude und Erfolg im neuen Aufgabengebiet.`,
    wertschaetzender: `Dieses Zwischenzeugnis wird aufgrund eines internen Wechsels ausgestellt. Wir danken ${NAME} bestens für die bisherige sehr gute Zusammenarbeit und die wertvollen Leistungen und wünschen ${IHM} im neuen Aufgabengebiet viel Freude und weiterhin viel Erfolg.`,
    top: `Dieses Zwischenzeugnis wird aufgrund eines internen Wechsels ausgestellt. Wir danken ${NAME} herzlich für die bisherige ausgezeichnete Zusammenarbeit und die hervorragenden Leistungen. Wir freuen uns, dass ${ER} ${SEIN} Können künftig im neuen Aufgabengebiet einbringt, und wünschen ${IHM} dort viel Freude und weiterhin viel Erfolg.`,
  },
  // Kein «weiterhin zählen zu dürfen»: Bei einer Reorganisation ist offen, ob
  // die Stelle bleibt.
  reorganisation: {
    standard: `Dieses Zwischenzeugnis wird im Zuge einer Reorganisation ausgestellt. Wir danken ${NAME} für die bisherige wertvolle Mitarbeit und wünschen ${IHM} weiterhin viel Erfolg.`,
    wertschaetzender: `Dieses Zwischenzeugnis wird im Zuge einer Reorganisation ausgestellt. Wir danken ${NAME} für die bisherige sehr gute Zusammenarbeit und die wertvollen Leistungen und wünschen ${IHM} weiterhin viel Erfolg.`,
    top: `Dieses Zwischenzeugnis wird im Zuge einer Reorganisation ausgestellt. Wir danken ${NAME} herzlich für die bisherige ausgezeichnete Zusammenarbeit und die hervorragenden Leistungen und wünschen ${IHM} weiterhin viel Freude und Erfolg.`,
  },
};

// ---------------------------------------------------------------------------
// Auswahl
// ---------------------------------------------------------------------------

/**
 * Anlass des Zwischenzeugnisses aus den Opt-ins. Die Steuerung erlaubt nur
 * einen Anlass; für Alt-Daten mit mehreren gilt die Reihenfolge wie in
 * deriveLegacyType: Vorgesetztenwechsel vor internem Wechsel, Reorg zuletzt.
 */
export function zwischenAnlass(p: SchlusssatzParams): ZwischenAnlass {
  if (p.optinVorgesetztenwechsel) return "vorgesetztenwechsel";
  if (p.optinInternerWechsel) return "interner_wechsel";
  if (p.optinReorg) return "reorganisation";
  return "wunsch";
}

/**
 * Liefert die Schlusssatz-Vorlage (mit {{m|f|d}}-Tokens und {vorname}/{nachname})
 * für die gegebene Kombination – oder null bei der Arbeitsbestätigung (die
 * Engine hat dafür einen eigenen Satz).
 */
export function pickSchlusssatz(p: SchlusssatzParams): string | null {
  const grad: Wertschaetzung = p.wertschaetzung ?? "standard";

  if (p.zeugnisTyp === "schluss") {
    const grund: Grund = p.austrittsgrund ?? "wunsch_an";
    const satz = (p.optinReorg ? SCHLUSS_REORG : SCHLUSS)[grund][grad];
    const teile = [satz.kontext];
    if (p.optinBedauern) {
      const b = BEDAUERN[grad];
      teile.push(...(b.stelle === "vor" ? [b.text, satz.kern] : [satz.kern, b.text]));
    } else {
      teile.push(satz.kern);
    }
    return teile.filter(Boolean).join(" ");
  }

  if (p.zeugnisTyp === "zwischen") {
    return ZWISCHEN[zwischenAnlass(p)][grad];
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
