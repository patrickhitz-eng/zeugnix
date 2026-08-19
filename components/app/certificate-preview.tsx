"use client";

import { useEffect, useRef, useState } from "react";
import QRCode from "qrcode";
import { buildVerifyUrl } from "@/lib/hash/canonicalize";
import { resolveTheme } from "@/lib/design/document-tokens";
import { buildDocumentCss } from "@/lib/design/document-css";

interface Company {
  name?: string;
  address?: string | null;
  postal_code?: string | null;
  city?: string | null;
  website?: string | null;
  phone?: string | null;
  email?: string | null;
  logo_url?: string | null;
  signatory_1_name?: string | null;
  signatory_1_role?: string | null;
  signatory_2_name?: string | null;
  signatory_2_role?: string | null;
}

interface Employee {
  first_name: string;
  last_name: string;
  gender: "m" | "f" | "d";
  function_title: string;
  date_of_birth?: string | null;
  entry_date: string;
  exit_date?: string | null;
}

interface Props {
  company: Company;
  employee: Employee;
  type: string;
  text: string;
  hash?: string | null;
  /**
   * Optionaler vorgerenderter Body (formatierter Rich-Text). Ist er gesetzt,
   * wird er statt des Plain-Text-Splits gerendert; der A4-Rahmen bleibt gleich.
   */
  bodyOverride?: React.ReactNode;
  /** Theme des Dokuments; versteht auch die Alt-Font-Keys. */
  themeId?: string | null;
}

const TYPE_LABELS: Record<string, string> = {
  schluss: "Arbeitszeugnis",
  zwischen: "Zwischenzeugnis",
  funktionswechsel: "Arbeitszeugnis",
  vorgesetztenwechsel: "Arbeitszeugnis",
  interner_wechsel: "Arbeitszeugnis",
  reorganisation: "Arbeitszeugnis",
  wunsch_mitarbeiterin: "Arbeitszeugnis",
  wunsch_mitarbeiter: "Arbeitszeugnis",
  arbeitsbestaetigung: "Arbeitsbestätigung",
};

