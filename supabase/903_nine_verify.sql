-- ============================================================================
-- zeugnio.ch – Gegenprobe nach dem Bootstrap (nur SELECTs)
-- ----------------------------------------------------------------------------
-- Ändert nichts. Die eine Ausnahme ist die Rollenprobe am Ende: sie läuft in
-- einer Transaktion, die mit ROLLBACK endet, und setzt darin nur
-- Sitzungseinstellungen – keine Daten.
--
-- WARUM DIESE DATEI DIE WICHTIGSTE DER VIER IST
--
-- Der gefährlichste Fehler bei diesem Umzug ist keine Fehlermeldung, sondern ein
-- leeres Ergebnis. Liefert auth.uid() NULL, greift keine der 45
-- Zeilensicherheitsregeln – und die Anwendung zeigt einfach nichts an, ohne dass
-- irgendwo etwas rot wird. „Die App startet" ist darum kein Beleg. Diese Datei
-- ist der Beleg.
--
-- Ausführung:
--   psql -w -v ON_ERROR_STOP=1 -d nmd_zeugnio -f supabase/903_nine_verify.sql
--
-- Vor dem Cutover auch auf der Produktionsdatenbank bei Supabase laufen lassen
-- (Abschnitt 11 – die Prüfsummen müssen auf beiden Seiten gleich sein).
-- ============================================================================
\pset pager off
\timing off

\echo
\echo '=== 1  Rollen und ihre Eigenschaften ==='
\echo '    Erwartet: anon, authenticated, service_role  -> rolcanlogin = f'
\echo '              authenticator                      -> rolcanlogin = t, rolinherit = f'
select rolname, rolcanlogin, rolinherit, rolsuper, rolbypassrls, rolcreaterole
  from pg_roles
 where rolname in ('anon', 'authenticated', 'service_role', 'authenticator')
 order by rolname;

\echo
\echo '=== 2  Mitgliedschaften ==='
\echo '    Erwartet (angelegt von 900_0_nine_rollen.sql):'
\echo '      authenticator in anon, authenticated, service_role: erbt = f, wechseln = t'
\echo '      authenticator in nmd_zeugnio_ro:                    erbt = t, wechseln = f  (nur für CONNECT)'
\echo '      nmd_zeugnio_rw in anon, authenticated, service_role: erbt = f, wechseln = t'
\echo '    pgadmin steht mit admin = t da, weil er die Rollen angelegt hat.'
select m.rolname as mitglied, g.rolname as in_rolle, a.admin_option as admin,
       a.inherit_option as erbt, a.set_option as wechseln
  from pg_auth_members a
  join pg_roles m on m.oid = a.member
  join pg_roles g on g.oid = a.roleid
 where g.rolname in ('anon', 'authenticated', 'service_role')
    or m.rolname = 'authenticator'
 order by 1, 2;

\echo
\echo '=== 2a  Darf authenticator sich verbinden?  (MUSS t sein) ==='
\echo '    Ohne CONNECT startet PostgREST, meldet aber bei jeder Anfrage einen Fehler.'
select has_database_privilege('authenticator', current_database(), 'CONNECT') as authenticator_connect;

\echo
\echo '=== 3  FORCE ROW LEVEL SECURITY  (MUSS LEER SEIN) ==='
\echo '    Ist hier eine Tabelle aufgeführt, gilt die Zeilensicherheit auch für die'
\echo '    Eigentümerin. Die SECURITY-DEFINER-Funktionen fänden dort nichts mehr.'
select n.nspname, c.relname
  from pg_class c join pg_namespace n on n.oid = c.relnamespace
 where c.relrowsecurity and c.relforcerowsecurity
 order by 1, 2;

\echo
\echo '=== 4  Tabellen mit Zeilensicherheit OHNE Regel für service_role  (MUSS LEER SEIN) ==='
\echo '    Hier sähe service_role nichts: leere Ergebnisse statt Fehler.'
\echo '    Abhilfe: 901_nine_rechte.sql nochmals laufen lassen.'
select c.relname
  from pg_class c join pg_namespace n on n.oid = c.relnamespace
 where n.nspname = 'public' and c.relkind in ('r', 'p') and c.relrowsecurity
   and not exists (
         select 1 from pg_policy p
          where p.polrelid = c.oid
            and p.polname = 'service_role_alles'
            and p.polpermissive
            and p.polcmd = '*'
            and p.polroles @> array['service_role'::regrole::oid])
 order by 1;

\echo
\echo '=== 4a  Tabellen, auf denen service_role nicht lesen und schreiben darf  (MUSS LEER SEIN) ==='
\echo '    schema_migrations ist absichtlich ausgenommen und erscheint hier nicht.'
select c.relname
  from pg_class c join pg_namespace n on n.oid = c.relnamespace
 where n.nspname = 'public' and c.relkind in ('r', 'p')
   and c.relname <> 'schema_migrations'
   and not (has_table_privilege('service_role', c.oid, 'SELECT')
        and has_table_privilege('service_role', c.oid, 'INSERT')
        and has_table_privilege('service_role', c.oid, 'UPDATE')
        and has_table_privilege('service_role', c.oid, 'DELETE'))
 order by 1;

