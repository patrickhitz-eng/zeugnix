-- ============================================================================
-- zeugnio.ch – Definitionen der Produktionsdatenbank bei Supabase (nur SELECTs)
-- ----------------------------------------------------------------------------
-- Die zweite Hälfte von 904_prod_inventar.sql. 904 fragt, WAS es gibt; diese
-- Datei fragt, WIE es definiert ist.
--
-- WARUM DAS NÖTIG IST
--
-- 904 hat gezeigt, dass zwei Regeln auf manager_invitations in der Produktion
-- stehen, die in keiner Migration vorkommen – von Hand im Dashboard angelegt.
-- Das Schema für den eigenen Server entsteht aber aus den Migrationen. Was
-- nicht in einer Migration steht, fehlt dort also. Bei einer Regel heisst das
-- nicht „Fehler", sondern: die Anwendung darf plötzlich etwas nicht mehr, und
-- zwar lautlos – die Zeilensicherheit liefert keine Fehlermeldung, sondern
-- nichts.
--
-- Namen allein genügen zum Nachbauen nicht: zwei Regeln mit gleichem Namen
-- können verschiedene Bedingungen haben. Darum stehen hier die vollständigen
-- Ausdrücke (USING und WITH CHECK).
--
-- Mitgeprüft wird alles, was 904 offengelassen hat und beim Wiederaufbau
-- auseinanderlaufen kann: Indexe, Vorgabewerte, Bedingungen, Tabellenrechte,
-- der Trigger im Schema `auth` und der Storage-Bucket für die Firmenlogos.
--
-- AUSFÜHRUNG
--
-- Supabase Dashboard → SQL Editor → einfügen → Run. Wie 904: keine
-- psql-Befehle, EINE Abfrage, weil der Editor sonst nur das letzte Ergebnis
-- zeigt. Ändert nichts.
--
-- Die Ausgabe enthält Regelausdrücke und Spaltennamen, aber keine Datenzeilen
-- und kein Geheimnis. Sie darf weitergegeben werden.
--
-- WENN SIE ABBRICHT
--
-- Eine einzige Abfrage hat einen Nachteil: scheitert ein Teil, kommt gar nichts
-- zurück. Der wahrscheinlichste Kandidat ist der letzte Block – „permission
-- denied for schema storage". Dann den Block `storage_regeln` und die Zeile
-- `union all select * from storage_regeln` löschen und erneut ausführen; die
-- Storage-Frage separat mit:
--
--   select b.id, b.public, count(o.id) as dateien
--     from storage.buckets b left join storage.objects o on o.bucket_id = b.id
--    group by 1, 2;
-- ============================================================================

