/**
 * zeugnix.ch – Effektive Unterzeichnende (Zeugnis-Override ⟶ Firmenvorgabe)
 * ----------------------------------------------------------------------------
 * Unterzeichnende können auf zwei Ebenen gesetzt sein:
 *   - Firma  (companies.signatory_1_name/role, signatory_2_name/role) – Vorgabe
 *   - Zeugnis (certificates.signatory_1_name/role, …) – optionaler Override
 *
 * Regel pro Slot (1 und 2 unabhängig): ist auf dem Zeugnis ein NAME gesetzt,
 * gilt der Zeugnis-Wert (Name + Rolle); sonst die Firmenvorgabe. Eine Rolle ohne
 * Name greift bewusst nicht – der Name ist der Anker.
 *
 * EINZIGE Quelle dieser Auflösung, damit PDF (app/api/certificates/[id]/pdf) und
 * A4-Vorschau (Detailseite) garantiert dieselben Unterzeichnenden zeigen.
 */

export interface SignatoryFields {
  signatory_1_name?: string | null;
  signatory_1_role?: string | null;
  signatory_2_name?: string | null;
  signatory_2_role?: string | null;
}

export interface EffectiveSignatories {
  signatory_1_name: string | null;
  signatory_1_role: string | null;
  signatory_2_name: string | null;
  signatory_2_role: string | null;
}

function pickSlot(
  certName: string | null | undefined,
  certRole: string | null | undefined,
  companyName: string | null | undefined,
  companyRole: string | null | undefined,
): { name: string | null; role: string | null } {
  const cn = (certName ?? "").trim();
  if (cn) return { name: cn, role: (certRole ?? "").trim() || null };
  const con = (companyName ?? "").trim();
  return { name: con || null, role: (companyRole ?? "").trim() || null };
}

export function resolveSignatories(
  cert: SignatoryFields,
  company: SignatoryFields,
): EffectiveSignatories {
  const s1 = pickSlot(
    cert.signatory_1_name,
    cert.signatory_1_role,
    company.signatory_1_name,
    company.signatory_1_role,
  );
  const s2 = pickSlot(
    cert.signatory_2_name,
    cert.signatory_2_role,
    company.signatory_2_name,
    company.signatory_2_role,
  );
  return {
    signatory_1_name: s1.name,
    signatory_1_role: s1.role,
    signatory_2_name: s2.name,
    signatory_2_role: s2.role,
  };
}
