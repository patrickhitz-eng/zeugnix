# Hook des advisori01-Kits: spielt die offenen Migrationen ein. Laeuft erst, nachdem das Kit
# einen Auszug angelegt hat. Scheitert der Auszug, laeuft dieser Hook nicht.
#
# migrate.mjs spielt jede Datei in einer eigenen Transaktion ein und merkt sich in
# public.schema_migrations, was schon drin ist. Dateien ab 900 und 007 laufen hier nie (Kopf von
# scripts/migrate.mjs).
#
# Bis Cutover A lesen und schreiben die Daten noch bei Supabase. Eine neue Migration gehoert in
# dieser Zeit darum an zwei Orte: hierher (nine) und von Hand in den Supabase-SQL-Editor.
set -euo pipefail

node --env-file=.env scripts/migrate.mjs
