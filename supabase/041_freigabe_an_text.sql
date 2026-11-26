-- ============================================================================
-- 041_freigabe_an_text.sql
-- Sicherheitstest 24.11.2026, Befund M3: Freigabe nicht an den Text gebunden.
-- (040 ist für M4, Tokens als SHA-256, reserviert.)
-- ============================================================================
--
-- PROBLEM
--
-- Eine Unterzeichner-Freigabe (certificate_signoffs, 020) hielt nur fest, DASS
-- eine Person zugestimmt hat, nicht WOZU. Die Unterzeichnerin gibt Text A frei,
-- danach ändert die Personalabteilung auf Text B und finalisiert. Prüfseite und
-- PDF meldeten B als «bestätigt».
--
-- LÖSUNG
--
-- Drei neue Spalten, gesetzt beim Klick auf «Zeugnis freigeben»
-- (app/api/signoffs/[token]/submit/route.ts):
--
--   confirmed_text_hash  SHA-256 (hex) über den kanonisierten Text, den die
--                        Person gesehen hat. Dieselbe Pipeline wie der
--                        v1-Body-Hash beim Finalisieren (hashBodyV1).
--   confirmed_name       Name und Rolle, unter denen die Person angefragt wurde
--   confirmed_role       und die beim Klick im Unterschriftsfeld standen.
--
-- Prüfseite, PDF und App zählen eine Freigabe nur, wenn Hash, Name und Rolle
-- zum Zeugnis passen (lib/certificate/signoff-binding.ts). Nach dem
-- Finalisieren ist das der versiegelte Stand, der per Trigger unveränderlich ist.
-- Eine veraltete Freigabe erscheint nicht als bestätigt; HR sieht sie in der App
-- als «veraltet» und fordert sie neu an.
--
-- ALTBESTAND: Bestätigte Freigaben von vor 041 haben keinen Hash. Es gibt KEIN
-- Nachtragen per SQL: Welchen Text die Person damals sah, ist nicht mehr
-- feststellbar. Die App zählt eine solche Freigabe nur, wenn sie nach dem
-- Finalisieren erteilt wurde (dann war der Text schon versiegelt). Ältere
-- erscheinen als veraltet und lassen sich neu anfordern, auch nach dem
-- Finalisieren.
--
-- DATENBANK-SEITIG (zweite Linie hinter der App)
--
--   1. Eine NEUE Bestätigung (Wechsel auf 'confirmed' oder Insert als
--      'confirmed') braucht Hash und Namen. Altzeilen bleiben schreibbar, damit
--      der Löschlauf (pii-cleanup) IP und Browserkennung weiter leeren kann.
--   2. Eine Bestätigung mit Hash ist eingefroren: Hash, Name, Rolle und
--      Zeitpunkt lassen sich nicht nachträglich auf einen neuen Text umbiegen.
--      Neu anfordern setzt die Zeile auf 'pending' zurück; das bleibt erlaubt.
--
-- Bestehende Daten werden nicht verändert. Idempotent. Läuft beim Deploy über
-- scripts/migrate.mjs.
-- ============================================================================

-- 1) Spalten.
alter table public.certificate_signoffs
  add column if not exists confirmed_text_hash text,
  add column if not exists confirmed_name text,
  add column if not exists confirmed_role text;

alter table public.certificate_signoffs
  drop constraint if exists certificate_signoffs_text_hash_format;
alter table public.certificate_signoffs
  add constraint certificate_signoffs_text_hash_format
  check (confirmed_text_hash is null or confirmed_text_hash ~ '^[0-9a-f]{64}$');

comment on column public.certificate_signoffs.confirmed_text_hash is
  'M3 (041): SHA-256 des kanonisierten Texts, den die Person freigegeben hat.';
comment on column public.certificate_signoffs.confirmed_name is
  'M3 (041): Name im Unterschriftsfeld zum Zeitpunkt der Freigabe.';
comment on column public.certificate_signoffs.confirmed_role is
  'M3 (041): Rolle im Unterschriftsfeld zum Zeitpunkt der Freigabe.';

-- 2) Trigger: neue Bestätigungen nur mit Bindung, Bindung danach eingefroren.
create or replace function public.enforce_signoff_binding()
returns trigger
language plpgsql
as $$
begin
  if new.status = 'confirmed' then
    -- Neue Bestätigung (Insert, Statuswechsel oder Entfernen einer Bindung).
    if (new.confirmed_text_hash is null or new.confirmed_name is null)
       and (
         tg_op = 'INSERT'
         or old.status is distinct from 'confirmed'
         or old.confirmed_text_hash is not null
       ) then
      raise exception 'Freigabe ohne Text-Hash und Namen (041, M3).'
        using errcode = 'check_violation';
    end if;

    -- Bestehende Bestätigung mit Bindung bleibt, wie sie ist.
    if tg_op = 'UPDATE'
       and old.status = 'confirmed'
       and old.confirmed_text_hash is not null
       and (
         new.confirmed_text_hash is distinct from old.confirmed_text_hash
         or new.confirmed_name is distinct from old.confirmed_name
         or new.confirmed_role is distinct from old.confirmed_role
         or new.confirmed_at is distinct from old.confirmed_at
       ) then
      raise exception 'Bestätigte Freigabe ist an ihren Text gebunden und nicht änderbar (041, M3).'
        using errcode = 'check_violation';
    end if;
  end if;
  return new;
end;
$$;

drop trigger if exists enforce_signoff_binding on public.certificate_signoffs;
create trigger enforce_signoff_binding
  before insert or update on public.certificate_signoffs
  for each row
  execute function public.enforce_signoff_binding();

-- 3) Selbstprüfung.
do $$
begin
  if not exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'certificate_signoffs'
      and column_name = 'confirmed_text_hash'
  ) then
    raise exception '041: Spalte confirmed_text_hash fehlt.';
  end if;
  if not exists (
    select 1 from pg_trigger
    where tgname = 'enforce_signoff_binding'
      and tgrelid = 'public.certificate_signoffs'::regclass
  ) then
    raise exception '041: Trigger enforce_signoff_binding fehlt.';
  end if;
end;
$$;

-- PostgREST soll die neuen Spalten kennen. Ohne Zuhörer ist das wirkungslos;
-- deploy.sh liest das Schema ohnehin neu ein.
notify pgrst, 'reload schema';
