import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/db/supabase-server";
import {
  computeCertificateHash,
  type CanonicalContent,
} from "@/lib/hash/canonicalize";

export async function POST(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { data: cert } = await supabase
    .from("certificates")
    .select("*, employees(*), companies(*)")
    .eq("id", id)
    .single();

  if (!cert)
    return NextResponse.json({ error: "Zeugnis nicht gefunden" }, { status: 404 });

  if (!cert.generated_text) {
    return NextResponse.json(
      { error: "Zeugnistext muss zuerst generiert werden." },
      { status: 400 },
    );
  }

  if (cert.status === "final") {
    return NextResponse.json(
      { error: "Zeugnis ist bereits finalisiert." },
      { status: 400 },
    );
  }

  // Canonical Content aus den strukturierten Daten erstellen
  const employee = cert.employees;
  const company = cert.companies;

  const canonical: CanonicalContent = {
    type: cert.type,
    company: { name: company.name, address: company.address },
    employee: {
      firstName: employee.first_name,
      lastName: employee.last_name,
      gender: employee.gender,
      functionTitle: employee.function_title,
      entryDate: employee.entry_date,
      exitDate: employee.exit_date,
    },
    body: cert.generated_text, // vereinfacht: ganzer Text
    closing: "", // ist in body enthalten
    date: new Date().toISOString().split("T")[0],
    location: company.city ?? "Zürich",
  };

  const { canonical: canonicalString, hash } = await computeCertificateHash(
    canonical,
  );

  await supabase
    .from("certificates")
    .update({
      hash,
      canonical_content: canonicalString,
      status: "final",
      finalized_at: new Date().toISOString(),
    })
    .eq("id", id);

  // Optional: Employer-Badge aktivieren, wenn das die erste Finalisierung ist
  await supabase
    .from("companies")
    .update({ has_employer_badge: true })
    .eq("id", cert.company_id);

  // Idempotent insert in employer_badges
  await supabase
    .from("employer_badges")
    .upsert(
      { company_id: cert.company_id, badge_type: "verified_certificate_employer", active: true },
      { onConflict: "company_id,badge_type", ignoreDuplicates: true },
    );

  return NextResponse.json({ ok: true, hash });
}
