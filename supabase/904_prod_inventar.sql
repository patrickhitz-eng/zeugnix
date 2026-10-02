-- ============================================================================
-- zeugnio.ch – Inventar der Produktionsdatenbank bei Supabase (nur SELECTs)
-- ----------------------------------------------------------------------------
-- WOFÜR DAS GUT IST
--
-- Zwei Fragen auf einmal:
--
--   1. Welche der Migrationen 001–025 sind in der Produktion wirklich
--      angekommen? Die Dateien im Ordner supabase/ laufen NICHT beim
--      Deployment – sie werden von Hand im SQL-Editor ausgeführt. Wird eine
--      vergessen, läuft die Anwendung weiter und scheitert erst an der Stelle,
--      die die neue Spalte braucht. Die Fehlermeldung lautet dann typischerweise
--      „Could not find the 'x' column of 'y' in the schema cache" und sieht nach
--      einem Supabase-Problem aus, obwohl sie nur eine fehlende Migration meldet.
--
--   2. Was muss die eigene Datenbank auf advisori01 am Ende genau enthalten?
--      Vor dem Umzug einmal hier laufen lassen, nach dem Einspielen des Schemas
--      dort noch einmal, und die beiden Ausgaben vergleichen. Was fehlt, fehlt;
--      was zusätzlich da ist, wurde in der Produktion von Hand geändert und
--      steht in keiner Migration.
--
-- AUSFÜHRUNG
--
-- Supabase Dashboard → SQL Editor → einfügen → Run. Die Datei enthält bewusst
-- keine psql-Befehle (\echo, \pset, \i): der Web-Editor kennt sie nicht. Sie
-- besteht aus EINER Abfrage, weil der Editor bei mehreren Anweisungen nur das
-- Ergebnis der letzten anzeigt – das kostet einen leicht, ohne dass man es
-- merkt. Die Ausgabe enthält keine Personendaten und kein Geheimnis: nur Namen
-- von Tabellen, Spalten, Funktionen und Regeln. Sie darf weitergegeben werden.
--
-- Ändert nichts. Kein INSERT, kein UPDATE, kein ALTER, kein CREATE.
-- ============================================================================