export function CertificatePreview({
  company,
  employee,
  type,
  text,
  hash,
  bodyOverride,
  themeId,
}: Props) {
  const title = TYPE_LABELS[type] ?? "Arbeitszeugnis";
  const theme = resolveTheme(themeId);
  const css = buildDocumentCss(theme);
  // Schwarz/weiss wie im PDF (certificate.tsx) – bester Scan-Kontrast.
  const qrDark = theme.colors.textPrimary;
  const qrLight = theme.colors.paper;

  // QR-Code zum Hash erzeugen – identische Verify-URL und Optionen wie im PDF
  // (lib/pdf/certificate.tsx), damit Vorschau und PDF konsistent sind.
  const [qrDataUrl, setQrDataUrl] = useState<string>("");
  useEffect(() => {
    if (!hash) {
      setQrDataUrl("");
      return;
    }
    const baseUrl =
      process.env.NEXT_PUBLIC_SITE_URL ?? "https://zeugnio.ch";
    const verifyUrl = buildVerifyUrl(baseUrl, hash);
    let cancelled = false;
    QRCode.toDataURL(verifyUrl, {
      margin: 0,
      width: 200,
      color: { dark: qrDark, light: qrLight },
    })
      .then((url) => {
        if (!cancelled) setQrDataUrl(url);
      })
      .catch(() => {
        if (!cancelled) setQrDataUrl("");
      });
    return () => {
      cancelled = true;
    };
  }, [hash, qrDark, qrLight]);

  // A4-Blatt proportional auf die verfügbare Spaltenbreite skalieren, damit es
  // bei jeder Breite das echte DIN-A4-Verhältnis behält (nur kleiner, nie
  // gequetscht). 210mm ≈ 794px bei 96dpi.
  const A4_WIDTH = 794;
  const containerRef = useRef<HTMLDivElement>(null);
  const sheetRef = useRef<HTMLDivElement>(null);
  const [scale, setScale] = useState(1);
  const [naturalHeight, setNaturalHeight] = useState(1123); // 297mm ≈ 1123px

  useEffect(() => {
    const container = containerRef.current;
    const sheet = sheetRef.current;
    if (!container || !sheet) return;
    const update = () => {
      setScale(Math.min(1, container.clientWidth / A4_WIDTH));
      setNaturalHeight(sheet.offsetHeight);
    };
    update();
    const ro = new ResizeObserver(update);
    ro.observe(container);
    ro.observe(sheet);
    return () => ro.disconnect();
  }, [text, hash, qrDataUrl]);

  // Text in Absätze splitten
  const paragraphs = text.split(/\n\n+/).map((p) => p.trim()).filter(Boolean);

  return (
    <div className="overflow-hidden rounded-md bg-ink-100 p-4 sm:p-6">
      {/* containerRef misst die verfügbare Breite OHNE das eigene Padding
          dieses Wrappers – sonst rechnet sich die Skalierung zu gross und
          das A4-Blatt frisst den rechten Rand des grauen Kastens auf. */}
      <div ref={containerRef} className="flex justify-center">
        {/* Platzhalter mit skalierter Höhe, damit kein Leerraum entsteht */}
        <div
          style={{
            width: A4_WIDTH * scale,
            height: naturalHeight * scale,
            position: "relative",
          }}
        >
          {/* A4-Blatt in Originalgrösse (210mm), proportional herunterskaliert */}
          <div
            ref={sheetRef}
            className="bg-white"
            style={{
              ...css.sheet,
              position: "absolute",
              top: 0,
              left: 0,
              boxShadow:
                "0 1px 2px rgba(14, 16, 20, 0.08), 0 8px 24px rgba(14, 16, 20, 0.12)",
              transform: `scale(${scale})`,
              transformOrigin: "top left",
            }}
          >
        {/* Letterhead */}
        <table style={css.letterhead}>
          <tbody>
            <tr>
              <td style={{ verticalAlign: "top", width: "60%" }}>
                {company.logo_url ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={company.logo_url} alt={company.name} style={css.logo} />
                ) : (
                  <div style={css.companyNameNoLogo}>{company.name}</div>
                )}
              </td>
              <td style={css.letterheadRight}>
                {company.logo_url && (
                  <div style={css.letterheadCompanyName}>{company.name}</div>
                )}
                {company.address && <div>{company.address}</div>}
                {(company.postal_code || company.city) && (
                  <div>
                    {company.postal_code} {company.city}
                  </div>
                )}
                {company.phone && <div>{company.phone}</div>}
                {company.email && <div>{company.email}</div>}
                {company.website && <div>{company.website}</div>}
              </td>
            </tr>
          </tbody>
        </table>

        {/* Title */}
        <h1 style={css.title}>{title}</h1>

        {/* Body */}
        <div style={{ textAlign: "justify" }}>
          {bodyOverride ?? paragraphs.map((p, i) => {
            // Bullet-Liste
            if (p.includes("•")) {
              const lines = p.split("\n");
              return (
                <div key={i} style={{ marginBottom: css.bodyParagraph.margin }}>
                  {lines.map((line, j) => (
                    <div key={j} style={line.startsWith("•") ? css.bullet : css.bodyParagraph}>
                      {line}
                    </div>
                  ))}
                </div>
              );
            }
            // Datum / Ort am Ende
            if (i === paragraphs.length - 1 && /^[A-ZÄÖÜ][a-zäöü]+,\s*\d{2}\.\d{2}\.\d{4}/.test(p)) {
              return (
                <p key={i} style={css.dateParagraph}>
                  {p}
                </p>
              );
            }
            return (
              <p key={i} style={css.bodyParagraph}>
                {p}
              </p>
            );
          })}
        </div>

        {/* Unterschriftsblock */}
        {(company.signatory_1_name || company.signatory_2_name) && (
          <div>
            <div style={css.signaturesHeader}>Digital ausgestellt durch</div>
            <table style={css.signaturesWrap}>
              <tbody>
                <tr>
                  {company.signatory_1_name && (
                    <td style={css.signatureCellLeft}>
                      <div style={css.signatureRule}>
                        <div style={css.signatureName}>{company.signatory_1_name}</div>
                        {company.signatory_1_role && (
                          <div style={css.signatureRole}>{company.signatory_1_role}</div>
                        )}
                      </div>
                    </td>
                  )}
                  {company.signatory_2_name && (
                    <td style={css.signatureCellRight}>
                      <div style={css.signatureRule}>
                        <div style={css.signatureName}>{company.signatory_2_name}</div>
                        {company.signatory_2_role && (
                          <div style={css.signatureRole}>{company.signatory_2_role}</div>
                        )}
                      </div>
                    </td>
                  )}
                </tr>
              </tbody>
            </table>
          </div>
        )}

        {/* Hash-Block (nur bei finalisierten Zeugnissen) – zweispaltig:
            Hash-Text links, QR-Code rechts (konsistent zum PDF) */}
        {hash && (
          <div style={css.hashBlock}>
            <div style={{ flex: 1 }}>
              <div style={css.hashLabel}>Echtheitsnachweis (SHA-256)</div>
              <div style={css.hashValue}>{hash}</div>
              <div>
                Dieses Arbeitszeugnis wurde mit zeugnio.ch erstellt und mit
                einem kryptografischen Echtheitsnachweis versehen. Jede
                nachträgliche Veränderung führt zu einem abweichenden Hash.
                Echtheit prüfen: zeugnio.ch/verify
              </div>
            </div>
            {qrDataUrl && (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={qrDataUrl} alt="QR-Code zur Echtheitsprüfung" style={css.qrCode} />
            )}
          </div>
        )}
          </div>
        </div>
      </div>
    </div>
  );
}
