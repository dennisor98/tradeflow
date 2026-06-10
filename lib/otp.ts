import { and, desc, eq, isNull } from 'drizzle-orm';
import { createHmac, randomInt, timingSafeEqual } from 'node:crypto';
import { db } from '@/lib/db';
import { userOtps } from '@/lib/schema';

export type OtpPurpose = 'register' | 'login';

const OTP_LENGTH = 6;
const OTP_TTL_MINUTES: Record<OtpPurpose, number> = {
  register: 10,
  login: 10,
};

function hashOtp(email: string, purpose: OtpPurpose, otp: string) {
  const secret = process.env.OTP_SECRET || process.env.SESSION_SECRET || 'tradeflow-otp-dev-secret';
  return createHmac('sha256', secret).update(`${email.toLowerCase()}|${purpose}|${otp}`).digest('hex');
}

function safeCompare(a: string, b: string) {
  const aBuffer = Buffer.from(a);
  const bBuffer = Buffer.from(b);
  if (aBuffer.length !== bBuffer.length) return false;
  return timingSafeEqual(aBuffer, bBuffer);
}

function generateOtpCode() {
  return randomInt(0, 10 ** OTP_LENGTH).toString().padStart(OTP_LENGTH, '0');
}

export async function createOtpChallenge(params: {
  userId: string;
  email: string;
  purpose: OtpPurpose;
}) {
  const { userId, email, purpose } = params;
  const otp = generateOtpCode();
  const now = new Date();
  const expiresAt = new Date(now.getTime() + OTP_TTL_MINUTES[purpose] * 60 * 1000);

  await db
    .update(userOtps)
    .set({ usedAt: now })
    .where(and(eq(userOtps.userId, userId), eq(userOtps.purpose, purpose), isNull(userOtps.usedAt)));

  await db.insert(userOtps).values({
    id: crypto.randomUUID(),
    userId,
    purpose,
    codeHash: hashOtp(email, purpose, otp),
    expiresAt,
  });

  return { otp, expiresAt };
}

export async function verifyOtpChallenge(params: {
  userId: string;
  email: string;
  purpose: OtpPurpose;
  otp: string;
}) {
  const { userId, email, purpose } = params;
  const enteredOtp = params.otp.trim();

  if (!/^\d{6}$/.test(enteredOtp)) {
    return { ok: false as const, error: 'OTP must be a 6-digit code' };
  }

  const latestOtp = await db
    .select()
    .from(userOtps)
    .where(and(eq(userOtps.userId, userId), eq(userOtps.purpose, purpose), isNull(userOtps.usedAt)))
    .orderBy(desc(userOtps.createdAt))
    .limit(1);

  if (latestOtp.length === 0) {
    return { ok: false as const, error: 'No OTP found. Please request a new code.' };
  }

  const challenge = latestOtp[0];
  const now = new Date();
  const isExpired = challenge.expiresAt.getTime() < now.getTime();

  if (isExpired) {
    await db.update(userOtps).set({ usedAt: now }).where(eq(userOtps.id, challenge.id));
    return { ok: false as const, error: 'OTP expired. Please request a new code.' };
  }

  const enteredHash = hashOtp(email, purpose, enteredOtp);
  if (!safeCompare(enteredHash, challenge.codeHash)) {
    return { ok: false as const, error: 'Invalid OTP code' };
  }

  await db.update(userOtps).set({ usedAt: now }).where(eq(userOtps.id, challenge.id));
  return { ok: true as const };
}
