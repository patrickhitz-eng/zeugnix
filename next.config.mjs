/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  poweredByHeader: false,
  // @react-pdf/renderer darf nicht ins Server-Bundle gezogen werden, sonst
  // crasht die PDF-Erzeugung auf Vercel-Serverless. Als externes Node-Modul
  // zur Laufzeit laden:
  serverExternalPackages: ["@react-pdf/renderer"],
  // Die eingebettete Inter-Schrift (public/fonts/*.ttf) wird von der PDF-Route
  // zur Laufzeit von der Platte gelesen (lib/pdf/certificate.tsx). Ohne diesen
  // Include würden die TTFs nicht in die Serverless-Function kopiert und die
  // PDF-Erzeugung auf Vercel bräche ("ENOENT ... Inter-Regular.ttf").
  outputFileTracingIncludes: {
    "/api/certificates/[id]/pdf": ["./public/fonts/*.ttf"],
  },
  experimental: {
    optimizePackageImports: ["clsx", "tailwind-merge"],
  },
  // Statische Sicherheitsheader. Die Content-Security-Policy steht bewusst
  // NICHT hier, sondern in middleware.ts – sie braucht pro Request eine Nonce.
  async headers() {
    return [
      {
        source: "/:path*",
        headers: [
          // VORÜBERGEHEND 5 Minuten statt 2 Jahre und ohne Subdomains, für den
          // Umzug zu nine (deploy/nine/cutover-reihenfolge.md, Schritt 0.3):
          // Zwischen dem Umlegen der A-Records und dem neuen Zertifikat gibt es
          // einige Minuten ohne gültiges Zertifikat. Mit dem Zweijahreswert
          // zeigt jeder Browser, der zeugnio.ch kennt, dann eine Fehlerseite
          // ohne «Trotzdem fortfahren»; jeder Besuch nach diesem Deploy
          // ersetzt den alten Wert. Nach dem Umzug zurück auf
          // "max-age=63072000; includeSubDomains" (Schritt 6.2).
          // Kein `preload`: Preload ist praktisch irreversibel und würde
          // jeden Rollback verunmöglichen.
          {
            key: "Strict-Transport-Security",
            value: "max-age=300",
          },
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "X-Frame-Options", value: "DENY" },
          { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
          {
            key: "Permissions-Policy",
            value: "camera=(), microphone=(), geolocation=(), payment=()",
          },
          // Verhindert, dass Antworten mit Personendaten in fremden
          // Browser-Kontexten landen.
          { key: "Cross-Origin-Opener-Policy", value: "same-origin" },
          { key: "X-DNS-Prefetch-Control", value: "off" },
        ],
      },
      {
        // Schriftdateien ändern sich faktisch nie. Wird doch einmal eine
        // ersetzt, braucht sie einen neuen Dateinamen – sonst sehen Bestands-
        // Browser ein Jahr lang die alte.
        source: "/fonts/web/:path*",
        headers: [
          {
            key: "Cache-Control",
            value: "public, max-age=31536000, immutable",
          },
        ],
      },
      {
        // Der Worker heisst nach jedem pdfjs-Update gleich. Deshalb bewusst
        // KEIN immutable: Ein zwischengespeicherter Worker aus einer anderen
        // Version bricht die Zeugnisprüfung mit "API version does not match
        // Worker version". Revalidierung ist dank ETag billig.
        source: "/pdfjs/:path*",
        headers: [
          { key: "Cache-Control", value: "public, max-age=0, must-revalidate" },
        ],
      },
    ];
  },
};

export default nextConfig;
