-- ============================================================================
-- zeugnio.ch – Rechte und Zugriff für service_role in der eigenen Datenbank (nine.ch)
-- ----------------------------------------------------------------------------
-- Läuft NACH `node scripts/migrate.mjs`, also nachdem das Schema aus den
-- Migrationen im Repository entstanden ist. Siehe Kopf von 900_nine_bootstrap.sql.
--
-- WAS HIER PASSIERT UND WARUM
--
-- Bei Supabase umgeht die Rolle service_role die Zeilensicherheit über das
-- Rollenattribut BYPASSRLS. Das lässt sich hier nicht voraussetzen: BYPASSRLS
-- vergeben darf nur ein Superuser oder eine Rolle, die es selbst hat.
--
-- DER ERSATZ: EINE REGEL PRO TABELLE
--
-- Jede Tabelle mit Zeilensicherheit bekommt eine Regel (Policy) namens
-- service_role_alles, die für service_role alles erlaubt:
-- `using (true) with check (true)`. PostgreSQL verknüpft mehrere zulässige
-- Regeln mit ODER. Für service_role ist darum jede Zeile sichtbar und
-- beschreibbar, für alle anderen Rollen bleibt alles, wie es ist. Dazu bekommt
-- service_role SELECT, INSERT, UPDATE und DELETE auf die Tabellen. Die Regel
-- gibt nur die Zeilen frei; ohne diese Rechte käme die Rolle gar nicht an die
-- Tabelle heran.
--
-- Bis zum 6.11.2026 stand hier ein anderer Ersatz: service_role wurde
-- Eigentümerin aller Tabellen, denn für die Eigentümerin gilt die
-- Zeilensicherheit nicht. Das geht auf advisori01 nicht. Ohne Superuser
-- verlangt `ALTER … OWNER TO`, dass die neue Eigentümerin CREATE auf dem
-- Schema hat. CREATE auf public kann aber nur nines Rolle nmd vergeben, der die
-- Datenbank gehört. Lokal nachgestellt am 6.11.2026: «permission denied for
-- schema public».
--
-- Die Tabellen gehören darum weiter der Schreibrolle nmd_zeugnio_rw, die sie
-- angelegt hat. Das entspricht Supabase, wo sie postgres gehören. Auch die
-- SECURITY-DEFINER-Funktionen (handle_new_user, log_certificate_status_change,
-- check_rate_limit, ensure_auth_user) laufen wie dort mit den Rechten der
-- Eigentümerin der Tabellen. Für sie gilt die Zeilensicherheit nicht.
--
-- Daraus folgen zwei Dinge, die geprüft werden müssen und nicht geglaubt:
--   1. Jede Tabelle mit Zeilensicherheit braucht die Regel. Fehlt sie, sieht
--      service_role dort nichts, und die Anwendung liefert leere Ergebnisse
--      statt Fehler. Bringt eine neue Migration eine Tabelle, diese Datei
--      danach nochmals laufen lassen.
--   2. Keine Tabelle darf FORCE ROW LEVEL SECURITY tragen. Sonst gälte die
--      Zeilensicherheit auch für die Eigentümerin, und die
--      SECURITY-DEFINER-Funktionen fänden nichts mehr.
-- Beides prüft 903_nine_verify.sql. Ohne diese Prüfung ist dieser Schritt nicht
-- abgeschlossen, auch wenn er fehlerfrei durchläuft.
--
-- Ausführung als Datenbankbenutzer nmd_zeugnio:
--   psql -w -h 127.0.0.1 -U nmd_zeugnio -d nmd_zeugnio -v ON_ERROR_STOP=1 \
--        -f supabase/901_nine_rechte.sql
--
-- Idempotent.
-- ============================================================================

