-- ============================================================================
-- zeugnio.ch – Rollen für die eigene Datenbank auf advisori01 (nine.ch)
-- ----------------------------------------------------------------------------
-- Legt die vier Rollen an, die Supabase mitbringt (anon, authenticated,
-- service_role, authenticator), und vergibt ihre Mitgliedschaften. Bis zum
-- 6.11.2026 stand das in Abschnitt 1 von 900_nine_bootstrap.sql.
--
-- WARUM EINE EIGENE DATEI
--
-- Rollen anlegen und vergeben darf auf advisori01 nur `pgadmin`, das
-- Verwaltungskonto von nine (CREATEROLE, kein Superuser). Der
-- Anwendungsbenutzer nmd_zeugnio darf beides nicht. Seit PostgreSQL 16 gilt
-- ausserdem: Eine Rolle vergeben darf nur, wer die ADMIN-Option auf sie hat.
-- Die bekommt, wer die Rolle anlegt, hier also pgadmin. Liefe dieser Teil als
-- nmd_zeugnio, bräche er mit «permission denied to create role» ab.
--
-- Nur dieser Teil läuft als pgadmin. Schemas, Funktionen und Tabellen legt
-- weiterhin nmd_zeugnio an (900 bis 903 und die Migrationen). So gehören sie
-- der Anwendung und nicht dem Verwaltungskonto.
--
-- WAS NINE VORGIBT (gemessen am 6.11.2026)
--
--   1. nmd_zeugnio wechselt beim Anmelden sofort in nmd_zeugnio_rw
--      (Rolleneinstellung role=nmd_zeugnio_rw). In 900 bis 903 und in den
--      Migrationen ist current_user darum nmd_zeugnio_rw, und alles, was dort
--      entsteht, gehört nmd_zeugnio_rw. Die Mitgliedschaften für den
--      Anwendungsbenutzer gehen deshalb an die _rw-Rolle.
--   2. PUBLIC hat auf der Datenbank kein CONNECT. Eine neue Rolle kann sich
--      erst verbinden, wenn sie das Recht von einer Rolle erbt, die es hat
--      (nmd_zeugnio_ro oder nmd_zeugnio_rw). Direkt vergeben kann CONNECT nur
--      nines Rolle nmd, der die Datenbank gehört.
--   3. Tabellen, die nmd_zeugnio_rw in public anlegt, bekommen automatisch
--      SELECT für nmd_zeugnio_ro (Vorgaberecht von nine).
--
-- AUSFÜHRUNG als pgadmin, im Konto www-data (dort liegt der Zugang in
-- ~/.pg_credentials):
--
--   psql -h localhost -U pgadmin -d nmd_zeugnio -w -X \
--        -v ON_ERROR_STOP=1 -v app=nmd_zeugnio -f 900_0_nine_rollen.sql
--
-- `-v app=…` nennt den Anwendungsbenutzer. Die Datei nennt ihn sonst nur in
-- Kommentaren, damit sie auch für eine zweite Datenbank taugt.
--
-- Danach: Passwörter für nmd_zeugnio und authenticator setzen (Runbook § 5),
-- dann 900_nine_bootstrap.sql als nmd_zeugnio.
--
-- Idempotent: Mehrfaches Ausführen ändert nichts. Eine schon bestehende
-- Mitgliedschaft meldet PostgreSQL nur als NOTICE.
-- ============================================================================

\set ON_ERROR_STOP on

\if :{?app}
\else
  \echo 'Abbruch: Variable app fehlt. Aufruf mit -v app=nmd_zeugnio'
  do $$ begin raise exception 'Variable app fehlt'; end $$;
\endif

\set app_rw :app '_rw'
\set app_ro :app '_ro'

-- ----------------------------------------------------------------------------
-- 0) Vorprüfung
-- ----------------------------------------------------------------------------
-- Bricht ab, wenn die _rw- oder _ro-Rolle nicht existiert (Tippfehler bei app).
select :'app_rw'::regrole as schreibrolle, :'app_ro'::regrole as leserolle;

do $$
begin
  if not (select rolcreaterole from pg_roles where rolname = current_user) then
    raise exception 'Diese Datei läuft als pgadmin. Angemeldet ist %, und diese Rolle darf keine Rollen anlegen.',
                    current_user;
  end if;
end
$$;

-- ----------------------------------------------------------------------------
-- 1) Die vier Rollen
-- ----------------------------------------------------------------------------
-- Die Namen sind NICHT frei wählbar, und zwar aus zwei Gründen.
--
-- Erstens vergleicht `public.enforce_certificate_immutability()` wörtlich
-- `current_user = 'service_role'`. Das ist EINE Funktion an EINEM Trigger auf
-- certificates (017:87); sie wird in den Migrationen fünfmal neu definiert
-- (017:40, 021:39, 024:51, 025:51, 029:114), gültig ist die Fassung aus 029.
-- Ein Präfix wie nmd_service_role würde diesen Vergleich stillschweigend
-- scheitern lassen.
--
-- Zweitens nennen drei Migrationen die Rollen beim Namen, und REVOKE scheitert
-- an einer Rolle, die es nicht gibt:
--   006:31,32   revoke execute on handle_new_user() from anon, authenticated
--   021:168,169 revoke ... from anon;  grant ... to authenticated
--   023:77,78   revoke ... from anon, authenticated
--
-- Rollen gelten für den ganzen Server, nicht pro Datenbank. Nach diesem
-- Schritt gehören die vier Namen auf advisori01 zeugnio. Eine spätere
-- Anwendung im Supabase-Stil müsste andere Namen nehmen.
--
-- NOINHERIT bei authenticator ist keine Kosmetik. PostgREST verbindet sich als
-- authenticator und wechselt pro Anfrage per SET ROLE. Alles, was VOR diesem
-- Wechsel läuft, läuft mit den Rechten der Rolle selbst. Erbte sie
-- service_role, wäre die Zeilensicherheit für diesen Teil jeder Anfrage
-- ausgeschaltet.
do $$
begin
  if not exists (select 1 from pg_roles where rolname = 'anon') then
    create role anon nologin noinherit;
  end if;
  if not exists (select 1 from pg_roles where rolname = 'authenticated') then
    create role authenticated nologin noinherit;
  end if;
  if not exists (select 1 from pg_roles where rolname = 'service_role') then
    create role service_role nologin noinherit;
  end if;
  if not exists (select 1 from pg_roles where rolname = 'authenticator') then
    -- Passwort danach mit \password authenticator setzen (Runbook § 5).
    create role authenticator login noinherit;
  end if;
