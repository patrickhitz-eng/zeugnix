# zeugnio.ch (Repo «zeugnix»)

Schweizer Arbeitszeugnis-Plattform. HR erstellt das Zeugnis, die vorgesetzte Person bewertet per Token-Link, und der Text entsteht aus Satzbausteinen. Beim Finalisieren wird er kanonisiert, mit SHA-256 und Ed25519 versiegelt und als PDF mit Hash und QR ausgegeben.

**Namen:** Produkt «zeugnio», Repo und Paket «zeugnix», Env-Präfix `ZEUGNIO_*`.

## Befehle

- `npm run dev`. `predev` kopiert dabei den pdfjs-Worker.
- `npm run build`. Prebuild führt `test:themes`, `test:dataapi` und `copy:pdfjs` aus, Postbuild `check:nonce`.
- `npm run typecheck` · `npm run check:env` (meldet nur Befunde, nie Werte) · `npm run migrate`.
- Einzeltests: `npm run test:hash`, `test:signing`, `test:pdf-roundtrip`, `test:tasks` … Die Tests sind `tsx`-Skripte; es gibt keinen Runner und kein CI.

## Git und Deploy

- **Remotes:** `origin` = `patrickhitz-eng/zeugnix` mit PR-Fluss, `fork` = `silvinio0374/zeugnix_fork_silvan`.
  - Änderungen über einen Branch und einen PR.
  - Nie `git add -A`.
- **Seit 20.11.2026:** Produktion auf nine advisori01 (eigenes Postgres 17 + PostgREST, Next.js über pm2/nginx). Seit 23.11. (Cutover B, PR #91) meldet zeugnio selbst an (Code oder Link per Mail über Resend). Seit B2 (Branch `feat/b2-supabase-entfernen`) enthält der Code keinen Supabase-Weg mehr: Datenclient ist `@supabase/postgrest-js` direkt auf `DATA_API_URL`, den Schalter `ZEUGNIO_AUTH` und die Variablen `NEXT_PUBLIC_SUPABASE_*`/`SUPABASE_SERVICE_ROLE_KEY` gibt es nicht mehr. Offen: Supabase-Projekt löschen (Patrick), danach erst Datenschutz-Schalter live. Vercel ist seit 21.11. pausiert und seit 23.11. vom Repo getrennt.
  - **Ein Merge nach `main` geht nicht von selbst live.** Deploy auf advisori01 als `www-zeugnio`: `~/kit/deploy.sh zeugnio main`.
  - Migrationen ab 900 werden von Hand auf advisori01 eingespielt (`deploy/nine/`). Der Ordner heisst aus historischen Gründen weiter `supabase/`.
- **Umzug:** in `deploy/nine/`:
  - Ablauf: `cutover-reihenfolge.md`.
  - Ausführliches Runbook: `docs/setup-zeugnio-nine.html`.
  - Server-Journal für alle Produkte: `deploy/nine/kommunikation.md`.

## Fallen

- **Rate-Limit-IP:** Seit 6.11.2026 liest `lib/client-ip.ts` zuerst `X-Real-IP` und sonst den **letzten** `X-Forwarded-For`-Eintrag. Der erste Eintrag lässt sich hinter Nginx fälschen, darum nie auf ihn zurückgehen. Test: `npm run test:client-ip`.
- **`NEXT_PUBLIC_SITE_URL`** wird beim Build eingefroren (QR-Codes, Einladungslinks). Auf advisori01 steht sie in `~/zeugnio/shared/.env` auf `https://zeugnio.ch`. Nach einer Änderung neu deployen.
- **Datenschutzseite:** Seit 28.10.2026 ohne Platzhalter (PR #39), aber noch nicht juristisch geprüft. Die Empfänger stehen als `RECIPIENTS` in `app/legal/privacy/page.tsx`. Die Umzugsschalter stehen in `lib/legal/hosting-phase.ts`. `ANMELDUNG` steht seit B2 auf `nine` (erst live, wenn das Supabase-Projekt gelöscht ist). Beim Mailwechsel (6.3) `MAIL` nachführen.
- **SPF und DMARC** fehlen (`docs/dns-spf-dmarc.md`).
- **Nie Secrets ausgeben,** auch nicht per `awk` auf `.env.local`. Prüfen geht über `npm run check:env`.

## Hub

- **Steckbrief und Überblick über alle advisori-Projekte:** `~/advisori-hub/projekte/zeugnio.md` · `~/advisori-hub/projekte/_register.md`.
- **Standards:** `~/advisori-hub/standards/` (Stack, Datenschutz, Sicherheit).
