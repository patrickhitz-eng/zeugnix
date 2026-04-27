import { NextRequest, NextResponse } from "next/server";

/**
 * Stripe-Webhook-Endpoint (Stub für MVP).
 *
 * Im Produktionsbetrieb:
 *   1. Webhook-Signatur validieren (process.env.STRIPE_WEBHOOK_SECRET)
 *   2. Event 'checkout.session.completed' abfangen
 *   3. payments-Tabelle: status = 'succeeded', stripe_payment_id eintragen
 *   4. Verknüpfte verification/analysis: paid = true
 *   5. E-Mail an Käufer mit Resultat
 *
 * Aktuell: nimmt POST entgegen, loggt und antwortet 200.
 */

export async function POST(req: NextRequest) {
  try {
    const body = await req.text();
    console.log("Stripe webhook received (stub):", body.slice(0, 200));

    // ---- Echte Webhook-Verarbeitung (auskommentiert) ----
    // const sig = req.headers.get('stripe-signature')!;
    // const event = stripe.webhooks.constructEvent(body, sig, process.env.STRIPE_WEBHOOK_SECRET!);
    // if (event.type === 'checkout.session.completed') { ... }

    return NextResponse.json({ received: true });
  } catch (err: any) {
    return NextResponse.json(
      { error: err.message ?? "Webhook error" },
      { status: 400 },
    );
  }
}