end
$$;

-- ----------------------------------------------------------------------------
-- 2) authenticator: wechseln ja, erben nein
-- ----------------------------------------------------------------------------
-- Seit PostgreSQL 16 trägt jede Mitgliedschaft zwei eigene Schalter: INHERIT
-- (die Rechte der Rolle gelten automatisch) und SET (man darf per SET ROLE in
-- sie wechseln). PostgREST braucht nur SET. Ausdrücklich geschrieben statt
-- über die Vorgabe der Rolle, damit es beim Lesen nicht verwechselt wird.
grant anon          to authenticator with inherit false, set true;
grant authenticated to authenticator with inherit false, set true;
grant service_role  to authenticator with inherit false, set true;

-- ----------------------------------------------------------------------------
-- 3) CONNECT für authenticator über die Leserolle
-- ----------------------------------------------------------------------------
-- Ohne CONNECT kann sich PostgREST nicht anmelden (siehe oben, Punkt 2). Den
-- Weg hat nine am 6.11.2026 vorgeschlagen (SVC-117420): erbende
-- Mitgliedschaft in einer Rolle, die CONNECT hat. Gewählt ist die _ro-Rolle,
-- weil sie die schwächste ist. SET ist aus: authenticator soll nie als
-- Leserolle auftreten, nur ihr CONNECT erben.
--
-- Was authenticator damit zusätzlich erbt: USAGE auf public und das SELECT,
-- das nine der _ro-Rolle auf neue Tabellen gibt (oben, Punkt 3). Das ist
-- vertretbar, aus zwei Gründen:
--   - Die Zeilensicherheit gilt für die _ro-Rolle, denn sie ist nicht
--     Eigentümerin. Ohne JWT liefern die Regeln mit auth.uid() keine Zeilen.
--   - authenticator darf ohnehin in service_role wechseln (Abschnitt 2). Wer
--     das Passwort von authenticator hat, kommt also sowieso an alles. Das
--     geerbte SELECT erweitert das nicht.
-- PostgREST selbst liest vor dem Rollenwechsel keine Tabellen. 903 zeigt die
-- Mitgliedschaft und prüft CONNECT.
grant :"app_ro" to authenticator with inherit true, set false;

-- ----------------------------------------------------------------------------
-- 4) Die Schreibrolle der Anwendung
-- ----------------------------------------------------------------------------
-- An die _rw-Rolle, nicht an den Anmeldebenutzer: Sie ist current_user, wenn
-- 900 bis 903 und die Migrationen laufen (oben, Punkt 1).
--
-- service_role mit INHERIT und SET: Die Schreibrolle muss in service_role
-- wechseln und deren Rechte nutzen können, wenn sie Rechte und Eigentum
-- einrichtet (901) und wenn spätere Migrationen Tabellen ändern.
--
-- anon und authenticated nur mit SET: Die Gegenprobe in 903 führt
-- `set local role authenticated` aus und beweist so, dass die
-- Zeilensicherheit greift, ohne dass dafür ein JWT ausgestellt werden muss.
grant service_role  to :"app_rw" with inherit true,  set true;
grant anon          to :"app_rw" with inherit false, set true;
grant authenticated to :"app_rw" with inherit false, set true;

-- ----------------------------------------------------------------------------
-- 5) Ergebnis
-- ----------------------------------------------------------------------------
\echo
\echo '== Rollen (erwartet: authenticator login = t, alle erbt_vorgabe = f)'
select rolname, rolcanlogin as login, rolinherit as erbt_vorgabe
  from pg_roles
 where rolname in ('anon', 'authenticated', 'service_role', 'authenticator')
 order by 1;

\echo '== Mitgliedschaften (ohne die ADMIN-Einträge von pgadmin)'
select u.rolname as mitglied, r.rolname as in_rolle, g.rolname as vergeben_von,
       m.inherit_option as erbt, m.set_option as wechseln
  from pg_auth_members m
  join pg_roles r on r.oid = m.roleid
  join pg_roles u on u.oid = m.member
  join pg_roles g on g.oid = m.grantor
 where u.rolname <> current_user
   and (u.rolname = 'authenticator'
        or r.rolname in ('anon', 'authenticated', 'service_role'))
 order by 1, 2;

\echo '== Darf authenticator sich verbinden? (muss t sein)'
select has_database_privilege('authenticator', current_database(), 'CONNECT') as authenticator_connect;
