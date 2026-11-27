import { NextResponse } from "next/server";

/**
 * Stripe-Webhook: stillgelegt, bis die Bezahlung wirklich eingebaut wird.
 *
 * Bisher nahm der Platzhalter jede POST-Anfrage an und antwortete 200, ohne
 * zu prüfen, ob sie von Stripe kommt. Ausgelöst hat er nichts, aber eine
 * Route, die «empfangen» meldet, lädt dazu ein, später Logik dahinter zu
 * hängen und die Prüfung zu vergessen. Darum jetzt 501: Der Body wird nicht
 * gelesen, nichts wird protokolliert oder ausgelöst.
 *
 * Die Herkunftsprüfung der Middleware (lib/api-origin.ts) nimmt diese Route
 * aus, weil Stripe keinen Origin schickt. Die echte Umsetzung muss darum
 * selbst prüfen, bevor sie irgendetwas tut:
 *   1. Rohtext lesen (`await req.text()`, nicht `req.json()`: die Signatur
 *      gilt für die Bytes, wie sie ankommen).
 *   2. `stripe.webhooks.constructEvent(rohtext, req.headers.get("stripe-signature"),
 *      process.env.STRIPE_WEBHOOK_SECRET)`; wirft es, mit 400 abweisen. Das
 *      Paket `stripe` ist schon Abhängigkeit.
 *   3. Erst dann `checkout.session.completed` verarbeiten: payments auf
 *      «succeeded», verknüpfte verification/analysis auf paid = true.
 *   4. Nie den Payload protokollieren: Er enthält Name, E-Mail und
 *      Zahlungsdaten der kaufenden Person.
 */
export function POST() {
  return NextResponse.json(
    { error: "Zahlungen sind noch nicht eingerichtet." },
    { status: 501 },
  );
}
