"use client";

/**
 * Abmelden über den Server (POST /api/auth/abmelden). Das Sitzungs-Cookie ist
 * HttpOnly; der Browser kann es gar nicht selbst löschen.
 */
export function SignOutButton({
  className = "text-ink-700 hover:text-petrol-700",
}: {
  /** Farben; in der dunklen App-Kopfzeile hell. */
  className?: string;
}) {
  async function signOut() {
    await fetch("/api/auth/abmelden", { method: "POST" }).catch(() => undefined);
    // Harter Seitenwechsel: kein zwischengespeicherter App-Inhalt bleibt stehen.
    window.location.assign("/");
  }

  return (
    <button
      onClick={signOut}
      className={`text-[12.5px] font-medium ${className}`}
    >
      Abmelden
    </button>
  );
}
