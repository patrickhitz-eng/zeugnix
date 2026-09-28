/**
 * zeugnio.ch – E-Mail-Templates
 * ----------------------------------------------------------------------------
 * HTML-Templates für transaktionale Mails. Inline-Styles, weil viele
 * Mail-Clients <style>-Blöcke filtern oder verändern.
 *
 * Designprinzipien:
 *   - Nüchtern, professionell, schweizerisch
 *   - Maximale Kompatibilität (Outlook, Gmail, Apple Mail)
 *   - Tabellenbasiertes Layout für Stabilität
 *   - Lesbar auch in Plain-Text-Fallback
 *
 * ----------------------------------------------------------------------------
 * KEIN NAME DER BEURTEILTEN PERSON IN DIESEN MAILS
 *
 * Eine Grenze bleibt auch nach dem Umzug auf Schweizer Infrastruktur bestehen,
 * und sie ist nicht zu umgehen: Sobald eine Einladung an ein Postfach bei
 * Microsoft 365 oder Gmail geht, liegt diese Mail in einem US-Rechenzentrum –
 * ganz unabhängig davon, über welchen Schweizer Versender wir sie verschickt
 * haben. Der einzige wirksame Hebel ist deshalb, was in der Mail steht.
 *
 * Darum nennen diese Vorlagen den Namen der Person, um deren Zeugnis es geht,
 * nicht mehr – weder im Betreff noch im Text. Er erscheint erst hinter dem
 * Link, also auf zeugnio.ch und damit in der Schweiz. Die Vorlagen nehmen den
 * Namen gar nicht mehr als Feld an: so lässt er sich nicht aus Versehen wieder
 * hineinschreiben.
 *
 * Die Namen der Beteiligten selbst – Empfängerin, Absender, Beurteiler – bleiben
 * stehen. Das ist die Grenze: wer eine Mail schreibt oder bekommt, ist Teil des
 * Schriftverkehrs. Die Person, deren Zeugnis erstellt wird, ist es nicht.
 *
 * Steht das so auch in der Datenschutzerklärung: Bearbeitung und Speicherung in
 * der Schweiz, Zustellung beim Mailanbieter der Empfängerin und damit
 * ausserhalb unseres Einflussbereichs.
 * ----------------------------------------------------------------------------
 */

interface ManagerInvitationProps {
  managerName?: string;
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
  const { companyName, inviteUrl, expiresAt, managerName, hrSenderName, hrSenderEmail } =
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

  const subject = `Beurteilung erbeten: Arbeitszeugnis (${companyName})`;