-- ----------------------------------------------------------------------------
-- Tabellen, die NICHT in die Daten-API gehören
-- ----------------------------------------------------------------------------
-- PostgREST liefert jede Tabelle aus, auf die die Rolle Rechte hat. Die
-- Buchführung über die Migrationen gehört nicht dazu.
--
-- Diese Liste stand früher in einer temporären Tabelle. Das geht auf advisori01
-- nicht: nine hat `TEMPORARY` auf der Datenbank entzogen, gemessen am 7.10.2026
-- mit has_database_privilege('nmd_zeugnio_rw', current_database(), 'TEMP') = f.
-- Eine temporäre Tabelle hätte dieses Skript also in der ersten Anweisung
-- abgebrochen. Statt nine um dieses Recht zu bitten, kommt die Liste jetzt als
-- Array-Literal – sie hat genau einen Eintrag, und ein zusätzliches Recht für
-- eine einelementige Liste wäre schlecht eingekauft.
--
-- ACHTUNG: Das Literal steht an ZWEI Stellen (Abschnitt 2 und Abschnitt 4).
-- Kommt eine Tabelle hinzu, muss sie an beiden Stellen eingetragen werden,
-- sonst bekommt sie in Abschnitt 2 Rechte und wird in Abschnitt 4 nicht
-- verschlossen. 903_nine_verify.sql prüft das Ergebnis und würde die
-- Abweichung melden.

-- ----------------------------------------------------------------------------
-- 1) Regel für service_role auf jeder Tabelle mit Zeilensicherheit
-- ----------------------------------------------------------------------------
-- Ein Hinweis für später: Heute gibt es keine Views. Kommt einmal eine hinzu,
-- gehört sie wie die Tabellen der Schreibrolle. Sie liest die darunterliegenden
-- Tabellen dann mit deren Rechten, also an der Zeilensicherheit vorbei, auch
-- wenn die Abfrage von einem angemeldeten Browser kommt. Eine solche View braucht
-- `with (security_invoker = true)`. 903_nine_verify.sql prüft genau das, damit es
-- am Tag der ersten View auffällt und nicht Monate später.
do $$
declare
  r record;
  n int := 0;
begin
  for r in
    select c.relname
      from pg_class c
      join pg_namespace ns on ns.oid = c.relnamespace
     where ns.nspname = 'public'
       and c.relkind in ('r', 'p')       -- Tabelle, partitionierte Tabelle
       and c.relrowsecurity
       and not exists (select 1 from pg_policy p
                        where p.polrelid = c.oid and p.polname = 'service_role_alles')
     order by c.relname
  loop
    execute format('create policy service_role_alles on public.%I as permissive for all '
                   'to service_role using (true) with check (true)', r.relname);
    n := n + 1;
  end loop;
  raise notice 'Regel service_role_alles neu angelegt auf % Tabellen', n;
end
$$;

-- ----------------------------------------------------------------------------
-- 2) Rechte für service_role, authenticated und anon
-- ----------------------------------------------------------------------------
-- service_role bekommt die vier Datenrechte, aber nicht TRUNCATE, REFERENCES
-- oder TRIGGER. Die Anwendung braucht nur lesen und schreiben.
--
-- anon und authenticated: absichtlich strenger als bei Supabase. Dort haben
-- anon und authenticated ALL auf allen Tabellen, und die Zeilensicherheit ist
-- die einzige Grenze. Hier bekommt anon nur SELECT: Nach der Umstellung
-- (Schritt C4) greift kein Browser mehr schreibend auf die Datenbank zu, alle
-- Schreibpfade laufen über Server-Routen mit dem service_role-Schlüssel. Damit
-- ist ein Schreibrecht für anon nicht nur unnötig. Es wegzulassen ist eine
-- zweite Verteidigungslinie, die man geschenkt bekommt.
--
-- Sollte später doch eine Route als anon schreiben müssen, wird das Recht
-- einzeln vergeben – nicht diese Zeile aufgeweicht.
do $$
declare
  r record;
begin
  for r in
    select c.relname
      from pg_class c
      join pg_namespace ns on ns.oid = c.relnamespace
     where ns.nspname = 'public'
       and c.relkind in ('r', 'p', 'v')
       -- Liste siehe Kopf dieser Datei. Zweite Stelle: Abschnitt 4.
       and c.relname <> all (array['schema_migrations']::text[])
  loop
    execute format('grant select, insert, update, delete on public.%I to service_role', r.relname);
    execute format('grant select, insert, update, delete on public.%I to authenticated', r.relname);
    execute format('grant select on public.%I to anon', r.relname);
  end loop;
end
$$;

-- Sequenzen: ohne USAGE scheitert jeder INSERT in eine Tabelle mit serial-Spalte.
grant usage, select on all sequences in schema public to anon, authenticated, service_role;

