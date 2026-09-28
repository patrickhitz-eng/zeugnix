import { mkdir, rename, unlink, writeFile } from "node:fs/promises";
import path from "node:path";

import { NextRequest, NextResponse } from "next/server";

import { userIsCompanyMember } from "@/lib/auth/ownership";
import { createClient } from "@/lib/db/supabase-server";
import { logError } from "@/lib/log";
import {
  LOGO_URL_PREFIX,
  MAX_LOGO_BYTES,
  logoDir,
  newLogoFileName,
  sniffImageType,
} from "@/lib/uploads/logos";

/**
 * POST /api/companies/[id]/logo
 * Body: multipart/form-data mit dem Feld "file"
 *
 * Nimmt ein Firmenlogo an, prüft es auf dem Server, legt es auf der Platte ab
 * und schreibt die Adresse in companies.logo_url.
 *
 * Bisher lief das komplett im Browser: Prüfung im Browser, Upload direkt in
 * einen öffentlichen Supabase-Bucket. Das hatte zwei Schwächen, die mit dem
 * Serverstandort nichts zu tun haben – wer den Upload nachbaute, umging die
 * Prüfung, und die Grössengrenze war eine Bitte, keine Grenze.
 *
 * Reihenfolge hier: Datei erst unter einem Zwischennamen schreiben, dann die
 * Datenbank aktualisieren, dann umbenennen. Scheitert die Datenbank, wird die
 * Zwischendatei entfernt – so bleibt weder ein Eintrag ohne Datei noch eine
 * Datei ohne Eintrag zurück.
 */
export const runtime = "nodejs";

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Nicht angemeldet" }, { status: 401 });

  if (!(await userIsCompanyMember(supabase, id, user.id))) {
    return NextResponse.json({ error: "Kein Zugriff" }, { status: 403 });
  }

  let form: FormData;
  try {
    form = await req.formData();
  } catch {
    return NextResponse.json({ error: "Anfrage ist kein Formular." }, { status: 400 });
  }

  const file = form.get("file");
  if (!(file instanceof File)) {
    return NextResponse.json({ error: "Kein Feld \"file\" in der Anfrage." }, { status: 400 });
  }
  if (file.size === 0) {
    return NextResponse.json({ error: "Die Datei ist leer." }, { status: 400 });
  }
  if (file.size > MAX_LOGO_BYTES) {
    return NextResponse.json(
      { error: `Logo darf maximal ${Math.round(MAX_LOGO_BYTES / 1024 / 1024)} MB gross sein.` },
      { status: 413 },
    );
  }

  const bytes = Buffer.from(await file.arrayBuffer());
  // Nicht dem gemeldeten Content-Type trauen, sondern die ersten Bytes ansehen.
  const kind = sniffImageType(bytes);
  if (!kind) {
    return NextResponse.json(
      { error: "Nur PNG oder JPG erlaubt. SVG stellt die PDF-Erzeugung nicht dar." },
      { status: 415 },
    );
  }

  const dir = logoDir(id);
  const fileName = newLogoFileName(kind.ext);
  const finalPath = path.join(dir, fileName);
  const tempPath = `${finalPath}.part`;
  const publicUrl = `${LOGO_URL_PREFIX}${id}/${fileName}`;

  try {
    await mkdir(dir, { recursive: true });
    await writeFile(tempPath, bytes, { mode: 0o640 });
  } catch (error) {
    logError("[logo] Datei nicht schreibbar:", error);
    return NextResponse.json(
      {
        error:
          "Das Logo konnte auf dem Server nicht abgelegt werden. " +
          "Ist ZEUGNIO_UPLOAD_DIR gesetzt und beschreibbar?",
      },
      { status: 500 },
    );
  }

  // Der Schreibzugriff läuft über die Sitzung der angemeldeten Person, nicht über
  // den service_role-Schlüssel: damit entscheidet weiterhin die Zeilensicherheit
  // in der Datenbank, wer welche Firma ändern darf, und nicht diese Route.
  const { data: updated, error: dbError } = await supabase
    .from("companies")
    .update({ logo_url: publicUrl })
    .eq("id", id)
    .select("id")
    .maybeSingle();

  if (dbError || !updated) {
    await unlink(tempPath).catch(() => {});
    if (dbError) logError("[logo] companies.logo_url nicht schreibbar:", dbError);
    return NextResponse.json(
      { error: dbError?.message ?? "Die Firma liess sich nicht aktualisieren." },
      { status: dbError ? 500 : 403 },
    );
  }

  try {
    await rename(tempPath, finalPath);
  } catch (error) {
    logError("[logo] Umbenennen fehlgeschlagen:", error);
    await unlink(tempPath).catch(() => {});
    return NextResponse.json(
      { error: "Das Logo konnte nicht abgelegt werden." },
      { status: 500 },
    );
  }

  return NextResponse.json({ ok: true, logo_url: publicUrl });
}

/**
 * DELETE /api/companies/[id]/logo
 *
 * Entfernt nur den Verweis, nicht die Datei. Absicht: ein versehentliches
 * Entfernen lässt sich so von Hand rückgängig machen, und bereits ausgestellte
 * PDFs enthalten das Logo ohnehin eingebettet. Aufräumen der verwaisten Dateien
 * gehört in einen eigenen, überlegten Schritt – nicht in einen Klick.
 */
export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Nicht angemeldet" }, { status: 401 });

  if (!(await userIsCompanyMember(supabase, id, user.id))) {
    return NextResponse.json({ error: "Kein Zugriff" }, { status: 403 });
  }

  const { error } = await supabase.from("companies").update({ logo_url: null }).eq("id", id);
  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
  return NextResponse.json({ ok: true });
}