  const text = [
    greeting + ",",
    "",
    `${senderLine} bittet Sie um Ihre Beurteilung für ein Arbeitszeugnis.`,
    "",
    "Um wen es geht, sehen Sie nach dem Öffnen des Links. Wir nennen in E-Mails",
    "bewusst keine Namen von Mitarbeitenden.",
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
    "zeugnio.ch",
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
                  zeugnio<span style="color:#0f7a6b;">.ch</span>
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
              Beurteilung erbeten<br>
              <span style="font-style:italic;color:#0f7a6b;">${escapeHtml(companyName)}</span>
            </h1>
            <p style="margin:16px 0;font-size:14.5px;line-height:1.65;color:#3a3f46;">
              ${escapeHtml(greeting)},
            </p>
            <p style="margin:16px 0;font-size:14.5px;line-height:1.65;color:#3a3f46;">
              ${escapeHtml(senderLine)} bittet Sie um Ihre Beurteilung für ein
              Arbeitszeugnis.
            </p>
            <p style="margin:16px 0;font-size:14.5px;line-height:1.65;color:#3a3f46;">
              Um wen es geht, sehen Sie nach dem Öffnen des Links. Wir nennen in
              E-Mails bewusst keine Namen von Mitarbeitenden.
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
                  <a href="${escapeHtml(inviteUrl)}" style="display:inline-block;padding:13px 28px;font-size:14px;font-weight:500;color:#ffffff;text-decoration:none;letter-spacing:0.01em;">
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
            zeugnio.ch — Arbeitszeugnisse erstellen, absichern, prüfen.
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

// ============================================================================
// Unterzeichner-Freigabe erbeten (V2): benannte Person bestaetigt das Zeugnis
// per Magic-Link. Die bestaetigende E-Mail ist die Identitaetsbindung.
// ============================================================================
interface SignoffRequestProps {
  signatoryName?: string;
  signatoryRole?: string;
  companyName: string;
  hrSenderName?: string;
  hrSenderEmail?: string;
  signoffUrl: string;
  expiresAt: Date;
}

export function buildSignoffRequestEmail(props: SignoffRequestProps): {
  subject: string;
  html: string;
  text: string;
} {
  const {
    signatoryName,
    signatoryRole,
    companyName,
    hrSenderName,
    hrSenderEmail,
    signoffUrl,
    expiresAt,
  } = props;

  const expiryDate = expiresAt.toLocaleDateString("de-CH", {
    day: "2-digit",
    month: "long",
    year: "numeric",
  });

  const greeting = signatoryName ? `Guten Tag ${signatoryName}` : "Guten Tag";
  const senderLine = hrSenderName
    ? hrSenderEmail
      ? `${hrSenderName} (${hrSenderEmail}) von ${companyName}`
      : `${hrSenderName} von ${companyName}`
    : companyName;
  const roleLine = signatoryRole ? ` als ${signatoryRole}` : "";

  const subject = `Freigabe erbeten: Arbeitszeugnis (${companyName})`;

  const text = [
    greeting + ",",
    "",
    `${senderLine} bittet Sie${roleLine}, ein Arbeitszeugnis freizugeben.`,
    "",
    "Um wen es geht, sehen Sie nach dem Öffnen des Links. Wir nennen in E-Mails",
    "bewusst keine Namen von Mitarbeitenden.",
    "",
    "Bitte prüfen Sie das Zeugnis und bestätigen Sie es. Ihre Bestätigung wird",
    "mit Ihrer E-Mail-Adresse und einem Zeitstempel als elektronische Freigabe",
    "festgehalten und erscheint als Echtheitssignal auf dem Zeugnis.",
    "",
    "Zeugnis ansehen und freigeben:",
    signoffUrl,
    "",
    `Dieser Link ist gültig bis ${expiryDate}.`,
    "",
    "Falls Sie diese Person oder dieses Zeugnis nicht kennen, ignorieren Sie",
    "diese Mail — es geschieht nichts.",
    "",
    "Mit freundlichen Grüssen",
    "zeugnio.ch",
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

        <tr>
          <td style="padding:28px 32px 20px 32px;border-bottom:1px solid #e4e6ea;">
            <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">
              <tr>
                <td style="font-size:16px;font-weight:600;color:#1a1d22;letter-spacing:-0.01em;">
                  zeugnio<span style="color:#0f7a6b;">.ch</span>
                </td>
                <td align="right" style="font-size:11px;color:#6b7178;text-transform:uppercase;letter-spacing:0.06em;">
                  Freigabe
                </td>
              </tr>
            </table>
          </td>
        </tr>

        <tr>
          <td style="padding:32px;">
            <h1 style="margin:0 0 12px 0;font-size:22px;font-weight:500;line-height:1.3;color:#1a1d22;letter-spacing:-0.01em;">
              Freigabe erbeten<br>
              <span style="font-style:italic;color:#0f7a6b;">${escapeHtml(companyName)}</span>
            </h1>
            <p style="margin:16px 0;font-size:14.5px;line-height:1.65;color:#3a3f46;">
              ${escapeHtml(greeting)},
            </p>
            <p style="margin:16px 0;font-size:14.5px;line-height:1.65;color:#3a3f46;">
              ${escapeHtml(senderLine)} bittet Sie${escapeHtml(roleLine)}, ein
              Arbeitszeugnis freizugeben.
            </p>
            <p style="margin:16px 0;font-size:14.5px;line-height:1.65;color:#3a3f46;">
              Um wen es geht, sehen Sie nach dem Öffnen des Links. Wir nennen in
              E-Mails bewusst keine Namen von Mitarbeitenden.
            </p>
            <p style="margin:16px 0;font-size:14.5px;line-height:1.65;color:#3a3f46;">
              Bitte prüfen Sie das Zeugnis und bestätigen Sie es. Ihre Bestätigung
              wird mit Ihrer E-Mail-Adresse und einem Zeitstempel als
              <strong>elektronische Freigabe</strong> festgehalten und erscheint
              als Echtheitssignal auf dem Zeugnis.
            </p>

            <table role="presentation" cellpadding="0" cellspacing="0" border="0" style="margin:28px 0;">
              <tr>
                <td style="border-radius:6px;background:#0f7a6b;">
                  <a href="${escapeHtml(signoffUrl)}" style="display:inline-block;padding:13px 28px;font-size:14px;font-weight:500;color:#ffffff;text-decoration:none;letter-spacing:0.01em;">
                    Zeugnis ansehen und freigeben →
                  </a>
                </td>
              </tr>
            </table>

            <p style="margin:16px 0 4px 0;font-size:12px;color:#6b7178;">
              Falls der Button nicht funktioniert, kopieren Sie diesen Link:
            </p>
            <p style="margin:0 0 16px 0;font-size:11.5px;color:#6b7178;word-break:break-all;font-family:'SF Mono',Menlo,Consolas,monospace;">
              ${escapeHtml(signoffUrl)}
            </p>

            <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="margin:24px 0;background:#f4f5f7;border-radius:6px;">
              <tr>
                <td style="padding:14px 18px;font-size:13px;line-height:1.55;color:#3a3f46;">
                  <strong style="color:#1a1d22;">Gültig bis:</strong> ${expiryDate}<br>
                  <strong style="color:#1a1d22;">Falls unbekannt:</strong> Kennen Sie diese
                  Person oder dieses Zeugnis nicht, ignorieren Sie diese Mail — es geschieht nichts.
                </td>
              </tr>
            </table>
          </td>
        </tr>

        <tr>
          <td style="padding:20px 32px 28px 32px;border-top:1px solid #e4e6ea;font-size:11.5px;line-height:1.55;color:#8a8f96;">
            Diese E-Mail wurde automatisch versendet, weil Ihre E-Mail-Adresse von
            Ihrem Arbeitgeber als unterzeichnende Person für ein Arbeitszeugnis angegeben wurde.
            <br><br>
            zeugnio.ch — Arbeitszeugnisse erstellen, absichern, prüfen.
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

// ============================================================================
// HR-Benachrichtigung: Beurteilung wurde abgegeben
// ============================================================================
interface EvaluationSubmittedProps {
  hrName?: string;
  managerEmail: string;
  managerName?: string;
  certificateUrl: string;
}

export function buildEvaluationSubmittedEmail(props: EvaluationSubmittedProps): {
  subject: string;
  html: string;
  text: string;
} {
  const { hrName, managerEmail, managerName, certificateUrl } = props;

  const greeting = hrName ? `Guten Tag ${hrName}` : "Guten Tag";
  const beurteiler = managerName ? `${managerName} (${managerEmail})` : managerEmail;

  // Diese Mail geht an die HR-Person, die das Zeugnis angelegt hat – sie kennt die
  // Person also. Der Name bleibt trotzdem draussen: die Mail liegt danach im
  // Postfach eines Anbieters, und eine Regel, die nur manchmal gilt, ist in einer
  // Datenschutzerklärung nicht formulierbar.
  const subject = "Beurteilung erhalten – Arbeitszeugnis";

  const text = [
    greeting + ",",
    "",
    `${beurteiler} hat eine Beurteilung für ein Arbeitszeugnis abgegeben.`,
    "",
    "Um welches Zeugnis es geht, sehen Sie hinter dem Link.",
    "",
    "Sie können nun den Zeugnistext generieren und finalisieren:",
    certificateUrl,
    "",
    "Mit freundlichen Grüssen",
    "zeugnio.ch",
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

        <tr>
          <td style="padding:28px 32px 20px 32px;border-bottom:1px solid #e4e6ea;">
            <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">
              <tr>
                <td style="font-size:16px;font-weight:600;color:#1a1d22;letter-spacing:-0.01em;">
                  zeugnio<span style="color:#0f7a6b;">.ch</span>
                </td>
                <td align="right" style="font-size:11px;color:#6b7178;text-transform:uppercase;letter-spacing:0.06em;">
                  Beurteilung eingegangen
                </td>
              </tr>
            </table>
          </td>
        </tr>

        <tr>
          <td style="padding:32px;">
            <h1 style="margin:0 0 12px 0;font-size:22px;font-weight:500;line-height:1.3;color:#1a1d22;letter-spacing:-0.01em;">
              Beurteilung erhalten<br>
              <span style="font-style:italic;color:#0f7a6b;">Arbeitszeugnis</span>
            </h1>
            <p style="margin:16px 0;font-size:14.5px;line-height:1.65;color:#3a3f46;">
              ${escapeHtml(greeting)},
            </p>
            <p style="margin:16px 0;font-size:14.5px;line-height:1.65;color:#3a3f46;">
              <strong>${escapeHtml(beurteiler)}</strong> hat eine Beurteilung
              für ein Arbeitszeugnis abgegeben. Um welches Zeugnis es geht, sehen
              Sie hinter dem Link.
            </p>
            <p style="margin:16px 0;font-size:14.5px;line-height:1.65;color:#3a3f46;">
              Sie können nun den Zeugnistext generieren, prüfen und mit
              kryptografischem Echtheitsnachweis finalisieren.
            </p>

            <table role="presentation" cellpadding="0" cellspacing="0" border="0" style="margin:28px 0;">
              <tr>
                <td style="border-radius:6px;background:#0f7a6b;">
                  <a href="${escapeHtml(certificateUrl)}" style="display:inline-block;padding:13px 28px;font-size:14px;font-weight:500;color:#ffffff;text-decoration:none;letter-spacing:0.01em;">
                    Zum Zeugnis →
                  </a>
                </td>
              </tr>
            </table>
          </td>
        </tr>

        <tr>
          <td style="padding:20px 32px 28px 32px;border-top:1px solid #e4e6ea;font-size:11.5px;line-height:1.55;color:#8a8f96;">
            zeugnio.ch — Arbeitszeugnisse erstellen, absichern, prüfen.
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
