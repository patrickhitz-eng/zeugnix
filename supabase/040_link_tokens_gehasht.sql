-- ============================================================================
-- 040_link_tokens_gehasht.sql
-- Sicherheitstest 24.11.2026, Befund M4 (docs/sicherheitstest-2026-11-24.md)
-- ============================================================================
--
-- PROBLEM
--
-- Zwei Links entscheiden allein über einen Token, wer hineinkommt:
--   manager_invitations.token     Einladung an die vorgesetzte Person
--   certificate_signoffs.token    Freigabe der unterzeichnenden Person
-- Beide Tokens lagen im Klartext in der Datenbank. Wer eine Sicherung, einen
-- Auszug oder (über die Leserechte aus 033) die Tabelle sah, konnte damit
-- gültige Links bauen und eine Beurteilung abgeben oder ein Zeugnis freigeben.
--
-- LÖSUNG
--
-- Die Spalte `token` wird durch `token_hash` ersetzt: SHA-256 des Tokens, als
-- Hex (64 Zeichen). Der Klartext steht nur noch im Link der Mail. Die App
-- hasht den Token aus dem Link und sucht die Zeile über den Hash
-- (lib/link-token.ts). Dasselbe Verfahren wie bei den Team-Einladungen (033).
--
-- UMSTELLEN
--
-- Die vorhandenen Tokens werden hier in SQL gehasht, und zwar genau so, wie die
-- App es tut: SHA-256 über die UTF-8-Bytes, als Hex-Text. Schon verschickte
-- Links funktionieren darum weiter. Danach fällt die Klartext-Spalte weg, mit
-- ihr der alte Unique-Index und der Suchindex aus 001 bzw. 020.
-- Umgestellt werden alle Zeilen, auch abgeschlossene: Der Klartext soll nirgends
-- mehr stehen bleiben.
--
-- Der Einladungs-Trigger aus 038 (`zeugnio_invitation_not_locked`) bleibt
-- unberührt. Er läuft nur bei INSERT und liest keine Token-Spalte. Die
-- Selbstprüfung unten stellt sicher, dass er nach dieser Migration noch da ist.
--
-- REIHENFOLGE BEIM DEPLOY
--
-- Die Migration läuft vor dem Neustart der App. Bis der neue Code läuft (einige
-- Sekunden), findet der alte Code die Spalte `token` nicht mehr: Wer genau dann
-- einen Link öffnet, sieht «nicht gefunden» und kann neu laden.
--
-- EINSPIELEN
--
-- nine (advisori01): läuft mit `scripts/migrate.mjs` beim Deploy automatisch,
-- danach liest PostgREST das Schema neu (hooks/post-migrate.sh).
-- Keine neue Tabelle, `901_nine_rechte.sql` ist nicht nötig.
-- Idempotent: Ein zweiter Lauf findet keine Spalte `token` mehr und ändert
-- nichts.
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 1) manager_invitations
-- ----------------------------------------------------------------------------
alter table public.manager_invitations add column if not exists token_hash text;

do $$
begin
  if exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'manager_invitations' and column_name = 'token'
  ) then
    execute $sql$
      update public.manager_invitations
      set token_hash = encode(sha256(convert_to(token, 'UTF8')), 'hex')
      where token_hash is null
    $sql$;
    execute 'alter table public.manager_invitations drop column token';
  end if;
end;
$$;

alter table public.manager_invitations alter column token_hash set not null;

alter table public.manager_invitations
  drop constraint if exists manager_invitations_token_hash_format;
alter table public.manager_invitations
  add constraint manager_invitations_token_hash_format
  check (token_hash ~ '^[0-9a-f]{64}$');

create unique index if not exists uq_manager_invitations_token_hash
  on public.manager_invitations (token_hash);

comment on column public.manager_invitations.token_hash is
  'SHA-256 (hex) des Einladungs-Tokens. Der Token selbst steht nur im Link der Mail (040, lib/link-token.ts).';

-- ----------------------------------------------------------------------------
-- 2) certificate_signoffs
-- ----------------------------------------------------------------------------
alter table public.certificate_signoffs add column if not exists token_hash text;

do $$
begin
  if exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'certificate_signoffs' and column_name = 'token'
  ) then
    execute $sql$
      update public.certificate_signoffs
      set token_hash = encode(sha256(convert_to(token, 'UTF8')), 'hex')
      where token_hash is null
    $sql$;
    execute 'alter table public.certificate_signoffs drop column token';
  end if;
end;
$$;

alter table public.certificate_signoffs alter column token_hash set not null;

alter table public.certificate_signoffs
  drop constraint if exists certificate_signoffs_token_hash_format;
alter table public.certificate_signoffs
  add constraint certificate_signoffs_token_hash_format
  check (token_hash ~ '^[0-9a-f]{64}$');

create unique index if not exists uq_certificate_signoffs_token_hash
  on public.certificate_signoffs (token_hash);

comment on column public.certificate_signoffs.token_hash is
  'SHA-256 (hex) des Freigabe-Tokens. Der Token selbst steht nur im Link der Mail (040, lib/link-token.ts).';

-- ----------------------------------------------------------------------------
-- Selbstprüfung. Bricht sonst ab, und die Transaktion von migrate.mjs ändert
-- nichts.
-- ----------------------------------------------------------------------------
do $$
begin
  if exists (
    select 1 from information_schema.columns
    where table_schema = 'public'
      and table_name in ('manager_invitations', 'certificate_signoffs')
      and column_name = 'token'
  ) then
    raise exception '040: Eine Klartext-Spalte token ist noch da.';
  end if;
  if not exists (
    select 1 from pg_indexes
    where schemaname = 'public' and indexname = 'uq_manager_invitations_token_hash'
  ) or not exists (
    select 1 from pg_indexes
    where schemaname = 'public' and indexname = 'uq_certificate_signoffs_token_hash'
  ) then
    raise exception '040: Ein Unique-Index auf token_hash fehlt.';
  end if;
  if not exists (
    select 1 from pg_trigger
    where tgname = 'zeugnio_invitation_not_locked'
      and tgrelid = 'public.manager_invitations'::regclass
  ) then
    raise exception '040: Trigger zeugnio_invitation_not_locked (038) fehlt.';
  end if;
end;
$$;
