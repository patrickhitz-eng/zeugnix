import { mkdir, rename, unlink, writeFile } from "node:fs/promises";
import path from "node:path";

import { NextRequest, NextResponse } from "next/server";

import { userIsCompanyMember } from "@/lib/auth/ownership";
import { createClient } from "@/lib/db/supabase-server";
import { logError, logWarn } from "@/lib/log";
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
 * Nimmt ein Firmenlogo an, prüft es auf dem Server, legt es ab und schreibt die
 * Adresse in companies.logo_url.
 *
 * Bisher lief das komplett im Browser: Prüfung im Browser, Upload direkt in
 * einen öffentlichen Supabase-Bucket. Das hatte zwei Schwächen, die mit dem
 * Serverstandort nichts zu tun haben – wer den Upload nachbaute, umging die
 * Prüfung, und die Grössengrenze war eine Bitte, keine Grenze. Beides ist hier
 * behoben, unabhängig davon, wo die Datei am Ende landet.
 *
 * ZWEI ABLAGEORTE, EINE ROUTE
 *
 * Auf dem eigenen Server liegt das Logo auf der Platte, unter
 * ZEUGNIO_UPLOAD_DIR, und wird über /api/logos/… ausgeliefert. Auf Vercel gibt
 * es kein beschreibbares Dateisystem – dort würde jeder Upload mit EROFS
 * scheitern. Damit dieser Branch nicht erst im Cutover-Fenster mergefähig ist,
 * fällt die Route in diesem Fall auf den bisherigen Weg zurück: Supabase-Storage,
 * Pfad <user_id>/<datei>, wie es die Zeilensicherheitsregel aus Migration 007
 * verlangt.
 *
 * Der Rückfallweg ist ausdrücklich vorübergehend. Er hält den Zustand von heute
 * und verschwindet mit dem Umzug von selbst: sobald ZEUGNIO_UPLOAD_DIR auf ein
 * beschreibbares Verzeichnis zeigt, wird er nie mehr betreten. Er wird darum
 * auch protokolliert – ein Logo, das nach dem Umzug noch bei Supabase landet,
 * ist ein Befund und keine Nebensache.
 *
 * Reihenfolge auf der Platte: Datei erst unter einem Zwischennamen schreiben,
 * dann die Datenbank aktualisieren, dann umbenennen. Scheitert die Datenbank,
 * wird die Zwischendatei entfernt – so bleibt weder ein Eintrag ohne Datei noch
 * eine Datei ohne Eintrag zurück.
 */
export const runtime = "nodejs";

/** Fehler, bei denen das Dateisystem nicht beschreibbar ist (Vercel und Verwandte). */
const NOT_WRITABLE = new Set(["EROFS", "EACCES", "EPERM", "ENOSPC"]);

function isNotWritable(error: unknown): boolean {
  const code = (error as { code?: string } | null)?.code;
  return typeof code === "string" && NOT_WRITABLE.has(code);
}

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

  const fileName = newLogoFileName(kind.ext);
  const dir = logoDir(id);
  const finalPath = path.join(dir, fileName);
  const tempPath = `${finalPath}.part`;

  // --- Ablage, erster Versuch: die Platte ------------------------------------
  // Auf Vercel wird es gar nicht erst versucht. Dort ist das Dateisystem
  // schreibgeschützt – und ein beschreibbares Verzeichnis wäre dort sogar
  // schlimmer als keines: /tmp überlebt den Aufruf nicht, die Datei wäre beim
  // nächsten Abruf weg, der Verweis in der Datenbank aber noch da. Das Logo
  // erschiene dann als gebrochenes Bild, ohne dass irgendwo ein Fehler stünde.
  const ausweichenAufStorage = Boolean(process.env.VERCEL);
  let onDisk = false;

  if (ausweichenAufStorage) {
    logWarn(
      "[logo] Läuft auf Vercel – Logo geht in den Supabase-Storage. Auf dem " +
        "eigenen Server landet es auf der Platte.",
    );
  } else {
    try {
      await mkdir(dir, { recursive: true });
      await writeFile(tempPath, bytes, { mode: 0o640 });
      onDisk = true;
    } catch (error) {
      // Nur ein nicht beschreibbares Dateisystem führt auf den Rückfallweg. Alles
      // andere – ein falsch gesetzter Pfad zum Beispiel – bleibt ein Fehler, den
      // man sehen soll, statt ihn still zu umgehen.
      if (!isNotWritable(error)) {
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
      logWarn(
        "[logo] Kein beschreibbares Upload-Verzeichnis – Rückfall auf den " +
          "Supabase-Storage. Nach dem Umzug auf den eigenen Server darf diese " +
          "Zeile nicht mehr auftauchen.",
      );
    }
  }

  // --- Ablage, Rückfallweg: Supabase-Storage wie bisher ----------------------
  let storagePath: string | null = null;
  let publicUrl: string;

  if (onDisk) {
    publicUrl = `${LOGO_URL_PREFIX}${id}/${fileName}`;
  } else {
    // Pfad <user_id>/<datei>: genau so verlangt es die Zeilensicherheitsregel
    // des Buckets aus Migration 007. Ein anderer Pfad wird abgewiesen.
    storagePath = `${user.id}/${fileName}`;
    const { error: uploadError } = await supabase.storage
      .from("company-logos")
      .upload(storagePath, bytes, { upsert: true, contentType: kind.mime });

    if (uploadError) {
      logError("[logo] Upload in den Supabase-Storage fehlgeschlagen:", uploadError);
      return NextResponse.json(
        { error: `Logo-Upload fehlgeschlagen: ${uploadError.message}` },
        { status: 500 },
      );
    }
    publicUrl = supabase.storage.from("company-logos").getPublicUrl(storagePath).data.publicUrl;
  }

  // --- Verweis in der Datenbank ---------------------------------------------
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
    // Aufräumen, damit keine Datei ohne Verweis zurückbleibt.
    if (onDisk) await unlink(tempPath).catch(() => {});
    if (storagePath) {
      await supabase.storage.from("company-logos").remove([storagePath]);
    }
    if (dbError) logError("[logo] companies.logo_url nicht schreibbar:", dbError);
    return NextResponse.json(
      { error: dbError?.message ?? "Die Firma liess sich nicht aktualisieren." },
      { status: dbError ? 500 : 403 },
    );
  }

  if (onDisk) {
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
  }

  return NextResponse.json({ ok: true, logo_url: publicUrl, ablage: onDisk ? "platte" : "supabase" });
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
