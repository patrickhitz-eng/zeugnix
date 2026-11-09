-- Hook des advisori01-Kits: bei jeder Sicherung (~/kit/db-backup.mjs zeugnio).
--
-- Eine Zeile pro ausgestelltem Zeugnis, mit genau den Feldern, an denen die Echtheitspruefung
-- haengt. Nach einem Zurueckspielen ist damit belegbar, WELCHE Zeugnisse es gab. Die Zeugnisse
-- selbst holt das nicht zurueck, dafuer braucht es den Auszug.
--
-- Das Kit schickt die Datei mit psql -c, darum genau EINE Anweisung. Spaltennamen gegen
-- supabase/024_hash_version_meta.sql und 025_certificate_signature.sql geprueft:
-- hash_version, signature, signing_key_id (nicht signature_key_id).
copy (
  select id, hash, hash_version, signature, signing_key_id, status, finalized_at, revoked_at
  from public.certificates
  where status in ('final', 'revoked')
  order by finalized_at nulls last, id
) to stdout with (format csv, header true)
