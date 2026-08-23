import { NextResponse } from 'next/server';
import { eq } from 'drizzle-orm';
import { db } from '@/lib/db';
import { users } from '@/lib/schema';
import { verifyPassword } from '@/lib/password';
import { ADMIN_COOKIE, issueAdminSession, recordAudit } from '@/lib/admin-auth';

/**
 * Simple per-process throttle on repeated failures.
 *
 * Note this is per worker — under pm2 cluster with N instances an attacker
 * effectively gets N times the allowance. It raises the cost of online
 * guessing but is not a substitute for a strong ADMIN_PASSWORD.
 */
const MAX_ATTEMPTS = 8;
const WINDOW_MS = 10 * 60 * 1000;
const attempts = new Map<string, { count: number; first: number }>();

function throttled(key: string) {
  const now = Date.now();
  const entry = attempts.get(key);
  if (!entry || now - entry.first > WINDOW_MS) return false;
  return entry.count >= MAX_ATTEMPTS;
}

function recordFailure(key: string) {
  const now = Date.now();
  const entry = attempts.get(key);
  if (!entry || now - entry.first > WINDOW_MS) attempts.set(key, { count: 1, first: now });
  else entry.count += 1;
}

export async function POST(request: Request) {
  try {
    const { email, password } = await request.json();
    if (typeof email !== 'string' || typeof password !== 'string' || !email || !password) {
      return NextResponse.json({ error: 'Email and password are required' }, { status: 400 });
    }

    const normalised = email.trim().toLowerCase();
    const throttleKey = `${normalised}|${request.headers.get('x-forwarded-for') ?? 'local'}`;

    if (throttled(throttleKey)) {
      return NextResponse.json(
        { error: 'Too many failed attempts. Try again in a few minutes.' },
        { status: 429 }
      );
    }

    const rows = await db.select().from(users).where(eq(users.email, normalised)).limit(1);
    const user = rows[0];

    // Always run a verification so a missing account and a wrong password take
    // roughly the same time, and never say which one it was.
    const passwordOk = await verifyPassword(password, user?.passwordHash ?? null);
    const invalid = NextResponse.json({ error: 'Invalid email or password' }, { status: 401 });

    if (!user || !passwordOk || user.role !== 'admin' || user.isActive !== 1) {
      recordFailure(throttleKey);
      console.warn('Failed admin sign-in for', normalised);
      return invalid;
    }

    attempts.delete(throttleKey);

    const admin = { id: user.id, name: user.name, email: user.email };
    const { token, expiresAt } = issueAdminSession(user.id);
    await recordAudit({ admin, action: 'admin.login' });

    const response = NextResponse.json({ admin }, { status: 200 });
    response.cookies.set(ADMIN_COOKIE, token, {
      httpOnly: true,
      sameSite: 'lax',
      secure: process.env.NODE_ENV === 'production',
      path: '/',
      expires: expiresAt,
    });
    return response;
  } catch (error) {
    console.error('Admin login error:', error);
    return NextResponse.json({ error: 'Failed to sign in' }, { status: 500 });
  }
}
