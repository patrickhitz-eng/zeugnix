-- ============================================================================
-- zeugnio.ch – Eigentum und Rechte in der eigenen Datenbank (nine.ch)
-- ----------------------------------------------------------------------------
-- Läuft NACH `node scripts/migrate.mjs`, also nachdem das Schema aus den
-- Migrationen im Repository entstanden ist – Eigentum kann man nur an Tabellen
-- übertragen, die es schon gibt. Siehe Kopf von 900_nine_bootstrap.sql.
--
-- WAS HIER PASSIERT UND WARUM
--
-- Bei Supabase umgeht die Rolle service_role die Zeilensicherheit über das
-- Rollenattribut BYPASSRLS. Das lässt sich hier nicht nachbauen: BYPASSRLS zu
-- setzen ist Superusern vorbehalten, und Superuser sind wir auf einem Managed
-- Server nicht. Der Ersatz ist das Eigentum an den Tabellen: PostgreSQL wendet
-- die Zeilensicherheit auf den Eigentümer einer Tabelle nicht an – ausser die
-- Tabelle ist ausdrücklich auf FORCE ROW LEVEL SECURITY gestellt.
--
-- Daraus folgen zwei Dinge, die geprüft werden müssen und nicht geglaubt:
--   1. Keine Tabelle darf FORCE ROW LEVEL SECURITY tragen. Sonst greift der
--      Ersatz nicht, und die Anwendung liefert leere Ergebnisse statt Fehler.
--   2. Umgekehrt darf niemand ausser service_role Eigentümer bleiben, sonst
--      wirkt die Zeilensicherheit dort nicht, wo sie wirken soll.
-- Beides prüft 903_nine_verify.sql. Ohne diese Prüfung ist dieser Schritt nicht
-- abgeschlossen, auch wenn er fehlerfrei durchläuft.
--
-- Ausführung als Datenbankbenutzer nmd_zeugnio:
--   psql -w -v ON_ERROR_STOP=1 -d nmd_zeugnio -f supabase/901_nine_ownership.sql
--
-- Idempotent.
-- ============================================================================

-- ----------------------------------------------------------------------------
-- Tabellen, die NICHT in die Daten-API gehören
-- ----------------------------------------------------------------------------
-- PostgREST liefert jede Tabelle aus, auf die die Rolle Rechte hat – die
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
-- sonst bekommt sie in Abschnitt 2 keine Rechte und wird in Abschnitt 4 nicht
-- verschlossen. 903_nine_verify.sql prüft das Ergebnis und würde die
-- Abweichung melden.

-- ----------------------------------------------------------------------------
-- 1) Eigentum an allen Objekten in public auf service_role
-- ----------------------------------------------------------------------------
-- Ein Hinweis für später: heute gibt es keine Views. Kommt einmal eine hinzu und
-- gehört sie service_role, dann liest sie die darunterliegenden Tabellen mit den
-- Rechten von service_role – also an der Zeilensicherheit vorbei, auch wenn die
-- Abfrage von einem angemeldeten Browser kommt. Eine solche View braucht
-- `with (security_invoker = true)`. 903_nine_verify.sql prüft genau das, damit es
-- am Tag der ersten View auffällt und nicht Monate später.
do $$
declare
  r record;
  n int := 0;
begin
  for r in
    select c.relname, c.relkind
      from pg_class c
      join pg_namespace ns on ns.oid = c.relnamespace
     where ns.nspname = 'public'
       and c.relkind in ('r', 'p', 'v', 'm', 'S')  -- Tabelle, partitioniert, View, MatView, Sequenz
       and c.relowner <> 'service_role'::regrole
     order by c.relkind, c.relname
  loop
    case r.relkind
      when 'r', 'p' then execute format('alter table public.%I owner to service_role', r.relname);
      when 'v'      then execute format('alter view public.%I owner to service_role', r.relname);
      when 'm'      then execute format('alter materialized view public.%I owner to service_role', r.relname);
      when 'S'      then execute format('alter sequence public.%I owner to service_role', r.relname);
    end case;
    n := n + 1;
  end loop;
  raise notice 'Eigentum übertragen: % Objekte', n;
end
$$;

-- Funktionen ebenfalls. Das betrifft insbesondere die SECURITY-DEFINER-Funktionen
-- (handle_new_user, revoke_certificate, check_rate_limit): sie laufen mit den
-- Rechten ihres Eigentümers. Gehören sie service_role, dürfen sie schreiben, was
-- sie schreiben müssen – und nur das, was ihr Rumpf vorsieht.
do $$
declare
  r record;
  n int := 0;
begin
  for r in
    select p.oid, p.proname, pg_get_function_identity_arguments(p.oid) as args
      from pg_proc p
      join pg_namespace ns on ns.oid = p.pronamespace
     where ns.nspname = 'public'
       and p.proowner <> 'service_role'::regrole
       and p.prokind in ('f', 'p')
  loop
    execute format('alter %s public.%I(%s) owner to service_role',
                   case when (select prokind from pg_proc where oid = r.oid) = 'p'
                        then 'procedure' else 'function' end,
                   r.proname, r.args);
    n := n + 1;
  end loop;
  raise notice 'Eigentum an Funktionen übertragen: % Objekte', n;
end
$$;

-- ----------------------------------------------------------------------------
-- 2) Rechte für authenticated und anon
-- ----------------------------------------------------------------------------
-- Absichtlich strenger als bei Supabase. Dort haben anon und authenticated ALL
-- auf allen Tabellen, und die Zeilensicherheit ist die einzige Grenze. Hier
-- bekommt anon nur SELECT: nach der Umstellung (Schritt C4) greift kein Browser
-- mehr schreibend auf die Datenbank zu, alle Schreibpfade laufen über
-- Server-Routen mit dem service_role-Schlüssel. Damit ist ein Schreibrecht für
-- anon nicht nur unnötig, sondern eine zweite Verteidigungslinie, die man
-- geschenkt bekommt.
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
-- authenticated – und die Anwendung meldete „permission denied for table",
-- lange nachdem die Migration als erfolgreich gemeldet wurde.
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
-- REVOKE hier gilt auch dann, wenn die Rechte aus dem Auszug mitgekommen sind.
do $$
declare
  r record;
begin
  -- Liste siehe Kopf dieser Datei. Erste Stelle: Abschnitt 2.
  for r in select unnest(array['schema_migrations']::text[]) as tablename loop
    if exists (select 1 from pg_tables where schemaname = 'public' and tablename = r.tablename) then
      execute format('revoke all on public.%I from anon, authenticated', r.tablename);
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
-- 6) Sofortige Warnung, falls der Eigentümer-Ersatz nicht trägt
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
      'FORCE ROW LEVEL SECURITY ist auf % Tabelle(n) gesetzt. Damit greift der '
      'Eigentümer-Ersatz für den service_role-Bypass nicht und die Anwendung '
      'würde leere Ergebnisse liefern. Siehe 903_nine_verify.sql.', n;
  end if;
end
$$;

-- ----------------------------------------------------------------------------
-- Fertig. Nächster Schritt: 902_auth_bridge.sql, danach 903_nine_verify.sql.
-- ----------------------------------------------------------------------------
