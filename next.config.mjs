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
          // Stufe 1 nach dem Umzug zu nine (deploy/nine/cutover-reihenfolge.md,
          // Schritt 6.2): 7 Tage, weiter ohne Subdomains. Seit 20.11.2026 kommt
          // das Zertifikat von Let's Encrypt über nine (90 Tage, Erneuerung
          // automatisch). Bewiesen ist die Erneuerung erst nach dem ersten
          // Lauf, etwa Mitte Januar 2027. Fällt sie aus und läuft das
          // Zertifikat ab, sperrt HSTS die Seite in jedem Browser, der sie
          // kennt, ohne «Trotzdem fortfahren», und zwar so lange wie max-age.
          // Darum erst nach der ersten Erneuerung Stufe 2:
          // "max-age=63072000; includeSubDomains".
          // Kein `preload`: Preload ist praktisch irreversibel und würde
          // jeden Rollback verunmöglichen.
          {
            key: "Strict-Transport-Security",
            value: "max-age=604800",
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
        // Die Seite hinter dem Link der Anmelde-Mail trägt das Token in der
        // Adresse (/auth/link?t=…). Ohne diese Zeile ginge die volle Adresse
        // beim nächsten Klick als Referer mit, auch an zeugnio selbst, und
        // stünde dann im Zugriffsprotokoll von nginx. Steht nach dem Block
        // "/:path*", weil bei gleichem Kopf der spätere Eintrag gilt.
        source: "/auth/link",
        headers: [{ key: "Referrer-Policy", value: "no-referrer" }],
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
