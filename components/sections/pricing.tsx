import Link from "next/link";
import { cn } from "@/lib/utils";
import { siteConfig } from "@/lib/site-config";
import { CompanyPackageCard } from "@/components/sections/company-package";

// Während der Beta ist die Echtheitsprüfung faktisch kostenlos (Stripe ist noch
// ein Stub). Der reguläre Preis wird als künftiger Preis ausgewiesen, NICHT
// durchgestrichen neben "Kostenlos" (PBV Art. 16: eine Vergleichspreis-
// Auszeichnung setzt voraus, dass der höhere Preis tatsächlich verlangt
// wurde — das war während der unbefristeten Beta nie der Fall).
// Was noch nicht gebaut ist, steht nicht in den Feature-Listen (UWG Art. 3
// Abs. 1 lit. b) – etwa PDF-Berichte zu Prüfung oder Analyse. Ein Tier, das
// es noch nicht gibt, bekommt `comingSoon:true` ("kommt bald").
// `beta:false` ohne comingSoon = dauerhaft gratis.
const tiers = [
  {
    name: "Erstellen",
    price: "CHF 0",
    regularPrice: null as string | null,
    sub: "Unbegrenzt kostenlos",
    beta: false,
    comingSoon: false,
    cta: siteConfig.signup.cta.label,
    href: siteConfig.signup.cta.href,
    features: [
      "Schweizer Arbeitszeugnis erstellen",
      "Führungskraft per Magic Link einladen",
      "Firmenlogo hochladen",
      "PDF-Generierung mit Hash und QR-Code",
      "Prüfbar über zeugnio.ch/verify",
    ],
    featured: false,
    badge: null as string | null,
  },
  {
    name: "Echtheit prüfen",
    price: "CHF 19.90",
    regularPrice: "CHF 19.90" as string | null,
    sub: "Pro Prüfung",
    beta: true,
    comingSoon: false,
    cta: "Echtheit prüfen",
    href: "/verify",
    features: [
      "SHA-256-Hash neu berechnen",
      "Abgleich mit registriertem Original",
      "Manipulation erkennen",
    ],
    featured: false,
    badge: null as string | null,
  },
  {
    name: "Premium-Prüfung",
    price: "CHF 39.90",
    regularPrice: "CHF 39.90" as string | null,
    sub: "Echtheit + Analyse",
    beta: true,
    comingSoon: false,
    cta: "Premium starten",
    href: "/verify?tier=premium",
    features: [
      "Vollständige Echtheitsprüfung",
      "Klartext-Zeugnisanalyse",
      "Stärken, schwächere Signale, Auffälligkeiten",
      "Schlussformel-Analyse",
    ],
    featured: true,
    badge: "Empfohlen für Bewerbungen" as string | null,
  },
  {
    name: "Zeugnisanalyse",
    price: "CHF 29.90",
    regularPrice: "CHF 29.90" as string | null,
    sub: "Pro Zeugnis",
    beta: true,
    comingSoon: false,
    cta: "Zeugnis analysieren",
    href: "/verify?tier=analyse",
    features: [
      "Formulierungen auswerten",
      "Gesamturteil und Vertrauensniveau",
      "Stärken und Schwächen",
      "Schlussformel-Analyse",
    ],
    featured: false,
    badge: null as string | null,
  },
];

