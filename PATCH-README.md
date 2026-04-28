# Patch: Logo-Upload + PDF-Generierung Fixes

Behebt zwei Probleme aus dem letzten Test:

## 1. Logo-Upload schlug fehl
**Fehler:** "new row violates row-level security policy"
**Ursache:** Storage-Bucket "company-logos" hatte keine RLS-Policy für Upload
**Fix:** SQL 006_storage_policies.sql in Supabase ausführen (siehe unten)

## 2. PDF-Generierung scheiterte mit React Error #31
**Ursache:** @react-pdf/renderer ist intolerant gegenüber zusammengesetzten
JSX-Expressions in Text-Komponenten (z.B. `<Text>Hallo {x} Welt</Text>` mit
mehreren Variablen). Solche Stellen wurden in saubere Strings umgewandelt.
**Fix:** Datei lib/pdf/certificate.tsx ersetzen

## Vorgehen

### Schritt 1: SQL für Storage-Policies

1. `006_storage_policies.sql` öffnen, Inhalt kopieren
2. Supabase Dashboard → SQL Editor → + New query
3. Einfügen → Run
4. Erwartet: "Success. No rows returned"

WICHTIG: Bevor das SQL läuft, muss der Bucket "company-logos" existieren.
Falls er noch nicht da ist:
- Supabase Dashboard → Storage → New bucket
- Name: company-logos
- Public: ON  (wichtig: muss public sein, damit der PDF-Renderer das Logo laden kann)

### Schritt 2: PDF-Datei ersetzen

1. Im Repo: `lib/pdf/certificate.tsx` durch die Version aus diesem Patch ersetzen
2. Commit: `fix: pdf-rendering und logo-upload`
3. Push origin

Vercel deployt automatisch.

### Schritt 3: Test

1. Logo nochmal hochladen → sollte funktionieren
2. Zeugnis finalisieren (mit Signatur-Bestätigung) → PDF herunterladen → öffnet sich ohne Fehler
