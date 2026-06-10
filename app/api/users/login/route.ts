import { NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { users } from '@/lib/schema';
import { eq, or } from 'drizzle-orm';

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const { phone, email } = body;

    if (!phone && !email) {
      return NextResponse.json({ error: 'Phone or email required' }, { status: 400 });
    }

    // Find user by phone or email
    const user = await db.select().from(users).where(
      or(
        phone ? eq(users.phone, phone) : undefined,
        email ? eq(users.email, email) : undefined
      )
    ).limit(1);

    if (user.length === 0) {
      return NextResponse.json({ error: 'User not found' }, { status: 404 });
    }

    return NextResponse.json({ user: user[0] }, { status: 200 });
  } catch (error) {
    console.error('Login error:', error);
    return NextResponse.json({ error: 'Login failed' }, { status: 500 });
  }
}
