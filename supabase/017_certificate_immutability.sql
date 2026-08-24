-- ============================================================================
-- 017_certificate_immutability.sql  (H1 — RLS-/Integritäts-Härtung)
-- Finalisierte Zeugnisse DB-seitig UNVERÄNDERLICH machen.
-- ============================================================================
-- PROBLEM: Die RLS-Policy "Members can manage certificates" (001) ist
--   `for all using (Firmenmitglied)` OHNE `with check`. Damit kann jedes
--   Firmenmitglied mit seinem normalen `authenticated`-JWT direkt per PostgREST
--   (nicht über die App) `hash`, `canonical_content` oder `status` einer BEREITS
--   finalisierten Zeile überschreiben. Die App-seitige Sperre in
--   app/api/certificates/[id]/finalize/route.ts (Zeile 36-41: "bereits
--   finalisiert") lebt NUR im Code und schützt den DB-Weg nicht.
--
-- LÖSUNG: BEFORE-UPDATE-Trigger, der Änderungen an den drei integritäts-
--   kritischen Spalten ABLEHNT, sobald die BESTEHENDE Zeile `status='final'` ist.
--   Der Trigger feuert unabhängig von RLS und für jede Rolle.
--
-- BEWUSST ENG GEFASST (nur hash / canonical_content / status):
--   * Der legitime Finalisierungs-Update (draft|manager_submitted -> final) hat
--     OLD.status <> 'final' und passiert daher ungehindert.
--   * Andere Spalten finaler Zeilen (z.B. pdf_storage_path, qr_code_url oder die
--     Unterzeichner aus Migration 016) bleiben bewusst änderbar, damit bestehende
--     Abläufe nicht brechen. Die Unveränderlichkeit der Unterzeichner ist ein
--     eigener Schritt (Achse 1 / "Siegel schliessen"), nicht Teil von H1.
--
-- service_role (Server-API mit Service-Key + Wartungsskripte wie
--   scripts/backfill-hash.ts) wird bewusst DURCHGELASSEN: dieser Schlüssel läuft
--   nie im Client-Bundle, ist vertraute Infrastruktur und kann den Trigger
--   ohnehin umgehen (`alter table ... disable trigger`). Ihn hier zu blockieren
--   wäre Security-Theater. Die reale Lücke ist der `authenticated`-Weg — und der
--   wird geschlossen.
--
-- HINWEIS FÜR H2 (Widerruf): sobald der Enum-Wert `revoked` existiert, ist in der
--   Statusprüfung unten der EINE Übergang `final -> revoked` zusätzlich zu
--   erlauben. Bis dahin ist `final` ein Endzustand.
--
-- Sentinels `[[zeugnix:body-start/end]]` und Theme-IDs bleiben unberührt.
-- Idempotent; manuell in Prod einspielen (SQL-Editor, Projekt „zeugnix").
-- ----------------------------------------------------------------------------

create or replace function public.enforce_certificate_immutability()
returns trigger
language plpgsql
-- SECURITY INVOKER (Default): der Trigger braucht keine erhöhten Rechte und muss
-- `current_user` des AUFRUFERS sehen. Mit SECURITY DEFINER wäre current_user der
-- Funktions-Owner — die service_role-Ausnahme würde dann fälschlich nie greifen.
as $$
begin
  -- Nur relevant, wenn die BESTEHENDE Zeile bereits final ist. Der
  -- Finalisierungs-Update selbst (OLD.status <> 'final') läuft ungehindert durch.
  if OLD.status is distinct from 'final' then
    return NEW;
  end if;

  -- Vertraute Infrastruktur (Server mit Service-Key) darf durch.
  if current_user = 'service_role' then
    return NEW;
  end if;

  -- Ab hier: eine nicht-vertraute Rolle (authenticated/anon) versucht, eine
  -- finalisierte Zeile zu verändern. Integritäts-kritische Spalten sind gesperrt.
  if NEW.hash is distinct from OLD.hash then
    raise exception
      'Zeugnis % ist finalisiert: hash ist unveraenderlich.', OLD.id
      using errcode = 'check_violation';
  end if;

  if NEW.canonical_content is distinct from OLD.canonical_content then
    raise exception
      'Zeugnis % ist finalisiert: canonical_content ist unveraenderlich.', OLD.id
      using errcode = 'check_violation';
  end if;

  if NEW.status is distinct from OLD.status then
    raise exception
      'Zeugnis % ist finalisiert: status ist unveraenderlich.', OLD.id
      using errcode = 'check_violation';
  end if;

  return NEW;
end;
$$;

drop trigger if exists enforce_certificate_immutability on public.certificates;
create trigger enforce_certificate_immutability
  before update on public.certificates
  for each row
  execute function public.enforce_certificate_immutability();

-- ----------------------------------------------------------------------------
-- VERIFIKATION (optional, im SQL-Editor nach dem Einspielen auszuführen).
-- Läuft als postgres (current_user='postgres' -> Trigger greift wie bei
-- 'authenticated'). Mutiert NICHTS: der blockierte Update wird zurückgerollt,
-- der positive Test schreibt denselben Wert zurück.
-- ----------------------------------------------------------------------------
-- do $$
-- declare
--   v_final uuid;
--   v_draft uuid;
-- begin
--   select id into v_final from public.certificates where status = 'final' limit 1;
--   select id into v_draft from public.certificates where status <> 'final' limit 1;
--
--   -- 1) NEGATIV: hash einer finalen Zeile ändern -> MUSS scheitern.
--   if v_final is not null then
--     begin
--       update public.certificates set hash = coalesce(hash,'') || 'x' where id = v_final;
--       raise exception 'TEST FEHLGESCHLAGEN: hash-Update auf finaler Zeile war moeglich';
--     exception when check_violation then
--       raise notice 'OK: hash-Update auf finaler Zeile wurde blockiert';
--     end;
--
--     -- status einer finalen Zeile ändern -> MUSS scheitern.
--     begin
--       update public.certificates set status = 'draft' where id = v_final;
--       raise exception 'TEST FEHLGESCHLAGEN: status-Update auf finaler Zeile war moeglich';
--     exception when check_violation then
--       raise notice 'OK: status-Update auf finaler Zeile wurde blockiert';
--     end;
--
--     -- Nicht-kritische Spalte finaler Zeile (qr_code_url) -> DARF durchgehen.
--     update public.certificates set qr_code_url = qr_code_url where id = v_final;
--     raise notice 'OK: nicht-kritische Spalte finaler Zeile bleibt aenderbar';
--   else
--     raise notice 'HINWEIS: keine finale Zeile zum Testen vorhanden';
--   end if;
--
--   -- 2) POSITIV: eine nicht-finale Zeile bleibt voll aenderbar.
--   if v_draft is not null then
--     update public.certificates set updated_at = now() where id = v_draft;
--     raise notice 'OK: nicht-finale Zeile ist normal aenderbar';
--   end if;
-- end $$;
