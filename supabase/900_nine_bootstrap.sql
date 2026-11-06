-- ============================================================================
-- zeugnio.ch – Bootstrap der eigenen Datenbank auf advisori01 (nine.ch)
-- ----------------------------------------------------------------------------
-- Stellt das her, was Supabase bisher mitgebracht hat: das Schema `auth` mit
-- auth.uid()/auth.role()/auth.jwt() und das Schema `extensions` mit uuid-ossp
-- und pgcrypto. Die vier Rollen legt seit dem 6.11.2026 900_0_nine_rollen.sql
-- an, weil das auf advisori01 nur pgadmin darf.
--
-- REIHENFOLGE – die Dateien 900 bis 903 laufen einmalig und in dieser Folge:
--
--   900_0_nine_rollen.sql    als pgadmin: Rollen und Mitgliedschaften
--   900_nine_bootstrap.sql   VOR dem Schema (diese Datei)
--   → dann `node scripts/migrate.mjs`
--     Das Schema entsteht aus den Migrationen im Repository (supabase/0*.sql),
--     NICHT aus einem Auszug der Produktionsdatenbank. Grund: Supabase läuft
--     auf PostgreSQL 17, hier steht 16, und der Auszug eines neueren Servers
--     lässt sich nicht in einen älteren einspielen. Der Auszug wird trotzdem
--     gezogen, aber nur zum Vergleichen. Näheres in Abschnitt 6 von
--     docs/setup-zeugnio-nine.html.
--     Kein `--baseline`: die Migrationen laufen hier wirklich. `--baseline`
--     würde sie nur als erledigt vermerken, ohne sie auszuführen – das war die
--     Reihenfolge, als das Schema noch aus dem Auszug kam.
--   901_nine_rechte.sql      NACH dem Schema: Rechte und Regel für service_role
--   902_auth_bridge.sql      NACH 901: Trigger und ensure_auth_user
--   903_nine_verify.sql      nur SELECTs – prüft, ob alles davon getragen hat
--
-- Diese Dateien werden von scripts/migrate.mjs NICHT automatisch eingespielt
-- (alles ab 900 ist davon ausgenommen), weil sie mehr Rechte brauchen als der
-- Anwendungsbenutzer im Betrieb hat.
--
-- Ausführung als Datenbankbenutzer nmd_zeugnio, nicht als pgadmin. Sonst
-- gehörten die Schemas auth und extensions dem Verwaltungskonto:
--   psql -w -v ON_ERROR_STOP=1 -d nmd_zeugnio -f supabase/900_nine_bootstrap.sql
--
-- Idempotent: mehrfaches Ausführen ändert nichts.
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 1) Die vier Rollen: angelegt von 900_0_nine_rollen.sql
-- ----------------------------------------------------------------------------
-- Bis zum 6.11.2026 stand hier das Anlegen der Rollen. Das darf auf advisori01
-- nur pgadmin; es steht darum jetzt in 900_0_nine_rollen.sql. Dort steht auch,
-- warum die Namen nicht frei wählbar sind und warum authenticator NOINHERIT ist.
--
-- Diese Prüfung bricht ab, bevor etwas angelegt wird, falls 900_0 fehlt.
-- current_user ist hier die Schreibrolle nmd_zeugnio_rw (Rolleneinstellung von
-- nine, siehe Kopf von 900_0).
do $$
declare
  fehlend text;
begin
  select string_agg(n, ', ') into fehlend
    from unnest(array['anon', 'authenticated', 'service_role', 'authenticator']) as n
   where not exists (select 1 from pg_roles where rolname = n);
  if fehlend is not null then
    raise exception 'Rollen fehlen: %. Zuerst 900_0_nine_rollen.sql als pgadmin ausführen.', fehlend;
  end if;

  if not (pg_has_role(current_user, 'service_role', 'SET')
          and pg_has_role(current_user, 'authenticated', 'SET')
          and pg_has_role(current_user, 'anon', 'SET')) then
    raise exception '% fehlt eine Mitgliedschaft (service_role, anon oder authenticated). '
                    '900_0_nine_rollen.sql mit -v app=… nochmals als pgadmin ausführen.', current_user;
  end if;
