# zeugnix.ch – MVP

> Schweizer Arbeitszeugnis-Plattform: erstellen, mit kryptografischem Hash
> absichern, später prüfbar und verständlich machen.

Dieses Repository enthält das **MVP-Skelett** der Plattform: Landingpage,
Auth, Dashboard, Zeugnis-Erstellungs-Workflow, Hash-Engine, Verify-Endpoint,
Analyse-Engine (Stub) und Stripe-Stubs.

---

## Was lauffähig ist

- Landingpage (`/`)
- Magic-Link-Login via Supabase (`/login`, `/auth/callback`)
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

### Schritt 2 – Supabase-Projekt anlegen

1. Auf <https://supabase.com> ein neues Projekt erstellen (Region Frankfurt
   `eu-central-1` empfohlen für DSG-Konformität).
2. SQL-Editor öffnen und die zwei Migrationen nacheinander ausführen:
   - `supabase/001_initial_schema.sql` – legt alle Tabellen, Enums,
     Trigger und RLS-Policies an.
   - `supabase/002_seed_phrases.sql` – seed der Bausteinbibliothek.
3. **Storage Buckets** anlegen (Dashboard → Storage → "New bucket"):
   - `company-logos` (public)
   - `certificates` (private)
   - `uploads` (private)
   - `reports` (private)

### Schritt 3 – Environment Variables setzen

`.env.example` zu `.env.local` kopieren und ausfüllen:

```bash
cp .env.example .env.local
```

Mindestens diese drei Variablen sind Pflicht:

```
NEXT_PUBLIC_SUPABASE_URL=...
NEXT_PUBLIC_SUPABASE_ANON_KEY=...
SUPABASE_SERVICE_ROLE_KEY=...
NEXT_PUBLIC_SITE_URL=http://localhost:3000
```

Die Werte stehen in Supabase unter **Project Settings → API**.

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

## Vercel-Deployment

1. GitHub-Repository pushen.
2. Auf Vercel → "Add New Project" → Repo auswählen.
3. Im Vercel-Dashboard unter **Settings → Environment Variables** alle
   Werte aus `.env.local` setzen, plus `NEXT_PUBLIC_SITE_URL` auf die
   Vercel-Domain (z.B. `https://zeugnix.vercel.app` oder `https://zeugnix.ch`).
4. **Wichtig**: In Supabase unter **Authentication → URL Configuration**
   die Vercel-URL als **Site URL** und **Redirect URLs** eintragen.
5. Deploy starten.

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
- **Supabase** für Auth, Postgres und Storage
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
- pdfjs-dist (Apache 2.0), @react-pdf/renderer (MIT), Supabase (Apache 2.0)
