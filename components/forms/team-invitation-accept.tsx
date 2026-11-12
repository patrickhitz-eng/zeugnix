"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

export function TeamInvitationAccept({ token }: { token: string }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  async function accept() {
    setBusy(true);
    setError("");
    try {
      const res = await fetch("/api/team/invitations/accept", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error ?? "Die Einladung liess sich nicht annehmen.");
      router.push("/app/dashboard");
      router.refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Die Einladung liess sich nicht annehmen.");
      setBusy(false);
    }
  }

  return (
    <div>
      <button onClick={accept} disabled={busy} className="btn-primary w-full py-3 text-[14px] disabled:opacity-50">
        {busy ? "Wird angenommen …" : "Einladung annehmen"}
      </button>
      {error && (
        <div className="mt-3 rounded-md border border-red-200 bg-red-50 px-3 py-2 text-[12.5px] text-red-700">{error}</div>
      )}
    </div>
  );
}
