-- Hook des advisori01-Kits: im Restore-Test (~/kit/restore-test.sh zeugnio), in der
-- zurueckgespielten Wegwerf-Datenbank. Die letzte Zeile muss «t» sein.
--
-- Geprueft wird, dass die Spalten da sind, an denen die Echtheitspruefung haengt. Fehlen sie,
-- laesst sich nach einem Zurueckspielen kein ausgestelltes Zeugnis mehr pruefen.
select count(*) = 3
from information_schema.columns
where table_schema = 'public'
  and table_name = 'certificates'
  and column_name in ('hash', 'signature', 'signing_key_id');
