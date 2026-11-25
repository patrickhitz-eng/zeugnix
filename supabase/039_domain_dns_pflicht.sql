-- ============================================================================
-- 039_domain_dns_pflicht.sql
-- Sicherheitstest 24.11.2026, Befund M2 (docs/sicherheitstest-2026-11-24.md)
-- Entscheid Silvan 25.11.2026: drei Stufen. Mailadresse an der Domain = bestätigt
-- (ohne Warnung), DNS-Eintrag = höchste Stufe «Domain geprüft», freiwillig.
-- ============================================================================
--
-- PROBLEM
--
-- Eine Firmen-Domain galt als «verifiziert», sobald die angemeldete Person eine
-- Mailadresse an dieser Domain hatte. Das kann jede Mitarbeiterin einer Firma,
-- auch für ein Konto, das sie privat anlegt. Wer zuerst kam, hielt die Domain;
-- die echte Personalabteilung bekam danach 409. Die öffentliche Prüfung zeigte
-- trotzdem «Aussteller bestätigt».
--
-- LÖSUNG
--
-- Zwei Stufen, die die Datenbank auseinanderhält:
--
--   status = 'email_confirmed'  Mail-Stufe. Die angemeldete Person hat eine
--                               Mailadresse an genau dieser Domain. Die Prüfung
--                               zeigt «Aussteller über Firmen-Mailadresse
--                               bestätigt». NICHT exklusiv: Mehrere Firmen dürfen
--                               dieselbe Domain so halten, niemand kann sie
--                               mehr besetzen.
--   status = 'verified'         Nur noch mit DNS-Eintrag (method = 'dns'). Die
--                               Firma hat bewiesen, dass sie die Domain verwaltet.
--                               Höchstens EINE Firma pro Domain (Index aus 019).
--
-- UMSTELLEN
--
-- Bisherige Einträge mit method = 'email' und status = 'verified' werden zu
-- 'email_confirmed'. Auf der Prüfseite bleiben sie «bestätigt» (Mail-Stufe);
-- neu ist nur, dass sie die Domain nicht mehr exklusiv besetzen. Die App
-- zählt beide Status als bestätigt; «verified» heisst ab jetzt DNS.
--
-- EINSPIELEN
--
-- nine (advisori01): läuft mit `scripts/migrate.mjs` beim Deploy automatisch.
-- Keine neue Tabelle, `901_nine_rechte.sql` ist nicht nötig. Idempotent.
-- ============================================================================

-- 1) Status-Prüfung um 'email_confirmed' erweitern. Den alten Check aus 019
--    über seinen Inhalt finden statt über den Namen, falls er anders heisst.
do $$
declare
  r record;
begin
  for r in
    select conname
    from pg_constraint
    where conrelid = 'public.company_domains'::regclass
      and contype = 'c'
      and pg_get_constraintdef(oid) ilike '%status%'
      and conname <> 'company_domains_verified_needs_dns'
  loop
    execute format('alter table public.company_domains drop constraint %I', r.conname);
  end loop;
end;
$$;

alter table public.company_domains
  add constraint company_domains_status_check
  check (status in ('pending', 'email_confirmed', 'verified', 'failed'));

-- 2) Herabstufen: bisher per Mailadresse «verifiziert» -> Vorstufe.
update public.company_domains
set status = 'email_confirmed'
where status = 'verified'
  and method = 'email';

-- 2b) Jede noch nicht per DNS bestätigte Domain bekommt einen Prüfwert für den
--     TXT-Eintrag (32 Hex-Zeichen, Format wie lib/company/domain.ts). So sehen
--     herabgestufte Firmen den DNS-Schritt sofort. Der Wert ist kein Geheimnis,
--     er steht später öffentlich im DNS; er ordnet den Eintrag nur dieser Firma zu.
update public.company_domains
set dns_token = replace(gen_random_uuid()::text, '-', '')
where status <> 'verified'
  and (dns_token is null or dns_token !~ '^[0-9a-f]{32}$');

