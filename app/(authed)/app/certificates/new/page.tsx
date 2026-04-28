import { createClient } from "@/lib/db/supabase-server";
import { NewCertificateForm } from "@/components/forms/new-certificate-form";
import Link from "next/link";

export const metadata = { title: "Neues Zeugnis erstellen" };

export default async function NewCertificatePage() {
  const supabase = await createClient();

  const { data: companies } = await supabase
    .from("companies")
    .select("id, name");

  if (!companies || companies.length === 0) {
    return (
      <div className="card p-10 text-center">
        <h1 className="headline-display text-[24px] leading-tight">
          Zuerst eine Firma anlegen
        </h1>
        <p className="mx-auto mt-3 max-w-md text-[14px] text-ink-600">
          Bevor Sie ein Arbeitszeugnis erstellen können, müssen Sie Ihre Firma
          erfassen. Das geht in unter einer Minute.
        </p>
        <Link href="/app/company" className="btn-primary mt-6 inline-flex">
          Firma erfassen
        </Link>
      </div>
    );
  }

  return (
    <div>
      <div className="mb-6">
        <h1 className="headline-display text-[28px] leading-tight">
          Neues Arbeitszeugnis
        </h1>
        <p className="mt-2 text-[14px] text-ink-600">
          Schritt 1 von 3: Mitarbeiterdaten und Zeugnistyp.
        </p>
      </div>

      <NewCertificateForm companies={companies} />
    </div>
  );
}