\echo
\echo '=== 4b  Eigentümer in public  (erwartet: eine Zeile, die Schreibrolle) ==='
select pg_get_userbyid(c.relowner) as eigentuemer, count(*) as objekte
  from pg_class c join pg_namespace n on n.oid = c.relnamespace
 where n.nspname = 'public' and c.relkind in ('r', 'p', 'v', 'm', 'S')
 group by 1
 order by 1;

\echo
\echo '=== 5  Tabellen OHNE Zeilensicherheit  (jede hier ist ein offenes Fenster) ==='
\echo '    Solche Tabellen sind für jede Rolle mit SELECT-Recht vollständig lesbar.'
\echo '    schema_migrations darf hier stehen: sie hat keine Rechte für anon/authenticated.'
select c.relname,
       c.relrowsecurity as rls_an,
       (select count(*) from pg_policies p
         where p.schemaname = 'public' and p.tablename = c.relname) as regeln,
       has_table_privilege('anon', c.oid, 'SELECT') as anon_darf_lesen
  from pg_class c join pg_namespace n on n.oid = c.relnamespace
 where n.nspname = 'public' and c.relkind in ('r', 'p')
   and not c.relrowsecurity
 order by 1;

\echo
\echo '=== 6  Schreibrechte von anon  (MUSS LEER SEIN) ==='
\echo '    Nach Schritt C4 schreibt kein Browser mehr direkt in die Datenbank.'
select c.relname,
       has_table_privilege('anon', c.oid, 'INSERT') as insert,
       has_table_privilege('anon', c.oid, 'UPDATE') as update,
       has_table_privilege('anon', c.oid, 'DELETE') as delete
  from pg_class c join pg_namespace n on n.oid = c.relnamespace
 where n.nspname = 'public' and c.relkind in ('r', 'p')
   and (has_table_privilege('anon', c.oid, 'INSERT')
     or has_table_privilege('anon', c.oid, 'UPDATE')
     or has_table_privilege('anon', c.oid, 'DELETE'))
 order by 1;

\echo
\echo '=== 7  Views, die nicht security_invoker sind  (MUSS LEER SEIN) ==='
\echo '    Eine solche View liest mit den Rechten ihrer Eigentümerin, und das ist'
\echo '    die Eigentümerin der Tabellen. Sie umgeht damit die Zeilensicherheit, auch'
\echo '    für authenticated. Heute gibt es keine Views; diese Prüfung ist für den'
\echo '    Tag, an dem jemand die erste anlegt.'
select c.relname, pg_get_userbyid(c.relowner) as eigentuemer
  from pg_class c join pg_namespace n on n.oid = c.relnamespace
 where n.nspname = 'public' and c.relkind = 'v'
   and coalesce((select option_value from pg_options_to_table(c.reloptions)
                  where option_name = 'security_invoker'), 'false') <> 'true'
 order by 1;

\echo
\echo '=== 8  Extensions, Schema und search_path ==='
\echo '    uuid-ossp und pgcrypto müssen vorhanden sein; wo sie liegen, entscheidet'
\echo '    darüber, ob die Spaltenvorgaben aus dem Auszug auflösen.'
select e.extname, n.nspname as schema, e.extversion
  from pg_extension e join pg_namespace n on n.oid = e.extnamespace
 where e.extname in ('uuid-ossp', 'pgcrypto')
 order by 1;
select current_setting('search_path') as search_path_der_sitzung;

\echo '    Dürfen die drei Rollen die Funktionen der Erweiterungen ausführen? (MUSS t sein)'
\echo '    Sonst scheitert jeder INSERT, dessen Spaltenvorgabe uuid_generate_v4() ist.'
select has_function_privilege('anon',          'extensions.uuid_generate_v4()', 'EXECUTE') as anon,
       has_function_privilege('authenticated', 'extensions.uuid_generate_v4()', 'EXECUTE') as authenticated,
       has_function_privilege('service_role',  'extensions.uuid_generate_v4()', 'EXECUTE') as service_role,
       has_function_privilege('service_role',  'extensions.gen_random_bytes(integer)', 'EXECUTE') as service_role_pgcrypto;

\echo
\echo '=== 9  Rechte auf den heiklen Funktionen ==='
\echo '    handle_new_user: anon und authenticated MÜSSEN false sein (Migration 006).'
\echo '    ensure_auth_user: nur service_role darf true sein.'
select 'handle_new_user' as funktion,
       has_function_privilege('anon', 'public.handle_new_user()', 'EXECUTE') as anon,
       has_function_privilege('authenticated', 'public.handle_new_user()', 'EXECUTE') as authenticated,
       has_function_privilege('service_role', 'public.handle_new_user()', 'EXECUTE') as service_role
 where exists (select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace
                where n.nspname = 'public' and p.proname = 'handle_new_user')
