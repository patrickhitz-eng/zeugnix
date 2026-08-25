-- ============================================================================
-- 024_hash_version_meta.sql  (S1b — versionierter Hash über die materiellen Felder)
-- ============================================================================
-- PROBLEM (Achse 1, "Siegel schliessen"): Der Echtheits-Hash deckte bisher nur
--   den Fliesstext (Body) zwischen den Sentinels. Arbeitgeber-Name, Dokument-
--   titel und die Unterzeichnenden stehen im PDF AUSSERHALB der Sentinels und
--   waren damit fälschbar, OHNE dass sich der Hash ändert (getauschter Briefkopf
--   + Unterschriften -> Prüfung sagte trotzdem "Echt").
--
-- LÖSUNG (S1b): additiv-versionierter Hash.
--   * hash_version = 1  -> Hash nur über den Body (Alt-/Bestandszeugnisse).
--   * hash_version = 2  -> Hash über Body UND einen kanonischen Meta-Block
--                          (Arbeitgeber, Titel, Unterzeichnende).
--   Der Meta-Block wird beim Finalisieren als Snapshot eingefroren (meta_snapshot)
--   und vom PDF-Renderer als unsichtbarer, maschinenlesbarer Block eingebettet.
--   Die Verifikation rekonstruiert beides aus dem PDF und probiert v2 UND v1
--   (Bestandsschutz: ein vor S1b ausgestelltes Zeugnis bleibt gültig).
--
-- Zwei additive Spalten; bestehende Zeilen erhalten hash_version = 1 (v1) und
-- meta_snapshot = NULL, bleiben also unverändert gültig.
--
-- Zusätzlich wird der Immutabilitäts-Trigger (H1/017, H2/021) so erweitert, dass
-- er hash_version/meta_snapshot einer bereits finalisierten (bzw. widerrufenen)
-- Zeile für nicht-vertraute Rollen ebenfalls sperrt. Sonst könnte ein
-- Firmenmitglied per rohem PostgREST den eingefrorenen Meta-Snapshot einer
-- finalen Zeile überschreiben — der gespeicherte Hash bleibt zwar (weiterhin
-- gesperrt) korrekt, aber das dann falsch eingebettete PDF würde die eigene
-- Prüfung brechen. Der Snapshot ist Teil des Siegels und daher unveränderlich.
--
-- Idempotent; manuell in Prod einspielen (SQL-Editor, Projekt „zeugnix").
-- Sentinels `[[zeugnix:body-start/end]]` und Theme-IDs bleiben unberührt.
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 1. Additive Spalten
-- ----------------------------------------------------------------------------
alter table public.certificates
  add column if not exists hash_version smallint not null default 1,
  add column if not exists meta_snapshot jsonb;

comment on column public.certificates.hash_version is
  'Echtheits-Hash-Version: 1 = nur Fliesstext (Body); 2 = Body + Meta (Arbeitgeber/Titel/Unterzeichnende). S1b (Migration 024).';
comment on column public.certificates.meta_snapshot is
  'Eingefrorene Meta-Felder (employer/documentTitle/signatoryX Name+Role) zum Finalisierungszeitpunkt. Basis des v2-Hash und des unsichtbaren PDF-Meta-Blocks. S1b (Migration 024).';

-- ----------------------------------------------------------------------------
-- 2. enforce_certificate_immutability() erweitern: hash_version + meta_snapshot
--    finaler/widerrufener Zeilen für nicht-vertraute Rollen sperren.
--    Basis: 021 (final -> revoked erlaubt, Widerruf-Forensik gesperrt).
-- ----------------------------------------------------------------------------
create or replace function public.enforce_certificate_immutability()
returns trigger
language plpgsql
-- SECURITY INVOKER (Default, siehe 017/021): current_user muss der AUFRUFER
-- sein, damit die service_role-Ausnahme greift.
as $$
begin
  -- Endzustände: 'final' und 'revoked'. Alles andere (draft, pending_manager,
  -- manager_submitted) läuft ungehindert durch — inkl. der Finalisierung selbst
  -- (OLD.status <> 'final'), die hash_version 1->2 und meta_snapshot erst setzt.
  if OLD.status is distinct from 'final' and OLD.status is distinct from 'revoked' then
    return NEW;
  end if;

  -- Vertraute Infrastruktur (Server mit Service-Key) darf durch.
  if current_user = 'service_role' then
    return NEW;
  end if;

  -- Der EINE erlaubte Übergang aus 'final': Widerruf. hash/canonical_content/
  -- hash_version/meta_snapshot bleiben davon unberührt (Siegel bleibt versiegelt).
  if OLD.status = 'final' and NEW.status = 'revoked' then
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
    if NEW.hash_version is distinct from OLD.hash_version then
      raise exception
        'Zeugnis % ist finalisiert: hash_version ist unveraenderlich.', OLD.id
        using errcode = 'check_violation';
    end if;
    if NEW.meta_snapshot is distinct from OLD.meta_snapshot then
      raise exception
        'Zeugnis % ist finalisiert: meta_snapshot ist unveraenderlich.', OLD.id
        using errcode = 'check_violation';
    end if;
    return NEW;
  end if;

  -- Ab hier: eine nicht-vertraute Rolle versucht, eine finale ODER widerrufene
  -- Zeile ausserhalb des erlaubten Widerruf-Übergangs zu verändern.
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

  if NEW.hash_version is distinct from OLD.hash_version then
    raise exception
      'Zeugnis % ist finalisiert: hash_version ist unveraenderlich.', OLD.id
      using errcode = 'check_violation';
  end if;

  if NEW.meta_snapshot is distinct from OLD.meta_snapshot then
    raise exception
      'Zeugnis % ist finalisiert: meta_snapshot ist unveraenderlich.', OLD.id
      using errcode = 'check_violation';
  end if;

  if NEW.status is distinct from OLD.status then
    raise exception
      'Zeugnis % ist %: status ist unveraenderlich.', OLD.id, OLD.status
      using errcode = 'check_violation';
  end if;

  -- Widerruf-Forensik ist nach dem Widerruf ebenfalls unveraenderlich (021).
  if OLD.status = 'revoked' then
    if NEW.revoked_at is distinct from OLD.revoked_at then
      raise exception
        'Zeugnis % ist widerrufen: revoked_at ist unveraenderlich.', OLD.id
        using errcode = 'check_violation';
    end if;
    if NEW.revoked_by_user_id is distinct from OLD.revoked_by_user_id then
      raise exception
        'Zeugnis % ist widerrufen: revoked_by_user_id ist unveraenderlich.', OLD.id
        using errcode = 'check_violation';
    end if;
    if NEW.revocation_reason is distinct from OLD.revocation_reason then
      raise exception
        'Zeugnis % ist widerrufen: revocation_reason ist unveraenderlich.', OLD.id
        using errcode = 'check_violation';
    end if;
  end if;

  return NEW;
end;
$$;

-- Trigger existiert bereits (017); Funktion per create-or-replace aktualisiert,
-- kein erneutes drop/create des Triggers nötig.

-- ----------------------------------------------------------------------------
-- VERIFIKATION (optional, im SQL-Editor nach dem Einspielen auszuführen).
-- Läuft als postgres (current_user='postgres' -> Trigger greift wie bei
-- 'authenticated'). Mutiert NICHTS: blockierte Updates werden zurückgerollt.
-- ----------------------------------------------------------------------------
-- do $$
-- declare v_final uuid;
-- begin
--   select id into v_final from public.certificates where status = 'final' limit 1;
--   if v_final is not null then
--     begin
--       update public.certificates set meta_snapshot = '{"x":1}'::jsonb where id = v_final;
--       raise exception 'TEST FEHLGESCHLAGEN: meta_snapshot-Update auf finaler Zeile war moeglich';
--     exception when check_violation then
--       raise notice 'OK: meta_snapshot-Update auf finaler Zeile wurde blockiert';
--     end;
--     begin
--       update public.certificates set hash_version = 1 where id = v_final;
--       raise exception 'TEST FEHLGESCHLAGEN: hash_version-Update auf finaler Zeile war moeglich';
--     exception when check_violation then
--       raise notice 'OK: hash_version-Update auf finaler Zeile wurde blockiert';
--     end;
--   else
--     raise notice 'HINWEIS: keine finale Zeile zum Testen vorhanden';
--   end if;
-- end $$;
