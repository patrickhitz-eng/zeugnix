-- ============================================================================
-- zeugnio.ch – Eigene Anmeldung (Cutover B): Anforderungen und Sitzungen
-- ----------------------------------------------------------------------------
-- Läuft NUR auf advisori01 (nine), NACH 900 bis 903. Wie alle Dateien ab 900
-- spielt scripts/migrate.mjs sie nicht automatisch ein.
--
-- WAS DIESE DATEI TUT
--
-- Bis Cutover B meldet Supabase Auth die Personen an. Danach tut das zeugnio
-- selbst: Code oder Link per Mail, danach eine Sitzung, deren Kennung als
-- Cookie im Browser liegt. Diese Datei legt dafür zwei Tabellen im Schema auth
-- an und die Funktionen, über die die Anwendung sie bedient. Plan:
-- .claude/plans/2026-10-30-cutover-b-eigene-anmeldung.md, Abschnitt 4.
--
-- Sie stört den laufenden Betrieb nicht: nur neue Objekte, nichts wird
-- geändert ausser einem zusätzlichen Index auf auth.users. Solange der
-- Schalter ZEUGNIO_AUTH in der Anwendung auf «supabase» steht, ruft niemand
-- diese Funktionen auf.
--
-- SICHERHEIT IN DREI SÄTZEN
--
--  1. In der Datenbank liegt kein Link, kein Code und keine Sitzungskennung im
--     Klartext, nur HMAC-SHA256-Werte mit einem Geheimnis, das nur die
--     Anwendung kennt (ZEUGNIO_AUTH_SECRET). Ein gestohlener Auszug taugt
--     darum weder zum Anmelden noch zum Durchprobieren der 6-stelligen Codes.
--  2. Einlösen geschieht in EINER Anweisung bzw. unter Zeilensperre. Ein Link
--     lässt sich darum nicht zweimal gleichzeitig einlösen.
--  3. Die Tabellen liegen im Schema auth, das PostgREST nicht bereitstellt.
--     Die Funktionen in public darf nur service_role ausführen.
--
-- Ausführung als Datenbankbenutzer nmd_zeugnio (wie 902):
--   psql -w -v ON_ERROR_STOP=1 -d nmd_zeugnio -f supabase/906_auth_eigen.sql
-- Danach die Gegenprobe:
--   psql -w -v ON_ERROR_STOP=1 -d nmd_zeugnio -f supabase/907_auth_eigen_verify.sql
-- Und PFLICHT: PostgREST neu laden, sonst kennt es die neuen Funktionen nicht
-- (db-channel-enabled = false, 404 auf /rpc/auth_*), und nach dem Umschalten
-- kann sich niemand anmelden:
--   systemctl --user reload postgrest
--   node deploy/nine/postgrest-probe.mjs --auth-eigen
--
-- Idempotent: mehrfaches Ausführen ändert nichts.
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 0) Voraussetzungen
-- ----------------------------------------------------------------------------
do $$
begin
  if to_regclass('auth.users') is null then
    raise exception 'auth.users fehlt. Zuerst 900_nine_bootstrap.sql bis 902_auth_bridge.sql.';
  end if;
  if to_regprocedure('public.check_rate_limit(text,integer,integer)') is null then
    raise exception 'public.check_rate_limit fehlt (Migration 023). Zuerst scripts/migrate.mjs.';
  end if;
end
$$;

-- ----------------------------------------------------------------------------
-- 1) E-Mail ohne Gross-/Kleinschreibung eindeutig
-- ----------------------------------------------------------------------------
-- auth.users.email ist heute eindeutig MIT Gross-/Kleinschreibung. Die eigene
-- Anmeldung sucht Personen über die Adresse, und «Anna@Firma.ch» und
-- «anna@firma.ch» sind dieselbe Person. Darum ein Index auf lower(email).
--
-- Gibt es in den kopierten Daten zwei Konten, die sich nur in der Schreibweise
-- unterscheiden, bricht diese Datei hier ab, statt dass später eine der beiden
-- Personen still im falschen Konto landet. Dann von Hand klären, welches Konto
-- gilt, und die Datei nochmals laufen lassen.
do $$
declare
  dubletten text;
begin
  select string_agg(lower(email), ', ') into dubletten
    from (select lower(email) as email from auth.users group by lower(email) having count(*) > 1) d;
  if dubletten is not null then
    raise exception 'auth.users hat Adressen, die sich nur in der Schreibweise unterscheiden: %. '
                    'Erst bereinigen, dann 906 nochmals ausführen.', dubletten;
  end if;
