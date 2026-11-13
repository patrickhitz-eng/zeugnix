/**
 * Hinweis im Prüfergebnis, wenn der Treffer aus dem Prüfregister stammt
 * (Migration 036): Die ausstellende Firma hat ihre Daten gelöscht. Hash,
 * Status, Arbeitgeber und Datum sind erhalten, Namen nicht mehr.
 */
export function RegisterNote({ fromRegister }: { fromRegister?: boolean }) {
  if (!fromRegister) return null;
  return (
    <p className="mt-2 text-[12.5px] leading-relaxed text-ink-600">
      Die ausstellende Firma hat ihre Daten bei zeugnio gelöscht. Geprüft wurde
      gegen das Prüfregister: Echtheit, Status, Arbeitgeber und Ausstellungsdatum
      sind dort festgehalten, Namen von Personen nicht mehr.
    </p>
  );
}
