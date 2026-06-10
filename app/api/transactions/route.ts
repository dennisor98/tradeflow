import { NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { transactions } from '@/lib/schema';
import { eq } from 'drizzle-orm';

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const userId = searchParams.get('userId');

    if (!userId) {
      return NextResponse.json({ error: 'User ID required' }, { status: 400 });
    }

    const userTransactions = await db.select().from(transactions).where(eq(transactions.userId, userId));
    return NextResponse.json({ transactions: userTransactions }, { status: 200 });
  } catch (error) {
    console.error('Get transactions error:', error);
    return NextResponse.json({ error: 'Failed to get transactions' }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const { userId, type, amount, status, label, time } = body;

    if (!userId || !type || !amount || !status || !label || !time) {
      return NextResponse.json({ error: 'Missing required fields' }, { status: 400 });
    }

    const transactionId = crypto.randomUUID();
    await db.insert(transactions).values({
      id: transactionId,
      userId,
      type,
      amount: amount.toString(),
      status,
      label,
      time,
    });

    const newTransaction = await db.select().from(transactions).where(eq(transactions.id, transactionId)).limit(1);
    return NextResponse.json({ transaction: newTransaction[0] }, { status: 201 });
  } catch (error) {
    console.error('Create transaction error:', error);
    return NextResponse.json({ error: 'Failed to create transaction' }, { status: 500 });
  }
}
