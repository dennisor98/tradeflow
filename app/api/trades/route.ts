import { NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { trades } from '@/lib/schema';
import { eq } from 'drizzle-orm';

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const userId = searchParams.get('userId');

    if (!userId) {
      return NextResponse.json({ error: 'User ID required' }, { status: 400 });
    }

    const userTrades = await db.select().from(trades).where(eq(trades.userId, userId));
    return NextResponse.json({ trades: userTrades }, { status: 200 });
  } catch (error) {
    console.error('Get trades error:', error);
    return NextResponse.json({ error: 'Failed to get trades' }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const { userId, asset, direction, amount, entryPrice, targetPrice, duration, result, payout, startTime, initialBalance, finalBalance } = body;

    if (!userId || !asset || !direction || !amount || !entryPrice || !targetPrice || !duration || !startTime) {
      return NextResponse.json({ error: 'Missing required fields' }, { status: 400 });
    }

    const tradeId = crypto.randomUUID();
    await db.insert(trades).values({
      id: tradeId,
      userId,
      asset,
      direction,
      amount: amount.toString(),
      entryPrice: entryPrice.toString(),
      targetPrice: targetPrice.toString(),
      duration,
      result,
      payout: payout ? payout.toString() : null,
      initialBalance: initialBalance ? initialBalance.toString() : null,
      finalBalance: finalBalance ? finalBalance.toString() : null,
      startTime,
    });

    const newTrade = await db.select().from(trades).where(eq(trades.id, tradeId)).limit(1);
    return NextResponse.json({ trade: newTrade[0] }, { status: 201 });
  } catch (error) {
    console.error('Create trade error:', error);
    return NextResponse.json({ error: 'Failed to create trade' }, { status: 500 });
  }
}
