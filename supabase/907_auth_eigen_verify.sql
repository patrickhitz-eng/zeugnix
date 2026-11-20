-- ============================================================================
-- zeugnio.ch – Gegenprobe zur eigenen Anmeldung (906_auth_eigen.sql)
-- ----------------------------------------------------------------------------
-- Läuft NACH 906, nur auf advisori01 bzw. einer Wegwerf-Datenbank. Ändert
-- nichts: Teil 1 sind reine Abfragen, Teil 2 läuft in einer Transaktion, die
-- mit ROLLBACK endet.
--
-- Warum eine eigene Datei und kein Abschnitt in 903: 903 läuft im Cutover A
-- und vorher auch auf der Produktionsdatenbank bei Supabase. Dort gibt es die
-- Funktionen aus 906 nicht, und mit ON_ERROR_STOP bräche 903 an dieser Stelle
-- ab.
--
-- Ausführung:
--   psql -w -v ON_ERROR_STOP=1 -d nmd_zeugnio -f supabase/907_auth_eigen_verify.sql
--
-- Teil 2 bricht mit einer Fehlermeldung ab, sobald eine Erwartung nicht
-- stimmt. Am Ende steht «907: ALLE PRÜFUNGEN BESTANDEN».
-- ============================================================================
\set ON_ERROR_STOP on
\pset pager off

\echo
\echo '=== 1  Rechte auf den auth_*-Funktionen ==='
\echo '    anon und authenticated MÜSSEN false sein, service_role true.'
select p.proname as funktion,
       has_function_privilege('anon', p.oid, 'EXECUTE')          as anon,
       has_function_privilege('authenticated', p.oid, 'EXECUTE') as authenticated,
       has_function_privilege('service_role', p.oid, 'EXECUTE')  as service_role
  from pg_proc p join pg_namespace n on n.oid = p.pronamespace
 where n.nspname = 'public' and p.proname like 'auth\_%'
 order by 1;

\echo
\echo '=== 2  Tabellen login_requests und sessions: lesbar für anon/authenticated/service_role? (MUSS LEER SEIN) ==='
select c.relname, r.rolname
  from pg_class c
  join pg_namespace n on n.oid = c.relnamespace
  cross join (values ('anon'), ('authenticated'), ('service_role')) as r(rolname)
 where n.nspname = 'auth' and c.relname in ('login_requests', 'sessions')
   and (has_table_privilege(r.rolname, c.oid, 'SELECT')
        or has_table_privilege(r.rolname, c.oid, 'INSERT')
        or has_table_privilege(r.rolname, c.oid, 'UPDATE')
        or has_table_privilege(r.rolname, c.oid, 'DELETE'));

\echo
\echo '=== 3  Verhalten (Transaktion mit ROLLBACK) ==='
begin;

do $$
declare
  r      record;
  n      integer;
  v_uid  uuid;
  -- Platzhalter-HMACs: 64 Zeichen wie echte HMAC-SHA256-Werte in Hex.
  l1 text := repeat('a', 64);  c1 text := repeat('b', 64);
  l2 text := repeat('c', 64);  c2 text := repeat('d', 64);
  s1 text := repeat('1', 64);  s2 text := repeat('2', 64);
  s3 text := repeat('3', 64);  s4 text := repeat('4', 64);
  falsch text := repeat('f', 64);
