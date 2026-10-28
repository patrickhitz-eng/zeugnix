import Link from "next/link";
import { siteConfig } from "@/lib/site-config";

interface StubPageProps {
  title: string;
  description: string;
}

export function StubPage({ title, description }: StubPageProps) {
  return (
    <section className="bg-white py-24">
      <div className="container-zx max-w-3xl">
        <div className="eyebrow">In Arbeit</div>
        <h1 className="headline-display mt-3 text-[40px] leading-[1.1]">
          {title}
        </h1>
        <p className="mt-5 text-[15px] leading-relaxed text-ink-600">
          {description}
        </p>
        <div className="mt-8 flex gap-3">
          <Link href="/" className="btn-secondary">
            Zur Startseite
          </Link>
          <Link href={siteConfig.signup.cta.href} className="btn-primary">
            {siteConfig.signup.cta.label}
          </Link>
        </div>
      </div>
    </section>
  );
}
