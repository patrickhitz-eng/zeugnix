import Link from "next/link";
import { companyInfo } from "@/lib/legal/company-info";
import { siteConfig } from "@/lib/site-config";

export const metadata = {
  title: "Zugang anfragen",
  description:
    "Zugang zu zeugnio für Ihre Firma anfragen oder Interesse am Firmenpaket melden.",
};

export default function ContactPage() {
  return (
    <section className="bg-white py-24">
      <div className="container-zx max-w-3xl">
        <div className="eyebrow">Zugang</div>
        <h1 className="headline-display mt-3 text-[40px] leading-[1.1]">
          Zugang anfragen
        </h1>
        <p className="mt-5 text-[15px] leading-relaxed text-ink-600">
          Sie möchten Arbeitszeugnisse mit zeugnio erstellen?{" "}
          {!siteConfig.signup.open && <>{siteConfig.signup.note} </>}
          Schreiben Sie uns kurz, für welche Firma oder Firmen Sie zeugnio
          nutzen möchten – wir melden uns. Dasselbe gilt, wenn Sie Interesse
          am geplanten Firmenpaket für Prüfungen haben.
        </p>

        <div className="mt-8 rounded-xl border border-ink-200 bg-ink-50/50 p-6">
          <p className="text-[14px] font-medium text-ink-900">
            Kontakt
          </p>
          <p className="mt-2 text-[14.5px] leading-relaxed text-ink-600">
            <a
              href={`mailto:${companyInfo.contactEmail}?subject=${encodeURIComponent(
                "Zugang zeugnio",
              )}`}
              className="font-medium text-petrol-700 underline underline-offset-2 hover:text-petrol-800"
            >
              {companyInfo.contactEmail}
            </a>
          </p>
          <p className="mt-3 text-[13px] text-ink-500">
            Nennen Sie uns kurz Firma, Firmengrösse und wer bei Ihnen
            Zeugnisse erstellt – dann können wir den Zugang rasch einrichten.
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
