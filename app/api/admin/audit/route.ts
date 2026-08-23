import { NextResponse } from 'next/server';
import { desc, sql } from 'drizzle-orm';
import { db } from '@/lib/db';
import { adminAuditLog } from '@/lib/schema';
import { requireAdmin } from '@/lib/admin-auth';

const PAGE_SIZE = 50;

export async function GET(request: Request) {
  const guard = await requireAdmin();
  if (!guard.ok) return guard.response;

  try {
    const { searchParams } = new URL(request.url);
    const page = Math.max(1, parseInt(searchParams.get('page') || '1', 10) || 1);

    const rows = await db
      .select()
      .from(adminAuditLog)
      .orderBy(desc(adminAuditLog.createdAt))
      .limit(PAGE_SIZE)
      .offset((page - 1) * PAGE_SIZE);

    const [{ total }] = await db.select({ total: sql<number>`count(*)` }).from(adminAuditLog);

    return NextResponse.json({ entries: rows, total: Number(total), page, pageSize: PAGE_SIZE }, { status: 200 });
  } catch (error) {
    console.error('Admin audit list error:', error);
    return NextResponse.json({ error: 'Failed to load audit log' }, { status: 500 });
  }
}
