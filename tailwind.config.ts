import type { Config } from "tailwindcss";

const config: Config = {
  content: [
    "./app/**/*.{js,ts,jsx,tsx,mdx}",
    "./components/**/*.{js,ts,jsx,tsx,mdx}",
  ],
  theme: {
    extend: {
      colors: {
        // Neutral Schweizer Palette
        ink: {
          50: "#F8F9FA",
          100: "#F1F2F4",
          200: "#E4E6EA",
          300: "#C9CDD3",
          400: "#9AA0A8",
          500: "#6B7280",
          600: "#4B5563",
          700: "#2C2F36",
          800: "#1A1D23",
          900: "#0E1014",
        },
        // Petrol als Akzentfarbe (HRTech / ComplianceTech)
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
