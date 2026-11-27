-- ============================================================================
-- 044_firmenzugang_nur_org_mitglieder.sql
-- Sicherheitstest 24.11.2026, Härtung der Firmenzugänge (company_members) und
-- Aufräumen der Tabellenrechte auf certificate_register und deletion_log.
-- ============================================================================
--
-- PROBLEM 1: FIRMENZUGANG OHNE MITGLIEDSCHAFT
--
-- Ein Firmenzugang (company_members) gibt einer Person eine Rolle in einer
-- Firma. Wirksam wird er nur, wenn die Person auch aktives Mitglied der
-- Organisation dieser Firma ist (organization_members); so rechnet
-- zeugnio_permissions_for() aus 035. Die Zeilenregel «Admins manage company
-- access» aus 033 prüfte beim Schreiben aber nur, ob die handelnde Person
-- Admin ist, nicht, ob die Person in der neuen Zeile zur Organisation gehört.
-- Ein Admin konnte so eine Zeile für ein beliebiges Konto anlegen. Rechte
-- bekam das Konto dadurch keine, aber die Teamseite für «Team verwalten»
-- baute ihre Personenliste aus diesen Zeilen und las dazu Name und Mailadresse
-- mit dem Service-Client. Die Regel für «Team verwalten» aus 035 prüfte die
-- Mitgliedschaft beim Anlegen schon, aber nicht, wenn eine bestehende Zeile
-- per UPDATE auf eine andere Person umgeschrieben wird.
--
-- Dasselbe galt für organization_members: Die Admin-Regel aus 033 erlaubt
-- UPDATE auf jede Spalte, also auch auf user_id. Ein Admin hätte damit eine
-- bestehende Mitgliedschaft auf ein fremdes Konto umschreiben können.
--
-- LÖSUNG 1: DIE DATENBANK HÄLT DIE REGEL SELBST
--
--   a) Trigger auf company_members (BEFORE INSERT OR UPDATE): Die Person der
--      Zeile muss in der Organisation der Firma eingetragen sein. Gilt für
--      jede Rolle, auch für service_role und die Einladungsannahme, also
--      unabhängig von Zeilenregeln. Bei einem UPDATE, das Firma und Person
--      nicht ändert (Rolle, Feinrechte), prüft der Trigger nichts.
--      «Eingetragen» heisst: aktiv ODER deaktiviert. Deaktivierte Personen
--      gehören weiter zur Organisation (der Admin kann sie reaktivieren), und
--      ihre Zugänge wirken ohnehin nicht, solange sie deaktiviert sind.
--   b) Die Admin-Regel aus 033 bekommt dieselbe Bedingung im WITH CHECK,
--      damit die Grenze auch in der Regel steht, die sie betrifft.
--   c) Trigger auf organization_members (BEFORE UPDATE): organization_id und
--      user_id sind unveränderlich. Neue Mitglieder entstehen nur über die
--      Einladung (Server), Austritt ist deactivated_at oder DELETE.
--
-- Der reguläre Weg bleibt: Die Einladungsannahme
-- (app/api/team/invitations/accept/route.ts) legt zuerst die Mitgliedschaft
-- an oder reaktiviert sie und schreibt erst danach die Firmenzugänge. Wer eine
-- Firma anlegt, wird über trg_company_assign_org (033) Admin und braucht keine
-- company_members-Zeile.
--
-- PROBLEM 2: 901 VERGIBT RECHTE NEU, DIE 036 ENTZOGEN HATTE
--
-- 036 hat auf certificate_register und deletion_log alle Rechte für anon und
-- authenticated entzogen; nur der Server (service_role) liest und schreibt.
-- 901_nine_rechte.sql vergibt danach pauschal SELECT, INSERT, UPDATE und
-- DELETE an authenticated und SELECT an anon, auf jeder Tabelle. Die
-- Zeilensicherheit ohne Regel für diese Rollen liefert zwar trotzdem keine
-- Zeile, aber die zweite Verteidigungslinie war weg.
--
-- LÖSUNG 2: Hier dieselben REVOKE wie in 036. 901 nimmt die beiden Tabellen
-- seit diesem Stand selbst aus (Liste «nur_server»), eine Neuinstallation ist
-- also auch ohne 044 sauber. service_role behält seine Rechte: 903 verlangt
-- für service_role auf jeder Tabelle alle vier Datenrechte.
--
-- EINSPIELEN
--
-- nine (advisori01): läuft mit `scripts/migrate.mjs` beim Deploy automatisch.
-- Keine neue Tabelle, 901 muss nicht erneut laufen (und nähme die Rechte
-- dank der neuen Ausnahme auch nicht mehr zurück). Idempotent.
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 1) Hilfsfunktionen: Ist die Person in der Organisation eingetragen?
-- ----------------------------------------------------------------------------
-- Aktiv oder deaktiviert, siehe Kopf. Für angemeldete Personen antworten die
-- Funktionen nur über Organisationen, in denen sie selbst aktiv sind; sonst
-- liesse sich per RPC abfragen, wer wo Mitglied ist. Der Server
-- (service_role, auth.uid() ist null) bekommt immer die Antwort.
-- Die Route app/api/team/members/[userId] fragt zeugnio_org_has_user, bevor
-- sie schreibt; die Zeilenregel in 3) fragt die Variante pro Firma.
create or replace function public.zeugnio_org_has_user(p_org_id uuid, p_user_id uuid)
returns boolean
language sql stable security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.organization_members om
    where om.organization_id = p_org_id
      and om.user_id = p_user_id
      and (auth.uid() is null or public.zeugnio_is_org_member(p_org_id))
  );
