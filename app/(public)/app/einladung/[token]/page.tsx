import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient, createServiceClient } from "@/lib/db/supabase-server";
import { Logo } from "@/components/ui/logo";
import { SignOutButton } from "@/components/app/sign-out-button";
import { TeamInvitationAccept } from "@/components/forms/team-invitation-accept";
import { companyRoleLabel } from "@/lib/auth/ownership";
import { emailMatchesInvitation, hashInvitationToken, invitationState } from "@/lib/team/invitations";

export const metadata = { title: "Einladung ins Team" };

/**
 * /app/einladung/[token] – eine Person nimmt die Einladung ins Team an.
 *
 * Liegt in (public), damit das App-Layout nicht vorher auf die AGB-Seite
 * umleitet; die AGB folgen beim ersten Aufruf des Arbeitsbereichs. Eingeloggt
 * sein muss man trotzdem: die Middleware schickt sonst zur Anmeldung und
 * danach hierher zurück. Angezeigt wird nur, was die eingeladene Person ohnehin
 * per Mail weiss (Organisation, Rolle, Adresse) – nichts über Mitarbeitende.
 */
export default async function TeamInvitationPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect(`/login?next=${encodeURIComponent(`/app/einladung/${token}`)}`);

  const { data: inv } = await createServiceClient()
    .from("organization_invitations")
    .select("email, org_role, company_role, expires_at, accepted_at, revoked_at, organizations(name)")
    .eq("token_hash", hashInvitationToken(token))
    .maybeSingle();

  const org = inv ? (Array.isArray(inv.organizations) ? inv.organizations[0] : inv.organizations) : null;
  const state = inv ? invitationState(inv) : null;
  const sameEmail = inv ? emailMatchesInvitation(user.email, inv.email) : false;
  const roleLabel = inv
    ? inv.org_role === "admin"
      ? "Admin"
      : companyRoleLabel(inv.company_role)
    : "";

  let body: React.ReactNode;
  if (!inv) {
    body = <p>Diese Einladung gibt es nicht. Prüfen Sie den Link in der Mail.</p>;
  } else if (state === "angenommen") {
    body = (
      <p>
        Diese Einladung ist bereits angenommen.{" "}
        <Link href="/app/dashboard" className="underline">
          Zum Arbeitsbereich
        </Link>
      </p>
    );
  } else if (state === "zurueckgezogen" || state === "abgelaufen") {
    body = <p>Diese Einladung ist {state === "abgelaufen" ? "abgelaufen" : "zurückgezogen"}. Bitten Sie den Admin um eine neue.</p>;
  } else if (!sameEmail) {
    body = (
      <p>
        Diese Einladung gilt für <strong>{inv.email}</strong>. Sie sind als {user.email} angemeldet. Bitte melden Sie
        sich ab und mit der eingeladenen Adresse wieder an.
      </p>
    );
  } else {
    body = (
      <>
        <p>
          Sie sind ins Team von <strong>{(org as { name?: string } | null)?.name ?? "einer Organisation"}</strong>{" "}
          eingeladen, mit der Rolle <strong>{roleLabel}</strong>.
        </p>
        <div className="mt-8">
          <TeamInvitationAccept token={token} />
        </div>
      </>
    );
  }

  return (
    <section className="bg-white">
      <div className="container-zx flex min-h-screen max-w-md flex-col justify-center py-16">
        <div className="text-center">
          <Link href="/" className="inline-flex items-center gap-2.5">
            <Logo className="h-8 w-8" />
            <span className="text-[18px] font-medium tracking-tight">
              zeugnio
              <span className="text-petrol-600">.ch</span>
            </span>
          </Link>
        </div>
        <h1 className="headline-display mt-12 text-center text-[28px] leading-tight">Einladung ins Team</h1>
        <div className="mt-6 text-center text-[14px] leading-relaxed text-ink-700">{body}</div>
        <div className="mt-8 flex items-center justify-center gap-2 text-[12px] text-ink-500">
          <span>Angemeldet als {user.email}.</span>
          <SignOutButton />
        </div>
      </div>
    </section>
  );
}