end
$$;

-- ----------------------------------------------------------------------------
-- 2) Schema `extensions` – und warum es überhaupt gebraucht wird
-- ----------------------------------------------------------------------------
-- Supabase legt uuid-ossp und pgcrypto nicht in public ab, sondern in einem
-- eigenen Schema `extensions`. Die Spaltenvorgaben unserer Tabellen zeigen
-- darum je nach Projektalter auf `extensions.uuid_generate_v4()` oder auf
-- `uuid_generate_v4()`. Existiert dieses Schema hier nicht, scheitert entweder
-- das Einspielen des Auszugs oder – schlimmer – erst der erste INSERT.
-- Beide Extensions sind seit PostgreSQL 13 als „trusted" eingetragen und
-- brauchen darum keinen Superuser, nur CREATE in der Datenbank.
create schema if not exists extensions;
create extension if not exists "uuid-ossp" schema extensions;
create extension if not exists pgcrypto schema extensions;

-- Damit unqualifizierte Aufrufe von uuid_generate_v4() auch dann noch
-- funktionieren, wenn sie aus dem Auszug ohne Schemaangabe kommen. In
-- postgrest.conf entspricht das db-extra-search-path = "public, extensions".
do $$
begin
  execute format('alter database %I set search_path to "$user", public, extensions',
                 current_database());
exception
  when insufficient_privilege then
    raise notice 'search_path der Datenbank nicht setzbar (kein Eigentümer). '
                 'Dann muss jede Verbindung public, extensions selbst setzen.';
end
$$;

-- ----------------------------------------------------------------------------
-- 3) Schema `auth`
-- ----------------------------------------------------------------------------
create schema if not exists auth;

-- auth.users: der Teil von Supabases Benutzertabelle, auf den unser Schema
-- tatsächlich zugreift. public.profiles.id hat einen Fremdschlüssel hierauf
-- (001:76) – ohne diese Tabelle lässt sich das Schema nicht einspielen.
--
-- Bewusst schmal gehalten: nur Spalten, die wir kennen und brauchen. Beim
-- Kopieren der Daten im Cutover werden die Spalten darum EINZELN benannt und
-- nicht die ganze Tabelle übernommen – Supabases auth.users hat über dreissig
-- Spalten, von denen die meisten zu GoTrue gehören und nicht zu uns.
create table if not exists auth.users (
  id                 uuid primary key,
  email              text not null unique,
  created_at         timestamptz not null default now(),
  updated_at         timestamptz,
  last_sign_in_at    timestamptz,
  email_confirmed_at timestamptz,
  raw_user_meta_data jsonb
);

comment on table auth.users is
  'Eigener Ersatz für Supabases auth.users. Enthält nur die Spalten, die zeugnio '
  'braucht. Gefüllt im Cutover A durch Kopieren einzeln benannter Spalten und '
  'danach laufend durch public.ensure_auth_user (siehe 902).';

-- ----------------------------------------------------------------------------
-- 4) auth.uid(), auth.role(), auth.jwt(), auth.email()
-- ----------------------------------------------------------------------------
-- Diese vier Funktionen sind der Kern: 45 Zeilensicherheitsregeln rufen
-- auth.uid() auf. Liefert sie NULL, ist jede dieser Regeln erfüllt oder leer –
-- und zwar ohne Fehlermeldung. Das ist der gefährlichste Einzelfehler dieses
-- Umzugs, darum prüft 903 genau das.
--
-- Gelesen wird aus den Einstellungen, die PostgREST pro Anfrage setzt. Die
-- coalesce-Kette deckt beide Schreibweisen ab: request.jwt.claims (JSON, seit
-- PostgREST 9 der Normalfall, db-use-legacy-gucs = false) und die alten
-- Einzelwerte request.jwt.claim.<name>. Damit bleiben die Regeln auch dann
-- wirksam, wenn jemand diese Einstellung einmal umstellt.
--
-- `stable` und nicht `volatile`: die Regeln rufen die Funktion pro Zeile auf.

