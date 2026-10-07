import { BRAND_THEMES, BUILTIN_THEMES } from "@/lib/design/document-tokens";

/**
 * Nimmt den Rumpf einer Anfrage an /api/companies und gibt daraus genau die
 * Felder zurück, die geschrieben werden dürfen.
 *
 * Zwei Eigenschaften sind hier wichtig und leicht zu verlieren:
 *
 *  1. Nur ÜBERGEBENE Felder werden zurückgegeben. Das Formular hat einen
 *     Kurzmodus, in dem Logo, Kontaktdaten und Unterzeichnende nicht gerendert
 *     werden. Würden diese Felder trotzdem geschrieben, überschriebe ein
 *     Speichern im Kurzmodus vorhandene Werte mit null – ein Datenverlust, der
 *     niemandem auffällt, bis das nächste Zeugnis ohne Unterschriftsblock
 *     herauskommt.
 *
 *  2. created_by_user_id steht NICHT in dieser Liste. Es wird serverseitig aus
 *     der Sitzung gesetzt. Stünde es hier, könnte ein Aufrufer eine Firma auf
 *     einen fremden Benutzer eintragen.
 */
const TEXT_FIELDS = [
  "name",
  "address",
  "postal_code",
  "city",
  "website",
  "phone",
  "email",
  "signatory_1_name",
  "signatory_1_role",
  "signatory_2_name",
  "signatory_2_role",
  // Ausstellerspezifische Fusszeile (mehrzeilig). trimmedOrNull trimmt nur aussen
  // und erhält interne Zeilenumbrüche; Länge wird unten begrenzt.
  "certificate_footer",
] as const;

export type CompanyPayload = Record<string, string | null>;

export interface PickOptions {
  /** Aktueller Wert von default_certificate_font_family, falls die Firma schon existiert. */
  currentTheme?: string | null;
}

/** Die Alt-Werte der Spalte, bevor sie Theme-IDs hielt. resolveTheme() versteht sie weiterhin. */
const LEGACY_THEME_VALUES = ["helvetica", "times", "courier"];

function trimmedOrNull(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return trimmed === "" ? null : trimmed;
}

export function pickCompanyFields(
  body: Record<string, unknown>,
  options: PickOptions = {},
): { data: CompanyPayload; error?: string } {
  const data: CompanyPayload = {};

  for (const field of TEXT_FIELDS) {
    if (field in body) data[field] = trimmedOrNull(body[field]);
  }

  if ("name" in body) {
    if (!data.name) return { data, error: "Der Firmenname ist Pflicht." };
    if (data.name.length > 200) return { data, error: "Der Firmenname ist zu lang." };
  }

  // Fusszeile: wenige Zeilen Branding/Pflichtangaben, kein Fliesstext. Die Grenze
  // schützt das Layout (die Fusszeile sitzt im Seitenunterrand) und die DB.
  if (data.certificate_footer && data.certificate_footer.length > 500) {
    return { data, error: "Die Fusszeile ist zu lang (max. 500 Zeichen)." };
  }

  // logo_url wird hier nur durchgelassen, um ein Logo zu ENTFERNEN. Gesetzt wird
  // es ausschliesslich von /api/companies/[id]/logo – sonst könnte ein Aufrufer
  // eine beliebige Adresse eintragen, und die PDF-Route würde sie abrufen.
  if ("logo_url" in body) {
    const value = trimmedOrNull(body.logo_url);
    if (value !== null) {
      return {
        data,
        error: "Ein Logo wird über /api/companies/<id>/logo hochgeladen, nicht über dieses Feld.",
      };
    }
    data.logo_url = null;
  }

  if ("default_certificate_font_family" in body) {
    const value = trimmedOrNull(body.default_certificate_font_family);
    if (value !== null) {
      const erlaubt =
        Object.keys(BUILTIN_THEMES).includes(value) ||
        LEGACY_THEME_VALUES.includes(value) ||
        // Marken-Themes sind nicht öffentlich wählbar (Whitelabeling, zentral per
        // SQL gesetzt). Das Formular sendet den bestehenden Wert unverändert
        // zurück, damit ein Speichern ihn nicht auf einen Standard-Stil
        // zurücksetzt – genau dieser Fall, und nur dieser, ist erlaubt.
        (value === options.currentTheme && Object.keys(BRAND_THEMES).includes(value));
      if (!erlaubt) {
        return { data, error: "Unbekannter Stil." };
      }
    }
    data.default_certificate_font_family = value;
  }

  return { data };
}
