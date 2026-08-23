import { NextResponse } from 'next/server';
import { desc, like, or, sql, eq, and } from 'drizzle-orm';
import { db } from '@/lib/db';
import { users } from '@/lib/schema';
import { requireAdmin } from '@/lib/admin-auth';

const PAGE_SIZE = 25;

export async function GET(request: Request) {
  const guard = await requireAdmin();
  if (!guard.ok) return guard.response;

  try {
    const { searchParams } = new URL(request.url);
    const q = (searchParams.get('q') || '').trim();
    const role = searchParams.get('role') || '';
    const page = Math.max(1, parseInt(searchParams.get('page') || '1', 10) || 1);

    const filters = [];
    if (q) {
      const term = `%${q}%`;
      filters.push(or(like(users.name, term), like(users.email, term), like(users.phone, term)));
    }
    if (role) filters.push(eq(users.role, role));
    const where = filters.length ? and(...filters) : undefined;

    const rows = await db
      .select({
        id: users.id,
        name: users.name,
        email: users.email,
        phone: users.phone,
        balance: users.balance,
        accountType: users.accountType,
        role: users.role,
        isActive: users.isActive,
        createdAt: users.createdAt,
      })
      .from(users)
      .where(where)
      .orderBy(desc(users.createdAt))
      .limit(PAGE_SIZE)
      .offset((page - 1) * PAGE_SIZE);

    const [{ total }] = await db.select({ total: sql<number>`count(*)` }).from(users).where(where);

    return NextResponse.json({ users: rows, total: Number(total), page, pageSize: PAGE_SIZE }, { status: 200 });
  } catch (error) {
    console.error('Admin list users error:', error);
    return NextResponse.json({ error: 'Failed to list users' }, { status: 500 });
  }
}
