import type { Metadata } from "next";
import "./globals.css";
import { siteConfig } from "@/lib/site-config";
import { MarketingChrome } from "@/components/marketing/marketing-chrome";

export const metadata: Metadata = {
  metadataBase: new URL(siteConfig.url),
  title: {
    default: `${siteConfig.name} – ${siteConfig.tagline}`,
    template: `%s · ${siteConfig.name}`,
  },
  description: siteConfig.description,
  keywords: [
    "Arbeitszeugnis",
    "Schweizer Arbeitszeugnis",
    "Zwischenzeugnis",
    "HR-Software Schweiz",
    "Echtheitsprüfung",
    "Zeugnisanalyse",
    "Hash",
    "QR-Code",
    "KMU",
    "Treuhänder",
    "Recruiter",
  ],
  authors: [{ name: "zeugnio" }],
  creator: "zeugnio",
  openGraph: {
    type: "website",
    locale: "de_CH",
    url: siteConfig.url,
    title: `${siteConfig.name} – ${siteConfig.tagline}`,
    description: siteConfig.description,
    siteName: siteConfig.name,
  },
  twitter: {
    card: "summary_large_image",
    title: `${siteConfig.name} – ${siteConfig.tagline}`,
    description: siteConfig.description,
  },
  robots: {
    index: true,
    follow: true,
  },
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="de-CH" suppressHydrationWarning>
      <head>
        {/*
         * Schriften liegen self-hosted in public/fonts/web (@font-face in
         * globals.css). Kein Google-Fonts-CDN mehr: Jeder Seitenaufruf hätte
         * sonst die Besucher-IP in die USA getragen. Vorgeladen wird nur der
         * Latin-Schnitt der beiden Schriften, die above the fold sichtbar sind.
         */}
        <link
          rel="preload"
          href="/fonts/web/inter-tight-latin.woff2"
          as="font"
          type="font/woff2"
          crossOrigin="anonymous"
        />
        <link
          rel="preload"
          href="/fonts/web/fraunces-latin.woff2"
          as="font"
          type="font/woff2"
          crossOrigin="anonymous"
        />
      </head>
      <body className="bg-white font-sans text-ink-900 antialiased">
        <MarketingChrome>{children}</MarketingChrome>
      </body>
    </html>
  );
}