end
$$;

create unique index if not exists users_email_lower_key on auth.users (lower(email));

-- ----------------------------------------------------------------------------
-- 2) Tabellen
-- ----------------------------------------------------------------------------
-- Eine Zeile pro Anforderung. Link und Code gehören zur selben Zeile: wer den
-- Link einlöst, hat auch den Code verbraucht und umgekehrt.
create table if not exists auth.login_requests (
  id          uuid primary key default gen_random_uuid(),
  email       text not null check (email = lower(email)),
  link_hmac   text not null unique,
  code_hmac   text not null,
  attempts    integer not null default 0,
  expires_at  timestamptz not null,
  used_at     timestamptz,
  created_at  timestamptz not null default now()
);

create index if not exists login_requests_email_open_idx
  on auth.login_requests (email, created_at desc)
  where used_at is null;

comment on table auth.login_requests is
  'Anmelde-Anforderungen der eigenen Anmeldung (906). Link und Code nur als '
  'HMAC-SHA256 mit ZEUGNIO_AUTH_SECRET. 15 Minuten gültig, höchstens 5 '
  'Fehlversuche. auth_cleanup() löscht sie nach 24 Stunden.';

-- Eine Zeile pro angemeldetem Gerät. Bewusst ohne IP-Adresse und ohne
-- Browserkennung (Datensparsamkeit): für die Anmeldung braucht es sie nicht.
create table if not exists auth.sessions (
  id           uuid primary key default gen_random_uuid(),
  token_hmac   text not null unique,
  user_id      uuid not null references auth.users (id) on delete cascade,
  created_at   timestamptz not null default now(),
  expires_at   timestamptz not null,
  last_seen_at timestamptz not null default now()
);

create index if not exists sessions_user_idx on auth.sessions (user_id);

comment on table auth.sessions is
  'Sitzungen der eigenen Anmeldung (906). Im Browser liegt nur die zufällige '
  'Kennung (Cookie __Host-zeugnio_session), hier nur deren HMAC. Abmelden = '
  'Zeile löschen. 30 Tage gültig, bei Nutzung verlängert (Entscheid E2).';

-- Niemand ausser der Eigentümerin (Schreibrolle) kommt an die Tabellen heran.
-- anon und authenticated haben USAGE auf dem Schema auth (für auth.uid()),
-- darum der ausdrückliche Entzug, auch wenn neue Tabellen ohnehin keine
-- Rechte für andere Rollen haben.
revoke all on auth.login_requests from public, anon, authenticated, service_role;
revoke all on auth.sessions       from public, anon, authenticated, service_role;

-- ----------------------------------------------------------------------------
-- 3) Gültigkeiten an einer Stelle
-- ----------------------------------------------------------------------------
-- Die Anwendung kennt dieselben Werte (lib/auth/config.ts). Ändert sich einer,
-- beide Stellen anpassen; test:auth prüft die Anwendungsseite.
create or replace function auth.login_ttl()       returns interval language sql immutable as $$ select interval '15 minutes' $$;
create or replace function auth.login_max_tries() returns integer  language sql immutable as $$ select 5 $$;
create or replace function auth.session_ttl()     returns interval language sql immutable as $$ select interval '30 days' $$;

revoke all on function auth.login_ttl()       from public, anon, authenticated;
revoke all on function auth.login_max_tries() from public, anon, authenticated;
revoke all on function auth.session_ttl()     from public, anon, authenticated;

-- ----------------------------------------------------------------------------
-- 4) Interne Hilfsfunktion: Person finden oder anlegen, Sitzung eröffnen
-- ----------------------------------------------------------------------------
-- Liegt im Schema auth und ist damit über PostgREST nicht aufrufbar. Nur die
-- beiden Einlöse-Funktionen unten rufen sie auf, nachdem Link oder Code
-- geprüft und verbraucht sind.
--
-- Fehlt die Person und ist die Registrierung offen, entsteht sie hier in
-- auth.users. Der Trigger on_auth_user_created (902) legt daraufhin das Profil
-- an, also derselbe Weg wie bisher bei Supabase.
create or replace function auth.open_session(p_email text, p_token_hmac text, p_signup_open boolean)
returns table (user_id uuid, email text)
language plpgsql
security definer
set search_path = pg_catalog, auth
as $$
declare
  v_id    uuid;
  v_email text;