with tabellen as (
  -- Spaltenliste pro Tabelle. Das ist der Teil, der die „schema cache"-Fehler
  -- erklärt: PostgREST (die Schicht, die Supabase vor die Datenbank setzt)
  -- liest das Schema beim Start einmal ein und hält es im Speicher. Fehlt eine
  -- Spalte wirklich, meldet es genau das – „im Schema-Cache nicht gefunden".
  select 'A Tabelle'::text as bereich,
         c.table_name::text as objekt,
         string_agg(c.column_name::text, ', ' order by c.ordinal_position)::text as befund
    from information_schema.columns c
    join information_schema.tables t
      on t.table_schema = c.table_schema
     and t.table_name = c.table_name
     and t.table_type = 'BASE TABLE'
   where c.table_schema = 'public'
   group by c.table_name
),
sicherheit as (
  -- Zeilensicherheit pro Tabelle. `relrowsecurity` = eingeschaltet,
  -- `relforcerowsecurity` = gilt auch für den Eigentümer der Tabelle. Das
  -- zweite Flag ist für den Umzug entscheidend: auf dem eigenen Server ersetzt
  -- das Eigentum an der Tabelle das Supabase-Attribut BYPASSRLS, und FORCE
  -- würde diesen Ersatz aushebeln – lautlos, mit leeren Ergebnissen statt
  -- Fehlern. Siehe 901_nine_ownership.sql.
  select 'B Zeilensicherheit'::text,
         c.relname::text,
         ('rls=' || c.relrowsecurity || '  force=' || c.relforcerowsecurity
          || '  regeln=' || (select count(*) from pg_policy p where p.polrelid = c.oid))::text
    from pg_class c
    join pg_namespace n on n.oid = c.relnamespace
   where n.nspname = 'public' and c.relkind = 'r'
),
regeln as (
  -- Die Regeln selbst, nach Tabelle und Befehl. Die Anzahl muss nach dem Umzug
  -- übereinstimmen – jede fehlende Regel ist entweder ein Datenleck oder eine
  -- Tabelle, die plötzlich leer aussieht.
  select 'C Regel'::text,
         (c.relname::text || ' / ' || p.polname::text)::text,
         ('für ' || p.polcmd::text || '  rollen=' ||
          coalesce((select string_agg(r.rolname::text, ',' order by r.rolname)
                      from pg_roles r where r.oid = any(p.polroles)), 'PUBLIC'))::text
    from pg_policy p
    join pg_class c on c.oid = p.polrelid
    join pg_namespace n on n.oid = c.relnamespace
   where n.nspname = 'public'
),
funktionen as (
  -- Funktionen in public. SECURITY DEFINER heisst: läuft mit den Rechten der
  -- Person, die sie angelegt hat, nicht der Person, die sie aufruft. Das ist
  -- gewollt (handle_new_user, ensure_auth_user), aber es ist auch die Stelle,
  -- an der eine zu weit gegebene Ausführungsberechtigung die Zeilensicherheit
  -- umgeht. Migration 006 nimmt sie anon und authenticated darum weg.
  select 'D Funktion'::text,
         (p.proname::text || '(' || pg_get_function_identity_arguments(p.oid) || ')')::text,
         (case when p.prosecdef then 'SECURITY DEFINER' else 'SECURITY INVOKER' end
          || '  ausführbar für: ' ||
          coalesce((select string_agg(r.rolname::text, ',' order by r.rolname)
                      from pg_roles r
                     where has_function_privilege(r.rolname, p.oid, 'EXECUTE')
                       and r.rolname in ('anon','authenticated','service_role')), '–'))::text
    from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'public'
),
ausloeser as (
  -- Trigger. Vier davon vergleichen wörtlich auf current_user = 'service_role'
  -- (Widerruf, PII-Cleanup, Unveränderlichkeit). Darum sind die Rollennamen auf
  -- dem eigenen Server nicht frei wählbar – 900_nine_bootstrap.sql legt genau
  -- diese Namen an.
  select 'E Trigger'::text,
         (c.relname::text || ' / ' || t.tgname::text)::text,
         ('ruft ' || p.proname::text || '()')::text
    from pg_trigger t
    join pg_class c on c.oid = t.tgrelid
    join pg_namespace n on n.oid = c.relnamespace
    join pg_proc p on p.oid = t.tgfoid
   where n.nspname = 'public' and not t.tgisinternal
),
erweiterungen as (
  -- In welchem Schema die Erweiterungen liegen. Supabase legt uuid-ossp und
  -- pgcrypto nach `extensions`, nicht nach `public`. Ein Schema-Auszug trägt
  -- darum Vorgabewerte wie extensions.uuid_generate_v4() – auf einem Server
  -- ohne dieses Schema scheitert das Einspielen. 900_nine_bootstrap.sql legt es
  -- deshalb vorher an.
  select 'F Erweiterung'::text, e.extname::text, ('Schema: ' || n.nspname::text || '  Version: ' || e.extversion)::text
    from pg_extension e join pg_namespace n on n.oid = e.extnamespace
),
umgebung as (
  select 'G Umgebung'::text, 'PostgreSQL'::text, version()::text
  union all
  select 'G Umgebung'::text, 'Schemata'::text,
         (select string_agg(nspname::text, ', ' order by nspname) from pg_namespace
           where nspname not like 'pg_%' and nspname <> 'information_schema')::text
)
select * from tabellen
union all select * from sicherheit
union all select * from regeln
union all select * from funktionen
union all select * from ausloeser
union all select * from erweiterungen
union all select * from umgebung
order by 1, 2;
