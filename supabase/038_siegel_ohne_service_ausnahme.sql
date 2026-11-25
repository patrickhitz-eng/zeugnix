-- ============================================================================
-- 038_siegel_ohne_service_ausnahme.sql
-- Sicherheitstest 24.11.2026, Befund H1 (docs/sicherheitstest-2026-11-24.md)
-- ============================================================================
--
-- PROBLEM
--
-- Der Trigger `enforce_certificate_immutability` (017, zuletzt 029) schützt
-- finalisierte und widerrufene Zeugnisse. Er hatte eine Ausnahme: Schreibt die
-- Rolle `service_role`, liess er jede Änderung durch. Gedacht war das für
-- «vertraute Infrastruktur». Die öffentliche Abgabe-Route der Vorgesetzten
-- (`app/api/evaluations/submit`) schreibt aber genau mit dieser Rolle, und wer
-- sie aufrufen darf, entscheidet allein ein Token aus einer Mail. Mit einer
-- Einladung auf ein finalisiertes Zeugnis liess sich dessen Status so auf
-- `manager_submitted` zurücksetzen. Danach griff weder der Text-Schutz noch die
-- Löschsperre aus 036.
--
-- LÖSUNG
--
-- 1. Die Ausnahme fällt weg. Für finalisierte und widerrufene Zeilen gelten
--    dieselben Regeln für alle Rollen: erlaubt ist nur der Widerruf
--    (final -> revoked) mit unverändertem Siegel, sowie Änderungen an Feldern
--    ausserhalb des Siegels (archived_at, updated_at, qr_code_url …).
--    Geprüft am 24.11.2026: Kein Code-Pfad braucht die Ausnahme. Die einzige
--    Stelle, die mit der Serverrolle in `certificates` schreibt, ist die
--    Abgabe-Route, und die prüft den Status jetzt selbst. Widerruf (021) und
--    Löschfunktionen (036) laufen nicht als `service_role`.
--    Wartung von Hand (psql als Eigentümer) war von der Ausnahme nie erfasst.
--
-- 2. Neue Sperre: Auf ein finalisiertes oder widerrufenes Zeugnis lässt sich
--    keine Einladung an Vorgesetzte mehr anlegen. Die App prüft das auch
--    (`app/api/certificates/[id]/invite`). Die Datenbank hält es zusätzlich
--    fest, für jeden anderen Weg.
--
-- EINSPIELEN
--
-- nine (advisori01): läuft mit `scripts/migrate.mjs` beim Deploy automatisch.
-- Supabase: wird zur Laufzeit nicht mehr gebraucht, nicht einspielen.
-- Idempotent (create or replace, drop trigger if exists).
-- Die Funktion behält Name und Signatur. Der bestehende Trigger aus 017 ruft
-- darum ab dem Commit die neue Fassung auf, ohne neu angelegt zu werden
-- (gleiches Vorgehen wie 021, 024, 025, 029).
--
-- Unverändert gegenüber 029 ist alles ausser dem entfernten Block
-- «if current_user = 'service_role' then return NEW; end if;».
-- ============================================================================

create or replace function public.enforce_certificate_immutability()
returns trigger
language plpgsql
-- SECURITY INVOKER (Default). Seit 038 ohne Ausnahme für service_role:
-- dieselben Regeln gelten für jede Rolle (Sicherheitstest 24.11.2026, H1).
as $$
begin
  -- Endzustände: 'final' und 'revoked'. Alles andere (draft, pending_manager,
  -- manager_submitted) läuft ungehindert durch — inkl. der Finalisierung selbst
  -- (OLD.status <> 'final'), die hash_version/meta_snapshot/signature erst setzt.
  if OLD.status is distinct from 'final' and OLD.status is distinct from 'revoked' then
    return NEW;
  end if;

  -- Der EINE erlaubte Übergang aus 'final': Widerruf. Alle Siegel-Bestandteile
  -- (hash, canonical_content, hash_version, meta_snapshot, signature,
  -- signing_key_id) UND der gerenderte Text bleiben davon unberührt (Siegel
  -- bleibt versiegelt).
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
    -- 029: der Text, aus dem das PDF rendert, ist Teil des Siegels.
    if NEW.generated_text is distinct from OLD.generated_text then
      raise exception
        'Zeugnis % ist finalisiert: generated_text ist unveraenderlich.', OLD.id
        using errcode = 'check_violation';
    end if;
    if NEW.edited_text is distinct from OLD.edited_text then
      raise exception
        'Zeugnis % ist finalisiert: edited_text ist unveraenderlich.', OLD.id
        using errcode = 'check_violation';
    end if;
    if NEW.formatted_content is distinct from OLD.formatted_content then
      raise exception
        'Zeugnis % ist finalisiert: formatted_content ist unveraenderlich.', OLD.id
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

  -- 029: die drei Quellen des gerenderten Fliesstexts. formatted_content steht
  -- hier, weil der Renderer es ZWISCHEN die Body-Sentinels setzt und damit
  -- genau den Bereich bestimmt, den die Prüfung hasht.
  if NEW.generated_text is distinct from OLD.generated_text then
    raise exception
      'Zeugnis % ist %: generated_text ist unveraenderlich.', OLD.id, OLD.status
      using errcode = 'check_violation';
  end if;

  if NEW.edited_text is distinct from OLD.edited_text then
    raise exception
      'Zeugnis % ist %: edited_text ist unveraenderlich.', OLD.id, OLD.status
      using errcode = 'check_violation';
  end if;

  if NEW.formatted_content is distinct from OLD.formatted_content then
    raise exception
      'Zeugnis % ist %: formatted_content ist unveraenderlich.', OLD.id, OLD.status
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

-- ----------------------------------------------------------------------------
-- 2) Keine Einladung an Vorgesetzte auf ein versiegeltes Zeugnis
-- ----------------------------------------------------------------------------
-- SECURITY DEFINER, damit der Status unabhängig von der Zeilensicherheit des
-- Aufrufers gelesen wird. search_path fest, wie bei allen Definer-Funktionen.
create or replace function public.zeugnio_invitation_not_locked()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_status text;
begin
  select c.status::text into v_status
  from public.certificates c
  where c.id = NEW.certificate_id;

  if v_status in ('final', 'revoked') then
    raise exception
      'Zeugnis % ist %: keine Einladung an Vorgesetzte mehr moeglich.', NEW.certificate_id, v_status
      using errcode = 'check_violation';
  end if;

  return NEW;
end;
$$;

revoke all on function public.zeugnio_invitation_not_locked() from public;

drop trigger if exists zeugnio_invitation_not_locked on public.manager_invitations;
create trigger zeugnio_invitation_not_locked
  before insert on public.manager_invitations
  for each row execute function public.zeugnio_invitation_not_locked();

-- ----------------------------------------------------------------------------
-- Selbstprüfung: Die neue Fassung darf den Ausnahme-Block nicht mehr enthalten.
-- Bricht sonst ab, und die Transaktion von migrate.mjs ändert nichts.
-- ----------------------------------------------------------------------------
do $$
begin
  if position('service_role' in pg_get_functiondef('public.enforce_certificate_immutability()'::regprocedure)) > 0 then
    raise exception '038: enforce_certificate_immutability enthaelt noch eine service_role-Ausnahme.';
  end if;
  if not exists (
    select 1 from pg_trigger
    where tgname = 'zeugnio_invitation_not_locked'
      and tgrelid = 'public.manager_invitations'::regclass
  ) then
    raise exception '038: Trigger zeugnio_invitation_not_locked fehlt.';
  end if;
end;
$$;
