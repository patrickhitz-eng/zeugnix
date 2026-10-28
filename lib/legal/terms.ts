/**
 * Aktuelle Fassung der AGB (Fahrplan Marktstart, Schritt 11).
 *
 * Wer den Arbeitsbereich /app betritt, muss genau diese Fassung angenommen
 * haben; die Annahme liegt mit Zeitpunkt in public.terms_acceptances
 * (Migration 031). Ändert sich der AGB-Text, hier BEIDE Werte nachführen: Dann
 * bittet die App alle beim nächsten Besuch erneut um Zustimmung, und jede
 * gespeicherte Annahme bleibt einer bestimmten Fassung zugeordnet.
 */
export const TERMS_VERSION = "2026-07-16";

/** Dieselbe Fassung für Menschen, angezeigt als «Stand» auf /legal/terms. */
export const TERMS_LABEL = "16. Juli 2026";
