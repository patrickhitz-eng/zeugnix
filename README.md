# zeugnix.ch – MVP

> Schweizer Arbeitszeugnis-Plattform: erstellen, mit kryptografischem Hash
> absichern, später prüfbar und verständlich machen.

Dieses Repository enthält das **MVP-Skelett** der Plattform: Landingpage,
Auth, Dashboard, Zeugnis-Erstellungs-Workflow, Hash-Engine, Verify-Endpoint,
Analyse-Engine (Stub) und Stripe-Stubs.

---

## Was lauffähig ist

- Landingpage (`/`)
- Anmeldung ohne Passwort mit Code oder Link per E-Mail (`/login`, `/auth/link`, `lib/auth/*`)
- Geschützter App-Bereich (`/app/*`)
- Firmenverwaltung
- Zeugnis-Erstellung (Mitarbeiterdaten, Aufgaben, Typ)
- Manager-Beurteilung über Token-Link (kein Account nötig)
- Baustein-basierte Zeugnistext-Generierung
- SHA-256-Finalisierung mit kanonisiertem Inhalt
- PDF-Generierung mit Hash-Block und QR-Code
- Verify-Seite mit Browser-seitiger PDF-Text-Extraktion und Hash-Vergleich
- Klartext-Analyse (regelbasiert, MVP-Stub)
- Stripe-Routen als Stub (echte Bezahlung muss konfiguriert werden)

## Was bewusst NICHT enthalten ist

- Vollständige Bausteinbibliothek (aktuell ~45 Bausteine als Beispiel –
  produktiv sollten 300–500 von einem HR-Profi/Arbeitsrechtler stammen)
- E-Mail-Versand für Manager-Einladungen (Resend ist vorbereitet, aber im
  MVP wird der Einladungslink stattdessen als API-Antwort zurückgegeben)
- LLM-basierte Zeugnis-Analyse (aktuell nur regelbasiert)
- OCR für gescannte Zeugnis-PDFs
- Live-Stripe-Checkout

---

## Setup

### Schritt 1 – Abhängigkeiten installieren

```bash
npm install
```

### Schritt 2 – Datenbank und Daten-API

Die Anwendung spricht nur über PostgREST mit einer eigenen PostgreSQL-Datenbank
(Produktion: advisori01 bei nine.ch). Die Migrationen liegen im Ordner
`supabase/` (der Name ist historisch) und laufen mit `npm run migrate`; die
900er-Reihe ist nur für den eigenen Server und wird von Hand eingespielt.
Aufbau und Betrieb: `docs/setup-zeugnio-nine.html` und `deploy/nine/`.

### Schritt 3 – Environment Variables setzen

`.env.example` zu `.env.local` kopieren und ausfüllen:

```bash
cp .env.example .env.local
```

Pflicht sind mindestens:

```
DATA_API_URL=http://127.0.0.1:3011
DATA_API_JWT_SECRET=...
ZEUGNIO_AUTH_SECRET=...
RESEND_API_KEY=...
NEXT_PUBLIC_SITE_URL=http://localhost:3000
```

`npm run check:env` prüft die Werte (meldet nur Befunde, nie Werte).

### Schritt 4 – Lokal starten

```bash
npm run dev
# → http://localhost:3000
```

### Schritt 5 – Hash-Engine-Tests

```bash
npm run test:hash
```

Es laufen 21 Tests gegen die Kanonisierung und SHA-256-Erzeugung.
Diese sollten bei jedem Code-Change grün bleiben.

---

## Deployment

Produktion läuft auf advisori01 (nine.ch). Ein Merge nach `main` geht nicht von
selbst live; Ablauf und Befehle stehen in `CLAUDE.md` und `deploy/nine/`.

---

## Workflow im Bild

```
┌──────────┐     ┌──────────────┐     ┌───────────────┐     ┌─────────┐
│ HR legt  │────▶│ Manager wird │────▶│ HR generiert  │────▶│ Zeugnis │
│ Zeugnis  │     │ eingeladen,  │     │ Text aus      │     │ wird    │
│ an       │     │ beurteilt    │     │ Beurteilungen │     │ final.  │
└──────────┘     └──────────────┘     └───────────────┘     └────┬────┘
                                                                 │
                                                                 ▼
                                                       ┌─────────────────┐
                                                       │ SHA-256-Hash +  │
                                                       │ PDF + QR-Code   │
                                                       └─────────────────┘
```

---

## Architektur

- **Next.js 15** App Router, Server Components als Default
- **PostgreSQL 17 + PostgREST** auf advisori01, angesprochen mit `@supabase/postgrest-js`
- **Eigene Anmeldung** (Code oder Link per E-Mail, Sitzung in `auth.sessions`)
- **Firmenlogos** auf der Platte des Servers (`ZEUGNIO_UPLOAD_DIR`)
- **Row-Level-Security** auf allen Tabellen
- **Token-basierte Manager-Einladungen** (kein Account für Führungskräfte)
- **Hash-Engine**: deterministische Kanonisierung → SHA-256 (Web Crypto API)
- **PDF**: `@react-pdf/renderer` server-seitig
- **Verify**: PDF-Text-Extraktion mit `pdfjs-dist` im Browser, Hash-Vergleich
  in API-Route gegen `certificates.hash`

---

## Roadmap zum Production-Launch

### Kritisch (vor Live-Schaltung)

- Bausteinbibliothek auf 300+ professionelle Schweizer Formulierungen
  ausbauen (Empfehlung: HR-Profi oder Arbeitsrechtler beauftragen)
- Resend-E-Mail-Templates für Manager-Einladungen
- Stripe-Live-Konfiguration für die vier Bezahlstufen
- DSG-konforme Datenschutzerklärung und AGB (Anwalt einbeziehen)
- Realistische Bewertungs-Tonalitäten (sehr_gut/gut/genuegend/ungenuegend
  je Kategorie und Geschlecht müssen konsistent sein)

### Wichtig

- Logo-Upload mit Storage-Anbindung
- Mehrbenutzer-Verwaltung pro Firma (HR-Team)
- E-Mail-Versand bei finalen Zeugnissen an Mitarbeitende
- LLM-basierte Klartext-Analyse statt Regel-Heuristik
- OCR für gescannte Zeugnisse (Tesseract oder cloud OCR)

### Nice-to-have

- Verified Certificate Employer Badge auf der Webseite des Arbeitgebers
- Recruiter-Bulk-Verifikation
- Auswertungs-Dashboard für HR (Zeugnisse pro Quartal, durchschnittliche
  Bewertungs-Verteilung etc.)
- Mehrsprachigkeit (FR, IT, EN)

---

## Lizenzen / Drittanbieter

- Schriftarten Inter Tight, Fraunces, JetBrains Mono via Google Fonts
- Icons: Inline-SVG, eigene Implementierung
- pdfjs-dist (Apache 2.0), @react-pdf/renderer (MIT), @supabase/postgrest-js (MIT)
