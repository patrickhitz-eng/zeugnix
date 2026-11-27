-- ============================================================================
-- 045_konto_loeschen_auth_users.sql
-- Kontolöschung entfernt auch das Anmeldekonto (auth.users) auf advisori01.
-- ============================================================================
--
-- PROBLEM
--
-- zeugnio_delete_account (036) löscht das Profil und danach die Zeile in
-- auth.users, aber nur «wo erlaubt»:
--
--   if ... has_table_privilege('auth.users', 'DELETE') then
--     delete from auth.users where id = p_user_id;
--
-- Die Funktion ist SECURITY INVOKER und läuft als service_role. Auf advisori01
-- hat service_role auf auth.users nur select, insert, update
-- (900_nine_bootstrap.sql). Die Bedingung ist dort also falsch, und die Zeile
-- mit der E-Mail-Adresse bleibt nach der Kontolöschung stehen. Bei Supabase hat
-- früher die Route das Anmeldekonto über die Admin-Schnittstelle gelöscht. Diesen
-- Weg gibt es seit B2 nicht mehr.
--
-- LÖSUNG
--
-- Eine kleine Funktion public.zeugnio_delete_auth_user(uuid), SECURITY DEFINER.
-- Sie gehört der Rolle, die diese Migration einspielt. Auf advisori01 ist das
-- die Schreibrolle, der auch auth.users gehört (900, Kopfkommentar), dasselbe
-- Muster wie public.ensure_auth_user in 902. Die Funktion darf darum löschen,
-- ohne dass service_role ein allgemeines DELETE-Recht auf auth.users bekommt.
--
-- Sie löscht nur ein Anmeldekonto, zu dem es KEIN Profil mehr gibt. Damit kann
-- sie nur abräumen, was zeugnio_delete_account schon geprüft und gelöscht hat
-- (letzte Admin-Person, Protokoll), und kein aktives Konto entfernen. Die
-- Sitzungen (auth.sessions, 906) folgen per Fremdschlüssel-Kaskade.
--
-- zeugnio_delete_account bleibt SECURITY INVOKER und ruft die neue Funktion auf.
-- Signatur, Rückgabe und Rechte bleiben gleich; die Rückgabe enthält zusätzlich
-- `auth_user_deleted`.
--
-- SELBSTPRÜFUNG
--
-- Am Ende prüft die Migration, dass der Besitzer der neuen Funktion auth.users
-- wirklich löschen darf. Wenn nicht, bricht sie ab. So fällt ein falscher
-- Besitzer beim Deploy auf und nicht erst, wenn jemand sein Konto löscht.
--
-- Idempotent (`create or replace`). Läuft beim Deploy über scripts/migrate.mjs.
-- ============================================================================

create or replace function public.zeugnio_delete_auth_user(p_user_id uuid)
returns boolean
language plpgsql
security definer
-- Fester search_path und voll qualifizierte Namen: Ein Aufrufer kann keine
-- eigenen Tabellen unterschieben.
set search_path = pg_catalog, pg_temp
as $$
begin
  if to_regclass('auth.users') is null then
    return false;
  end if;
  if exists (select 1 from public.profiles where id = p_user_id) then
    raise exception 'Anmeldekonto % hat noch ein Profil. Konten nur über zeugnio_delete_account löschen.', p_user_id
      using errcode = '55000';
  end if;
  execute 'delete from auth.users where id = $1' using p_user_id;
  return found;
end;
$$;

revoke all on function public.zeugnio_delete_auth_user(uuid) from public;
revoke all on function public.zeugnio_delete_auth_user(uuid) from anon;
revoke all on function public.zeugnio_delete_auth_user(uuid) from authenticated;
grant execute on function public.zeugnio_delete_auth_user(uuid) to service_role;

-- Konto. Nur für den Server (service_role). Fassung aus 036, nur der letzte
-- Schritt (auth.users) geht jetzt über zeugnio_delete_auth_user. SECURITY
-- INVOKER, damit current_user service_role bleibt.
create or replace function public.zeugnio_delete_account(p_user_id uuid)
returns jsonb
language plpgsql
set search_path = public, pg_temp
as $$
declare
  v_blocking text;
  v_auth_deleted boolean;
begin
  -- Letzte aktive Admin-Person einer Organisation: erst übergeben oder die
  -- Organisation löschen.
  select o.name into v_blocking
  from public.organization_members m
  join public.organizations o on o.id = m.organization_id
  where m.user_id = p_user_id
    and m.role = 'admin'
    and m.deactivated_at is null
    and not exists (
      select 1 from public.organization_members x
      where x.organization_id = m.organization_id
        and x.user_id <> p_user_id
        and x.role = 'admin'
        and x.deactivated_at is null
    )
  limit 1;
  if v_blocking is not null then
    raise exception 'Sie sind die letzte Admin-Person der Organisation «%». Machen Sie zuerst eine andere Person zum Admin oder löschen Sie die Organisation.', v_blocking
      using errcode = '23514';
  end if;

  insert into public.deletion_log (actor_user_id, scope) values (p_user_id, 'account');

  delete from public.profiles where id = p_user_id;
  -- 045: Anmeldekonto samt E-Mail-Adresse und (per Kaskade) Sitzungen.
  v_auth_deleted := public.zeugnio_delete_auth_user(p_user_id);

  return jsonb_build_object('deleted', true, 'auth_user_deleted', v_auth_deleted);
end;
$$;

revoke all on function public.zeugnio_delete_account(uuid) from public, anon, authenticated;
grant execute on function public.zeugnio_delete_account(uuid) to service_role;

-- ----------------------------------------------------------------------------
-- Selbstprüfung
-- ----------------------------------------------------------------------------
do $$
declare
  v_owner name;
begin
  select r.rolname into v_owner
  from pg_proc p join pg_roles r on r.oid = p.proowner
  where p.oid = 'public.zeugnio_delete_auth_user(uuid)'::regprocedure;

  if not (select prosecdef from pg_proc where oid = 'public.zeugnio_delete_auth_user(uuid)'::regprocedure) then
    raise exception '045: zeugnio_delete_auth_user ist nicht SECURITY DEFINER';
  end if;
  if has_function_privilege('anon', 'public.zeugnio_delete_auth_user(uuid)', 'EXECUTE')
     or has_function_privilege('authenticated', 'public.zeugnio_delete_auth_user(uuid)', 'EXECUTE') then
    raise exception '045: zeugnio_delete_auth_user darf nur service_role aufrufen';
  end if;
  if to_regclass('auth.users') is not null
     and not has_table_privilege(v_owner, 'auth.users', 'DELETE') then
    raise exception '045: Besitzer % von zeugnio_delete_auth_user darf auth.users nicht löschen. Migration als Besitzer von auth.users einspielen.', v_owner;
  end if;
  if position('zeugnio_delete_auth_user' in pg_get_functiondef('public.zeugnio_delete_account(uuid)'::regprocedure)) = 0 then
    raise exception '045: zeugnio_delete_account ruft zeugnio_delete_auth_user nicht auf';
  end if;
  raise notice '045: ok (Besitzer %, darf auth.users löschen)', v_owner;
end;
$$;
