import { NextResponse } from 'next/server';
import { and, desc, eq, like, or, sql } from 'drizzle-orm';
import { db } from '@/lib/db';
import { transactions, users } from '@/lib/schema';
import { requireAdmin } from '@/lib/admin-auth';

const PAGE_SIZE = 30;

export async function GET(request: Request) {
  const guard = await requireAdmin();
  if (!guard.ok) return guard.response;

  try {
    const { searchParams } = new URL(request.url);
    const status = searchParams.get('status') || '';
    const type = searchParams.get('type') || '';
    const q = (searchParams.get('q') || '').trim();
    const page = Math.max(1, parseInt(searchParams.get('page') || '1', 10) || 1);

    const filters = [];
    if (status) filters.push(eq(transactions.status, status));
    if (type) filters.push(eq(transactions.type, type));
    if (q) {
      const term = `%${q}%`;
      filters.push(or(like(users.email, term), like(users.name, term), like(transactions.label, term)));
    }
    const where = filters.length ? and(...filters) : undefined;

    const rows = await db
      .select({
        id: transactions.id,
        userId: transactions.userId,
        userName: users.name,
        userEmail: users.email,
        type: transactions.type,
        amount: transactions.amount,
        status: transactions.status,
        label: transactions.label,
        time: transactions.time,
        createdAt: transactions.createdAt,
      })
      .from(transactions)
      .innerJoin(users, eq(transactions.userId, users.id))
      .where(where)
      .orderBy(desc(transactions.createdAt))
      .limit(PAGE_SIZE)
      .offset((page - 1) * PAGE_SIZE);

    const [{ total }] = await db
      .select({ total: sql<number>`count(*)` })
      .from(transactions)
      .innerJoin(users, eq(transactions.userId, users.id))
      .where(where);

    return NextResponse.json({ transactions: rows, total: Number(total), page, pageSize: PAGE_SIZE }, { status: 200 });
  } catch (error) {
    console.error('Admin list transactions error:', error);
    return NextResponse.json({ error: 'Failed to list transactions' }, { status: 500 });
  }
}