-- Funktionen in public bewusst NICHT pauschal: die beiden einzigen RPC-Aufrufe der
-- Anwendung (check_rate_limit, revoke_certificate) laufen über den
-- service_role-Schlüssel, siehe lib/rate-limit.ts und
-- app/api/certificates/[id]/revoke/route.ts. anon und authenticated brauchen
-- darum kein EXECUTE. Käme später eine RPC hinzu, die als authenticated laufen
-- soll, wird sie hier einzeln eingetragen – ein pauschales Grant würde
-- irgendwann eine SECURITY-DEFINER-Funktion mitnehmen, die niemand aufrufen soll.
grant execute on all functions in schema public to service_role;

-- ----------------------------------------------------------------------------
-- 3) Künftige Objekte
-- ----------------------------------------------------------------------------
-- Ohne das hier hätte eine später angelegte Tabelle keine Rechte für
-- authenticated und service_role, und die Anwendung meldete „permission denied
-- for table", lange nachdem die Migration als erfolgreich gemeldet wurde.
-- Vorgaberechte gelten für Objekte, die die ausführende Rolle anlegt. Das ist
-- hier wie in den Migrationen die Schreibrolle.
--
-- Die Regel aus Abschnitt 1 lässt sich so NICHT vorgeben. Darum nach jeder
-- Migration mit neuer Tabelle diese Datei nochmals laufen lassen; 903 meldet
-- eine fehlende Regel.
alter default privileges in schema public
  grant select, insert, update, delete on tables to service_role;
alter default privileges in schema public
  grant select, insert, update, delete on tables to authenticated;
alter default privileges in schema public
  grant select on tables to anon;
alter default privileges in schema public
  grant usage, select on sequences to anon, authenticated, service_role;

-- ----------------------------------------------------------------------------
-- 4) Ausgenommene Tabellen wieder verschliessen
-- ----------------------------------------------------------------------------
-- Gürtel und Hosenträger: die Schleife oben überspringt sie schon, aber ein
-- REVOKE hier gilt auch dann, wenn Rechte über die Vorgaberechte aus Abschnitt 3
-- dazugekommen sind.
do $$
declare
  r record;
begin
  -- Liste siehe Kopf dieser Datei. Erste Stelle: Abschnitt 2.
  for r in select unnest(array['schema_migrations']::text[]) as tablename loop
    if exists (select 1 from pg_tables where schemaname = 'public' and tablename = r.tablename) then
      execute format('revoke all on public.%I from anon, authenticated, service_role', r.tablename);
    end if;
  end loop;
end
$$;

-- ----------------------------------------------------------------------------
-- 5) Die Absicherungen aus 006 wieder herstellen
-- ----------------------------------------------------------------------------
-- 006_security_hardening.sql hat handle_new_user das EXECUTE-Recht entzogen,
-- weil die Funktion SECURITY DEFINER ist und sonst als RPC aufrufbar wäre. Da
-- oben Rechte pauschal neu vergeben werden, wird dieser Entzug hier ausdrücklich
-- wiederholt – sonst nimmt dieser Bootstrap eine bereits behobene Schwachstelle
-- stillschweigend zurück.
do $$
begin
  if exists (
    select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace
     where n.nspname = 'public' and p.proname = 'handle_new_user'
  ) then
    revoke execute on function public.handle_new_user() from public;
    revoke execute on function public.handle_new_user() from anon;
    revoke execute on function public.handle_new_user() from authenticated;
  end if;
end
$$;

-- ----------------------------------------------------------------------------
-- 6) Sofortige Warnung, falls der Ersatz nicht trägt
-- ----------------------------------------------------------------------------
do $$
declare
  n int;
begin
  select count(*) into n
    from pg_class c join pg_namespace ns on ns.oid = c.relnamespace
   where ns.nspname = 'public' and c.relrowsecurity and c.relforcerowsecurity;
  if n > 0 then
    raise exception
      'FORCE ROW LEVEL SECURITY ist auf % Tabelle(n) gesetzt. Damit gilt die '
      'Zeilensicherheit auch für die Eigentümerin, und die SECURITY-DEFINER-'
      'Funktionen fänden nichts mehr. Siehe 903_nine_verify.sql.', n;
  end if;
end
$$;

-- ----------------------------------------------------------------------------
-- Fertig. Nächster Schritt: 902_auth_bridge.sql, danach 903_nine_verify.sql.
-- ----------------------------------------------------------------------------