$$;

create or replace function public.zeugnio_company_org_has_user(p_company_id uuid, p_user_id uuid)
returns boolean
language sql stable security definer
set search_path = public
as $$
  select public.zeugnio_org_has_user(
    (select c.organization_id from public.companies c where c.id = p_company_id),
    p_user_id
  );
$$;

revoke execute on function public.zeugnio_org_has_user(uuid, uuid) from public, anon;
grant execute on function public.zeugnio_org_has_user(uuid, uuid) to authenticated, service_role;
revoke execute on function public.zeugnio_company_org_has_user(uuid, uuid) from public, anon;
grant execute on function public.zeugnio_company_org_has_user(uuid, uuid) to authenticated, service_role;

-- ----------------------------------------------------------------------------
-- 2) Trigger: Firmenzugang nur für Personen der Organisation
-- ----------------------------------------------------------------------------
-- SECURITY DEFINER, weil die handelnde Person (z. B. mit «Team verwalten»)
-- unter den Zeilenregeln fremde Mitgliedschaften nicht sieht. Der Trigger
-- fragt die Tabelle darum direkt und ohne die Einschränkung aus 1).
create or replace function public.zeugnio_company_members_org_guard()
returns trigger
language plpgsql security definer
set search_path = public
as $$
begin
  if tg_op = 'UPDATE'
     and new.company_id = old.company_id
     and new.user_id = old.user_id then
    return new;
  end if;

  if not exists (
    select 1
    from public.companies c
    join public.organization_members om on om.organization_id = c.organization_id
    where c.id = new.company_id
      and om.user_id = new.user_id
  ) then
    raise exception 'Diese Person gehört nicht zur Organisation der Firma.'
      using errcode = '42501';
  end if;
  return new;
end;
$$;

revoke execute on function public.zeugnio_company_members_org_guard() from public, anon, authenticated;

drop trigger if exists trg_company_members_org_guard on public.company_members;
create trigger trg_company_members_org_guard
  before insert or update on public.company_members
  for each row execute function public.zeugnio_company_members_org_guard();

-- ----------------------------------------------------------------------------
-- 3) Admin-Regel aus 033: Mitgliedschaft im WITH CHECK
-- ----------------------------------------------------------------------------
drop policy if exists "Admins manage company access" on public.company_members;
create policy "Admins manage company access" on public.company_members
  for all using (public.zeugnio_company_role(company_id) = 'admin')
  with check (
    public.zeugnio_company_role(company_id) = 'admin'
    and public.zeugnio_company_org_has_user(company_id, user_id)
  );

