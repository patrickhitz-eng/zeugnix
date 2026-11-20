/**
 * Welcher Betriebszustand auf der Website beschrieben wird.
 *
 * EIN Schalter für alle Aussagen über Anbieter und Orte: Datenschutzerklärung
 * (app/legal/privacy/page.tsx, Abschnitt 5), FAQ «Wer sieht die Daten»
 * (components/sections/faq.tsx) und Vertrauensstreifen
 * (components/sections/trust-strip.tsx). So können die Texte nie
 * auseinanderlaufen.
 *
 * - "uebergang": nach dem Umzug zu nine (Cutover A). Anwendung, Datenbank und
 *   Logos bei nine in Zürich; die Anmeldung noch über Supabase (Frankfurt),
 *   Mails noch über Resend (Irland/USA), Notfallzugriff von nine aus Kanada.
 *
 * - "schweiz": Endzustand. Erst umschalten, wenn ALLE vier Punkte erfüllt
 *   sind, sonst behauptet die Website etwas Falsches (UWG Art. 3 Abs. 1
 *   lit. b, Art. 19 DSG) und Anhang 3 des Auftragsbearbeitungsvertrags
 *   stimmt nicht:
 *     1. Cutover B ist durch: Die App fragt Supabase nicht mehr
 *        (`connect-src` ohne supabase.co), das Supabase-Projekt ist gelöscht
 *        oder leer.
 *     2. Mailversand läuft über mailomat.swiss (cutover-reihenfolge.md 6.3),
 *        Resend ist abgeschaltet und der Schlüssel widerrufen. Der Standort
 *        Schweiz steht in mailomats Vertrag.
 *     3. nines Tochter in Kanada ist per SSH-Schlüsselverwaltung vom Zugriff
 *        auf advisori01 ausgeschlossen (laut nines AVV möglich, mit
 *        Einschränkungen im SLA), schriftlich bestätigt.
 *     4. Kein Cloudflare oder anderer Dienst bei nine gebucht, für den nine
 *        Unterauftragsbearbeiter ausserhalb der Schweiz beizieht.
 *   Offen für den Endzustand: wer E-Mails an Adressen @zeugnio.ch empfängt
 *   (heute Resend). Das muss vor dem Umschalten in RECIPIENTS stehen.
 */
export type HostingPhase = "uebergang" | "schweiz";

export const HOSTING_PHASE: HostingPhase = "uebergang";
