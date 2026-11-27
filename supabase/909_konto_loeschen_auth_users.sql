-- ============================================================================
-- zeugnio.ch – Kontolöschung entfernt auch die Zeile in auth.users
-- ----------------------------------------------------------------------------
-- Läuft NUR auf advisori01, von Hand. Wie alle Dateien ab 900 spielt
-- scripts/migrate.mjs sie nicht automatisch ein.
--
-- PROBLEM
--
-- zeugnio_delete_account (036) löscht das Profil und danach die Zeile in
-- auth.users, aber nur, wenn die aufrufende Rolle dort DELETE hat:
--
--   if to_regclass('auth.users') is not null and has_table_privilege('auth.users', 'DELETE') then
--
-- Die Funktion läuft absichtlich ohne SECURITY DEFINER, also als service_role.
-- 900_nine_bootstrap.sql hat service_role auf auth.users aber nur select,
-- insert, update gegeben. Die Bedingung war darum immer falsch, und der
-- Schritt fiel still weg. Gemessen auf advisori01 am 27.11.2026:
-- has_table_privilege('service_role', 'auth.users', 'DELETE') = f, eine
-- protokollierte Kontolöschung, eine Zeile in auth.users ohne Profil.
--
-- Folgen: Die Mailadresse blieb nach «Konto gelöscht» in auth.users stehen
-- (mit Anlage- und letzter Anmeldezeit). Meldet sich dieselbe Adresse wieder
-- an, findet auth.open_session (906) die alte Zeile und eröffnet eine Sitzung,
-- aber der Trigger on_auth_user_created (902) legt das Profil nur beim
-- Einfügen an. Die Person wäre angemeldet, aber ohne Profil.
--
-- LÖSUNG
--
-- 1. service_role bekommt DELETE auf auth.users. Damit greift der vorhandene
--    Schritt in zeugnio_delete_account; Code ändert sich keiner. Die
--    Fremdschlüssel mit ON DELETE CASCADE räumen auth.sessions (906) mit ab.
--    900_nine_bootstrap.sql vergibt das Recht seit diesem Stand selbst.
-- 2. Einmalig: Zeilen in auth.users ohne Profil löschen. Ein Profil entsteht
--    beim Anlegen jedes Kontos über den Trigger on_auth_user_created (902,
--    903 Abschnitt 10 prüft ihn). Eine Zeile ohne Profil bleibt also nur nach
--    einer Kontolöschung zurück. Mit deletion_log lässt sie sich nicht
--    abgleichen, weil dort actor_user_id beim Löschen des Profils auf null
--    geht (ON DELETE SET NULL). Als Schutz bricht die Datei ab, wenn es mehr
--    solche Zeilen gibt als protokollierte Kontolöschungen. Dann zuerst
--    nachsehen, statt etwas Unerwartetes zu löschen.
--
-- AUSFÜHRUNG
--
-- Auf advisori01 als www-zeugnio, nach dem Deploy des Merges (dann liegt die
-- Datei in ~/zeugnio/current), zuerst als PROBELAUF:
--
--   cd ~/zeugnio/current
--   psql -w -h 127.0.0.1 -U nmd_zeugnio -d nmd_zeugnio -v ON_ERROR_STOP=1 -f supabase/909_konto_loeschen_auth_users.sql
--
-- Ohne -v ausfuehren=1 rollt die Datei am Ende zurück und zeigt nur, was sie
-- täte. Mit Ausführen:
--
--   psql -w -h 127.0.0.1 -U nmd_zeugnio -d nmd_zeugnio -v ON_ERROR_STOP=1 -v ausfuehren=1 -f supabase/909_konto_loeschen_auth_users.sql
--
-- Die Datei gibt keine Adressen aus, nur Zahlen. Idempotent: Ein zweiter Lauf
-- findet nichts mehr zu löschen. Danach ist kein Neustart von PostgREST nötig
-- (keine neue Tabelle, keine neue Funktion).
-- ============================================================================

\set ON_ERROR_STOP on
\if :{?ausfuehren}
  \echo 'MODUS: AUSFUEHREN (Änderungen werden gespeichert)'
\else
  \echo 'MODUS: PROBELAUF (am Ende wird zurückgerollt)'
\endif

begin;

-- 1) Recht
grant delete on auth.users to service_role;

-- 2) Liegengebliebene Zeilen
select
  (select count(*) from auth.users u
    where not exists (select 1 from public.profiles p where p.id = u.id)) as zeilen_ohne_profil,
  (select count(*) from public.deletion_log where scope = 'account')     as kontoloeschungen_protokolliert;

do $$
declare
  v_ohne_profil int;
  v_loeschungen int;
  v_geloescht   int;
begin
  select count(*) into v_ohne_profil
  from auth.users u
  where not exists (select 1 from public.profiles p where p.id = u.id);
  select count(*) into v_loeschungen from public.deletion_log where scope = 'account';

  if v_ohne_profil > v_loeschungen then
    raise exception '909: % Zeilen in auth.users ohne Profil, aber nur % protokollierte Kontolöschungen. '
                    'Abbruch, nichts geändert. Zuerst nachsehen, woher die übrigen Zeilen kommen.',
                    v_ohne_profil, v_loeschungen;
  end if;

  delete from auth.users u
  where not exists (select 1 from public.profiles p where p.id = u.id);
  get diagnostics v_geloescht = row_count;
  raise notice '909: % Zeile(n) aus auth.users gelöscht.', v_geloescht;
end
$$;

-- 3) Selbstprüfung
do $$
begin
  if not has_table_privilege('service_role', 'auth.users', 'DELETE') then
    raise exception '909: service_role hat noch kein DELETE auf auth.users.';
  end if;
  if exists (select 1 from auth.users u
             where not exists (select 1 from public.profiles p where p.id = u.id)) then
    raise exception '909: Es gibt noch Zeilen in auth.users ohne Profil.';
  end if;
  if exists (select 1 from auth.sessions s
             where not exists (select 1 from auth.users u where u.id = s.user_id)) then
    raise exception '909: Es gibt Sitzungen ohne Konto.';
  end if;
end
$$;

\if :{?ausfuehren}
  commit;
  \echo '909 AUSGEFUEHRT'
\else
  rollback;
  \echo '909 PROBELAUF OK (nichts gespeichert). Mit -v ausfuehren=1 erneut starten.'
\endif