-- ----------------------------------------------------------------------------
-- 4) organization_members: Organisation und Person unveränderlich
-- ----------------------------------------------------------------------------
create or replace function public.zeugnio_org_members_keys_fixed()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if new.organization_id is distinct from old.organization_id
     or new.user_id is distinct from old.user_id then
    raise exception 'Organisation und Person einer Mitgliedschaft lassen sich nicht ändern.'
      using errcode = '42501';
  end if;
  return new;
end;
$$;

revoke execute on function public.zeugnio_org_members_keys_fixed() from public, anon, authenticated;

drop trigger if exists trg_org_members_keys_fixed on public.organization_members;
create trigger trg_org_members_keys_fixed
  before update on public.organization_members
  for each row execute function public.zeugnio_org_members_keys_fixed();

-- ----------------------------------------------------------------------------
-- 5) Rechte auf Register und Löschprotokoll wie in 036
-- ----------------------------------------------------------------------------
revoke all on table public.certificate_register from anon, authenticated;
revoke all on table public.deletion_log from anon, authenticated;
grant select, insert, delete on table public.certificate_register to service_role;
grant select, insert on table public.deletion_log to service_role;

-- ----------------------------------------------------------------------------
-- 6) Selbstprüfung
-- ----------------------------------------------------------------------------
do $$
declare
  n int;
begin
  -- Bestehende Zeilen: jede Person eines Firmenzugangs gehört zur Organisation.
  -- Sonst nicht abbrechen (der Trigger schützt ab jetzt), aber laut melden.
  select count(*) into n
  from public.company_members cm
  join public.companies c on c.id = cm.company_id
  where not exists (
    select 1 from public.organization_members om
    where om.organization_id = c.organization_id and om.user_id = cm.user_id
  );
  if n > 0 then
    raise warning '044: % Firmenzugänge gehören zu Personen ausserhalb der Organisation der Firma. Prüfen und entfernen.', n;
  end if;

  if not exists (
    select 1 from pg_trigger
    where tgname = 'trg_company_members_org_guard'
      and tgrelid = 'public.company_members'::regclass and not tgisinternal
  ) then
    raise exception '044: Trigger trg_company_members_org_guard fehlt.';
  end if;
  if not exists (
    select 1 from pg_trigger
    where tgname = 'trg_org_members_keys_fixed'
      and tgrelid = 'public.organization_members'::regclass and not tgisinternal
  ) then
    raise exception '044: Trigger trg_org_members_keys_fixed fehlt.';
  end if;
  if not exists (
    select 1 from pg_policy
    where polrelid = 'public.company_members'::regclass
      and polname = 'Admins manage company access'
      and pg_get_expr(polwithcheck, polrelid) like '%zeugnio_company_org_has_user%'
  ) then
    raise exception '044: Admin-Regel auf company_members prüft die Mitgliedschaft nicht.';
  end if;

  if exists (
    select 1
    from unnest(array['certificate_register', 'deletion_log']) as t(name),
         unnest(array['anon', 'authenticated']) as r(role),
         unnest(array['SELECT', 'INSERT', 'UPDATE', 'DELETE']) as p(priv)
    where has_table_privilege(r.role, ('public.' || t.name)::regclass, p.priv)
  ) then
    raise exception '044: anon oder authenticated haben noch Rechte auf Register oder Löschprotokoll.';
  end if;
  if not (has_table_privilege('service_role', 'public.certificate_register', 'SELECT')
          and has_table_privilege('service_role', 'public.certificate_register', 'INSERT')
          and has_table_privilege('service_role', 'public.certificate_register', 'DELETE')
          and has_table_privilege('service_role', 'public.deletion_log', 'SELECT')
          and has_table_privilege('service_role', 'public.deletion_log', 'INSERT')) then
    raise exception '044: service_role fehlt ein Recht auf Register oder Löschprotokoll.';
  end if;
end;
$$;
