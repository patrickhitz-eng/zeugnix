-- ============================================================================
-- 018_signature_mode.sql  (Unterschrifts-Modus pro Zeugnis)
-- ============================================================================
-- Erlaubt, pro Zeugnis zu wählen, WIE unterzeichnet wird. Steuert im PDF und in
-- der A4-Vorschau, ob der Kopf „Digital ausgestellt durch" über den
-- Unterzeichnenden erscheint:
--   * 'digital'     -> Kopf „Digital ausgestellt durch" (bisheriges Verhalten)
--   * 'handwritten' -> KEIN Kopf; Platz für die handschriftliche Unterschrift
--                      (Wunsch First Advisory: finales PDF drucken, von Hand
--                       unterzeichnen, physisch übergeben)
--
-- ERWEITERBAR: Ein späterer Modus (z.B. 'seal' = elektronisches Siegel, das als
--   Signatur zählt) wird rein additiv ergänzt — CHECK unten um den Wert
--   erweitern und im Renderer/UI behandeln.
--
-- Der Modus liegt AUSSERHALB des gehashten Bodys (Briefkopf/Unterschriften sind
--   nicht Teil des SHA-256). Er beeinflusst den Hash daher NICHT — keine
--   hash_version, Bestandszeugnisse bleiben unverändert gültig. Sentinels und
--   Theme-IDs unberührt.
--
-- Default 'digital' = exakt das heutige Verhalten für alle bestehenden Zeilen.
-- Idempotent; manuell in Prod einspielen (SQL-Editor, Projekt „zeugnix").
-- ----------------------------------------------------------------------------

alter table public.certificates
  add column if not exists signature_mode text not null default 'digital';

-- Erlaubte Modi absichern (erweiterbar). drop+add macht die Migration idempotent
-- und erlaubt späteres Nachziehen (z.B. 'seal') durch erneutes Ausführen.
alter table public.certificates
  drop constraint if exists certificates_signature_mode_check;

alter table public.certificates
  add constraint certificates_signature_mode_check
  check (signature_mode in ('digital', 'handwritten'));
