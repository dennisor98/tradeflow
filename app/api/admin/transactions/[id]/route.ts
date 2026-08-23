import { NextResponse } from 'next/server';
import { eq } from 'drizzle-orm';
import { db } from '@/lib/db';
import { transactions, users } from '@/lib/schema';
import { requireAdmin, recordAudit } from '@/lib/admin-auth';

const STATUSES = ['pending', 'completed', 'failed'];

/**
 * Settle a pending transaction. Approving a pending deposit credits the user;
 * this is the manual path for M-Pesa or crypto deposits that arrived but were
 * never reconciled automatically.
 */
export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const guard = await requireAdmin();
  if (!guard.ok) return guard.response;

  try {
    const { id } = await params;
    const { status, creditBalance } = await request.json();

    if (!STATUSES.includes(status)) {
      return NextResponse.json({ error: `Status must be one of: ${STATUSES.join(', ')}` }, { status: 400 });
    }

    const rows = await db.select().from(transactions).where(eq(transactions.id, id)).limit(1);
    const tx = rows[0];
    if (!tx) return NextResponse.json({ error: 'Transaction not found' }, { status: 404 });
    if (tx.status === status) {
      return NextResponse.json({ error: `Transaction is already ${status}` }, { status: 400 });
    }
    if (tx.status !== 'pending') {
      return NextResponse.json({ error: 'Only pending transactions can be settled' }, { status: 400 });
    }

    const userRows = await db.select().from(users).where(eq(users.id, tx.userId)).limit(1);
    const user = userRows[0];
    if (!user) return NextResponse.json({ error: 'Transaction owner not found' }, { status: 404 });

    let balanceAfter: number | null = null;
    const shouldCredit = status === 'completed' && creditBalance === true && tx.type === 'deposit';

    if (shouldCredit) {
      const before = parseFloat(user.balance.toString());
      balanceAfter = Math.round((before + parseFloat(tx.amount.toString())) * 100) / 100;
      await db.update(users).set({ balance: balanceAfter.toFixed(2) }).where(eq(users.id, user.id));
    }

    await db.update(transactions).set({ status }).where(eq(transactions.id, id));

    await recordAudit({
      admin: guard.admin,
      action: 'transaction.settle',
      targetUserId: user.id,
      targetUserEmail: user.email,
      details: {
        transactionId: tx.id,
        type: tx.type,
        amount: tx.amount,
        from: tx.status,
        to: status,
        creditedBalance: shouldCredit,
        balanceAfter,
      },
    });

    return NextResponse.json({ ok: true, status, balanceAfter }, { status: 200 });
  } catch (error) {
    console.error('Admin settle transaction error:', error);
    return NextResponse.json({ error: 'Failed to update transaction' }, { status: 500 });
  }
}