-- 3) Ab jetzt: «verified» nur mit DNS.
alter table public.company_domains
  drop constraint if exists company_domains_verified_needs_dns;
alter table public.company_domains
  add constraint company_domains_verified_needs_dns
  check (status <> 'verified' or method = 'dns');

-- Der partielle Unique-Index uq_company_domains_verified aus 019
-- (domain where status = 'verified') bleibt und gilt damit nur noch für DNS.

-- 3b) Prüfregister (036): Stufe der Domain mitspeichern. Bisherige Einträge
--     stammen alle aus der Zeit vor DNS, also aus der Mail-Stufe.
alter table public.certificate_register
  add column if not exists verified_domain_method text;
alter table public.certificate_register
  drop constraint if exists certificate_register_domain_method_check;
alter table public.certificate_register
  add constraint certificate_register_domain_method_check
  check (verified_domain_method is null or verified_domain_method in ('dns', 'email'));
update public.certificate_register
set verified_domain_method = 'email'
where verified_domain is not null
  and verified_domain_method is null;

-- Register-Trigger aus 036, unverändert bis auf Domain und Stufe. Name und
-- Signatur bleiben gleich; der bestehende Trigger ruft ab dem Commit die neue
-- Fassung auf.
create or replace function public.zeugnio_certificate_register()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_employer text;
  v_title text;
  v_domain text;
  v_domain_method text;
begin
  if old.status not in ('final', 'revoked') or old.hash is null then
    return old;
  end if;

  -- v2: eingefrorene Angaben aus dem Siegel. v1: lebende Firma (noch da,
  -- weil die Löschfunktionen die Zeugnisse vor der Firma löschen).
  v_employer := old.meta_snapshot ->> 'employer';
  if v_employer is null then
    select name into v_employer from public.companies where id = old.company_id;
  end if;

  v_title := old.meta_snapshot ->> 'documentTitle';
  if v_title is null then
    -- wie certificateTypeLabel() in lib/certificate/certificate-title.ts
    v_title := case old.type
      when 'zwischen' then 'Zwischenzeugnis'
      when 'arbeitsbestaetigung' then 'Arbeitsbestätigung'
      else 'Arbeitszeugnis'
    end;
  end if;

  -- 039: DNS-geprüfte Domain zuerst, sonst die Mail-Stufe. Die Stufe geht
  -- mit ins Register, damit die Prüfung nach dem Löschen dasselbe zeigt.
  select domain, case when status = 'verified' then 'dns' else 'email' end
    into v_domain, v_domain_method
  from public.company_domains
  where company_id = old.company_id and status in ('verified', 'email_confirmed')
  order by (status = 'verified') desc, verified_at
  limit 1;

  insert into public.certificate_register (
    certificate_id, hash, body_hash, hash_version, status, finalized_at, revoked_at,
    signature, signing_key_id, employer, document_title, verified_domain,
    verified_domain_method, delete_after
  ) values (
    old.id,
    old.hash,
    -- Gleich wie hashBodyV1(): SHA-256 (UTF-8, hex) über den kanonischen Text.
    case when old.canonical_content is not null
      then encode(sha256(convert_to(old.canonical_content, 'UTF8')), 'hex') end,
    coalesce(old.hash_version, 1),
    old.status,
    old.finalized_at,
    old.revoked_at,
    old.signature,
    old.signing_key_id,
    v_employer,
    v_title,
    v_domain,
    v_domain_method,
    coalesce(old.finalized_at, now()) + interval '10 years'
  )
  on conflict (certificate_id) do nothing;

  return old;
end;
$$;

-- 4) Selbstprüfung.
do $$
begin
  if exists (
    select 1 from public.company_domains
    where status = 'verified' and method <> 'dns'
  ) then
    raise exception '039: es gibt noch verifizierte Domains ohne DNS.';
  end if;
  if not exists (
    select 1 from pg_indexes
    where schemaname = 'public' and indexname = 'uq_company_domains_verified'
  ) then
    raise exception '039: Index uq_company_domains_verified fehlt.';
  end if;
end;
$$;
