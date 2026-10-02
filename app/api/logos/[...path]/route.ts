import { readFile, stat } from "node:fs/promises";

import { NextRequest, NextResponse } from "next/server";

import { contentTypeForFile, resolveLogoPath } from "@/lib/uploads/logos";

/**
 * GET /api/logos/<companyId>/<datei>
 *
 * Liefert ein Firmenlogo von der Platte aus. Ersetzt den öffentlichen
 * Supabase-Bucket, in dem die Logos bisher lagen.
 *
 * Öffentlich erreichbar, wie bisher: ein Firmenlogo ist das Aushängeschild der
 * Firma und steht im Briefkopf jedes Zeugnisses. Der Dateiname ist trotzdem
 * nicht erratbar (Zeitstempel plus acht Zufallsbytes) – damit lässt sich aus
 * einer bekannten Firmen-ID nicht auf die Logos schliessen.
 *
 * Die Pfadprüfung steht in lib/uploads/logos.ts und ist absichtlich streng:
 * companies.logo_url kann jeder ändern, der die Firma bearbeiten darf, und ohne
 * diese Prüfung wäre das ein Weg, beliebige Dateien des Servers auszuliefern.
 */
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ path: string[] }> },
) {
  const { path: segments } = await params;
  const file = resolveLogoPath(segments ?? []);
  if (!file) {
    return new NextResponse("Nicht gefunden", { status: 404 });
  }

  try {
    const info = await stat(file);
    if (!info.isFile()) return new NextResponse("Nicht gefunden", { status: 404 });

    const bytes = await readFile(file);
    return new NextResponse(bytes, {
      status: 200,
      headers: {
        "Content-Type": contentTypeForFile(file),
        "Content-Length": String(info.size),
        // Der Dateiname ändert sich bei jedem neuen Logo, die Datei selbst nie.
        "Cache-Control": "public, max-age=31536000, immutable",
        // Ein hochgeladenes Bild wird nie als etwas anderes gedeutet.
        "X-Content-Type-Options": "nosniff",
        "Content-Disposition": "inline",
      },
    });
  } catch {
    // Fehlt die Datei, ist das kein Serverfehler: sie kann aus einer Sicherung
    // fehlen oder von Hand entfernt worden sein. Die PDF-Erzeugung behandelt ein
    // fehlendes Logo ohnehin als "kein Logo" und läuft weiter.
    return new NextResponse("Nicht gefunden", { status: 404 });
  }
}
