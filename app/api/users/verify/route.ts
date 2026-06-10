import { NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { users } from '@/lib/schema';
import { eq } from 'drizzle-orm';
import { verifyOtpChallenge, type OtpPurpose } from '@/lib/otp';

function normalizeEmail(email: string) {
  return email.trim().toLowerCase();
}

function isOtpPurpose(value: string): value is OtpPurpose {
  return value === 'register' || value === 'login';
}

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const rawEmail = body.email;
    const otp = body.otp;
    const purpose = body.purpose;

    if (!rawEmail || !otp || !purpose) {
      return NextResponse.json({ error: 'Email, OTP and purpose are required' }, { status: 400 });
    }

    if (!isOtpPurpose(purpose)) {
      return NextResponse.json({ error: 'Invalid OTP purpose' }, { status: 400 });
    }

    const email = normalizeEmail(rawEmail);
    const foundUser = await db.select().from(users).where(eq(users.email, email)).limit(1);
    if (foundUser.length === 0) {
      return NextResponse.json({ error: 'User not found' }, { status: 404 });
    }

    const user = foundUser[0];
    if (purpose === 'login' && user.isActive !== 1) {
      return NextResponse.json({ error: 'Account not verified. Complete registration OTP first.' }, { status: 403 });
    }

    const verification = await verifyOtpChallenge({
      userId: user.id,
      email,
      purpose,
      otp: String(otp),
    });

    if (!verification.ok) {
      return NextResponse.json({ error: verification.error }, { status: 400 });
    }

    if (purpose === 'register' && user.isActive !== 1) {
      await db
        .update(users)
        .set({ isActive: 1, emailVerifiedAt: new Date() })
        .where(eq(users.id, user.id));
    }

    const activeUser = await db.select().from(users).where(eq(users.id, user.id)).limit(1);

    return NextResponse.json({
      message: purpose === 'register' ? 'Account verified' : 'Login successful',
      user: {
        id: activeUser[0].id,
        name: activeUser[0].name,
        phone: activeUser[0].phone,
        email: activeUser[0].email,
        isActive: activeUser[0].isActive === 1,
      },
    }, { status: 200 });
  } catch (error) {
    console.error('OTP verification error:', error);
    return NextResponse.json({ error: 'OTP verification failed' }, { status: 500 });
  }
}
