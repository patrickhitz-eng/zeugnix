-- ============================================================================
-- zeugnio.ch – Cutover B, Tag B Schritt 2: Benutzer mit Supabase abgleichen
-- ----------------------------------------------------------------------------
-- Läuft NUR auf advisori01, NACH 906 und VOR dem Umschalten auf
-- ZEUGNIO_AUTH=eigen. Wie alle Dateien ab 900 spielt scripts/migrate.mjs sie
-- nicht automatisch ein.
--
-- WARUM
--
-- Ab Tag B sucht zeugnio eine Person über ihre Adresse in der eigenen Tabelle
-- auth.users. Fehlt dort jemand, den Supabase kennt, kommt diese Person nach
-- dem Umschalten nicht mehr in ihr Konto: Bei geschlossener Registrierung
-- kommt keine Mail, bei offener entstünde ein zweites, leeres Konto. Steht
-- eine veraltete Adresse drin, gilt dasselbe.
--
-- Bis heute füllt public.ensure_auth_user (902) die Tabelle bei jeder
-- Anmeldung über Supabase nach. Wer sich seit Cutover A nicht angemeldet hat,
-- steht nur dann richtig drin, wenn der Auszug vom Cutover A vollständig war.
-- Diese Datei prüft das und trägt nach, was fehlt.
--
-- ABLAUF
--
-- 1. Im SQL-Editor von Supabase (Projekt zeugnix) diese Abfrage ausführen und
--    das Ergebnis mit «Download CSV» speichern. Sie liest nur:
--
--      select id, lower(email) as email, created_at, email_confirmed_at, last_sign_in_at
--        from auth.users
--       where email is not null and deleted_at is null
--       order by created_at;
--
-- 2. Datei auf den Server kopieren (Windows PowerShell, Dateiname anpassen,
--    falls der Browser ihn anders vergeben hat):
--
--      scp "$HOME\Downloads\auth-abgleich.csv" www-zeugnio@advisori01.nine.ch:auth-abgleich.csv
--
-- 3. Auf advisori01 im Checkout, zuerst als PROBELAUF (ändert nichts):
--
--      psql -w -h 127.0.0.1 -U nmd_zeugnio -d nmd_zeugnio -v ON_ERROR_STOP=1 -f supabase/908_auth_abgleich.sql < ~/auth-abgleich.csv
--
--    Die CSV-Datei kommt über die Standardeingabe herein (`\copy … from
--    pstdin`), darum das `<` am Ende. Abschnitt 2 MUSS leer sein.
--
-- 4. Stimmt alles, dasselbe mit `-v ausfuehren=1` vor `-f`. Erst dann wird
--    geschrieben.
--
-- 5. Die CSV-Datei enthält Adressen. Danach auf beiden Seiten löschen:
--      shred -u ~/auth-abgleich.csv                      (advisori01)
--      Remove-Item "$HOME\Downloads\auth-abgleich.csv"   (Windows PowerShell)
--
-- WAS GESCHIEHT
--
--   - Fehlt eine Person auf advisori01, wird sie angelegt, mit der ID aus
--     Supabase. Der Trigger on_auth_user_created (902) legt das Profil an,
--     derselbe Weg wie bei ensure_auth_user.
--   - Hat eine Person auf advisori01 eine andere Adresse als bei Supabase,
--     gilt die von Supabase (so macht es ensure_auth_user bei jeder Anmeldung).
--   - Gehört eine Adresse auf beiden Seiten verschiedenen IDs, bricht die
--     Datei ab, ohne etwas zu ändern. Das von Hand klären.
--   - Wer nur auf advisori01 steht, bleibt stehen und wird nur gemeldet
--     (z. B. ein Konto, das bei Supabase gelöscht wurde, hier aber nicht).
--
-- Wer sich zwischen Auszug und Umschalten noch über Supabase anmeldet, wird
-- wie bisher von ensure_auth_user nachgetragen. Ein erneuter Lauf mit einem
-- frischen Auszug schadet nicht: die Datei ist idempotent.
-- ============================================================================
\set ON_ERROR_STOP on
\pset pager off

begin;

create temp table abgleich_quelle (
  id                 uuid primary key,
  email              text not null,
  -- Zeitstempel zuerst als Text: Je nach Export steht für «leer» nichts oder
  -- "" in der Datei, und "" liesse sich nicht direkt als Zeitpunkt lesen.
  created_at         text,
  email_confirmed_at text,
  last_sign_in_at    text
) on commit drop;

-- header match: Die erste Zeile muss genau die Spaltennamen in dieser
-- Reihenfolge tragen. Eine CSV mit vertauschten Spalten bricht hier ab, statt
-- Adressen und IDs zu verwechseln.
\copy abgleich_quelle from pstdin with (format csv, header match)

