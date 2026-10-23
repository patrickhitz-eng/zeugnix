-- ============================================================================
-- 029_certificate_text_immutability.sql
-- Die Spalten, aus denen das PDF seinen Fliesstext rendert, mit ins Siegel.
-- ============================================================================
-- BEFUND: `public.enforce_certificate_immutability()` (017, zuletzt neu
--   definiert in 025) sperrt für eine finale/widerrufene Zeile die Siegel-
--   Bestandteile hash, canonical_content, hash_version, meta_snapshot,
--   signature, signing_key_id, status sowie die Widerruf-Forensik. NICHT
--   gesperrt waren die drei Spalten, aus denen das ausgelieferte Dokument
--   seinen Fliesstext bezieht:
--
--     generated_text     – der generierte Body (Fallback-Quelle)
--     edited_text        – die manuelle Überarbeitung; gewinnt über
--                          generated_text und ist die HASH-QUELLE
--                          (finalize/route.ts: `cert.edited_text ||
--                          cert.generated_text`)
--     formatted_content  – das Tiptap-JSON; gewinnt im Renderer über BEIDE
--
--   Zur dritten Spalte, denn sie ist die unauffälligste und gleichzeitig die
--   wichtigste: lib/pdf/certificate.tsx:250-258 setzt ZWISCHEN die Body-
--   Sentinels `formattedBody ? formattedBody : paragraphs`. Ist
--   formatted_content gesetzt, rendert das PDF also ausschliesslich daraus –
--   der Klartext aus edited_text/generated_text erscheint dann gar nicht im
--   Dokument. Die Prüfung schneidet genau diesen Bereich aus dem PDF heraus
--   (extractBodyBetweenSentinels) und hasht ihn. formatted_content ist damit
--   nicht „nur Formatierung", sondern der tatsächliche Hash-Gegenstand.
--   Dass app/api/certificates/[id]/content/route.ts edited_text server-
--   autoritativ aus dem JSON projiziert (`tiptapToPlainText`), schützt nur den
--   Weg DURCH die App; über PostgREST lässt sich formatted_content ohne diese
--   Projektion schreiben.
--
-- WARUM DAS ZÄHLT: Nach der Finalisierung existieren zwei Fassungen des Texts –
--   die eingefrorene (canonical_content, gesperrt) und die lebende
--   (generated_text/edited_text/formatted_content, offen). Das ausgelieferte
--   PDF entsteht aus der lebenden. Das ist KEINE Fälschung: hash und
--   canonical_content bleiben gesperrt, die Prüfung schlägt also fehl. Es ist
--   ein Integritätsproblem – ausgestelltes Dokument und versiegelter Datensatz
--   können auseinanderlaufen, ohne dass das System es merkt, und die
--   angestellte Person hält am Ende ein Zeugnis, das bei der Prüfung durchfällt.
--
--   Der Weg dorthin ist offen, weil die RLS-Policy „Members can manage
--   certificates" (001) `for all using (Firmenmitglied)` OHNE `with check` ist:
--   ein Firmenmitglied kann mit seinem normalen `authenticated`-JWT direkt per
--   PostgREST an der App vorbei schreiben. Die App-seitigen Sperren
--   (isCertificateLocked in content/ und text/route.ts) leben nur im Code.
--
-- LÖSUNG: Die Funktion per `create or replace` neu definieren – Fassung aus 025
--   unverändert, zusätzlich generated_text, edited_text und formatted_content
--   gesperrt. In BEIDEN Zweigen: im erlaubten Übergang final -> revoked ebenso
--   wie im allgemeinen Zweig. Ein Widerruf ist ein reiner Statuswechsel und darf
--   keine Textänderung mitschmuggeln.
--
-- ----------------------------------------------------------------------------
-- WAS HIER BEWUSST NICHT GESPERRT WIRD
-- ----------------------------------------------------------------------------
-- Die Grenze liegt dort, wo eine Spalte den INHALT des ausgelieferten Dokuments
-- bestimmt. Was daraus abgeleitet oder nur transportiert wird, bleibt offen,
-- damit bestehende Abläufe nicht brechen (dieselbe Linie wie 017):
--
--   * pdf_storage_path, qr_code_url – Transport/Ablage, kein Inhalt. Beide sind
--     aus Hash und ID jederzeit neu herleitbar (017-Entscheid, unverändert).
--   * archived_at – reine Sichtbarkeits-Verwaltung in der Liste.
--   * text_last_edited_at / text_last_edited_by_user_id – Metadaten zur
--     Bearbeitung. Sie stehen in keinem PDF und speisen keinen Hash. Dass sie
--     nach der Finalisierung noch änderbar sind, kostet höchstens
--     Nachvollziehbarkeit, nicht Integrität.
--
--   * signatory_1_name/_role, signatory_2_name/_role, signature_mode –
--     AUSGELASSEN, aber ausdrücklich NICHT „unkritisch". Das ist ein zweites
--     Loch derselben Art, nur anders geformt, und es gehört nicht in diese
--     Migration:
--       – Das PDF rendert die SICHTBAREN Unterzeichner aus den lebenden Spalten
--         (resolveSignatories über cert/company), bettet als Meta-Block aber den
--         beim Finalisieren eingefrorenen meta_snapshot ein. Ändert jemand
--         signatory_1_name einer finalen v2-Zeile, bleibt der v2-Hash intakt
--         (der Meta-Block ist eingefroren und gesperrt) – die Prüfung meldet
--         weiter „verified".
--       – Verschärfend: app/api/verify/route.ts:213 zeigt dem Prüfenden die
--         Unterzeichner ebenfalls aus den LEBENDEN Spalten. Papier und
--         Prüfseite stimmen dann beide überein, nur eben mit dem geänderten
--         Namen. Niemand vergleicht den eingebetteten Meta-Block gegen den
--         sichtbaren Unterschriftenblock.
--       – Dieses Loch zu schliessen ist deshalb keine Trigger-Zeile, sondern
--         eine Produktentscheidung: entweder werden die Spalten gesperrt UND
--         die Prüfseite liest aus meta_snapshot statt aus den lebenden
--         Spalten, oder die Unterzeichner-Freigaben (certificate_signoffs, 020)
--         dürfen die Spalten weiterhin anfassen. Das ist der von 017 bereits
--         vorgemerkte eigene Schritt („Achse 1 / Siegel schliessen"), und es
--         braucht eine Entscheidung dazu, nicht eine stillschweigende Sperre
--         mitten in dieser Migration.
--
-- ----------------------------------------------------------------------------
-- EINSPIELEN: was dabei passiert
-- ----------------------------------------------------------------------------
-- Der TRIGGER wird NICHT neu erstellt und muss es nicht. `create trigger` aus
-- 017:87 bindet den Trigger an die Funktion über deren Identität (Name +
-- Signatur), nicht an den Funktionskörper. `create or replace function` behält
-- Name, Signatur und OID und tauscht nur den Körper – der bestehende Trigger
-- ruft ab dem Commit dieser Migration die neue Fassung auf. Genau so sind 021,
-- 024 und 025 vorgegangen (025 vermerkt es ausdrücklich). Ein erneutes
-- `drop trigger ... / create trigger ...` wäre nicht falsch, würde aber ein
-- kurzes ACCESS EXCLUSIVE auf certificates nehmen, ohne etwas zu ändern.
--
-- Nach dem Einspielen ist also GENAU EINS anders: derselbe Trigger weist für
-- finale/widerrufene Zeilen zusätzlich Änderungen an generated_text,
-- edited_text und formatted_content ab. Bestehende Daten werden nicht berührt,
-- kein Backfill, keine Sperre auf der Tabelle über den Funktionstausch hinaus.
--
-- Idempotent; manuell in Prod einspielen (SQL-Editor, Projekt „zeugnix").
-- Sentinels `[[zeugnix:body-start/end]]`, `[[zeugnix:meta-*]]`,
-- `[[zeugnix:sig-*]]` und Theme-IDs bleiben unberührt.
-- ============================================================================

create or replace function public.enforce_certificate_immutability()
returns trigger
language plpgsql
-- SECURITY INVOKER (Default, siehe 017/021/025): current_user muss der AUFRUFER
-- sein, damit die service_role-Ausnahme greift. Mit SECURITY DEFINER wäre
-- current_user der Funktions-Owner und die Ausnahme würde für JEDEN greifen.
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

-- Trigger existiert bereits (017:87); Funktion per create-or-replace
-- aktualisiert. Siehe „EINSPIELEN" im Kopf, warum das genügt.

-- ----------------------------------------------------------------------------
-- VERIFIKATION (optional, im SQL-Editor nach dem Einspielen auszuführen).
-- Läuft als postgres (current_user='postgres' -> Trigger greift wie bei
-- 'authenticated'). Mutiert NICHTS: die blockierten Updates werden
-- zurückgerollt, der positive Test schreibt denselben Wert zurück.
-- ----------------------------------------------------------------------------
-- do $$
-- declare
--   v_final uuid;
--   v_draft uuid;
-- begin
--   select id into v_final from public.certificates where status = 'final' limit 1;
--   select id into v_draft from public.certificates where status <> 'final' limit 1;
--
--   if v_final is not null then
--     -- 1) NEGATIV: die drei Textspalten einer finalen Zeile -> MUSS scheitern.
--     begin
--       update public.certificates
--          set generated_text = coalesce(generated_text, '') || ' x'
--        where id = v_final;
--       raise exception 'TEST FEHLGESCHLAGEN: generated_text-Update auf finaler Zeile war moeglich';
--     exception when check_violation then
--       raise notice 'OK: generated_text-Update auf finaler Zeile wurde blockiert';
--     end;
--
--     begin
--       update public.certificates
--          set edited_text = coalesce(edited_text, '') || ' x'
--        where id = v_final;
--       raise exception 'TEST FEHLGESCHLAGEN: edited_text-Update auf finaler Zeile war moeglich';
--     exception when check_violation then
--       raise notice 'OK: edited_text-Update auf finaler Zeile wurde blockiert';
--     end;
--
--     begin
--       update public.certificates
--          set formatted_content = '{"type":"doc","content":[]}'::jsonb
--        where id = v_final;
--       raise exception 'TEST FEHLGESCHLAGEN: formatted_content-Update auf finaler Zeile war moeglich';
--     exception when check_violation then
--       raise notice 'OK: formatted_content-Update auf finaler Zeile wurde blockiert';
--     end;
--
--     -- Gegenprobe: das Siegel aus 017/024/025 haelt weiterhin.
--     begin
--       update public.certificates set hash = coalesce(hash, '') || 'x' where id = v_final;
--       raise exception 'TEST FEHLGESCHLAGEN: hash-Update auf finaler Zeile war moeglich';
--     exception when check_violation then
--       raise notice 'OK: hash-Update auf finaler Zeile wurde blockiert';
--     end;
--
--     -- 2) POSITIV: nicht-kritische Spalte finaler Zeile -> DARF durchgehen.
--     update public.certificates set qr_code_url = qr_code_url where id = v_final;
--     raise notice 'OK: nicht-kritische Spalte finaler Zeile bleibt aenderbar';
--   else
--     raise notice 'HINWEIS: keine finale Zeile zum Testen vorhanden';
--   end if;
--
--   -- 3) POSITIV: eine nicht-finale Zeile bleibt voll aenderbar – auch im Text,
--   --    sonst waere der normale Bearbeitungs-Workflow gebrochen.
--   if v_draft is not null then
--     update public.certificates
--        set edited_text = edited_text,
--            generated_text = generated_text,
--            formatted_content = formatted_content
--      where id = v_draft;
--     raise notice 'OK: nicht-finale Zeile ist im Text normal aenderbar';
--   end if;
-- end $$;

