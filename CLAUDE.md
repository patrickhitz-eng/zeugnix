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
- **Heute:** Vercel + Supabase (Auth, DB, Storage). Migrationen in `supabase/` werden von Hand auf Prod angewendet.
- **Ziel:** nine advisori01. Vorbereitet in `deploy/nine/`:
  - Ablauf: `cutover-reihenfolge.md`.
  - Ausführliches Runbook: `docs/setup-zeugnio-nine.html`.
  - Server-Journal für alle Produkte: `deploy/nine/kommunikation.md`.

## Fallen

- **Rate-Limit-IP:** Seit 6.11.2026 liest `lib/client-ip.ts` zuerst `X-Real-IP` und sonst den **letzten** `X-Forwarded-For`-Eintrag. Der erste Eintrag lässt sich hinter Nginx fälschen, darum nie auf ihn zurückgehen. Test: `npm run test:client-ip`.
- **Vercel-Region:** `vercel.json` pinnt die Funktionen seit 28.10.2026 auf `fra1` (Frankfurt). Die Middleware läuft trotzdem weltweit, und Vercel bleibt ein US-Anbieter. Erst der Umzug zu nine bringt die Verarbeitung in die Schweiz.
- **Datenschutzseite:** Seit 28.10.2026 ohne Platzhalter (PR #39), aber noch nicht juristisch geprüft. Die Empfänger stehen als `RECIPIENTS` in `app/legal/privacy/page.tsx`. Beim Umzug und beim Mailwechsel umstellen (`cutover-reihenfolge.md` 6.0 und 6.3).
- **SPF und DMARC** fehlen (`docs/dns-spf-dmarc.md`).
- **Nie Secrets ausgeben,** auch nicht per `awk` auf `.env.local`. Prüfen geht über `npm run check:env`.

## Hub

- **Steckbrief und Überblick über alle advisori-Projekte:** `~/advisori-hub/projekte/zeugnio.md` · `~/advisori-hub/projekte/_register.md`.
- **Standards:** `~/advisori-hub/standards/` (Stack, Datenschutz, Sicherheit).
