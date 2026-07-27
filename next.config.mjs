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
};

export default nextConfig;
