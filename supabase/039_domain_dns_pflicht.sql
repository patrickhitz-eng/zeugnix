-- ============================================================================
-- 039_domain_dns_pflicht.sql
-- Sicherheitstest 24.11.2026, Befund M2 (docs/sicherheitstest-2026-11-24.md)
-- Entscheid Silvan 25.11.2026: DNS-Eintrag für «Aussteller bestätigt»,
-- Mailadresse nur noch als Vorstufe, bestehende Mail-Verifizierungen herabstufen.
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
--   status = 'email_confirmed'  Vorstufe. Die angemeldete Person hat eine
--                               Mailadresse an genau dieser Domain. Die Prüfung
--                               zeigt das grau, nicht als «bestätigt». Mehrere
--                               Firmen dürfen dieselbe Domain so halten.
--   status = 'verified'         Nur noch mit DNS-Eintrag (method = 'dns'). Die
--                               Firma hat bewiesen, dass sie die Domain verwaltet.
--                               Höchstens EINE Firma pro Domain (Index aus 019).
--
-- Weil «verified» jetzt DNS bedeutet, stimmen alle bestehenden Abfragen
-- `status = 'verified'` (Prüfung, Prüfregister 036, Badge beim Finalisieren,
-- Firmenliste, Dashboard) ohne Änderung.
--
-- HERABSTUFEN
--
-- Bisherige Einträge mit method = 'email' und status = 'verified' werden zu
-- 'email_confirmed'. Die betroffenen Firmen sehen in der App den DNS-Schritt.
-- Zeugnisse bleiben gültig; nur das Label «Aussteller bestätigt» entfällt, bis
-- der DNS-Eintrag steht.
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
