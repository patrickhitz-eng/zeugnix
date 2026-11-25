/**
 * Logos einer gelöschten Firma entfernen (Schritt 17).
 *
 * Das Entfernen eines Logos im Formular lässt die Datei bewusst liegen (sie
 * ist schon ausgelieferten Dokumenten zugeordnet). Wird die Firma gelöscht,
 * gibt es dafür keinen Grund mehr: Ein öffentlich abrufbares Logo ohne Firma
 * wäre ein Rest, den niemand mehr verwaltet.
 *
 * Die Logos liegen unter <ZEUGNIO_UPLOAD_DIR>/logos/<companyId>/; gelöscht wird
 * der ganze Ordner. Den Bucket «company-logos» aus der Zeit vor dem Umzug gibt
 * es seit Cutover A nicht mehr (5.10), darum hier auch keinen zweiten Weg.
 *
 * Fehler werden protokolliert, nicht geworfen: Die Daten in der Datenbank sind
 * zu diesem Zeitpunkt schon gelöscht, ein verbliebenes Bild darf das nicht
 * als gescheitert melden.
 */
import { rm } from "node:fs/promises";
import { logoDir } from "@/lib/uploads/logos";
import { logError } from "@/lib/log";

export async function deleteCompanyLogos(companyIds: string[]): Promise<void> {
  for (const companyId of companyIds) {
    if (!/^[0-9a-f-]{36}$/i.test(companyId)) continue;
    try {
      await rm(logoDir(companyId), { recursive: true, force: true });
    } catch (err) {
      logError("[loeschen] Logo-Ordner nicht entfernt:", companyId, err);
    }
  }
}
