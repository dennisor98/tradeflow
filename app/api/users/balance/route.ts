import { NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { users } from '@/lib/schema';
import { getSettings, resolveAccountType } from '@/lib/settings';
import { eq } from 'drizzle-orm';
import { sendDepositEmail } from '@/lib/email';

type UserBalanceUpdate = {
  balance: string;
  maxSingleDeposit?: string;
  accountType?: string;
};

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const userId = searchParams.get('userId');

    if (!userId) {
      return NextResponse.json({ error: 'User ID required' }, { status: 400 });
    }

    const user = await db.select().from(users).where(eq(users.id, userId)).limit(1);
    if (user.length === 0) {
      return NextResponse.json({ error: 'User not found' }, { status: 404 });
    }

    return NextResponse.json({ 
      balance: user[0].balance, 
      accountType: user[0].accountType,
      maxSingleDeposit: user[0].maxSingleDeposit,
    }, { status: 200 });
  } catch (error) {
    console.error('Get balance error:', error);
    return NextResponse.json({ error: 'Failed to get balance' }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    const body = await request.json();  
    console.log('Balance update body:', body);

    const { userId, amount, isDeposit = false } = body;

    if (!userId || amount === undefined) {
      return NextResponse.json({ error: 'User ID and amount required' }, { status: 400 });
    }

    const user = await db.select().from(users).where(eq(users.id, userId)).limit(1);
    if (user.length === 0) {
      return NextResponse.json({ error: 'User not found' }, { status: 404 });
    }

    const currentBalance = parseFloat(user[0].balance.toString());
    const newBalance = Math.max(0, currentBalance + amount);

    // If this is a deposit, track max single deposit and potentially upgrade account type
    const updates: UserBalanceUpdate = { balance: newBalance.toString() };
    if (isDeposit && amount > 0) {
      const currentMaxDeposit = parseFloat(user[0].maxSingleDeposit?.toString() || '0');
      const newMaxDeposit = Math.max(currentMaxDeposit, amount);
      updates.maxSingleDeposit = newMaxDeposit.toString();

      // Tier thresholds are admin-configurable; see lib/settings.
      const promotion = resolveAccountType(newMaxDeposit, user[0].accountType, await getSettings());
      if (promotion) updates.accountType = promotion;
    }

    await db.update(users).set(updates).where(eq(users.id, userId));

    if (isDeposit && amount > 0) {
      await sendDepositEmail({
        to: user[0].email,
        name: user[0].name,
        status: 'success',
        amountUsd: amount,
        method: 'Deposit',
      });
    }

    return NextResponse.json({ balance: newBalance.toString(), accountType: updates.accountType || user[0].accountType }, { status: 200 });
  } catch (error) {
    console.error('Update balance error:', error);
    return NextResponse.json({ error: 'Failed to update balance' }, { status: 500 });
  }
}
