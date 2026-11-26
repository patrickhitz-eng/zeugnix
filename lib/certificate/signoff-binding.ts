/**
 * zeugnio – Bindung einer Unterzeichner-Freigabe an Text und Namen
 * ----------------------------------------------------------------------------
 * Sicherheitstest 24.11.2026, Befund M3.
 *
 * PROBLEM: Eine Freigabe (certificate_signoffs, 020) hielt nur fest, DASS eine
 * Person zugestimmt hat, nicht WOZU. Die Unterzeichnerin gibt Text A frei,
 * danach ändert die Personalabteilung auf Text B und finalisiert. Prüfseite und
 * PDF meldeten B als «bestätigt».
 *
 * LÖSUNG: Beim Klick auf «Zeugnis freigeben» speichert die Freigabe den
 * SHA-256 des Texts, den die Person gesehen hat (`confirmed_text_hash`), und
 * Name und Rolle, unter denen sie angefragt wurde (`confirmed_name`,
 * `confirmed_role`, Migration 041). Eine Freigabe zählt nur, wenn beides zum
 * Zeugnis passt:
 *   - der Hash zum Text des Zeugnisses (nach dem Finalisieren der versiegelte
 *     Text, der per Trigger unveränderlich ist), und
 *   - Name und Rolle zum Unterschriftsfeld des Slots (nach dem Finalisieren
 *     aus dem eingefrorenen Siegel, siehe lib/certificate/presentation.ts).
 *
 * Passt etwas nicht, ist die Freigabe «veraltet»: Prüfseite und PDF zeigen sie
 * nicht an, HR sieht sie in der App als veraltet und kann sie neu anfordern.
 *
 * Warum nicht einfach Freigaben bei jeder Änderung zurücksetzen? Text und
 * Namen ändern sich über viele Wege (Editor, Neu generieren, Schlusssatz,
 * Unterzeichnende pro Zeugnis, Firmeneinstellungen auf `companies`). Jeder
 * vergessene Weg wäre wieder dasselbe Loch. Der Vergleich hier geschieht dort,
 * wo die Freigabe angezeigt wird, und gilt damit für jeden Schreibweg.
 *
 * Der Text-Hash ist der v1-Body-Hash (`hashBodyV1`): SHA-256 über den
 * kanonisierten Fliesstext, dieselbe Pipeline wie beim Finalisieren. Er deckt
 * bewusst NUR den Text und nicht die Meta-Felder des v2-Siegels. Sonst würde
 * eine Änderung an Unterschrift 2 auch die Freigabe von Unterschrift 1
 * entwerten. Name und Rolle des eigenen Slots prüft der Namensvergleich.
 *
 * ALTBESTAND (Freigaben von vor 041, ohne Hash): Eine solche Freigabe zählt nur,
 * wenn sie NACH dem Finalisieren erteilt wurde. Dann war der Text bereits
 * versiegelt und unveränderlich, die Person hat also genau ihn gesehen. Eine
 * ältere Freigabe lässt sich nicht mehr einem Text zuordnen und gilt als
 * veraltet. Name und Rolle kommen dann aus `name`/`role` (Stand der Anfrage).
 */

import { canonicalizeForHash, hashBodyV1 } from "@/lib/hash/canonicalize";

/** Spalten, die die Bindungsprüfung aus certificate_signoffs braucht. */
export const SIGNOFF_BINDING_COLS =
  "slot, status, name, role, confirmed_at, confirmed_text_hash, confirmed_name, confirmed_role";

export interface SignoffBindingRow {
  slot: number;
  status: string;
  name?: string | null;
  role?: string | null;
  confirmed_at?: string | null;
  confirmed_text_hash?: string | null;
  confirmed_name?: string | null;
  confirmed_role?: string | null;
}

export interface SignoffBindingContext {
  /** Text-Hash des Zeugnisses (`certificateTextHash`), null = kein Text. */
  textHash: string | null;
  /** Name und Rolle, die heute im Unterschriftsfeld des Slots stehen. */
  slotName: string | null | undefined;
  slotRole: string | null | undefined;
  /** finalized_at des Zeugnisses (nur für den Altbestand ohne Hash). */
  finalizedAt?: string | null;
}

/**
 * bound       Freigabe zählt.
 * stale_text  Der Text wurde nach der Freigabe geändert.
 * stale_name  Name oder Rolle im Unterschriftsfeld wurden geändert.
 * unbound     Altbestand ohne Hash, vor dem Finalisieren erteilt.
 * open        Keine Bestätigung (ausstehend, abgelehnt, abgelaufen).
 */
export type SignoffBindingState =
  | "bound"
  | "stale_text"
  | "stale_name"
  | "unbound"
  | "open";

/** Der Text, den Finalisieren, PDF und Freigabe-Seite verwenden. */
export function certificateBodyText(cert: {
  edited_text?: string | null;
  generated_text?: string | null;
}): string {
  return cert.edited_text || cert.generated_text || "";
}

/** SHA-256 über den kanonisierten Fliesstext, null bei leerem Text. */
export async function certificateTextHash(cert: {
  edited_text?: string | null;
  generated_text?: string | null;
}): Promise<string | null> {
  const body = certificateBodyText(cert);
  if (!canonicalizeForHash(body)) return null;
  return hashBodyV1(body);
}

/** Namen und Rollen whitespace-tolerant vergleichen; leer == null. */
export function sameSignatoryText(
  a: string | null | undefined,
  b: string | null | undefined,
): boolean {
  return canonicalizeForHash(a ?? "") === canonicalizeForHash(b ?? "");
}

export function signoffBindingState(
  row: SignoffBindingRow,
  ctx: SignoffBindingContext,
): SignoffBindingState {
  if (row.status !== "confirmed") return "open";

  // Zuerst der Name: Steht heute eine andere Person (oder Rolle) im Feld,
  // zählt die Freigabe nicht, egal zu welchem Text.
  if (!ctx.slotName) return "stale_name";
  const hasBinding = !!row.confirmed_text_hash;
  const name = hasBinding ? row.confirmed_name : row.name;
  const role = hasBinding ? row.confirmed_role : row.role;
  if (!sameSignatoryText(name, ctx.slotName) || !sameSignatoryText(role, ctx.slotRole)) {
    return "stale_name";
  }

  if (hasBinding) {
    if (!ctx.textHash) return "stale_text";
    return row.confirmed_text_hash === ctx.textHash ? "bound" : "stale_text";
  }

  // Altbestand ohne Hash: nur nach dem Finalisieren erteilt ist eindeutig.
  if (
    ctx.finalizedAt &&
    row.confirmed_at &&
    new Date(row.confirmed_at).getTime() >= new Date(ctx.finalizedAt).getTime()
  ) {
    return "bound";
  }
  return "unbound";
}

/** Name und Rolle des Slots aus den aufgelösten Unterzeichnenden. */
export function slotSignatory(
  signatories: {
    signatory_1_name: string | null;
    signatory_1_role: string | null;
    signatory_2_name: string | null;
    signatory_2_role: string | null;
  },
  slot: number,
): { name: string | null; role: string | null } {
  return slot === 1
    ? { name: signatories.signatory_1_name, role: signatories.signatory_1_role }
    : slot === 2
      ? { name: signatories.signatory_2_name, role: signatories.signatory_2_role }
      : { name: null, role: null };
}
