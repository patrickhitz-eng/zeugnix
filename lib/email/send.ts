/**
 * zeugnix.ch – E-Mail-Service via Resend
 * ----------------------------------------------------------------------------
 * Versendet transaktionale E-Mails. Verwendet die Resend-API.
 *
 * Konfiguration:
 *   RESEND_API_KEY          – API-Key aus Resend Dashboard
 *   EMAIL_FROM              – Absenderadresse (z.B. "noreply@zeugnix.ch")
 *   EMAIL_REPLY_TO          – Optional, Antworten gehen hierhin (z.B. "support@zeugnix.ch")
 *
 * Fallback: Wenn RESEND_API_KEY fehlt, wird der Versand übersprungen und
 * stattdessen ein Hinweis geloggt. Die aufrufende Funktion kann dann
 * entscheiden, was zu tun ist (z.B. Link in API-Antwort zurückgeben).
 */

const RESEND_API_URL = "https://api.resend.com/emails";

export interface SendEmailParams {
  to: string;
  subject: string;
  html: string;
  text?: string;
  replyTo?: string;
}

export interface SendEmailResult {
  sent: boolean;
  id?: string;
  error?: string;
  reason?: "no_api_key" | "api_error" | "invalid_input";
}

/**
 * Sendet eine E-Mail via Resend. Idempotent gegenüber fehlender Konfiguration.
 */
export async function sendEmail(params: SendEmailParams): Promise<SendEmailResult> {
  const apiKey = process.env.RESEND_API_KEY;
  const from = process.env.EMAIL_FROM ?? "noreply@zeugnix.ch";
  const defaultReplyTo = process.env.EMAIL_REPLY_TO;

  if (!apiKey) {
    console.warn("[email] RESEND_API_KEY nicht gesetzt – Versand übersprungen");
    return { sent: false, reason: "no_api_key" };
  }

  if (!params.to || !params.to.includes("@")) {
    return { sent: false, reason: "invalid_input", error: "Ungültige Empfängeradresse" };
  }

  try {
    const body: Record<string, unknown> = {
      from: `zeugnix.ch <${from}>`,
      to: [params.to],
      subject: params.subject,
      html: params.html,
    };
    if (params.text) body.text = params.text;
    const replyTo = params.replyTo ?? defaultReplyTo;
    if (replyTo) body.reply_to = replyTo;

    const res = await fetch(RESEND_API_URL, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(body),
    });

    if (!res.ok) {
      const errText = await res.text();
      console.error("[email] Resend API error:", res.status, errText);
      return {
        sent: false,
        reason: "api_error",
        error: `Resend ${res.status}: ${errText.slice(0, 200)}`,
      };
    }

    const data = await res.json();
    return { sent: true, id: data.id };
  } catch (err: any) {
    console.error("[email] Resend fetch error:", err);
    return { sent: false, reason: "api_error", error: err.message ?? "Unknown error" };
  }
}
