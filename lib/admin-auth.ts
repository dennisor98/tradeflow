import { createHmac, timingSafeEqual } from 'node:crypto';
import { cookies } from 'next/headers';
import { NextResponse } from 'next/server';
import { eq } from 'drizzle-orm';
import { db } from '@/lib/db';
import { users, adminAuditLog } from '@/lib/schema';

export const ADMIN_COOKIE = 'wt_admin_session';

/**
 * Prefix for transactions created by an admin balance adjustment. These are
 * written as deposit/withdrawal rows so they render correctly in the user's
 * own history, so reporting needs this to tell them apart from real customer
 * money moving in and out.
 */
export const ADMIN_ADJUSTMENT_LABEL = 'Balance adjustment by admin';
const SESSION_TTL_MS = 8 * 60 * 60 * 1000;

export type AdminUser = {
  id: string;
  name: string;
  email: string;
};

function sessionSecret() {
  const configured = process.env.ADMIN_SESSION_SECRET || process.env.SESSION_SECRET;
  if (configured) return configured;
  if (process.env.NODE_ENV === 'production') {
    // Refuse to fall back to a known constant in production — a guessable
    // secret means anyone can mint an admin session cookie.
    throw new Error('ADMIN_SESSION_SECRET must be set in production');
  }
  return 'wintradein-admin-dev-secret';
}

function sign(payload: string) {
  return createHmac('sha256', sessionSecret()).update(payload).digest('hex');
}

function safeCompare(a: string, b: string) {
  const ab = Buffer.from(a);
  const bb = Buffer.from(b);
  if (ab.length !== bb.length) return false;
  return timingSafeEqual(ab, bb);
}

export function issueAdminSession(adminId: string) {
  const expiresAt = Date.now() + SESSION_TTL_MS;
  const payload = `${adminId}.${expiresAt}`;
  return { token: `${payload}.${sign(payload)}`, expiresAt: new Date(expiresAt) };
}

/** Returns the admin id if the token is well-formed, unexpired and correctly signed. */
export function readAdminSession(token: string | undefined): string | null {
  if (!token) return null;
  const parts = token.split('.');
  if (parts.length !== 3) return null;
  const [adminId, expiresAt, signature] = parts;
  if (!safeCompare(signature, sign(`${adminId}.${expiresAt}`))) return null;
  if (!/^\d+$/.test(expiresAt) || Number(expiresAt) < Date.now()) return null;
  return adminId;
}

/**
 * Resolves the current admin from the session cookie. Re-checks role and
 * active status on every request, so revoking an admin takes effect
 * immediately rather than when their cookie happens to expire.
 */
export async function getAdmin(): Promise<AdminUser | null> {
  const store = await cookies();
  const adminId = readAdminSession(store.get(ADMIN_COOKIE)?.value);
  if (!adminId) return null;

  const rows = await db.select().from(users).where(eq(users.id, adminId)).limit(1);
  const row = rows[0];
  if (!row || row.role !== 'admin' || row.isActive !== 1) return null;

  return { id: row.id, name: row.name, email: row.email };
}

type AdminGuard =
  | { ok: true; admin: AdminUser }
  | { ok: false; response: NextResponse };

/** Guard for admin route handlers. Every /api/admin route must call this first. */
export async function requireAdmin(): Promise<AdminGuard> {
  const admin = await getAdmin();
  if (!admin) {
    return {
      ok: false,
      response: NextResponse.json({ error: 'Not authorised' }, { status: 401 }),
    };
  }
  return { ok: true, admin };
}

export async function recordAudit(params: {
  admin: AdminUser;
  action: string;
  targetUserId?: string | null;
  targetUserEmail?: string | null;
  details?: unknown;
}) {
  try {
    await db.insert(adminAuditLog).values({
      id: crypto.randomUUID(),
      adminId: params.admin.id,
      adminEmail: params.admin.email,
      action: params.action,
      targetUserId: params.targetUserId ?? null,
      targetUserEmail: params.targetUserEmail ?? null,
      details: params.details === undefined ? null : JSON.stringify(params.details),
    });
  } catch (error) {
    // An audit write must never silently vanish — surface it loudly.
    console.error('AUDIT WRITE FAILED', params.action, error);
    throw error;
  }
}
