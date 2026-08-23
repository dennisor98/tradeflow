import { NextResponse } from 'next/server';
import { getStripeClient } from '@/lib/stripe';

export async function POST(request: Request) {
  try {
    const body = await request.json() as { amount?: number | string; userId?: string };
    const amount = Number(body.amount);
    const userId = body.userId;

    if (!userId || Number.isNaN(amount) || amount < 10) {
      return NextResponse.json(
        { error: 'Valid userId and amount (minimum $10) are required' },
        { status: 400 }
      );
    }

    const stripe = getStripeClient();
    const configuredAppUrl = process.env.NEXT_PUBLIC_APP_URL?.trim();
    const appUrl = configuredAppUrl && /^https?:\/\//.test(configuredAppUrl)
      ? configuredAppUrl
      : new URL(request.url).origin;

    const session = await stripe.checkout.sessions.create({
      mode: 'payment',
      client_reference_id: userId,
      metadata: {
        userId,
        amountUsd: amount.toFixed(2),
      },
      line_items: [
        {
          price_data: {
            currency: 'usd',
            product_data: {
              name: 'Wintradein Account Deposit',
              description: `Deposit $${amount.toFixed(2)} into your Wintradein wallet`,
            },
            unit_amount: Math.round(amount * 100),
          },
          quantity: 1,
        },
      ],
      success_url: `${appUrl}/stripe/success?session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${appUrl}/stripe/cancel`,
    });

    if (!session.url) {
      return NextResponse.json({ error: 'Failed to create checkout URL' }, { status: 500 });
    }

    return NextResponse.json({ sessionId: session.id, url: session.url });
  } catch (error) {
    console.error('Create Stripe checkout session error:', error);
    return NextResponse.json({ error: 'Failed to create checkout session' }, { status: 500 });
  }
}
