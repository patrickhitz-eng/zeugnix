import { NextRequest, NextResponse } from "next/server";

/**
 * Stripe-Checkout-Endpoint (Stub für MVP).
 *
 * Erwartet: { product: 'verify_only' | 'analysis_only' | 'premium_check', email?: string }
 *
 * Im Produktionsbetrieb:
 *   1. Stripe-Client initialisieren (process.env.STRIPE_SECRET_KEY)
 *   2. Checkout-Session mit price_id für gewähltes Produkt erstellen
 *   3. URL zurückgeben, Frontend redirected
 *
 * Aktuell: gibt Mock-URL zurück, damit das UI nicht bricht.
 */

const PRODUCT_PRICES: Record<string, { amount: number; label: string }> = {
  verify_only: { amount: 19.9, label: "Verify – Echtheitsprüfung" },
  analysis_only: { amount: 29.9, label: "Klartext – Analyse" },
  premium_check: { amount: 39.9, label: "Premium-Check" },
};

export async function POST(req: NextRequest) {
  try {
    const { product, email } = await req.json();

    if (!product || !PRODUCT_PRICES[product]) {
      return NextResponse.json(
        { error: "Ungültiges Produkt" },
        { status: 400 },
      );
    }

    // ---- Echte Stripe-Integration (auskommentiert bis Keys hinterlegt) ----
    // const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!);
    // const session = await stripe.checkout.sessions.create({
    //   mode: 'payment',
    //   payment_method_types: ['card', 'twint'],
    //   customer_email: email,
    //   line_items: [{
    //     price_data: {
    //       currency: 'chf',
    //       product_data: { name: PRODUCT_PRICES[product].label },
    //       unit_amount: Math.round(PRODUCT_PRICES[product].amount * 100),
    //     },
    //     quantity: 1,
    //   }],
    //   success_url: `${process.env.NEXT_PUBLIC_SITE_URL}/verify?paid=1&session={CHECKOUT_SESSION_ID}`,
    //   cancel_url: `${process.env.NEXT_PUBLIC_SITE_URL}/pricing`,
    // });
    // return NextResponse.json({ url: session.url });

    // ---- MVP-Stub ----
    return NextResponse.json({
      url: "/pricing?stripe_not_configured=1",
      mock: true,
      product: PRODUCT_PRICES[product],
    });
  } catch (err: any) {
    return NextResponse.json(
      { error: err.message ?? "Internal error" },
      { status: 500 },
    );
  }
}
