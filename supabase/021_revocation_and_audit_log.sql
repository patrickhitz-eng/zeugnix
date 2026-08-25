-- ============================================================================
-- 021_revocation_and_audit_log.sql  (H2 — Widerruf-Status, H3 — Audit-Log)
-- ============================================================================
-- H2: Ein finalisiertes Zeugnis kann in den Endzustand 'revoked' überführt
--   werden. hash/canonical_content bleiben dabei für IMMER gesperrt (auch beim
--   Widerruf) – nur der Statuswechsel + Widerruf-Metadaten sind erlaubt.
-- H3: Jeder Statuswechsel eines Zeugnisses wird automatisch (Trigger, nicht
--   App-Code) in audit_log protokolliert – wer/wann/was.
--
-- WICHTIG BEIM EINSPIELEN (Supabase SQL-Editor, Projekt „zeugnix"):
--   Ein neuer Enum-Wert kann in Postgres nicht in derselben Transaktion
--   verwendet werden, in der er hinzugefügt wurde. Falls der Editor beim
--   Ausführen der GESAMTEN Datei einen Fehler wie "unsafe use of new value"
--   wirft: zuerst NUR die beiden "alter type" Zeilen unten ausführen,
--   Ergebnis abwarten, DANACH den Rest der Datei separat einspielen.
--
-- Idempotent; manuell in Prod einspielen.
-- Sentinels `[[zeugnix:body-start/end]]` und Theme-IDs bleiben unberührt.
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 1. Enum-Erweiterungen (eigenständige Statements, vor jeder Verwendung)
-- ----------------------------------------------------------------------------
alter type public.certificate_status add value if not exists 'revoked';
alter type public.verify_result add value if not exists 'revoked';

-- ----------------------------------------------------------------------------
-- 2. Widerruf-Spalten auf certificates
-- ----------------------------------------------------------------------------
alter table public.certificates
  add column if not exists revoked_at timestamptz,
  add column if not exists revoked_by_user_id uuid references public.profiles(id) on delete set null,
  add column if not exists revocation_reason text;

-- ----------------------------------------------------------------------------
-- 3. enforce_certificate_immutability() erweitern: final -> revoked erlauben.
--    Nach dem Widerruf ist die Zeile terminal (wie zuvor 'final').
-- ----------------------------------------------------------------------------
create or replace function public.enforce_certificate_immutability()
returns trigger
language plpgsql
-- SECURITY INVOKER (Default, siehe 017): current_user muss der AUFRUFER sein,
-- damit die service_role-Ausnahme greift.
as $$
begin
  -- Endzustände: 'final' und 'revoked'. Alles andere (draft, pending_manager,
  -- manager_submitted) läuft ungehindert durch.
  if OLD.status is distinct from 'final' and OLD.status is distinct from 'revoked' then
    return NEW;
  end if;

  -- Vertraute Infrastruktur (Server mit Service-Key) darf durch.
  if current_user = 'service_role' then
    return NEW;
  end if;

  -- Der EINE erlaubte Übergang aus 'final': Widerruf. hash/canonical_content
  -- bleiben davon unberührt (unten weiterhin gesperrt geprüft).
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

  if NEW.status is distinct from OLD.status then
    raise exception
      'Zeugnis % ist %: status ist unveraenderlich.', OLD.id, OLD.status
      using errcode = 'check_violation';
  end if;

  -- Widerruf-Forensik ist nach dem Widerruf ebenfalls unveraenderlich – schliesst
  -- den Weg, ueber ein direktes UPDATE ausserhalb von revoke_certificate()
  -- revoked_at/revoked_by_user_id/revocation_reason nachtraeglich zu faelschen
  -- (z.B. per erneutem RPC-Aufruf oder direktem PostgREST-Update auf eine
  -- bereits widerrufene Zeile).
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

-- Trigger existiert bereits (017); Funktion wurde per create-or-replace
-- aktualisiert, kein erneutes drop/create des Triggers nötig.

-- ----------------------------------------------------------------------------
-- 4. RPC: revoke_certificate — einziger vorgesehener Weg, ein Zeugnis zu
--    widerrufen. SECURITY INVOKER (nicht definer!), damit RLS und der
--    Immutability-Trigger exakt wie bei einem normalen User-Update greifen.
--
--    WICHTIG: `and status = 'final'` in der WHERE-Klausel ist KEINE Kosmetik –
--    ohne sie koennte jeder Aufrufer mit EXECUTE-Recht (jedes Firmenmitglied,
--    per direktem supabase.rpc()-Aufruf ausserhalb der App) einen NICHT
--    finalisierten Entwurf direkt auf 'revoked' setzen (der App-seitige Check
--    in app/api/certificates/[id]/revoke/route.ts schuetzt nur den App-Weg,
--    nicht den direkten RPC-Weg – exakt die Klasse Luecke, die H1 bereits fuer
--    UPDATEs geschlossen hat). Zusaetzlich verhindert sie ein stilles
--    Ueberschreiben der Widerruf-Forensik bei einem zweiten Aufruf auf eine
--    bereits widerrufene Zeile (0 Zeilen betroffen -> raise exception statt
--    stillem No-Op).
-- ----------------------------------------------------------------------------
create or replace function public.revoke_certificate(
  p_certificate_id uuid,
  p_reason text default null
)
returns void
language plpgsql
security invoker
as $$
begin
  update public.certificates
  set
    status = 'revoked',
    revoked_at = now(),
    revoked_by_user_id = auth.uid(),
    revocation_reason = p_reason
  where id = p_certificate_id
    and status = 'final';

  if not found then
    raise exception
      'Zeugnis % kann nicht widerrufen werden: nicht gefunden, kein Zugriff oder nicht finalisiert.', p_certificate_id
      using errcode = 'check_violation';
  end if;
end;
$$;

-- anon soll diese Funktion nie aufrufen koennen (nur eingeloggte Firmen-
-- mitglieder); authenticated bleibt bewusst erlaubt, siehe RPC-Kommentar oben.
revoke execute on function public.revoke_certificate(uuid, text) from public;
revoke execute on function public.revoke_certificate(uuid, text) from anon;
grant execute on function public.revoke_certificate(uuid, text) to authenticated;

-- ----------------------------------------------------------------------------
-- 5. audit_log — append-only, nur per Trigger beschrieben.
-- ----------------------------------------------------------------------------
create table if not exists public.audit_log (
  id uuid primary key default uuid_generate_v4(),
  certificate_id uuid not null references public.certificates(id) on delete cascade,
  actor_user_id uuid references public.profiles(id) on delete set null,
  action text not null,
  old_status certificate_status,
  new_status certificate_status,
  note text,
  created_at timestamptz not null default now()
);

create index if not exists idx_audit_log_certificate on public.audit_log(certificate_id, created_at desc);

alter table public.audit_log enable row level security;

drop policy if exists "Members can read audit log" on public.audit_log;
create policy "Members can read audit log" on public.audit_log
  for select using (
    exists (
      select 1 from public.certificates c
      join public.companies co on co.id = c.company_id
      where c.id = audit_log.certificate_id
        and (
          co.created_by_user_id = auth.uid()
          or exists (select 1 from public.company_members m where m.company_id = co.id and m.user_id = auth.uid())
        )
    )
  );
-- Bewusst KEINE insert/update/delete-Policy für authenticated/anon: nur die
-- SECURITY DEFINER Trigger-Funktion unten schreibt (analog handle_new_user, 001).

-- ----------------------------------------------------------------------------
-- 6. AFTER-UPDATE-Trigger auf certificates: protokolliert jeden Statuswechsel.
-- ----------------------------------------------------------------------------
create or replace function public.log_certificate_status_change()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_action text;
begin
  if NEW.status is not distinct from OLD.status then
    return NEW;
  end if;

  v_action := case
    when NEW.status = 'final' then 'finalized'
    when NEW.status = 'revoked' then 'revoked'
    else 'status_changed'
  end;

  insert into public.audit_log (certificate_id, actor_user_id, action, old_status, new_status, note)
  values (NEW.id, auth.uid(), v_action, OLD.status, NEW.status, NEW.revocation_reason);

  return NEW;
end;
$$;

drop trigger if exists log_certificate_status_change on public.certificates;
create trigger log_certificate_status_change
  after update on public.certificates
  for each row
  execute function public.log_certificate_status_change();

-- SECURITY DEFINER Trigger-Funktion nicht zusaetzlich als REST-RPC aufrufbar
-- machen (analog handle_new_user, 006_security_hardening.sql). Der Trigger
-- selbst braucht kein EXECUTE-Grant.
revoke execute on function public.log_certificate_status_change() from public;
revoke execute on function public.log_certificate_status_change() from anon;
revoke execute on function public.log_certificate_status_change() from authenticated;
