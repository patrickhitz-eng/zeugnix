# zeugnix.ch

> Schweizer Arbeitszeugnisse erstellen, mit kryptografischem Hash absichern,
> später überprüfbar und verständlich machen.

Dies ist die **Landingpage** der Plattform zeugnix.ch – als produktionsreifes
Next.js 15 Projekt mit App Router, TypeScript und Tailwind CSS.

## Setup

```bash
# Abhängigkeiten installieren
npm install

# Entwicklungsserver starten (http://localhost:3000)
npm run dev

# Production-Build prüfen
npm run build
npm run start

# Type-Check ohne Emit
npm run typecheck
```

Node.js 20 LTS oder neuer empfohlen.

## Projektstruktur

```
zeugnix/
├── app/
│   ├── layout.tsx              # Root Layout mit Header/Footer & Metadata
│   ├── page.tsx                # Landingpage (komponiert alle Sektionen)
│   ├── globals.css             # Tailwind + CSS-Variablen
│   ├── verify/                 # /verify – Echtheitsprüfung & Analyse
│   ├── pricing/                # /pricing
│   ├── how-it-works/           # /how-it-works
│   ├── for-employers/          # /for-employers
│   ├── for-candidates/         # /for-candidates
│   ├── for-recruiters/         # /for-recruiters
│   ├── legal/                  # Impressum, Datenschutz, AGB
│   └── api/verify/             # API-Stub (für spätere Hash-Logik)
│
├── components/
│   ├── marketing/              # Header, Footer, Mockups, Stub-Pages
│   │   ├── header.tsx
│   │   ├── footer.tsx
│   │   ├── certificate-mockup.tsx   # PDF-Visual mit Hash & QR-Code
│   │   ├── analysis-card.tsx        # Schwebende Score-Karte
│   │   └── stub-page.tsx
│   ├── sections/               # Landingpage-Sektionen
│   │   ├── hero.tsx
│   │   ├── problem.tsx
│   │   ├── solution.tsx        # Dunkler Block, vier Säulen
│   │   ├── workflow.tsx        # 5-Schritte-Erstellung
│   │   ├── verify.tsx          # Mock-UI der /verify-Seite
│   │   ├── audience.tsx        # Vier Zielgruppen
│   │   ├── pricing.tsx         # Vier Preiskarten + Firmenpaket
│   │   ├── badge.tsx           # Verified Certificate Employer
│   │   └── cta.tsx             # Final-CTA mit Hash-Hintergrund
│   └── ui/
│       └── logo.tsx            # SVG-Schild mit Häkchen
│
├── lib/
│   ├── utils.ts                # cn() für Tailwind class merging
│   └── site-config.ts          # Zentrale Konstanten (Preise, Domain, Texte)
│
├── tailwind.config.ts          # Schweizer Farbpalette (ink, petrol, navy)
├── tsconfig.json
├── next.config.mjs
└── package.json
```

## Designsystem

**Farben** (definiert in `tailwind.config.ts`):

- `ink` — Neutrale Skala von Off-White bis Anthrazit (Hauptpalette)
- `petrol` — Akzentfarbe für CTAs, Trust-Signale, Hervorhebungen
- `navy` — Dunkelblau für das Arbeitgeber-Siegel

**Typografie** (via Google Fonts):

- Inter Tight für Body-Text und UI (klar, bürotauglich)
- Fraunces für Display-Headlines (seriös, mit kursivem Akzent für Subhead-Phrasen)
- JetBrains Mono für Hash-Werte und Monospaced-Details

**Designprinzipien**:

- Viel Weissraum, klare Hierarchie
- Feine Hairlines (`border-ink-200`) statt schwerer Linien
- Eine Dark-Sektion (Solution) für visuellen Rhythmus
- Schweizer Rechtschreibung durchgehend (ss statt ß)

## Was als Nächstes ansteht

Diese Landingpage ist **vollständig** und produktionsreif. Damit aus zeugnix.ch
ein Produkt wird, sind folgende Bausteine zu ergänzen (in Reihenfolge der
Priorität):

1. **Supabase-Schema** – Users, Companies, Certificates, Phrase Blocks,
   Verifications, Analyses, Payments
2. **Auth-Flow** – Magic-Link via Supabase Auth + Resend
3. **Hash-Engine** (`lib/hash.ts`) – Kanonisierung des Zeugnisinhalts und
   SHA-256-Berechnung
4. **PDF-Generierung** – via `@react-pdf/renderer` oder Puppeteer-Service
5. **Baustein-Engine** – Datenbank + Renderer für die Zeugnistext-Generierung
6. **Stripe-Integration** – Checkout für die vier Preisstufen
7. **App-Bereich** (`/app/...`) – Dashboard, Zeugnis-Editor, Beurteilungsformular
8. **Verify-Logik** – Upload, Text-Extraktion, Hash-Vergleich, Analyse

## Rechtlicher Hinweis

Das Spec sieht klare Disclaimer vor (unter Verifikation, Analyse und
allgemein). Diese sind im Footer und auf der `/verify`-Seite bereits
integriert.

Vor dem Live-Gang sollte ein arbeitsrechtlich versierter Anwalt die
Datenschutzerklärung und insbesondere die Speicherung von `canonical_content`
prüfen (revDSG-Anforderungen an Personendaten).

---

© zeugnix.ch · Alle Rechte vorbehalten.
