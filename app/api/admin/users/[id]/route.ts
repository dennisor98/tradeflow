import { NextResponse } from 'next/server';
import { desc, eq } from 'drizzle-orm';
import { db } from '@/lib/db';
import { users, transactions, trades } from '@/lib/schema';
import { requireAdmin, recordAudit } from '@/lib/admin-auth';

const ROLES = ['user', 'marketer', 'admin'];
const TIERS = ['normal', 'vip', 'vvip'];

export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const guard = await requireAdmin();
  if (!guard.ok) return guard.response;

  try {
    const { id } = await params;
    const rows = await db.select().from(users).where(eq(users.id, id)).limit(1);
    if (rows.length === 0) return NextResponse.json({ error: 'User not found' }, { status: 404 });

    const [userTransactions, userTrades] = await Promise.all([
      db.select().from(transactions).where(eq(transactions.userId, id)).orderBy(desc(transactions.createdAt)).limit(50),
      db.select().from(trades).where(eq(trades.userId, id)).orderBy(desc(trades.createdAt)).limit(50),
    ]);

    return NextResponse.json({ user: rows[0], transactions: userTransactions, trades: userTrades }, { status: 200 });
  } catch (error) {
    console.error('Admin get user error:', error);
    return NextResponse.json({ error: 'Failed to load user' }, { status: 500 });
  }
}

export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const guard = await requireAdmin();
  if (!guard.ok) return guard.response;

  try {
    const { id } = await params;
    const body = await request.json();

    const rows = await db.select().from(users).where(eq(users.id, id)).limit(1);
    const target = rows[0];
    if (!target) return NextResponse.json({ error: 'User not found' }, { status: 404 });

    const updates: Record<string, unknown> = {};
    const changed: Record<string, { from: unknown; to: unknown }> = {};

    if (body.role !== undefined) {
      if (!ROLES.includes(body.role)) {
        return NextResponse.json({ error: `Role must be one of: ${ROLES.join(', ')}` }, { status: 400 });
      }
      // An admin removing their own admin rights would lock them out mid-session.
      if (target.id === guard.admin.id && body.role !== 'admin') {
        return NextResponse.json({ error: 'You cannot change your own role' }, { status: 400 });
      }
      if (body.role !== target.role) {
        updates.role = body.role;
        changed.role = { from: target.role, to: body.role };
      }
    }

    if (body.accountType !== undefined) {
      if (!TIERS.includes(body.accountType)) {
        return NextResponse.json({ error: `Tier must be one of: ${TIERS.join(', ')}` }, { status: 400 });
      }
      if (body.accountType !== target.accountType) {
        updates.accountType = body.accountType;
        changed.accountType = { from: target.accountType, to: body.accountType };
      }
    }

    if (body.isActive !== undefined) {
      const next = body.isActive ? 1 : 0;
      if (target.id === guard.admin.id && next === 0) {
        return NextResponse.json({ error: 'You cannot deactivate your own account' }, { status: 400 });
      }
      if (next !== target.isActive) {
        updates.isActive = next;
        changed.isActive = { from: target.isActive, to: next };
      }
    }

    if (Object.keys(updates).length === 0) {
      return NextResponse.json({ user: target, changed: {} }, { status: 200 });
    }

    await db.update(users).set(updates).where(eq(users.id, id));
    await recordAudit({
      admin: guard.admin,
      action: 'user.update',
      targetUserId: target.id,
      targetUserEmail: target.email,
      details: changed,
    });

    const [updated] = await db.select().from(users).where(eq(users.id, id)).limit(1);
    return NextResponse.json({ user: updated, changed }, { status: 200 });
  } catch (error) {
    console.error('Admin update user error:', error);
    return NextResponse.json({ error: 'Failed to update user' }, { status: 500 });
  }
}
