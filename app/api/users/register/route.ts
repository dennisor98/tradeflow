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
    const name = body.name?.trim();
    const phone = body.phone?.trim();
    const rawEmail = body.email;

    if (!name || !phone || !rawEmail) {
      return NextResponse.json({ error: 'Missing required fields' }, { status: 400 });
    }

    const email = normalizeEmail(rawEmail);
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      return NextResponse.json({ error: 'Valid email required' }, { status: 400 });
    }

    const existingByEmail = await db.select().from(users).where(eq(users.email, email)).limit(1);
    if (existingByEmail.length > 0) {
      const existingUser = existingByEmail[0];

      if (existingUser.isActive === 1) {
        return NextResponse.json({ error: 'User already exists' }, { status: 400 });
      }

      if (existingUser.name !== name || existingUser.phone !== phone) {
        await db.update(users).set({ name, phone }).where(eq(users.id, existingUser.id));
      }

      const challenge = await createOtpChallenge({
        userId: existingUser.id,
        email,
        purpose: 'register',
      });

      const emailResult = await sendOtpEmail({
        to: email,
        name,
        otp: challenge.otp,
        purpose: 'register',
      });

      if (!emailResult.sent) {
        return NextResponse.json({ error: emailResult.reason }, { status: 500 });
      }

      return NextResponse.json({
        message: 'OTP sent to email',
        user: {
          id: existingUser.id,
          name,
          phone,
          email,
          isActive: false,
        },
      }, { status: 200 });
    }

    const existingByPhone = await db.select().from(users).where(eq(users.phone, phone)).limit(1);
    if (existingByPhone.length > 0) {
      return NextResponse.json({ error: 'Phone already in use' }, { status: 400 });
    }

    const userId = crypto.randomUUID();
    await db.insert(users).values({
      id: userId,
      name,
      phone,
      email,
      balance: '0',
      isActive: 0,
    });

    const challenge = await createOtpChallenge({
      userId,
      email,
      purpose: 'register',
    });

    const emailResult = await sendOtpEmail({
      to: email,
      name,
      otp: challenge.otp,
      purpose: 'register',
    });

    if (!emailResult.sent) {
      return NextResponse.json({ error: emailResult.reason }, { status: 500 });
    }

    return NextResponse.json({
      message: 'OTP sent to email',
      user: {
        id: userId,
        name,
        phone,
        email,
        isActive: false,
      },
    }, { status: 201 });
  } catch (error) {
    console.error('Registration error:', error);
    return NextResponse.json({ error: 'Registration failed' }, { status: 500 });
  }
}