import { NextResponse } from 'next/server';
import { sql } from 'drizzle-orm';
import { db } from '@/lib/db';
import { users, transactions, trades } from '@/lib/schema';
import { requireAdmin, ADMIN_ADJUSTMENT_LABEL } from '@/lib/admin-auth';

export async function GET() {
  const guard = await requireAdmin();
  if (!guard.ok) return guard.response;

  try {
    const [userAgg] = await db
      .select({
        total: sql<number>`count(*)`,
        active: sql<number>`sum(case when is_active = 1 then 1 else 0 end)`,
        marketers: sql<number>`sum(case when role = 'marketer' then 1 else 0 end)`,
        admins: sql<number>`sum(case when role = 'admin' then 1 else 0 end)`,
        heldBalance: sql<string>`coalesce(sum(balance), 0)`,
      })
      .from(users);

    const [txAgg] = await db
      .select({
        deposits: sql<string>`coalesce(sum(case when type = 'deposit' and status = 'completed' then amount else 0 end), 0)`,
        withdrawals: sql<string>`coalesce(sum(case when type = 'withdrawal' and status = 'completed' then amount else 0 end), 0)`,
        pendingCount: sql<number>`sum(case when status = 'pending' then 1 else 0 end)`,
      })
      .from(transactions);

    const [tradeAgg] = await db
      .select({
        total: sql<number>`count(*)`,
        wins: sql<number>`sum(case when result = 'win' then 1 else 0 end)`,
        staked: sql<string>`coalesce(sum(amount), 0)`,
        paidOut: sql<string>`coalesce(sum(coalesce(payout, 0)), 0)`,
      })
      .from(trades);

    // "Today" means since local midnight. MySQL and the app server both run on
    // East Africa Time, so CURDATE() is the Nairobi day an operator expects —
    // this figure shifts if the server timezone ever changes.
    //
    // Admin balance adjustments are stored as deposit/withdrawal rows so they
    // render in the user's history, but they are not customer money moving in
    // or out, so they are excluded here and reported separately.
    const notAnAdjustment = sql`${transactions.label} not like ${ADMIN_ADJUSTMENT_LABEL + '%'}`;

    const [todayTx] = await db
      .select({
        depositTotal: sql<string>`coalesce(sum(case when type = 'deposit' and status = 'completed' and ${notAnAdjustment} then amount else 0 end), 0)`,
        depositCount: sql<number>`sum(case when type = 'deposit' and status = 'completed' and ${notAnAdjustment} then 1 else 0 end)`,
        depositPendingTotal: sql<string>`coalesce(sum(case when type = 'deposit' and status = 'pending' and ${notAnAdjustment} then amount else 0 end), 0)`,
        withdrawalTotal: sql<string>`coalesce(sum(case when type = 'withdrawal' and status = 'completed' and ${notAnAdjustment} then amount else 0 end), 0)`,
        withdrawalCount: sql<number>`sum(case when type = 'withdrawal' and status = 'completed' and ${notAnAdjustment} then 1 else 0 end)`,
        withdrawalPendingTotal: sql<string>`coalesce(sum(case when type = 'withdrawal' and status = 'pending' and ${notAnAdjustment} then amount else 0 end), 0)`,
        withdrawalPendingCount: sql<number>`sum(case when type = 'withdrawal' and status = 'pending' and ${notAnAdjustment} then 1 else 0 end)`,
        adjustmentCount: sql<number>`sum(case when not ${notAnAdjustment} then 1 else 0 end)`,
        adjustmentNet: sql<string>`coalesce(sum(case when not ${notAnAdjustment} then (case when type = 'deposit' then amount else -amount end) else 0 end), 0)`,
      })
      .from(transactions)
      .where(sql`${transactions.createdAt} >= curdate()`);

    const [todayTrades] = await db
      .select({
        tradeCount: sql<number>`count(*)`,
        tradeWins: sql<number>`coalesce(sum(case when result = 'win' then 1 else 0 end), 0)`,
        tradeStaked: sql<string>`coalesce(sum(amount), 0)`,
        tradePaidOut: sql<string>`coalesce(sum(coalesce(payout, 0)), 0)`,
      })
      .from(trades)
      .where(sql`${trades.createdAt} >= curdate()`);

    return NextResponse.json(
      { users: userAgg, transactions: txAgg, trades: tradeAgg, today: { ...todayTx, ...todayTrades } },
      { status: 200 }
    );
  } catch (error) {
    console.error('Admin stats error:', error);
    return NextResponse.json({ error: 'Failed to load stats' }, { status: 500 });
  }
}