with regel_definitionen as (
  -- Der eigentliche Grund für diese Datei. `qual` ist die USING-Bedingung
  -- (welche vorhandenen Zeilen sichtbar sind), `with_check` die
  -- WITH-CHECK-Bedingung (welche neuen Zeilen erlaubt sind). Fehlt WITH CHECK
  -- bei einer FOR-ALL-Regel, verwendet PostgreSQL die USING-Bedingung auch für
  -- INSERT – das erklärt oft, warum eine zusätzliche INSERT-Regel von Hand
  -- nötig wurde.
  select 'H Regel'::text as bereich,
         (tablename::text || ' / ' || policyname::text) as objekt,
         ('cmd=' || cmd::text || '  rollen=' || roles::text ||
          '  USING: ' || coalesce(qual, '–') ||
          '  WITH CHECK: ' || coalesce(with_check, '–'))::text as befund
    from pg_policies
   where schemaname = 'public'
),
indexe as (
  -- Indexe stehen in den Migrationen und kommen beim Wiederaufbau mit. Was
  -- hier zusätzlich auftaucht, wurde von Hand angelegt. Ein fehlender Index
  -- ist kein Fehler, nur Langsamkeit – ein fehlender UNIQUE-Index dagegen
  -- erlaubt plötzlich Duplikate, und das ist einer.
  select 'I Index'::text,
         (t.relname::text || ' / ' || i.relname::text),
         pg_get_indexdef(x.indexrelid)::text
    from pg_index x
    join pg_class i on i.oid = x.indexrelid
    join pg_class t on t.oid = x.indrelid
    join pg_namespace n on n.oid = t.relnamespace
   where n.nspname = 'public'
),
vorgabewerte as (
  -- Vorgabewerte. Hier wird sichtbar, was 904 vorhergesagt hat: Supabase legt
  -- uuid-ossp nach `extensions`, also lauten die Vorgaben
  -- extensions.uuid_generate_v4() – mit Schema-Präfix. Auf einem Server ohne
  -- dieses Schema scheitert jedes Einfügen. 900_nine_bootstrap.sql legt es an.
  select 'J Vorgabewert'::text,
         (c.table_name::text || '.' || c.column_name::text),
         (c.column_default::text ||
          case when c.is_nullable = 'NO' then '   [NOT NULL]' else '' end)
    from information_schema.columns c
   where c.table_schema = 'public' and c.column_default is not null
),
bedingungen as (
  -- CHECK- und UNIQUE-Bedingungen und Fremdschlüssel. Der wichtigste Eintrag
  -- hier ist der Fremdschlüssel von profiles.id auf auth.users – er ist der
  -- Grund, warum 902_auth_bridge.sql existiert.
  select 'K Bedingung'::text,
         (rel.relname::text || ' / ' || con.conname::text),
         pg_get_constraintdef(con.oid)::text
    from pg_constraint con
    join pg_class rel on rel.oid = con.conrelid
    join pg_namespace n on n.oid = rel.relnamespace
   where n.nspname = 'public' and con.contype in ('c', 'u', 'f')
),
rechte as (
  -- Welche der drei Supabase-Rollen auf welcher Tabelle was darf. Das ist der
  -- Soll-Wert, den 901_nine_ownership.sql auf dem eigenen Server herstellen
  -- muss. 901 ist dabei absichtlich strenger: anon bekommt dort nur SELECT.
  select 'L Recht'::text,
         (c.relname::text || ' / ' || r.rolname::text),
         (concat_ws(' ',
            case when has_table_privilege(r.rolname, c.oid, 'SELECT') then 'SELECT' end,
            case when has_table_privilege(r.rolname, c.oid, 'INSERT') then 'INSERT' end,
            case when has_table_privilege(r.rolname, c.oid, 'UPDATE') then 'UPDATE' end,
            case when has_table_privilege(r.rolname, c.oid, 'DELETE') then 'DELETE' end))::text
    from pg_class c
    join pg_namespace n on n.oid = c.relnamespace
   cross join pg_roles r
   where n.nspname = 'public' and c.relkind = 'r'
     and r.rolname in ('anon', 'authenticated', 'service_role')
),
auth_trigger as (
  -- 904 hat nur `public` abgefragt. Der Trigger, der beim Anlegen eines
  -- Benutzers das Profil erzeugt, hängt aber an auth.users – in einem
  -- Schema-Auszug von `public` ist er darum nicht enthalten. Genau deshalb
  -- legt 902_auth_bridge.sql ihn neu an. Diese Zeile bestätigt, dass er
  -- überhaupt existiert; wäre er weg, entstünde das Profil anderswo und 902
  -- wäre falsch.
  select 'M auth-Trigger'::text,
         (c.relname::text || ' / ' || t.tgname::text),
         ('ruft ' || p.proname::text || '()   enabled=' || t.tgenabled::text)
    from pg_trigger t
    join pg_class c on c.oid = t.tgrelid
    join pg_namespace n on n.oid = c.relnamespace
    join pg_proc p on p.oid = t.tgfoid
   where n.nspname = 'auth' and not t.tgisinternal
),
storage_regeln as (
  -- Migration 007 legt den Bucket für die Firmenlogos an und setzt Regeln auf
  -- storage.objects. Auf dem eigenen Server gibt es dieses Schema nicht – die
  -- Logos liegen dort auf der Platte (lib/uploads/logos.ts), und
  -- scripts/migrate.mjs nimmt 007 darum ausdrücklich aus. Diese Zeilen sagen,
  -- was beim Umzug an Dateien mitkommen muss.
  select 'N Storage'::text,
         ('Bucket: ' || b.id::text),
         ('öffentlich=' || b.public::text ||
          '  Dateien=' || (select count(*) from storage.objects o where o.bucket_id = b.id)::text)
    from storage.buckets b
)
select * from regel_definitionen
union all select * from indexe
union all select * from vorgabewerte
union all select * from bedingungen
union all select * from rechte
union all select * from auth_trigger
union all select * from storage_regeln
order by 1, 2;
