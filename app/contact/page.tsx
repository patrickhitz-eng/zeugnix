import Link from "next/link";
import { companyInfo } from "@/lib/legal/company-info";

export const metadata = {
  title: "Firmenzugang anfragen",
  description:
    "Kontaktieren Sie uns für das zeugnio Firmenpaket: mehrere Prüfungen, Recruiter-Zugang und zentrale Rechnungsstellung.",
};

export default function ContactPage() {
  return (
    <section className="bg-white py-24">
      <div className="container-zx max-w-3xl">
        <div className="eyebrow">Firmenzugang</div>
        <h1 className="headline-display mt-3 text-[40px] leading-[1.1]">
          Firmenzugang anfragen
        </h1>
        <p className="mt-5 text-[15px] leading-relaxed text-ink-600">
          Sie möchten zeugnio für mehrere Prüfungen, mit Recruiter-Zugang
          oder zentraler Rechnungsstellung einsetzen? Schreiben Sie uns kurz,
          worum es geht – wir melden uns.
        </p>

        <div className="mt-8 rounded-xl border border-ink-200 bg-ink-50/50 p-6">
          <p className="text-[14px] font-medium text-ink-900">
            Kontakt
          </p>
          <p className="mt-2 text-[14.5px] leading-relaxed text-ink-600">
            <a
              href={`mailto:${companyInfo.contactEmail}?subject=${encodeURIComponent(
                "Firmenzugang zeugnio",
              )}`}
              className="font-medium text-petrol-700 underline underline-offset-2 hover:text-petrol-800"
            >
              {companyInfo.contactEmail}
            </a>
          </p>
          <p className="mt-3 text-[13px] text-ink-500">
            Nennen Sie uns kurz Firmengrösse und gewünschten Nutzungsumfang –
            das hilft uns, Ihnen schnell ein passendes Angebot zu machen.
          </p>
        </div>

        <div className="mt-8 flex gap-3">
          <Link href="/" className="btn-secondary">
            Zur Startseite
          </Link>
          <Link href="/pricing" className="btn-primary">
            Preise ansehen
          </Link>
        </div>
      </div>
    </section>
  );
}