begin
  select u.id, u.email into v_id, v_email from auth.users u where lower(u.email) = p_email;

  if v_id is null then
    if not p_signup_open then
      return;
    end if;
    insert into auth.users (id, email, created_at, email_confirmed_at)
    values (gen_random_uuid(), p_email, now(), now())
    on conflict do nothing
    returning id, auth.users.email into v_id, v_email;
    -- Zwei gleichzeitige Erstanmeldungen derselben Adresse: die zweite findet
    -- den Datensatz der ersten.
    if v_id is null then
      select u.id, u.email into v_id, v_email from auth.users u where lower(u.email) = p_email;
    end if;
  end if;

  update auth.users set last_sign_in_at = now() where id = v_id;

  insert into auth.sessions (token_hmac, user_id, expires_at)
  values (p_token_hmac, v_id, now() + auth.session_ttl());

  user_id := v_id;
  email   := v_email;
  return next;
end
$$;

revoke all on function auth.open_session(text, text, boolean) from public, anon, authenticated, service_role;

-- Nach einer erfolgreichen Anmeldung: alle übrigen offenen Anforderungen der
-- Adresse verbrauchen. Die Person ist drin, weitere Mails braucht sie nicht
-- mehr, und ein liegengebliebener Code im Postfach soll nicht noch eine
-- Viertelstunde lang eine zweite Sitzung eröffnen können.
create or replace function auth.consume_open_requests(p_email text)
returns void
language sql
security definer
set search_path = pg_catalog, auth
as $$
  update auth.login_requests set used_at = now() where email = p_email and used_at is null;
$$;

revoke all on function auth.consume_open_requests(text) from public, anon, authenticated, service_role;

-- ----------------------------------------------------------------------------
-- 5) Öffentliche Funktionen (nur service_role)
-- ----------------------------------------------------------------------------