union all
select 'ensure_auth_user',
       has_function_privilege('anon', 'public.ensure_auth_user(uuid,text)', 'EXECUTE'),
       has_function_privilege('authenticated', 'public.ensure_auth_user(uuid,text)', 'EXECUTE'),
       has_function_privilege('service_role', 'public.ensure_auth_user(uuid,text)', 'EXECUTE')
 where exists (select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace
                where n.nspname = 'public' and p.proname = 'ensure_auth_user');

\echo
\echo '=== 10  Trigger auf auth.users  (muss on_auth_user_created zeigen) ==='
select t.tgname, c.relname as tabelle, p.proname as funktion
  from pg_trigger t
  join pg_class c on c.oid = t.tgrelid
  join pg_namespace n on n.oid = c.relnamespace
  join pg_proc p on p.oid = t.tgfoid
 where n.nspname = 'auth' and not t.tgisinternal
 order by 1;

\echo
\echo '=== 11  Prüfsummen der ausgestellten Zeugnisse ==='
\echo '    DIESE ZEILE AUF BEIDEN SEITEN VERGLEICHEN – Supabase und hier. Weicht sie'
\echo '    ab, wird der Cutover abgebrochen. Sie ist das einzige Kriterium, das die'
\echo '    Unversehrtheit bereits ausgestellter Zeugnisse belegt; ein QR-Code, der ins'
\echo '    Leere zeigt, ist danach nicht mehr zu heilen.'
select count(*)                                                       as anzahl,
       md5(string_agg(hash, '' order by id))                          as md5_hash,
       md5(string_agg(coalesce(canonical_content, ''), '' order by id)) as md5_inhalt,
       md5(string_agg(coalesce(signature, ''), '' order by id))       as md5_signatur,
       count(*) filter (where signature is not null)                  as davon_signiert,
       count(*) filter (where status = 'revoked')                     as davon_widerrufen
  from public.certificates
 where status in ('final', 'revoked');

\echo
\echo '=== 12  Zeilenzahlen aller Tabellen (zum Vergleich vor und nach dem Umzug) ==='
select relname as tabelle, n_live_tup as zeilen_geschaetzt
  from pg_stat_user_tables
 where schemaname = 'public'
 order by 1;

\echo
\echo '=== 13  auth.uid() und auth.role() mit gestellten Ansprüchen ==='
\echo '    Die entscheidende Probe. Sie läuft in einer Transaktion mit ROLLBACK.'
begin;

-- Genau das setzt PostgREST pro Anfrage, wenn db-use-legacy-gucs = false ist.
select set_config(
  'request.jwt.claims',
  '{"sub":"11111111-1111-1111-1111-111111111111","role":"authenticated","email":"probe@example.org"}',
  true
) is not null as anspruch_gesetzt;

\echo '--- 13a  Als Datenbankbenutzer: uid und role müssen gefüllt sein ---'
select public.debug_whoami();

\echo '--- 13b  Als authenticated: die Zeilensicherheit MUSS greifen ---'
\echo '         Erwartet: 0 Zeilen und KEIN Fehler. Ein Fehler hiesse fehlende'
\echo '         Rechte, eine Zahl über 0 hiesse eine wirkungslose Regel.'
set local role authenticated;
select current_user as laeuft_als, auth.uid() as uid, auth.role() as rolle;
select count(*) as sichtbare_zeugnisse_fuer_fremden_benutzer from public.certificates;
select count(*) as sichtbare_profile_fuer_fremden_benutzer   from public.profiles;

\echo '--- 13c  Als service_role: alles sichtbar (Regel service_role_alles statt BYPASSRLS) ---'
reset role;
set local role service_role;
select current_user as laeuft_als;
select count(*) as alle_zeugnisse from public.certificates;

reset role;
rollback;

\echo
\echo '=== Ende der Gegenprobe ==='
\echo 'Zusammengefasst muss gelten:'
\echo '  Abschnitt 2a t             (authenticator darf sich verbinden)'
\echo '  Abschnitt 3  leer          (kein FORCE ROW LEVEL SECURITY)'
\echo '  Abschnitt 4  leer          (jede Tabelle mit Zeilensicherheit hat die service_role-Regel)'
\echo '  Abschnitt 4a leer          (service_role darf überall lesen und schreiben)'
\echo '  Abschnitt 4b eine Zeile    (alles gehört der Schreibrolle)'
\echo '  Abschnitt 6  leer          (anon schreibt nichts)'
\echo '  Abschnitt 7  leer          (keine View umgeht die Zeilensicherheit)'
\echo '  Abschnitt 8  t             (alle drei Rollen dürfen die Erweiterungen ausführen)'
\echo '  Abschnitt 9  anon und authenticated auf handle_new_user = false'
\echo '  Abschnitt 10 zeigt on_auth_user_created'
\echo '  Abschnitt 11 gleiche Prüfsummen wie bei Supabase'
\echo '  Abschnitt 13a uid und role gefüllt, 13b 0 Zeilen ohne Fehler, 13c alle Zeilen'
\echo
