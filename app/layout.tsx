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
  authors: [{ name: "zeugnix" }],
  creator: "zeugnix",
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
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link
          rel="preconnect"
          href="https://fonts.gstatic.com"
          crossOrigin="anonymous"
        />
        <link
          href="https://fonts.googleapis.com/css2?family=Inter+Tight:wght@300;400;500;600&family=Fraunces:opsz,wght@9..144,300;9..144,400;9..144,500&family=JetBrains+Mono:wght@400;500&display=swap"
          rel="stylesheet"
        />
      </head>
      <body className="bg-white font-sans text-ink-900 antialiased">
        <MarketingChrome>{children}</MarketingChrome>
      </body>
    </html>
  );
}
