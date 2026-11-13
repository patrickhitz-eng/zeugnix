/**
 * Logos einer gelöschten Firma entfernen (Schritt 17).
 *
 * Das Entfernen eines Logos im Formular lässt die Datei bewusst liegen (sie
 * ist schon ausgelieferten Dokumenten zugeordnet). Wird die Firma gelöscht,
 * gibt es dafür keinen Grund mehr: Ein öffentlich abrufbares Logo ohne Firma
 * wäre ein Rest, den niemand mehr verwaltet.
 *
 * Zwei Ablageorte:
 *   - lokal (advisori01): <ZEUGNIO_UPLOAD_DIR>/logos/<companyId>/ – ganzer Ordner
 *   - Supabase-Bucket «company-logos» aus der Zeit vor dem Umzug: die Datei
 *     hinter der gespeicherten Adresse
 *
 * Fehler werden protokolliert, nicht geworfen: Die Daten in der Datenbank sind
 * zu diesem Zeitpunkt schon gelöscht, ein verbliebenes Bild darf das nicht
 * als gescheitert melden.
 */
import { rm } from "node:fs/promises";
import { logoDir } from "@/lib/uploads/logos";
import { logError } from "@/lib/log";

const BUCKET_MARKER = "/company-logos/";

export async function deleteCompanyLogos(
  serviceClient: any,
  companyIds: string[],
  logoUrls: (string | null | undefined)[],
): Promise<void> {
  for (const companyId of companyIds) {
    if (!/^[0-9a-f-]{36}$/i.test(companyId)) continue;
    try {
      await rm(logoDir(companyId), { recursive: true, force: true });
    } catch (err) {
      logError("[loeschen] Logo-Ordner nicht entfernt:", companyId, err);
    }
  }

  const bucketPaths = logoUrls
    .filter((url): url is string => typeof url === "string" && url.includes(BUCKET_MARKER))
    .map((url) => decodeURIComponent(url.split(BUCKET_MARKER)[1].split("?")[0]))
    .filter((p) => p.length > 0 && !p.includes(".."));
  if (bucketPaths.length > 0) {
    try {
      const { error } = await serviceClient.storage.from("company-logos").remove(bucketPaths);
      if (error) logError("[loeschen] Logo im Bucket nicht entfernt:", error);
    } catch (err) {
      logError("[loeschen] Logo im Bucket nicht entfernt:", err);
    }
  }
}
