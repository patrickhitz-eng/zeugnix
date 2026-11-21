"use client";

/**
 * Abmelden über den Server (POST /api/auth/abmelden), für beide Stellungen des
 * Schalters ZEUGNIO_AUTH. Das Sitzungs-Cookie der eigenen Anmeldung ist
 * HttpOnly; der Browser kann es gar nicht selbst löschen.
 */
export function SignOutButton() {
  async function signOut() {
    await fetch("/api/auth/abmelden", { method: "POST" }).catch(() => undefined);
    // Harter Seitenwechsel: kein zwischengespeicherter App-Inhalt bleibt stehen.
    window.location.assign("/");
  }

  return (
    <button
      onClick={signOut}
      className="text-[12.5px] font-medium text-ink-700 hover:text-petrol-700"
    >
      Abmelden
    </button>
  );
}
