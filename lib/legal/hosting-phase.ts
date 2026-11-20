/**
 * Welcher Betriebszustand auf der Website beschrieben wird.
 *
 * Drei Schalter für alle Aussagen über Anbieter und Orte: Datenschutzerklärung
 * (app/legal/privacy/page.tsx, Abschnitt 5), FAQ «Wer sieht die Daten»
 * (components/sections/faq.tsx) und Vertrauensstreifen
 * (components/sections/trust-strip.tsx). Die Texte setzen sich daraus
 * zusammen und können darum nicht auseinanderlaufen.
 *
 * Jeder Schalter beschreibt einen FAKT. Erst umlegen, wenn der Fakt auf
 * Produktion stimmt, sonst behauptet die Website etwas Falsches (UWG Art. 3
 * Abs. 1 lit. b, Art. 19 DSG) und Anhang 3 des Auftragsbearbeitungsvertrags
 * stimmt nicht.
 *
 * Grundzustand dieses Codes: nach dem Umzug zu nine (Cutover A).
 */

export type Anmeldung = "supabase" | "nine";
export type Mail = "resend" | "mailomat";
export type AuslandzugriffNine = "moeglich" | "ausgeschlossen";

/**
 * "supabase": Anmeldung über Supabase Auth (Frankfurt).
 * "nine": eigene Anmeldung auf advisori01 (Cutover B). Umlegen, wenn die App
 * supabase.co nicht mehr aufruft (`connect-src` ohne Supabase) und das
 * Supabase-Projekt leer oder gelöscht ist.
 */
export const ANMELDUNG: Anmeldung = "supabase";

/**
 * "resend": Mailversand und Empfang @zeugnio.ch über Resend (Irland/USA).
 * "mailomat": Versand über mailomat.swiss (cutover-reihenfolge.md 6.3).
 * Umlegen, wenn Resend abgeschaltet und der Schlüssel widerrufen ist, der
 * Standort Schweiz in mailomats Vertrag steht und geklärt ist, wer E-Mails an
 * Adressen @zeugnio.ch empfängt (dann im mailomat-Eintrag der
 * Datenschutzerklärung nachtragen).
 */
export const MAIL: Mail = "resend";

/**
 * "moeglich": nines Tochter in Kanada kann für Notfälle zugreifen, und
 * Cloudflare steht mit Vorbehalt in der Liste.
 * "ausgeschlossen": Kanada per SSH-Schlüsselverwaltung von advisori01
 * ausgeschlossen (laut nines AVV möglich, mit Einschränkungen im SLA),
 * schriftlich bestätigt, UND bei nine ist kein Cloudflare oder anderer Dienst
 * mit Unterauftragsbearbeitern ausserhalb der Schweiz gebucht.
 */
export const AUSLANDZUGRIFF_NINE: AuslandzugriffNine = "moeglich";

/** Alle Auftragsbearbeiter des Dienstes in der Schweiz. */
// Die Umwandlungen in den Typ sind nötig, weil TypeScript die Konstanten oben
// sonst auf ihren aktuellen Wert festlegt und den Vergleich als unmöglich meldet.
export const ALLES_SCHWEIZ: boolean =
  (ANMELDUNG as Anmeldung) === "nine" &&
  (MAIL as Mail) === "mailomat" &&
  (AUSLANDZUGRIFF_NINE as AuslandzugriffNine) === "ausgeschlossen";
