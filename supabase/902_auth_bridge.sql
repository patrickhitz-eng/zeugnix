-- ============================================================================
-- zeugnio.ch – Brücke zwischen Supabase-Anmeldung und eigener Datenbank
-- ----------------------------------------------------------------------------
-- Läuft NACH 901_nine_ownership.sql. Siehe Kopf von 900_nine_bootstrap.sql.
--
-- DAS PROBLEM, DAS DIESE DATEI LÖST
--
-- Der Umzug passiert in zwei Schritten: erst die Daten (Cutover A), später die
-- Anmeldung (Cutover B). Dazwischen gibt es einen Zustand, in dem Supabase noch
-- anmeldet, die Daten aber schon hier liegen. Meldet sich in dieser Zeit jemand
-- NEU an, entsteht der Benutzer bei Supabase – und unsere auth.users weiss
-- nichts davon. public.profiles.id hat aber einen Fremdschlüssel auf auth.users
-- (001:76). Der Trigger, der das Profil anlegen soll, scheitert deshalb am
-- Fremdschlüssel: die Anmeldung gelingt, das Konto ist aber unbrauchbar.
--
-- Das trifft nicht einen Randfall, sondern jede neue Registrierung – also genau
-- den Weg, den Christoph Senn und seine Kolleginnen und Kollegen gerade gehen.
--
-- Die Lösung: die Anwendung meldet den Benutzer nach erfolgreicher Anmeldung
-- einmal hier an (app/api/auth/sync + app/auth/callback/page.tsx). Diese Datei
-- stellt die Funktion dafür bereit.
--
-- Ausführung als Datenbankbenutzer nmd_zeugnio:
--   psql -w -v ON_ERROR_STOP=1 -d nmd_zeugnio -f supabase/902_auth_bridge.sql
--
-- Idempotent.
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 1) Der Trigger aus 001 – hier, weil er nicht im Auszug steckt
-- ----------------------------------------------------------------------------
-- 001_initial_schema.sql legt on_auth_user_created auf auth.users an. Der
-- Schema-Auszug der Produktionsdatenbank umfasst aber nur das Schema public,
-- und der Trigger hängt an einer Tabelle im Schema auth. Er muss darum hier
-- wieder entstehen, sonst bekommt ein neuer Benutzer kein Profil – und das
-- fällt erst auf, wenn sich jemand zum ersten Mal anmeldet.
do $$
begin
  if not exists (
    select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace
     where n.nspname = 'public' and p.proname = 'handle_new_user'
  ) then
    raise exception
      'public.handle_new_user() fehlt. Diese Datei läuft erst NACH dem '
      'Einspielen des Schemas – siehe Kopf von 900_nine_bootstrap.sql.';
  end if;
end
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute procedure public.handle_new_user();

-- ----------------------------------------------------------------------------
-- 2) public.ensure_auth_user
-- ----------------------------------------------------------------------------
-- Legt den Benutzer in auth.users an, falls er dort fehlt. Der Trigger von oben
-- erzeugt daraufhin das Profil – die Funktion muss sich also nicht selbst um
-- public.profiles kümmern, und der Weg für einen neuen Benutzer ist derselbe
-- wie bisher.
--
-- SECURITY DEFINER, weil die Anwendung sonst Schreibrecht auf auth.users
-- bräuchte. Eigentümer ist service_role (durch 901), search_path ist fixiert –
-- ohne diese Fixierung könnte ein Aufrufer mit eigenem search_path die
-- verwendeten Tabellen unterschieben.
--
-- Gibt zurück, was tatsächlich passiert ist. Die Route protokolliert das, denn
-- „angelegt" ist im Betrieb eine Information: nach Cutover B darf hier nichts
-- mehr Neues entstehen.
create or replace function public.ensure_auth_user(p_id uuid, p_email text)
returns text
language plpgsql
security definer
set search_path = public, auth
as $$
declare
  v_existing_email text;
  v_email_owner    uuid;
begin
  if p_id is null or p_email is null or btrim(p_email) = '' then
    raise exception 'ensure_auth_user: id und email sind Pflicht.';
  end if;

  select email into v_existing_email from auth.users where id = p_id;

  if v_existing_email is not null then
    if v_existing_email = p_email then
      return 'unverändert';
    end if;
    -- Adresswechsel: nur erlaubt, wenn die neue Adresse nicht bereits einem
    -- anderen Konto gehört. Sonst bricht der eindeutige Index – und eine
    -- unverständliche Fehlermeldung mitten in der Anmeldung ist das Letzte,
    -- was jemand in diesem Moment braucht.
    select id into v_email_owner from auth.users where email = p_email and id <> p_id;
    if v_email_owner is not null then
      raise exception
        'ensure_auth_user: die Adresse gehört bereits einem anderen Konto.'
        using errcode = 'unique_violation';
    end if;
    update auth.users set email = p_email, updated_at = now() where id = p_id;
    return 'aktualisiert';
  end if;

  -- Neu. Kann bei zwei gleichzeitigen Anmeldungen kollidieren, darum on conflict.
  select id into v_email_owner from auth.users where email = p_email;
  if v_email_owner is not null then
    raise exception
      'ensure_auth_user: die Adresse gehört bereits einem anderen Konto.'
      using errcode = 'unique_violation';
  end if;

  insert into auth.users (id, email, created_at, email_confirmed_at)
  values (p_id, p_email, now(), now())
  on conflict (id) do nothing;

  return 'angelegt';
end
$$;

-- Nur service_role darf das aufrufen. Die Route /api/auth/sync läuft mit dem
-- service_role-Schlüssel; ein angemeldeter Browser kommt hier nicht heran.
-- Ohne diesen Entzug könnte sonst jeder Angemeldete beliebige Konten anlegen.
revoke all on function public.ensure_auth_user(uuid, text) from public;
revoke all on function public.ensure_auth_user(uuid, text) from anon;
revoke all on function public.ensure_auth_user(uuid, text) from authenticated;
grant execute on function public.ensure_auth_user(uuid, text) to service_role;

comment on function public.ensure_auth_user(uuid, text) is
  'Trägt einen bei Supabase angemeldeten Benutzer in die eigene auth.users ein, '
  'damit der Fremdschlüssel von public.profiles trägt. Nur zwischen Cutover A '
  'und B nötig; danach entsteht der Benutzer hier zuerst und diese Funktion '
  'sollte nichts mehr anlegen (nur noch „unverändert" zurückgeben).';

-- ----------------------------------------------------------------------------
-- Fertig. Nächster Schritt: 903_nine_verify.sql – und der ist nicht optional.
-- ----------------------------------------------------------------------------
