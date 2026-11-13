import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/db/supabase-server";
import { deletionErrorStatus } from "@/lib/loeschen/rpc-error";
import { logError } from "@/lib/log";

/**
 * POST /api/employees/[id]/delete
 *
 * Löscht eine Person samt allen ihren Zeugnissen (Schritt 17). Ausgestellte
 * Zeugnisse bleiben im Prüfregister ohne Personendaten. Darf, wer in der Firma
 * versiegeln darf; das prüft zeugnio_delete_employee (036).
 */
export async function POST(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Nicht angemeldet" }, { status: 401 });

  const { data, error } = await supabase.rpc("zeugnio_delete_employee", { p_employee_id: id });
  if (error) {
    const status = deletionErrorStatus(error);
    if (status === 500) logError("[loeschen] Person nicht gelöscht:", error);
    return NextResponse.json({ error: status === 500 ? "Löschen fehlgeschlagen." : error.message }, { status });
  }
  return NextResponse.json({ ok: true, certificates: data?.certificates ?? 0, registered: data?.registered ?? 0 });
}
