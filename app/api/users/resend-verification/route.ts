import { NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { users } from '@/lib/schema';
import { eq } from 'drizzle-orm';
import { createOtpChallenge } from '@/lib/otp';
import { sendOtpEmail } from '@/lib/email';

function normalizeEmail(email: string) {
  return email.trim().toLowerCase();
}

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const rawEmail = body.email;

    if (!rawEmail) {
      return NextResponse.json({ error: 'Email is required' }, { status: 400 });
    }

    const email = normalizeEmail(rawEmail);
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      return NextResponse.json({ error: 'Valid email required' }, { status: 400 });
    }

    const foundUser = await db.select().from(users).where(eq(users.email, email)).limit(1);
    if (foundUser.length === 0) {
      return NextResponse.json({ error: 'User not found' }, { status: 404 });
    }

    const user = foundUser[0];
    if (user.isActive === 1) {
      return NextResponse.json({ error: 'Account already verified' }, { status: 400 });
    }

    const challenge = await createOtpChallenge({
      userId: user.id,
      email,
      purpose: 'register',
    });

    const emailResult = await sendOtpEmail({
      to: email,
      name: user.name,
      otp: challenge.otp,
      purpose: 'register',
    });

    if (!emailResult.sent) {
      return NextResponse.json({ error: emailResult.reason }, { status: 500 });
    }

    return NextResponse.json({ message: 'Verification OTP sent to email' }, { status: 200 });
  } catch (error) {
    console.error('Resend verification OTP error:', error);
    return NextResponse.json({ error: 'Failed to send verification OTP' }, { status: 500 });
  }
}
