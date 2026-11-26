import type { Config } from "tailwindcss";

const config: Config = {
  content: [
    "./app/**/*.{js,ts,jsx,tsx,mdx}",
    "./components/**/*.{js,ts,jsx,tsx,mdx}",
  ],
  theme: {
    extend: {
      colors: {
        // Hintergrund der App und der getönten Website-Abschnitte, leicht
        // petrolstichig. Weisse Karten heben sich ab (vorher ink-50/30 =
        // 1.02 : 1, jetzt 1.15 : 1 plus sichtbare Linie).
        canvas: "#E8F1EE",
        // Neutral Schweizer Palette, Kontrast-Kur 26.11.2026:
        // - 50–400 sind leicht zum Petrol hin getönt, damit Grau und Marke
        //   zusammenpassen.
        // - ink-200 ist die Standard-Linie (border-ink-200 an über 100
        //   Stellen). Vorher #E4E6EA = 1.25 : 1 gegen Weiss, Kartenränder
        //   verschwanden. Jetzt 1.51 : 1.
        // - ink-500 ist dunkler (vorher #6B7280), damit Hilfstext auch auf
        //   canvas über 4.5 : 1 bleibt (6.0 auf Weiss, 5.2 auf canvas).
        // Für Text nie heller als ink-500; ink-400 erreicht nur rund 2.6 : 1.
        ink: {
          50: "#F5F8F7",
          100: "#EDF2F0",
          200: "#C4D6D1",
          300: "#A3B8B3",
          400: "#8E9C99",
          500: "#5C6470",
          600: "#4B5563",
          700: "#2C2F36",
          800: "#1A1D23",
          900: "#0E1014",
        },
        // Siegel-Gold: NUR für Versiegeltes und Verifiziertes (Status
        // «Versiegelt», Hash, Prüf-Pill). Nicht als allgemeiner Akzent, sonst
        // verliert es die Bedeutung. Schrift seal-700 auf seal-50 = 5.4 : 1,
        // seal-400 auf petrol-800 = 5.6 : 1.
        seal: {
          50: "#FBF3E2",
          200: "#EED7A6",
          400: "#D9A441",
          700: "#8A5A12",
        },
        // Petrol als Akzentfarbe (HRTech / ComplianceTech). petrol-800 ist
        // seit 26.11.2026 auch Fläche: Kopfzeile, Hero und Schluss-Abschnitt
        // («section-deep»). Darauf Text petrol-50 (11.2 : 1), Nebentext
        // petrol-100 (9.3 : 1), Akzent petrol-200 (6.9 : 1).
        petrol: {
          50: "#E6F4F2",
          100: "#C2E4DF",
          200: "#8FCBC2",
          300: "#5AAFA3",
          400: "#2D9485",
          500: "#0F7A6B",
          600: "#0A6357",
          700: "#084E45",
          800: "#053A33",
          900: "#022620",
        },
        // Dunkelblau für Trust / Siegel
        navy: {
          50: "#EEF2F8",
          100: "#D5DEEC",
          200: "#A9BCDA",
          300: "#7993C0",
          400: "#4F6EA5",
          500: "#2E4F87",
          600: "#1F3D6B",
          700: "#162D50",
          800: "#0F2038",
          900: "#081424",
        },
      },
      fontFamily: {
        sans: [
          "Inter Tight",
          "ui-sans-serif",
          "system-ui",
          "-apple-system",
          "Segoe UI",
          "Helvetica Neue",
          "sans-serif",
        ],
        display: [
          "Fraunces",
          "ui-serif",
          "Georgia",
          "serif",
        ],
        mono: [
          "JetBrains Mono",
          "ui-monospace",
          "SFMono-Regular",
          "monospace",
        ],
      },
      letterSpacing: {
        tightest: "-0.04em",
        tighter: "-0.025em",
      },
      maxWidth: {
        container: "1200px",
      },
      animation: {
        "fade-up": "fade-up 0.6s ease-out forwards",
        "fade-in": "fade-in 0.5s ease-out forwards",
      },
      keyframes: {
        "fade-up": {
          "0%": { opacity: "0", transform: "translateY(12px)" },
          "100%": { opacity: "1", transform: "translateY(0)" },
        },
        "fade-in": {
          "0%": { opacity: "0" },
          "100%": { opacity: "1" },
        },
      },
    },
  },
  plugins: [],
};

export default config;