create or replace function auth.uid()
returns uuid
language sql
stable
as $$
  select nullif(
    coalesce(
      nullif(current_setting('request.jwt.claim.sub', true), ''),
      nullif(current_setting('request.jwt.claims', true), '')::jsonb ->> 'sub'
    ),
    ''
  )::uuid
$$;

create or replace function auth.role()
returns text
language sql
stable
as $$
  select nullif(
    coalesce(
      nullif(current_setting('request.jwt.claim.role', true), ''),
      nullif(current_setting('request.jwt.claims', true), '')::jsonb ->> 'role'
    ),
    ''
  )::text
$$;

create or replace function auth.email()
returns text
language sql
stable
as $$
  select nullif(
    coalesce(
      nullif(current_setting('request.jwt.claim.email', true), ''),
      nullif(current_setting('request.jwt.claims', true), '')::jsonb ->> 'email'
    ),
    ''
  )::text
$$;

create or replace function auth.jwt()
returns jsonb
language sql
stable
as $$
  select coalesce(
    nullif(current_setting('request.jwt.claim', true), ''),
    nullif(current_setting('request.jwt.claims', true), '')
  )::jsonb
$$;

-- ----------------------------------------------------------------------------
-- 5) Hilfsfunktion für die Gegenprobe
-- ----------------------------------------------------------------------------
-- Ohne diese Funktion ist die Frage „mit welcher Rolle und welcher Benutzer-ID
-- läuft diese Anfrage gerade?" von aussen nicht beantwortbar – und genau sie
-- entscheidet, ob die Zeilensicherheit greift. Sie gibt nichts Geheimes zurück:
-- die eigene Rolle, die eigene ID, und ob überhaupt Ansprüche ankommen.
create or replace function public.debug_whoami()
returns jsonb
language sql
stable
as $$
  select jsonb_build_object(
    'current_user',   current_user,
    'session_user',   session_user,
    'auth_uid',       auth.uid(),
    'auth_role',      auth.role(),
    'claims_present', (nullif(current_setting('request.jwt.claims', true), '') is not null),
    'search_path',    current_setting('search_path')
  )
$$;

-- ----------------------------------------------------------------------------
-- 6) Rechte auf den Schemas und den auth-Funktionen
-- ----------------------------------------------------------------------------
-- Die Zeilensicherheitsregeln rufen auth.uid() mit den Rechten des Aufrufers
-- auf. Ohne EXECUTE für anon und authenticated bricht jede Abfrage auf einer
-- Tabelle mit Zeilensicherheit ab – mit „permission denied for function uid".
-- USAGE auf public fehlt hier mit Absicht. Auf advisori01 hat PUBLIC es schon
-- (=U im Rechteeintrag des Schemas), die drei Rollen haben es also. Selbst
-- vergeben könnte die Schreibrolle es nicht: Sie hält das Recht ohne
-- Weitergaberecht, und GRANT gäbe nur die Warnung «no privileges were granted».
grant usage on schema auth       to anon, authenticated, service_role;
grant usage on schema extensions to anon, authenticated, service_role;

grant execute on function auth.uid()   to anon, authenticated, service_role;
grant execute on function auth.role()  to anon, authenticated, service_role;
grant execute on function auth.email() to anon, authenticated, service_role;
grant execute on function auth.jwt()   to anon, authenticated, service_role;
grant execute on function public.debug_whoami() to anon, authenticated, service_role;

grant execute on all functions in schema extensions to anon, authenticated, service_role;

-- auth.users ist keine Tabelle der Daten-API. Nur service_role darf hinein, und
-- auch das nur über die Funktion in 902.
revoke all on auth.users from public;
grant select, insert, update on auth.users to service_role;

-- ----------------------------------------------------------------------------
-- Fertig. Nächster Schritt: `node scripts/migrate.mjs` – das legt das Schema aus
-- den Migrationen im Repository an. Danach 901_nine_rechte.sql.
-- ----------------------------------------------------------------------------