-- ----------------------------------------------------------------------------
-- ERKENNUNG BESTEHENDER DRIFT (optional, nur lesend, mutiert nichts).
-- ----------------------------------------------------------------------------
-- Findet finale/widerrufene Zeilen, deren lebender Klartext nicht mehr zum
-- eingefrorenen canonical_content passt – also Zeugnisse, bei denen die Lücke
-- vor dieser Migration schon zugeschlagen hat. Das Ergebnis ist eine Liste zur
-- Sichtprüfung von Hand, kein Urteil.
--
-- Die Kanonisierung bildet lib/hash/canonicalize.ts (canonicalizeForHash) in
-- SQL nach, in derselben Reihenfolge:
--   1. normalizeSpecialChars – NBSP-Varianten -> Space; typografische
--      Anführungszeichen -> ASCII; en/em-dash -> '-'; Ellipsis -> '...'; NFC.
--      Die Zeichenklassen nutzen Postgres-Regex-Escapes (\uXXXX), damit in
--      dieser Datei keine unsichtbaren Zeichen stehen.
--      Mit in Schritt 1 gezogen sind alle übrigen Unicode-Spaces, die JS-`\s`
--      matcht (U+1680, U+2000–U+200A, U+2028, U+2029, U+205F, U+3000, U+FEFF).
--      Ob Postgres' `\s` sie ebenfalls als Whitespace zählt, hängt am ctype der
--      Datenbank; durch die Vorstufe ist das Ergebnis unabhängig davon.
--   2. alle Whitespace-Läufe -> ein Space
--   3. Trennstrich vor Whitespace entfernen (`- ` -> '')
--   4. trim
--
-- Body-Quelle wie in finalize/route.ts und pdf/route.ts:
-- `edited_text || generated_text`. In JS greift `||` auch beim Leerstring,
-- daher `nullif(..., '')` statt `coalesce` allein.
--
-- ZWEI PIPELINES, mit Absicht: Regel 3 (Silbentrennung) kam erst mit Commit
-- d27e9c4 dazu. Zeugnisse, die davor finalisiert wurden, tragen ein
-- canonical_content OHNE diese Regel. Ein Vergleich gegen nur die heutige
-- Pipeline würde jedes alte Zeugnis, dessen Text ein "- " enthält, als
-- Manipulation melden. Gemeldet wird daher nur, was zu KEINER der beiden
-- Fassungen passt.
--
-- GRENZEN, ausdrücklich:
--   * formatted_content wird NICHT geprüft. Die Datenbank hält keinen Canonical
--     des Tiptap-JSON, und die Reihenfolge der Textknoten ist aus jsonb nicht
--     verlässlich zu rekonstruieren. Wer NUR formatted_content ändert, lässt
--     edited_text unberührt – diese Abfrage meldet die Zeile dann als sauber,
--     obwohl das PDF abweicht. Sie deckt den Klartext-Pfad auf, nicht den
--     Rich-Text-Pfad; letzteren schützt ab jetzt der Trigger.
--   * Zeugnisse von vor Commit 645e62b (gemeinsame Body-Hash-Pipeline) können
--     aus demselben Grund legitim abweichen – dort war die Pipeline noch anders.
--     `finalized_at` in der Ausgabe hilft, solche Fälle zu erkennen.
--   * Ein exotisches Steuerzeichen, das Postgres als Whitespace zählt und JS
--     nicht (z. B. U+0085), würde einen falschen Treffer erzeugen. Das fällt bei
--     der Sichtprüfung der beiden Textanfänge sofort auf.
--
-- Benötigt `normalize()` (PostgreSQL 13+; Prod läuft auf 17).
-- ----------------------------------------------------------------------------
-- with src as (
--   select
--     c.id,
--     c.status,
--     c.finalized_at,
--     c.canonical_content,
--     -- Schritt 1 + 2: Sonderzeichen, NFC, Whitespace-Läufe.
--     regexp_replace(
--       normalize(
--         regexp_replace(
--           regexp_replace(
--             regexp_replace(
--               regexp_replace(
--                 regexp_replace(
--                   coalesce(nullif(c.edited_text, ''), c.generated_text, ''),
--                   '[\u00A0\u202F\u2007\u1680\u2000-\u200A\u2028\u2029\u205F\u3000\uFEFF]', ' ', 'g'
--                 ),
--                 '[\u2018\u2019\u201A\u201B]', '''', 'g'
--               ),
--               '[\u201C\u201D\u201E\u201F]', '"', 'g'
--             ),
--             '[\u2013\u2014]', '-', 'g'
--           ),
--           '\u2026', '...', 'g'
--         ),
--         NFC
--       ),
--       '\s+', ' ', 'g'
--     ) as collapsed
--   from public.certificates c
--   where c.status in ('final', 'revoked')
--     and c.canonical_content is not null
-- ),
-- canon as (
--   select
--     id, status, finalized_at, canonical_content,
--     -- heutige Pipeline (mit Silbentrennungs-Regel)
--     btrim(replace(collapsed, '- ', '')) as live_canonical,
--     -- Pipeline vor d27e9c4 (ohne Silbentrennungs-Regel)
--     btrim(collapsed)                    as live_canonical_legacy
--   from src
-- )
-- select
--   id,
--   status,
--   finalized_at,
--   length(canonical_content)    as laenge_versiegelt,
--   length(live_canonical)       as laenge_lebend,
--   left(canonical_content, 160) as versiegelt_anfang,
--   left(live_canonical, 160)    as lebend_anfang
-- from canon
-- where canonical_content not in (live_canonical, live_canonical_legacy)
-- order by finalized_at desc nulls last;
