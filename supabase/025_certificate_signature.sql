-- ============================================================================
-- 025_certificate_signature.sql  (S2 — kryptografische Ed25519-Signatur)
-- ============================================================================
-- KONTEXT (Achse 1): Der SHA-256 (v1) bzw. der versionierte Meta-Hash (v2/S1b)
--   belegt die IDENTITÄT des Inhalts — jeder kann ihn selbst nachrechnen. Er
--   beweist NICHT die URHEBERSCHAFT: dass genau zeugnio das Zeugnis ausgestellt
--   hat. Ein Angreifer mit DB-Schreibzugriff könnte theoretisch einen eigenen
--   Hash registrieren.
--
-- LÖSUNG (S2): Beim Finalisieren wird der v2-Hash mit einem privaten Plattform-
--   Schlüssel (Ed25519) signiert. Die Signatur wird gespeichert UND als
--   unsichtbarer Block ins PDF eingebettet. Die Prüfung verifiziert die Signatur
--   gegen den öffentlichen Schlüssel — OFFLINE, ohne DB. Damit gilt „nur zeugnio
--   konnte das ausstellen"; der Schutz hält sogar gegen DB-Schreibzugriff,
--   solange der private Schlüssel getrennt (Vercel-Env / später KMS) verwahrt ist.
--
-- Zwei additive, NULLBARE Spalten. Bestehende Zeilen (und jede Finalisierung
-- ohne konfigurierten Schlüssel) bleiben signature = NULL: die Prüfung fällt
-- dann sauber auf den v2-/v1-Hash-Match zurück (voller Bestandsschutz).
--   * signature       – Base64 der Ed25519-Signatur über den v2-Hash.
--   * signing_key_id   – ID des verwendeten Schlüssels (erlaubt Rotation:
--                        zurückgezogene öffentliche Schlüssel bleiben in der
--                        App-Registry hinterlegt, alte Zeugnisse verifizieren weiter).
--
-- Zusätzlich wird der Immutabilitäts-Trigger (H1/017, H2/021, S1b/024) so
-- erweitert, dass signature/signing_key_id einer finalen (bzw. widerrufenen)
-- Zeile für nicht-vertraute Rollen ebenfalls gesperrt sind — die Signatur ist
-- Teil des Siegels und damit unveränderlich.
--
-- Idempotent; manuell in Prod einspielen (SQL-Editor, Projekt „zeugnix").
-- Sentinels `[[zeugnix:body-start/end]]` und Theme-IDs bleiben unberührt.
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 1. Additive, nullbare Spalten
-- ----------------------------------------------------------------------------
alter table public.certificates
  add column if not exists signature text,
  add column if not exists signing_key_id text;

comment on column public.certificates.signature is
  'Base64 der Ed25519-Signatur über den v2-Hash (S2, Migration 025). NULL = keine kryptografische Signatur (Bestandszeugnis oder kein Schlüssel konfiguriert).';
comment on column public.certificates.signing_key_id is
  'ID des Plattform-Schlüssels, mit dem signature erzeugt wurde (Rotation). S2 (Migration 025).';

-- ----------------------------------------------------------------------------
-- 2. enforce_certificate_immutability() erweitern: signature + signing_key_id
--    finaler/widerrufener Zeilen für nicht-vertraute Rollen sperren.
--    Basis: 024 (hash/canonical_content/hash_version/meta_snapshot gesperrt).
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
  -- (OLD.status <> 'final'), die hash_version/meta_snapshot/signature erst setzt.
  if OLD.status is distinct from 'final' and OLD.status is distinct from 'revoked' then
    return NEW;
  end if;

  -- Vertraute Infrastruktur (Server mit Service-Key) darf durch.
  if current_user = 'service_role' then
    return NEW;
  end if;

  -- Der EINE erlaubte Übergang aus 'final': Widerruf. Alle Siegel-Bestandteile
  -- (hash, canonical_content, hash_version, meta_snapshot, signature,
  -- signing_key_id) bleiben davon unberührt (Siegel bleibt versiegelt).
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
    if NEW.signature is distinct from OLD.signature then
      raise exception
        'Zeugnis % ist finalisiert: signature ist unveraenderlich.', OLD.id
        using errcode = 'check_violation';
    end if;
    if NEW.signing_key_id is distinct from OLD.signing_key_id then
      raise exception
        'Zeugnis % ist finalisiert: signing_key_id ist unveraenderlich.', OLD.id
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

  if NEW.signature is distinct from OLD.signature then
    raise exception
      'Zeugnis % ist finalisiert: signature ist unveraenderlich.', OLD.id
      using errcode = 'check_violation';
  end if;

  if NEW.signing_key_id is distinct from OLD.signing_key_id then
    raise exception
      'Zeugnis % ist finalisiert: signing_key_id ist unveraenderlich.', OLD.id
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

-- Trigger existiert bereits (017); Funktion per create-or-replace aktualisiert.

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
--       update public.certificates set signature = 'x' where id = v_final;
--       raise exception 'TEST FEHLGESCHLAGEN: signature-Update auf finaler Zeile war moeglich';
--     exception when check_violation then
--       raise notice 'OK: signature-Update auf finaler Zeile wurde blockiert';
--     end;
--     begin
--       update public.certificates set signing_key_id = 'x' where id = v_final;
--       raise exception 'TEST FEHLGESCHLAGEN: signing_key_id-Update auf finaler Zeile war moeglich';
--     exception when check_violation then
--       raise notice 'OK: signing_key_id-Update auf finaler Zeile wurde blockiert';
--     end;
--   else
--     raise notice 'HINWEIS: keine finale Zeile zum Testen vorhanden';
--   end if;
-- end $$;