export function PricingSection() {
  return (
    <section
      id="pricing"
      className="border-b border-ink-200 bg-white py-24 scroll-mt-20"
    >
      <div className="container-zx">
        <div className="grid items-end gap-6 sm:grid-cols-2 sm:gap-12">
          <div>
            <div className="eyebrow">Preise</div>
            <h2 className="headline-display mt-3 text-[32px] leading-[1.15] sm:text-[40px]">
              Faire, transparente Preise.
            </h2>
          </div>
          <p className="text-[15px] leading-relaxed text-ink-600 sm:text-right">
            Die Erstellung ist kostenlos und bleibt es. Prüfung und Analyse sind
            <strong className="font-medium text-ink-800">
              {" "}
              während der Beta ebenfalls kostenlos
            </strong>{" "}
            – die regulären Preise gelten erst nach der Beta.
          </p>
        </div>

        <div className="mt-14 grid gap-3 lg:grid-cols-4">
          {tiers.map((tier) => (
            <div
              key={tier.name}
              className={cn(
                "relative flex flex-col rounded-xl border bg-white p-6 transition-shadow",
                tier.featured
                  ? "border-petrol-600 shadow-xl shadow-petrol-900/10 lg:scale-[1.015]"
                  : "border-ink-200 hover:shadow-md hover:shadow-ink-900/5",
              )}
            >
              {tier.featured && (
                <span className="absolute -top-2.5 left-6 rounded-full bg-petrol-700 px-2.5 py-1 text-[10px] font-medium uppercase tracking-wider text-white">
                  {tier.badge}
                </span>
              )}

              <div>
                <div className="flex items-center gap-2">
                  <h3 className="text-[14px] font-medium tracking-tight text-ink-900">
                    {tier.name}
                  </h3>
                  {tier.beta && (
                    <span className="rounded-full bg-petrol-50 px-2 py-0.5 text-[10px] font-medium uppercase tracking-wider text-petrol-700 ring-1 ring-inset ring-petrol-600/20">
                      Beta
                    </span>
                  )}
                  {tier.comingSoon && (
                    <span className="rounded-full bg-ink-100 px-2 py-0.5 text-[10px] font-medium uppercase tracking-wider text-ink-500 ring-1 ring-inset ring-ink-300/40">
                      Bald
                    </span>
                  )}
                </div>
                {tier.comingSoon ? (
                  <>
                    <div className="mt-3 font-display text-[24px] font-light leading-none tracking-tight text-ink-400">
                      Kommt bald
                    </div>
                    <p className="mt-1 text-[12px] text-ink-500">
                      In Vorbereitung · regulär {tier.regularPrice}
                    </p>
                  </>
                ) : tier.beta ? (
                  <>
                    <div className="mt-3 font-display text-[28px] font-light leading-none tracking-tight text-ink-900">
                      Kostenlos
                    </div>
                    <p className="mt-1 text-[12px] text-ink-500">
                      während der Beta · regulär {tier.regularPrice} nach der
                      Beta
                    </p>
                  </>
                ) : (
                  <>
                    <div className="mt-3 font-display text-[28px] font-light leading-none tracking-tight text-ink-900">
                      {tier.price}
                    </div>
                    <p className="mt-1 text-[12px] text-ink-500">{tier.sub}</p>
                  </>
                )}
              </div>

              <ul className="mt-6 flex-1 space-y-2.5">
                {tier.features.map((f) => (
                  <li
                    key={f}
                    className="flex items-start gap-2 text-[13px] leading-relaxed text-ink-700"
                  >
                    <svg
                      width="13"
                      height="13"
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="2.5"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      className="mt-1 flex-shrink-0 text-petrol-600"
                    >
                      <polyline points="20 6 9 17 4 12" />
                    </svg>
                    <span>{f}</span>
                  </li>
                ))}
              </ul>

              <Link
                href={tier.href}
                className={cn(
                  "mt-6 inline-flex items-center justify-center rounded-md px-4 py-2.5 text-[13px] font-medium transition-all active:scale-[0.985]",
                  tier.featured
                    ? "bg-petrol-700 text-white hover:bg-petrol-800"
                    : tier.comingSoon
                      ? "border border-ink-200 bg-white text-ink-500 hover:border-ink-300 hover:bg-ink-50"
                      : "border border-ink-200 bg-white text-ink-800 hover:border-ink-300 hover:bg-ink-50",
                )}
              >
                {tier.cta}
              </Link>
            </div>
          ))}
        </div>

        <CompanyPackageCard className="mt-6" />
      </div>
    </section>
  );
}
