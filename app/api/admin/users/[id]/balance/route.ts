import { NextResponse } from 'next/server';
import { eq } from 'drizzle-orm';
import { db } from '@/lib/db';
import { users, transactions } from '@/lib/schema';
import { requireAdmin, recordAudit, ADMIN_ADJUSTMENT_LABEL } from '@/lib/admin-auth';

/**
 * Adjust a user's balance.
 *
 * Body: { amount: number (signed — negative debits), reason: string }
 *
 * Every adjustment writes two rows: a transaction the user can see in their
 * own history, and an audit entry naming the admin who made it. A balance
 * change with no attributable author is not acceptable on a system holding
 * customer funds, so `reason` is required and the audit write is not
 * best-effort — if it fails, the request fails.
 */
export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const guard = await requireAdmin();
  if (!guard.ok) return guard.response;

  try {
    const { id } = await params;
    const body = await request.json();

    const amount = Number(body.amount);
    const reason = typeof body.reason === 'string' ? body.reason.trim() : '';

    if (!Number.isFinite(amount) || amount === 0) {
      return NextResponse.json({ error: 'Amount must be a non-zero number' }, { status: 400 });
    }
    if (Math.abs(amount) > 1_000_000) {
      return NextResponse.json({ error: 'Adjustment exceeds the $1,000,000 single-operation limit' }, { status: 400 });
    }
    if (reason.length < 3) {
      return NextResponse.json({ error: 'A reason of at least 3 characters is required' }, { status: 400 });
    }

    const rows = await db.select().from(users).where(eq(users.id, id)).limit(1);
    const target = rows[0];
    if (!target) return NextResponse.json({ error: 'User not found' }, { status: 404 });

    const before = parseFloat(target.balance.toString());
    const after = Math.round(Math.max(0, before + amount) * 100) / 100;
    const applied = Math.round((after - before) * 100) / 100;

    if (applied === 0) {
      return NextResponse.json({ error: 'Adjustment would not change the balance' }, { status: 400 });
    }

    await db.update(users).set({ balance: after.toFixed(2) }).where(eq(users.id, id));

    // Audit first-class: if this throws, the operator sees a failure rather
    // than an untraceable balance change.
    await recordAudit({
      admin: guard.admin,
      action: applied > 0 ? 'balance.credit' : 'balance.debit',
      targetUserId: target.id,
      targetUserEmail: target.email,
      details: { requested: amount, applied, balanceBefore: before, balanceAfter: after, reason },
    });

    await db.insert(transactions).values({
      id: crypto.randomUUID(),
      userId: target.id,
      type: applied > 0 ? 'deposit' : 'withdrawal',
      amount: Math.abs(applied).toFixed(2),
      status: 'completed',
      label: `${ADMIN_ADJUSTMENT_LABEL} — ${reason}`,
      time: Date.now(),
    });

    return NextResponse.json({ balanceBefore: before, balanceAfter: after, applied }, { status: 200 });
  } catch (error) {
    console.error('Admin balance adjustment error:', error);
    return NextResponse.json({ error: 'Failed to adjust balance' }, { status: 500 });
  }
}