-- 5a) Anforderung anlegen.
-- Gibt zurück, ob eine Mail verschickt werden soll. Die Anwendung antwortet
-- dem Browser in BEIDEN Fällen gleich (Entscheid E3); nur die Mail bleibt aus,
-- wenn die Registrierung geschlossen ist und es die Adresse nicht gibt.
--
-- Ältere offene Anforderungen derselben Adresse bleiben bis zu ihrem Ablauf
-- gültig (Review PR #91, 21.11.). Vorher machte jede neue Anforderung die
-- älteren ungültig. Damit konnte eine fremde Person, die nur die Adresse
-- kennt, mit einer Anforderung pro Minute jede Mail entwerten, bevor die
-- Inhaberin sie öffnet, und mit fünf Anforderungen pro Stunde auch das Limit
-- pro Adresse aufbrauchen. Jetzt landet jede fremde Anforderung als
-- zusätzliche, gültige Mail im Postfach der Inhaberin; aussperren lässt sie
-- sich damit nicht mehr. Nach einer erfolgreichen Anmeldung verfallen alle
-- offenen Anforderungen der Adresse (auth.consume_open_requests).
create or replace function public.auth_request_login(
  p_email text, p_link_hmac text, p_code_hmac text, p_signup_open boolean
)
returns boolean
language plpgsql
security definer
set search_path = pg_catalog, auth
as $$
declare
  v_email text := lower(btrim(p_email));
begin
  if v_email is null or v_email = '' or position('@' in v_email) = 0 then
    raise exception 'auth_request_login: ungültige Adresse' using errcode = '22023';
  end if;
  if coalesce(length(p_link_hmac), 0) < 32 or coalesce(length(p_code_hmac), 0) < 32 then
    raise exception 'auth_request_login: HMAC fehlt' using errcode = '22023';
  end if;

  if not p_signup_open
     and not exists (select 1 from auth.users u where lower(u.email) = v_email) then
    return false;
  end if;

  insert into auth.login_requests (email, link_hmac, code_hmac, expires_at)
  values (v_email, p_link_hmac, p_code_hmac, now() + auth.login_ttl());

  return true;
end
$$;

-- 5b) Link einlösen und Sitzung eröffnen, in einem Zug.
-- Das UPDATE … RETURNING verbraucht den Link nur, wenn er noch offen und
-- gültig ist. Ein zweiter, gleichzeitiger Aufruf findet ihn bereits verbraucht
-- und bekommt nichts zurück.
--
-- Fehlversuche beim CODE sperren den Link nicht (Review PR #91). Der Zähler
-- schützt die 6-stelligen Codes vor dem Durchprobieren. Der Link trägt 32
-- zufällige Bytes, den errät niemand. Hinge er am selben Zähler, könnte eine
-- fremde Person mit fünf falschen Codes auf die Adresse auch den Link im
-- Postfach der Inhaberin entwerten.
create or replace function public.auth_redeem_link(
  p_link_hmac text, p_token_hmac text, p_signup_open boolean
)
returns table (user_id uuid, email text)
language plpgsql
security definer
set search_path = pg_catalog, auth
as $$
declare
  v_email text;
begin
  update auth.login_requests r
     set used_at = now()
   where r.link_hmac = p_link_hmac
     and r.used_at is null
     and r.expires_at > now()
  returning r.email into v_email;

  if v_email is null then
    return;
  end if;

  perform auth.consume_open_requests(v_email);

  return query select s.user_id, s.email from auth.open_session(v_email, p_token_hmac, p_signup_open) s;
end
$$;

-- 5c) Code einlösen und Sitzung eröffnen.
-- Alle offenen Anforderungen der Adresse werden gesperrt (FOR UPDATE), dann
-- wird der Code gegen jede davon verglichen: Seit ältere Mails gültig bleiben
-- (5a), darf die Person den Code aus irgendeiner noch gültigen Mail nehmen.
--
-- Falscher Code: Fehlversuch bei ALLEN offenen Anforderungen der Adresse
-- zählen und nichts zurückgeben, OHNE Ausnahme, sonst würde die Zählung mit
-- zurückgerollt. Ab dem fünften Fehlversuch ist eine Anforderung für den Code
-- verbrannt, auch der richtige Code hilft dann nicht mehr (der Link schon).
--
-- Warum bei allen: Ein Rateversuch prüft gegen bis zu N offene Codes. Zählte
-- er nur bei einer Anforderung, bekäme ein Angreifer mit N offenen Mails
-- N × 5 Versuche pro Code. So bekommt jeder Code höchstens 5 Prüfungen, gleich
-- viele wie vorher. Bei höchstens 5 Anforderungen pro Stunde und Adresse
-- (lib/auth/config.ts) sind das höchstens 25 geprüfte Codes pro Stunde und
-- Adresse, eine Trefferchance von rund 1 zu 40 000 pro Stunde.
--
-- Der Vergleich läuft auf HMAC-Werten, nicht auf dem Code. Ein Zeitunterschied
-- im Vergleich verrät darum nichts, womit sich ein Code erraten liesse.
create or replace function public.auth_redeem_code(
  p_email text, p_code_hmac text, p_token_hmac text, p_signup_open boolean
)
returns table (user_id uuid, email text)
language plpgsql
security definer
set search_path = pg_catalog, auth
as $$
declare
  v_email text := lower(btrim(p_email));
  v_id    uuid;
begin
  -- Sperren, damit zwei gleichzeitige Aufrufe nicht beide durchkommen: der
  -- zweite wartet und findet die Anforderungen danach verbraucht.
  perform 1
     from auth.login_requests r
    where r.email = v_email
      and r.used_at is null
      and r.expires_at > now()
      and r.attempts < auth.login_max_tries()
      for update;

  if not found then
    return;
  end if;

  select r.id into v_id
    from auth.login_requests r
   where r.email = v_email
     and r.used_at is null
     and r.expires_at > now()
     and r.attempts < auth.login_max_tries()
     and r.code_hmac = p_code_hmac
   limit 1;

  if v_id is null then
    update auth.login_requests r
       set attempts = r.attempts + 1
     where r.email = v_email
       and r.used_at is null
       and r.expires_at > now()
       and r.attempts < auth.login_max_tries();
    return;
  end if;

  perform auth.consume_open_requests(v_email);

  return query select s.user_id, s.email from auth.open_session(v_email, p_token_hmac, p_signup_open) s;
end
$$;

