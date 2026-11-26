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
//
// Aufbau (seit 20.11.2026): zwei Gruppen nach Zielgruppe statt vier gleicher
// Spalten. Links das Erstellen für Arbeitgeber, rechts die drei Prüfangebote
// für Kandidatinnen und Recruiter, Premium als Kombination zuletzt. Vorbild
// für die Gruppierung: Riverside auf Mobbin («For Individuals» / «For
// Companies»). Die Feature-Listen sind unverändert.
type Tier = {
  name: string;
  price: string;
  regularPrice: string | null;
  sub: string;
  beta: boolean;
  comingSoon: boolean;
  cta: string;
  href: string;
  features: string[];
  featured: boolean;
  badge: string | null;
};

const erstellen: Tier = {
  name: "Erstellen",
  price: "CHF 0",
  regularPrice: null,
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
  badge: null,
};

const pruefen: Tier[] = [
  {
    name: "Echtheit prüfen",
    price: "CHF 19.90",
    regularPrice: "CHF 19.90",
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
    badge: null,
  },
  {
    name: "Zeugnisanalyse",
    price: "CHF 29.90",
    regularPrice: "CHF 29.90",
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
    badge: null,
  },
  {
    name: "Premium-Prüfung",
    price: "CHF 39.90",
    regularPrice: "CHF 39.90",
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
    badge: "Empfohlen für Bewerbungen",
  },
];

export function PricingSection() {
  return (
    <section
      id="pricing"
      className="scroll-mt-20 border-b border-ink-200 bg-white py-24"
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

        <div className="mt-14 grid gap-8 xl:grid-cols-12 xl:gap-6">
          {/* Gruppe 1: Arbeitgeber */}
          <div className="flex flex-col xl:col-span-4">
            <GroupHeader
              title="Für Arbeitgeber und HR"
              note="Dauerhaft kostenlos"
            />
            <TierCard tier={erstellen} className="flex-1" wide />
          </div>

          {/* Gruppe 2: Prüfen */}
          <div className="flex flex-col xl:col-span-8">
            <GroupHeader
              title="Für Kandidatinnen, Recruiter und Prüfende"
              note="Während der Beta kostenlos"
              beta
            />
            <div className="grid flex-1 gap-3 rounded-2xl bg-canvas p-2 ring-1 ring-inset ring-ink-200 md:grid-cols-3">
              {pruefen.map((tier) => (
                <TierCard key={tier.name} tier={tier} />
              ))}
            </div>
          </div>
        </div>

        <CompanyPackageCard className="mt-6" />
      </div>
    </section>
  );
}

function GroupHeader({
  title,
  note,
  beta,
}: {
  title: string;
  note: string;
  beta?: boolean;
}) {
  return (
    <div className="mb-3 flex flex-wrap items-center justify-between gap-x-3 gap-y-1 px-1">
      <h3 className="text-[13px] font-medium tracking-tight text-ink-900">
        {title}
      </h3>
      <span
        className={cn(
          "inline-flex items-center gap-1.5 text-[11px] font-medium uppercase tracking-wider",
          beta ? "text-petrol-700" : "text-ink-500",
        )}
      >
        {beta && (
          <span className="rounded-full bg-petrol-50 px-2 py-0.5 text-[10px] ring-1 ring-inset ring-petrol-600/20">
            Beta
          </span>
        )}
        {note}
      </span>
    </div>
  );
}

function TierCard({
  tier,
  className,
  wide,
}: {
  tier: Tier;
  className?: string;
  /** Unter xl volle Breite: Features zweispaltig statt einer langen Liste. */
  wide?: boolean;
}) {
  return (
    <div
      className={cn(
        "relative flex flex-col rounded-xl border bg-white p-6 transition-shadow",
        tier.featured
          ? "border-petrol-600 shadow-xl shadow-petrol-900/10"
          : "border-ink-200 hover:shadow-md hover:shadow-ink-900/5",
        className,
      )}
    >
      {tier.featured && tier.badge && (
        <span className="absolute -top-2.5 left-4 whitespace-nowrap rounded-full bg-petrol-700 px-2.5 py-1 text-[10px] font-medium uppercase tracking-wider text-white">
          {tier.badge}
        </span>
      )}

      <div>
        <div className="flex items-center gap-2">
          <h4 className="text-[14px] font-medium tracking-tight text-ink-900">
            {tier.name}
          </h4>
          {tier.comingSoon && (
            <span className="rounded-full bg-ink-100 px-2 py-0.5 text-[10px] font-medium uppercase tracking-wider text-ink-500 ring-1 ring-inset ring-ink-300/40">
              Bald
            </span>
          )}
        </div>
        <p className="mt-0.5 text-[12px] text-ink-500">{tier.sub}</p>
        {tier.comingSoon ? (
          <>
            <div className="mt-4 font-display text-[24px] font-light leading-none tracking-tight text-ink-500">
              Kommt bald
            </div>
            <p className="mt-1.5 text-[12px] text-ink-500">
              In Vorbereitung · regulär {tier.regularPrice}
            </p>
          </>
        ) : tier.beta ? (
          <>
            <div className="mt-4 font-display text-[28px] font-light leading-none tracking-tight text-ink-900">
              Kostenlos
            </div>
            <p className="mt-1.5 text-[12px] leading-snug text-ink-500">
              während der Beta · regulär {tier.regularPrice} nach der Beta
            </p>
          </>
        ) : (
          <>
            <div className="mt-4 font-display text-[28px] font-light leading-none tracking-tight text-ink-900">
              {tier.price}
            </div>
            <p className="mt-1.5 text-[12px] text-ink-500">
              Ohne Kreditkarte, ohne Verpflichtung
            </p>
          </>
        )}
      </div>

      <ul
        className={cn(
          "mt-6 flex-1 space-y-2.5 border-t border-ink-100 pt-5",
          wide &&
            "sm:grid sm:grid-cols-2 sm:gap-x-6 sm:gap-y-2.5 sm:space-y-0 xl:block xl:space-y-2.5",
        )}
      >
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
              aria-hidden="true"
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
          "mt-6 inline-flex items-center justify-center rounded-md px-4 py-2.5 text-center text-[13px] font-medium transition-all active:scale-[0.985]",
          tier.featured
            ? "bg-petrol-700 text-white hover:bg-petrol-800"
            : !tier.beta && !tier.comingSoon
              ? "bg-petrol-600 text-white hover:bg-petrol-700"
              : tier.comingSoon
                ? "border border-ink-200 bg-white text-ink-500 hover:border-ink-300 hover:bg-ink-50"
                : "border border-ink-200 bg-white text-ink-800 hover:border-ink-300 hover:bg-ink-50",
        )}
      >
        {tier.cta}
      </Link>
    </div>
  );
}
