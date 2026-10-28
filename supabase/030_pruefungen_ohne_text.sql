-- 030_pruefungen_ohne_text.sql
-- Prüf- und Analysetexte nicht mehr aufbewahren (Fahrplan Marktstart, Schritt 7).
-- Ab diesem Stand speichern /api/verify und /api/analyze weder den Text des
-- hochgeladenen Zeugnisses noch die E-Mail der prüfenden Person, nur Hash und
-- Ergebnis. Diese Datei leert den Altbestand einmalig; die Spalten bleiben
-- bestehen (Schema unverändert, nichts im Code liest sie).
--
-- Reihenfolge: ERST den Code deployen, DANN diese Datei – sonst kommen zwischen
-- beiden Schritten neue Texte dazu.
-- Manuell im Supabase-SQL-Editor (Projekt "zeugnix") ausführen.
-- Idempotent: ein zweiter Lauf ändert 0 Zeilen.

begin;

update public.verifications
   set extracted_text = null,
       extracted_canonical_content = null,
       user_email = null
 where extracted_text is not null
    or extracted_canonical_content is not null
    or user_email is not null;

update public.analyses
   set extracted_text = null,
       user_email = null
 where extracted_text is not null
    or user_email is not null;

commit;

-- Kontrolle, beide Abfragen müssen 0 liefern:
-- select count(*) from public.verifications
--  where extracted_text is not null or extracted_canonical_content is not null or user_email is not null;
-- select count(*) from public.analyses
--  where extracted_text is not null or user_email is not null;