-- 5c') Zu welcher Adresse gehört dieser Link? Nur lesen, nichts verbrauchen.
-- Die Seite /auth/link zeigt die Adresse (maskiert) VOR dem Knopf
-- «Anmelden» (Review PR #91, Login-CSRF): Schickt jemand einer Person den
-- Link zum eigenen Konto, sieht diese eine fremde Adresse und meldet sich
-- nicht ahnungslos im fremden Konto an. NULL, wenn der Link unbekannt,
-- verbraucht oder abgelaufen ist.
create or replace function public.auth_link_email(p_link_hmac text)
returns text
language sql
stable
security definer
set search_path = pg_catalog, auth
as $$
  select r.email
    from auth.login_requests r
   where r.link_hmac = p_link_hmac
     and r.used_at is null
     and r.expires_at > now();
$$;

-- 5d) Wer gehört zu dieser Sitzung?
-- Liefert id und email, solange die Sitzung gilt. Verlängert sie höchstens
-- einmal pro Tag um die volle Dauer (renewed = true); dann erneuert die
-- Anwendung auch das Cookie. So bleibt angemeldet, wer zeugnio nutzt, und
-- die Tabelle wird nicht bei jedem Seitenaufruf beschrieben.
create or replace function public.auth_session_user(p_token_hmac text)
returns table (user_id uuid, email text, renewed boolean)
language plpgsql
security definer
set search_path = pg_catalog, auth
as $$
declare
  v_user    uuid;
  v_renewed boolean := false;
begin
  update auth.sessions s
     set expires_at = now() + auth.session_ttl(),
         last_seen_at = now()
   where s.token_hmac = p_token_hmac
     and s.expires_at > now()
     and s.last_seen_at < now() - interval '1 day'
  returning s.user_id into v_user;

  if v_user is not null then
    v_renewed := true;
  else
    select s.user_id into v_user
      from auth.sessions s
     where s.token_hmac = p_token_hmac and s.expires_at > now();
  end if;

  if v_user is null then
    return;
  end if;

  return query select u.id, u.email, v_renewed from auth.users u where u.id = v_user;
end
$$;

-- 5e) Abmelden: diese Sitzung bzw. alle Sitzungen einer Person.
create or replace function public.auth_end_session(p_token_hmac text)
returns void
language sql
security definer
set search_path = pg_catalog, auth
as $$
  delete from auth.sessions where token_hmac = p_token_hmac;
$$;

create or replace function public.auth_end_all_sessions(p_user_id uuid)
returns integer
language sql
security definer
set search_path = pg_catalog, auth
as $$
  with weg as (delete from auth.sessions where user_id = p_user_id returning 1)
  select count(*)::integer from weg;
$$;

-- 5f) Aufräumen (nächtlich, deploy/nine/cron-pii-cleanup.mjs).
-- Anforderungen nach 24 Stunden weg, abgelaufene Sitzungen weg.
create or replace function public.auth_cleanup()
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, auth
as $$
declare
  v_req integer;
  v_ses integer;
begin
  delete from auth.login_requests where created_at < now() - interval '24 hours';
  get diagnostics v_req = row_count;
  delete from auth.sessions where expires_at <= now();
  get diagnostics v_ses = row_count;
  return jsonb_build_object('anforderungen', v_req, 'sitzungen', v_ses);
end
$$;

-- ----------------------------------------------------------------------------
-- 6) Rechte: nur service_role
-- ----------------------------------------------------------------------------
-- Neue Funktionen sind in PostgreSQL für PUBLIC ausführbar. Ohne diesen Entzug
-- könnte jeder Browser über /rpc/auth_redeem_code Codes durchprobieren oder
-- über /rpc/auth_session_user Sitzungen abfragen.
do $$
declare
  f text;
begin
  foreach f in array array[
    'public.auth_request_login(text,text,text,boolean)',
    'public.auth_redeem_link(text,text,boolean)',
    'public.auth_redeem_code(text,text,text,boolean)',
    'public.auth_link_email(text)',
    'public.auth_session_user(text)',
    'public.auth_end_session(text)',
    'public.auth_end_all_sessions(uuid)',
    'public.auth_cleanup()'
  ] loop
    execute format('revoke all on function %s from public, anon, authenticated', f);
    execute format('grant execute on function %s to service_role', f);
  end loop;
end
$$;

comment on function public.auth_request_login(text, text, text, boolean) is
  'Eigene Anmeldung (906): legt eine Anforderung an. true = Mail schicken. Nur service_role.';
comment on function public.auth_session_user(text) is
  'Eigene Anmeldung (906): Person zur Sitzung, verlängert höchstens täglich. Nur service_role.';

-- ----------------------------------------------------------------------------
-- Fertig. Nächster Schritt: 907_auth_eigen_verify.sql.
-- ----------------------------------------------------------------------------