begin
  -- Rechte: anon/authenticated dürfen keine auth_*-Funktion ausführen.
  select count(*) into n
    from pg_proc p join pg_namespace ns on ns.oid = p.pronamespace
   where ns.nspname = 'public' and p.proname like 'auth\_%'
     and (has_function_privilege('anon', p.oid, 'EXECUTE')
          or has_function_privilege('authenticated', p.oid, 'EXECUTE'));
  if n > 0 then raise exception '907: % auth_*-Funktion(en) für anon/authenticated ausführbar', n; end if;

  if has_table_privilege('anon', 'auth.sessions', 'SELECT')
     or has_table_privilege('authenticated', 'auth.login_requests', 'SELECT') then
    raise exception '907: Tabellen im Schema auth lesbar für Browser-Rollen';
  end if;
  if has_function_privilege('service_role', 'auth.open_session(text,text,boolean)', 'EXECUTE') then
    raise exception '907: auth.open_session darf niemand direkt aufrufen';
  end if;

  -- Neue Adresse, Registrierung offen: Mail ja, Link einlösen legt Person + Profil an.
  if not public.auth_request_login('Neu.Test@Probe-907.ch', l1, c1, true) then
    raise exception '907: Anforderung bei offener Registrierung abgelehnt';
  end if;
  select * into r from public.auth_redeem_link(l1, s1, true);
  if r.user_id is null or r.email <> 'neu.test@probe-907.ch' then
    raise exception '907: Link einlösen hat keine Sitzung eröffnet';
  end if;
  v_uid := r.user_id;
  if not exists (select 1 from public.profiles where id = v_uid) then
    raise exception '907: Profil fehlt (Trigger on_auth_user_created)';
  end if;

  -- Derselbe Link ein zweites Mal: leer.
  select count(*) into n from public.auth_redeem_link(l1, s2, true);
  if n <> 0 then raise exception '907: Link liess sich zweimal einlösen'; end if;

  -- Sitzung liefert die Person; unbekannte Sitzung nichts.
  select * into r from public.auth_session_user(s1);
  if r.user_id is distinct from v_uid then raise exception '907: Sitzung liefert falsche Person'; end if;
  if r.renewed then raise exception '907: frische Sitzung darf nicht verlängert werden'; end if;
  select count(*) into n from public.auth_session_user(falsch);
  if n <> 0 then raise exception '907: unbekannte Sitzung liefert eine Person'; end if;

  -- Verlängerung höchstens täglich: nach zwei Tagen Pause renewed = true.
  update auth.sessions set last_seen_at = now() - interval '2 days',
                           expires_at = now() + interval '1 hour'
   where token_hmac = s1;
  select * into r from public.auth_session_user(s1);
  if not r.renewed then raise exception '907: Sitzung wurde nicht verlängert'; end if;
  if (select expires_at from auth.sessions where token_hmac = s1) < now() + interval '29 days' then
    raise exception '907: Verlängerung um weniger als 30 Tage';
  end if;

  -- Abgelaufene Sitzung: nichts.
  update auth.sessions set expires_at = now() - interval '1 second' where token_hmac = s1;
  select count(*) into n from public.auth_session_user(s1);
  if n <> 0 then raise exception '907: abgelaufene Sitzung gilt noch'; end if;

  -- Fünf falsche Codes, dann der richtige: abgelehnt.
  perform public.auth_request_login('neu.test@probe-907.ch', l2, c2, true);
  for i in 1..5 loop
    select count(*) into n from public.auth_redeem_code('neu.test@probe-907.ch', falsch, s3, true);
    if n <> 0 then raise exception '907: falscher Code angenommen'; end if;
  end loop;
  if (select attempts from auth.login_requests where link_hmac = l2) <> 5 then
    raise exception '907: Fehlversuche nicht gezählt';
  end if;
  select count(*) into n from public.auth_redeem_code('neu.test@probe-907.ch', c2, s3, true);
  if n <> 0 then raise exception '907: richtiger Code nach 5 Fehlversuchen angenommen'; end if;
  select count(*) into n from public.auth_redeem_link(l2, s3, true);
  if n <> 0 then raise exception '907: Link nach 5 Fehlversuchen noch gültig'; end if;

  -- Richtiger Code (Grossschreibung egal), danach verbraucht.
  perform public.auth_request_login('NEU.test@probe-907.ch', repeat('e', 64), repeat('9', 64), true);
  select * into r from public.auth_redeem_code('neu.TEST@probe-907.ch', repeat('9', 64), s3, true);
  if r.user_id is distinct from v_uid then raise exception '907: Code meldet falsche Person an'; end if;
  select count(*) into n from public.auth_redeem_code('neu.test@probe-907.ch', repeat('9', 64), s4, true);
  if n <> 0 then raise exception '907: Code liess sich zweimal einlösen'; end if;

  -- Neue Anforderung entwertet die ältere.
  perform public.auth_request_login('neu.test@probe-907.ch', repeat('5', 64), repeat('6', 64), true);
  perform public.auth_request_login('neu.test@probe-907.ch', repeat('7', 64), repeat('8', 64), true);
  select count(*) into n from public.auth_redeem_link(repeat('5', 64), s4, true);
  if n <> 0 then raise exception '907: ältere Anforderung gilt noch'; end if;

  -- Abgelaufene Anforderung: abgelehnt.
  update auth.login_requests set expires_at = now() - interval '1 second' where link_hmac = repeat('7', 64);
  select count(*) into n from public.auth_redeem_link(repeat('7', 64), s4, true);
  if n <> 0 then raise exception '907: abgelaufener Link angenommen'; end if;

  -- Registrierung geschlossen, unbekannte Adresse: keine Mail, nichts angelegt.
  if public.auth_request_login('fremd@probe-907.ch', repeat('0', 64), repeat('0', 63) || 'x', false) then
    raise exception '907: geschlossene Registrierung schickt Mail an unbekannte Adresse';
  end if;
  if exists (select 1 from auth.login_requests where email = 'fremd@probe-907.ch')
     or exists (select 1 from auth.users where lower(email) = 'fremd@probe-907.ch') then
    raise exception '907: geschlossene Registrierung hat etwas angelegt';
  end if;
  -- … bekannte Adresse bei geschlossener Registrierung: Mail ja.
  if not public.auth_request_login('neu.test@probe-907.ch', repeat('0', 64), repeat('0', 63) || 'x', false) then
    raise exception '907: bekannte Adresse bekommt bei geschlossener Registrierung keine Mail';
  end if;

  -- Überall abmelden.
  perform public.auth_end_session(s3);
  if exists (select 1 from auth.sessions where token_hmac = s3) then
    raise exception '907: Abmelden hat die Sitzung nicht gelöscht';
  end if;
  insert into auth.sessions (token_hmac, user_id, expires_at) values (s4, v_uid, now() + interval '1 day');
  if public.auth_end_all_sessions(v_uid) < 1 then raise exception '907: überall abmelden ohne Wirkung'; end if;

  -- Aufräumen läuft durch.
  perform public.auth_cleanup();

  raise notice '907: ALLE PRÜFUNGEN BESTANDEN';
end
$$;

rollback;
