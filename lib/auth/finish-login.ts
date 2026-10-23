/**
 * Schliesst eine Anmeldung ab, sobald die Supabase-Session steht.
 *
 * Beide Anmeldewege enden hier: der Magic-Link über /auth/callback und die
 * Code-Eingabe im Login-Formular. Vorher lag diese Logik nur im Callback – mit
 * dem zweiten Weg muss sie geteilt werden, sonst bekommt eine per Code
 * angemeldete Person kein vollständiges Konto.
 *
 * Der /api/auth/sync-Aufruf ist NICHT optional: solange die Daten noch bei
 * Supabase liegen, antwortet er mit "übersprungen", danach trägt er die Person
 * in die eigene auth.users ein. Ohne diesen Eintrag greift der Fremdschlüssel
 * von public.profiles nicht, und das Konto bliebe leer. Siehe
 * app/api/auth/sync/route.ts.
 *
 * Der Abschluss ist bewusst ein harter Reload (window.location.assign) und kein
 * router.push: die Middleware muss die frisch gesetzten Session-Cookies sehen,
 * und ein Client-Navigate würde sie überspringen.
 */
export async function finishLogin(next: string): Promise<void> {
  const sync = await fetch("/api/auth/sync", { method: "POST" });

  if (!sync.ok) {
    const body = (await sync.json().catch(() => ({}))) as { error?: string };
    throw new Error(
      body.error ??
        "Die Anmeldung hat funktioniert, das Konto konnte aber nicht fertig " +
          "eingerichtet werden. Bitte noch einmal versuchen.",
    );
  }

  window.location.assign(next);
}
