import { createServiceClient } from "@/lib/db/supabase-server";
import { notFound } from "next/navigation";
import { Logo } from "@/components/ui/logo";
import Link from "next/link";
import { certificateTypeLabel } from "@/lib/certificate/certificate-title";
import { SignoffConfirm } from "@/components/forms/signoff-confirm";

interface PageProps {
  params: Promise<{ token: string }>;
}

export default async function SignoffPage({ params }: PageProps) {
  const { token } = await params;

  // Öffentliche (token-basierte) Seite → Service-Client (umgeht RLS).
  const supabase = createServiceClient();

  const { data: signoff } = await supabase
    .from("certificate_signoffs")
    .select(
      "id, slot, email, name, role, status, expires_at, confirmed_at, " +
        "certificates(id, type, generated_text, edited_text, employees(first_name, last_name), companies(name))",
    )
    .eq("token", token)
    .maybeSingle();

  if (!signoff) notFound();

  if (signoff.status === "confirmed") {
    return (
      <Wrapper>
        <StatusHeadline>Bereits freigegeben</StatusHeadline>
        <p className="mt-3 text-[14px] text-ink-600">
          Sie haben dieses Zeugnis bereits freigegeben. Vielen Dank — es ist
          nichts weiter zu tun.
        </p>
      </Wrapper>
    );
  }
  if (signoff.status === "declined") {
    return (
      <Wrapper>
        <StatusHeadline>Freigabe abgelehnt</StatusHeadline>
        <p className="mt-3 text-[14px] text-ink-600">
          Sie haben die Freigabe für dieses Zeugnis abgelehnt. Der Arbeitgeber
          wurde darüber im System informiert.
        </p>
      </Wrapper>
    );
  }
  if (new Date(signoff.expires_at) < new Date()) {
    return (
      <Wrapper>
        <StatusHeadline>Link abgelaufen</StatusHeadline>
        <p className="mt-3 text-[14px] text-ink-600">
          Dieser Freigabe-Link ist nicht mehr gültig. Bitte fordern Sie beim
          Arbeitgeber einen neuen Link an.
        </p>
      </Wrapper>
    );
  }

  const cert: any = Array.isArray(signoff.certificates)
    ? signoff.certificates[0]
    : signoff.certificates;
  const employee: any = cert?.employees
    ? Array.isArray(cert.employees)
      ? cert.employees[0]
      : cert.employees
    : null;
  const company: any = cert?.companies
    ? Array.isArray(cert.companies)
      ? cert.companies[0]
      : cert.companies
    : null;

  if (!cert || !employee || !company) {
    return (
      <Wrapper>
        <StatusHeadline>Freigabe nicht verfügbar</StatusHeadline>
        <p className="mt-3 text-[14px] text-ink-600">
          Zu dieser Freigabe fehlen Angaben. Bitte fordern Sie beim Arbeitgeber
          einen neuen Link an.
        </p>
      </Wrapper>
    );
  }

  // Status best-effort auf 'viewed' setzen (blockiert die Anzeige nicht).
  if (signoff.status === "pending") {
    const { error: viewErr } = await supabase
      .from("certificate_signoffs")
      .update({ status: "viewed", viewed_at: new Date().toISOString() })
      .eq("id", signoff.id);
    if (viewErr) {
      console.warn("[signoff] viewed-Update fehlgeschlagen:", viewErr.message);
    }
  }

  const employeeName = `${employee.first_name} ${employee.last_name}`;
  const bodyText: string = cert.edited_text || cert.generated_text || "";
  const paragraphs = bodyText
    .split(/\n{2,}/)
    .map((p: string) => p.trim())
    .filter(Boolean);

  return (
    <Wrapper>
      <div className="text-[11px] font-medium uppercase tracking-wider text-petrol-600">
        Freigabe · {certificateTypeLabel(cert.type)}
      </div>
      <h1 className="headline-display mt-1 text-[28px] leading-tight">
        {employeeName}
      </h1>
      <p className="mt-1 text-[14px] text-ink-600">{company.name}</p>

      <div className="mt-8 rounded-md bg-petrol-50 p-4 text-[13px] leading-relaxed text-petrol-800">
        <strong>Sie wurden als unterzeichnende Person angefragt.</strong> Bitte
        prüfen Sie den Zeugnistext unten. Mit Ihrer Freigabe bestätigen Sie das
        Zeugnis als{" "}
        <strong>
          {signoff.name}
          {signoff.role ? `, ${signoff.role}` : ""}
        </strong>
        . Die Bestätigung wird mit Ihrer E-Mail-Adresse ({signoff.email}) und
        einem Zeitstempel als elektronische Freigabe festgehalten.
      </div>

      {/* Zeugnistext (nur zur Ansicht) */}
      <div className="mt-8">
        <div className="mb-2 text-[11px] font-medium uppercase tracking-wider text-ink-500">
          Zeugnistext
        </div>
        <div className="rounded-md border border-ink-200 bg-white p-6">
          {paragraphs.length > 0 ? (
            paragraphs.map((p: string, i: number) => (
              <p
                key={i}
                className="mb-3 whitespace-pre-line text-[13.5px] leading-relaxed text-ink-800 last:mb-0"
              >
                {p}
              </p>
            ))
          ) : (
            <p className="text-[13.5px] text-ink-500">
              Für dieses Zeugnis liegt noch kein Text vor.
            </p>
          )}
        </div>
      </div>

      <div className="mt-8">
        <SignoffConfirm token={token} />
      </div>
    </Wrapper>
  );
}

function StatusHeadline({ children }: { children: React.ReactNode }) {
  return <h1 className="headline-display text-[24px]">{children}</h1>;
}

function Wrapper({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen bg-ink-50/40">
      <header className="border-b border-ink-200 bg-white">
        <div className="container-zx flex h-14 items-center">
          <Link href="/" className="flex items-center gap-2">
            <Logo className="h-6 w-6" />
            <span className="text-[15px] font-medium tracking-tight">
              zeugnio
              <span className="text-petrol-600">.ch</span>
            </span>
          </Link>
        </div>
      </header>
      <main className="container-zx max-w-2xl py-12">{children}</main>
    </div>
  );
}
