import { NextResponse } from 'next/server';
import { and, eq } from 'drizzle-orm';
import { db } from '@/lib/db';
import { transactions, users } from '@/lib/schema';
import { sendDepositEmail } from '@/lib/email';
import { getStripeClient } from '@/lib/stripe';
import { getSettings, resolveAccountType } from '@/lib/settings';

type UserBalanceUpdate = {
  balance: string;
  maxSingleDeposit?: string;
  accountType?: string;
};

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const sessionId = searchParams.get('session_id');

    if (!sessionId) {
      return NextResponse.json({ error: 'session_id is required' }, { status: 400 });
    }

    const stripe = getStripeClient();
    const session = await stripe.checkout.sessions.retrieve(sessionId);

    if (session.payment_status !== 'paid') {
      return NextResponse.json({ error: 'Payment is not completed yet' }, { status: 400 });
    }

    const userId = session.metadata?.userId || session.client_reference_id;
    const amountUsd = session.metadata?.amountUsd
      ? Number(session.metadata.amountUsd)
      : Number(session.amount_total || 0) / 100;

    if (!userId || Number.isNaN(amountUsd) || amountUsd <= 0) {
      return NextResponse.json({ error: 'Stripe session metadata is invalid' }, { status: 400 });
    }

    const label = `Stripe Deposit (${session.id})`;
    const existingTransaction = await db.select()
      .from(transactions)
      .where(and(eq(transactions.userId, userId), eq(transactions.label, label)))
      .limit(1);

    if (existingTransaction.length > 0) {
      return NextResponse.json({
        success: true,
        alreadyProcessed: true,
        amountUsd: parseFloat(existingTransaction[0].amount.toString()),
      });
    }

    const userResult = await db.select().from(users).where(eq(users.id, userId)).limit(1);
    if (userResult.length === 0) {
      return NextResponse.json({ error: 'User not found' }, { status: 404 });
    }

    const user = userResult[0];
    const currentBalance = parseFloat(user.balance.toString());
    const newBalance = currentBalance + amountUsd;
    const currentMaxDeposit = parseFloat(user.maxSingleDeposit?.toString() || '0');
    const newMaxDeposit = Math.max(currentMaxDeposit, amountUsd);

    const updates: UserBalanceUpdate = {
      balance: newBalance.toFixed(2),
      maxSingleDeposit: newMaxDeposit.toFixed(2),
    };

    const promotion = resolveAccountType(newMaxDeposit, user.accountType, await getSettings());
    if (promotion) updates.accountType = promotion;

    await db.update(users).set(updates).where(eq(users.id, userId));

    await db.insert(transactions).values({
      id: crypto.randomUUID(),
      userId,
      type: 'deposit',
      amount: amountUsd.toFixed(2),
      status: 'completed',
      label,
      time: Date.now(),
    });

    await sendDepositEmail({
      to: user.email,
      name: user.name,
      status: 'success',
      amountUsd,
      method: 'Stripe',
      reference: session.id,
    });

    return NextResponse.json({
      success: true,
      alreadyProcessed: false,
      amountUsd,
    });
  } catch (error) {
    console.error('Stripe confirm session error:', error);
    return NextResponse.json({ error: 'Failed to confirm Stripe payment' }, { status: 500 });
  }
}
