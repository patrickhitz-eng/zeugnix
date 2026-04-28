/**
 * zeugnix.ch – E-Mail-Templates
 * ----------------------------------------------------------------------------
 * HTML-Templates für transaktionale Mails. Inline-Styles, weil viele
 * Mail-Clients <style>-Blöcke filtern oder verändern.
 *
 * Designprinzipien:
 *   - Nüchtern, professionell, schweizerisch
 *   - Maximale Kompatibilität (Outlook, Gmail, Apple Mail)
 *   - Tabellenbasiertes Layout für Stabilität
 *   - Lesbar auch in Plain-Text-Fallback
 */

interface ManagerInvitationProps {
  managerName?: string;
  employeeName: string;
  companyName: string;
  hrSenderName?: string;
  hrSenderEmail?: string;
  inviteUrl: string;
  expiresAt: Date;
}

export function buildManagerInvitationEmail(props: ManagerInvitationProps): {
  subject: string;
  html: string;
  text: string;
} {
  const { employeeName, companyName, inviteUrl, expiresAt, managerName, hrSenderName, hrSenderEmail } =
    props;

  const expiryDate = expiresAt.toLocaleDateString("de-CH", {
    day: "2-digit",
    month: "long",
    year: "numeric",
  });

  const greeting = managerName ? `Guten Tag ${managerName}` : "Guten Tag";
  const senderLine = hrSenderName
    ? hrSenderEmail
      ? `${hrSenderName} (${hrSenderEmail}) von ${companyName}`
      : `${hrSenderName} von ${companyName}`
    : companyName;

  const subject = `Beurteilung erbeten: Arbeitszeugnis für ${employeeName}`;

  const text = [
    greeting + ",",
    "",
    `${senderLine} bittet Sie um Ihre Beurteilung für das Arbeitszeugnis von ${employeeName}.`,
    "",
    "Sie müssen keinen Account erstellen und keinen Text formulieren.",
    "Sie geben in einem strukturierten Formular pro Kategorie eine Bewertung ab –",
    "die Plattform erstellt daraus automatisch den Zeugnistext.",
    "",
    "Beurteilung starten:",
    inviteUrl,
    "",
    `Dieser Link ist gültig bis ${expiryDate}.`,
    "",
    "Ihre Eingaben werden vertraulich behandelt und nur zur Erstellung",
    "des Arbeitszeugnisses verwendet.",
    "",
    "Mit freundlichen Grüssen",
    "zeugnix.ch",
    "",
    "—",
    "Diese E-Mail wurde automatisch versendet, weil Ihre E-Mail-Adresse",
    "von Ihrem Arbeitgeber als Beurteilungsperson für ein Arbeitszeugnis",
    "angegeben wurde. Falls dies ein Irrtum ist, ignorieren Sie diese Mail.",
  ].join("\n");

  const html = `<!DOCTYPE html>
<html lang="de">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${subject}</title>
</head>
<body style="margin:0;padding:0;background:#f4f5f7;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;color:#1a1d22;">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background:#f4f5f7;">
  <tr>
    <td align="center" style="padding:32px 16px;">
      <table role="presentation" width="560" cellpadding="0" cellspacing="0" border="0" style="max-width:560px;width:100%;background:#ffffff;border-radius:8px;border:1px solid #e4e6ea;">

        <!-- Letterhead -->
        <tr>
          <td style="padding:28px 32px 20px 32px;border-bottom:1px solid #e4e6ea;">
            <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">
              <tr>
                <td style="font-size:16px;font-weight:600;color:#1a1d22;letter-spacing:-0.01em;">
                  zeugnix<span style="color:#0f7a6b;">.ch</span>
                </td>
                <td align="right" style="font-size:11px;color:#6b7178;text-transform:uppercase;letter-spacing:0.06em;">
                  Beurteilung
                </td>
              </tr>
            </table>
          </td>
        </tr>

        <!-- Body -->
        <tr>
          <td style="padding:32px;">
            <h1 style="margin:0 0 12px 0;font-size:22px;font-weight:500;line-height:1.3;color:#1a1d22;letter-spacing:-0.01em;">
              Beurteilung erbeten für<br>
              <span style="font-style:italic;color:#0f7a6b;">${escapeHtml(employeeName)}</span>
            </h1>
            <p style="margin:16px 0;font-size:14.5px;line-height:1.65;color:#3a3f46;">
              ${escapeHtml(greeting)},
            </p>
            <p style="margin:16px 0;font-size:14.5px;line-height:1.65;color:#3a3f46;">
              ${escapeHtml(senderLine)} bittet Sie um Ihre Beurteilung für das Arbeitszeugnis
              von <strong>${escapeHtml(employeeName)}</strong>.
            </p>
            <p style="margin:16px 0;font-size:14.5px;line-height:1.65;color:#3a3f46;">
              Sie müssen <strong>keinen Account erstellen</strong> und <strong>keinen Text formulieren</strong>.
              Sie geben in einem strukturierten Formular pro Kategorie eine Bewertung ab —
              die Plattform erstellt daraus automatisch den Zeugnistext.
            </p>

            <!-- CTA Button -->
            <table role="presentation" cellpadding="0" cellspacing="0" border="0" style="margin:28px 0;">
              <tr>
                <td style="border-radius:6px;background:#0f7a6b;">
                  <a href="${inviteUrl}" style="display:inline-block;padding:13px 28px;font-size:14px;font-weight:500;color:#ffffff;text-decoration:none;letter-spacing:0.01em;">
                    Beurteilung starten →
                  </a>
                </td>
              </tr>
            </table>

            <p style="margin:16px 0 4px 0;font-size:12px;color:#6b7178;">
              Falls der Button nicht funktioniert, kopieren Sie diesen Link:
            </p>
            <p style="margin:0 0 16px 0;font-size:11.5px;color:#6b7178;word-break:break-all;font-family:'SF Mono',Menlo,Consolas,monospace;">
              ${escapeHtml(inviteUrl)}
            </p>

            <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="margin:24px 0;background:#f4f5f7;border-radius:6px;">
              <tr>
                <td style="padding:14px 18px;font-size:13px;line-height:1.55;color:#3a3f46;">
                  <strong style="color:#1a1d22;">Gültig bis:</strong> ${expiryDate}<br>
                  <strong style="color:#1a1d22;">Dauer:</strong> ca. 5 Minuten<br>
                  <strong style="color:#1a1d22;">Vertraulich:</strong> Ihre Eingaben werden nur
                  zur Erstellung dieses Zeugnisses verwendet.
                </td>
              </tr>
            </table>
          </td>
        </tr>

        <!-- Footer -->
        <tr>
          <td style="padding:20px 32px 28px 32px;border-top:1px solid #e4e6ea;font-size:11.5px;line-height:1.55;color:#8a8f96;">
            Diese E-Mail wurde automatisch versendet, weil Ihre E-Mail-Adresse von
            Ihrem Arbeitgeber als Beurteilungsperson für ein Arbeitszeugnis angegeben wurde.
            Falls dies ein Irrtum ist, ignorieren Sie diese Mail.
            <br><br>
            zeugnix.ch — Arbeitszeugnisse erstellen, absichern, prüfen.
          </td>
        </tr>

      </table>
    </td>
  </tr>
</table>
</body>
</html>`;

  return { subject, html, text };
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}