update abgleich_quelle set email = lower(btrim(email));

do $$
begin
  if to_regprocedure('public.auth_request_login(text,text,text,boolean)') is null then
    raise exception '908: 906_auth_eigen.sql fehlt. Zuerst 906 und 907, dann diese Datei.';
  end if;
  if (select count(*) from abgleich_quelle) = 0 then
    raise exception '908: Die CSV-Datei ist leer. Kam sie über die Standardeingabe herein (< ~/auth-abgleich.csv)?';
  end if;
  if exists (select 1 from abgleich_quelle group by email having count(*) > 1) then
    raise exception '908: Die CSV-Datei enthält dieselbe Adresse mehrfach.';
  end if;
end
$$;

\echo
\echo '=== 1  Anzahl ==='
select (select count(*) from abgleich_quelle) as supabase,
       (select count(*) from auth.users)      as advisori01_vorher;

\echo
\echo '=== 2  Gleiche Adresse, verschiedene ID (MUSS LEER SEIN, sonst Abbruch) ==='
select q.email, q.id as supabase_id, u.id as advisori01_id
  from abgleich_quelle q
  join auth.users u on lower(u.email) = q.email and u.id <> q.id
 order by q.email;

\echo
\echo '=== 3  Gleiche ID, andere Adresse (wird auf die Supabase-Adresse gesetzt) ==='
select q.id, u.email as advisori01_alt, q.email as supabase_neu
  from abgleich_quelle q
  join auth.users u on u.id = q.id and lower(u.email) <> q.email
 order by q.id;

\echo
\echo '=== 4  Fehlt auf advisori01 (wird angelegt) ==='
select q.id, q.email, q.created_at
  from abgleich_quelle q
 where not exists (select 1 from auth.users u where u.id = q.id)
 order by q.created_at;

\echo
\echo '=== 5  Nur auf advisori01 (bleibt, nur zur Kenntnis) ==='
select u.id, u.email, u.created_at
  from auth.users u
 where not exists (select 1 from abgleich_quelle q where q.id = u.id)
 order by u.created_at;

do $$
declare
  v_konflikte integer;
  v_geaendert integer;
  v_angelegt  integer;
  v_fehlt     integer;
begin
  select count(*) into v_konflikte
    from abgleich_quelle q
    join auth.users u on lower(u.email) = q.email and u.id <> q.id;
  if v_konflikte > 0 then
    raise exception '908: % Adresse(n) gehören auf beiden Seiten verschiedenen Konten (Abschnitt 2). '
                    'Nichts geändert. Von Hand klären, dann nochmals.', v_konflikte;
  end if;

  update auth.users u
     set email = q.email, updated_at = now()
    from abgleich_quelle q
   where u.id = q.id and lower(u.email) <> q.email;
  get diagnostics v_geaendert = row_count;

  insert into auth.users (id, email, created_at, email_confirmed_at, last_sign_in_at)
  select q.id, q.email,
         coalesce(nullif(q.created_at, '')::timestamptz, now()),
         coalesce(nullif(q.email_confirmed_at, '')::timestamptz, now()),
         nullif(q.last_sign_in_at, '')::timestamptz
    from abgleich_quelle q
   where not exists (select 1 from auth.users u where u.id = q.id)
  on conflict do nothing;
  get diagnostics v_angelegt = row_count;

  -- Gegenprobe: Jede Person aus Supabase steht jetzt mit derselben ID und
  -- derselben Adresse auf advisori01.
  select count(*) into v_fehlt
    from abgleich_quelle q
   where not exists (select 1 from auth.users u where u.id = q.id and lower(u.email) = q.email);
  if v_fehlt > 0 then
    raise exception '908: Nach dem Abgleich fehlen noch % Person(en). Nichts geändert.', v_fehlt;
  end if;

  -- Ohne Profil kommt eine Person zwar hinein, sieht aber nichts. Das bricht
  -- nicht ab (es lag dann schon vorher so), wird aber gemeldet.
  select count(*) into v_fehlt
    from abgleich_quelle q
   where not exists (select 1 from public.profiles p where p.id = q.id);
  if v_fehlt > 0 then
    raise warning '908: % Person(en) ohne Profil in public.profiles. Vor dem Umschalten klären.', v_fehlt;
  end if;

  raise notice '908: % Adresse(n) angeglichen, % Person(en) angelegt. Supabase = advisori01 für alle % Personen.',
    v_geaendert, v_angelegt, (select count(*) from abgleich_quelle);
end
$$;

\if :{?ausfuehren}
commit;
\echo '908: ÜBERNOMMEN.'
\else
rollback;
\echo '908: PROBELAUF, nichts geändert. Zum Übernehmen mit -v ausfuehren=1 nochmals ausführen.'
\endif
