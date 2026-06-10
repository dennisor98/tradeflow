import { NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { mpesaTransactions } from '@/lib/schema';
import { eq } from 'drizzle-orm';

const MPESA_CONSUMER_KEY = 'jJJNi8StDAUxA2ceMQX4quIlaHoZMDNyVBHGTHLtRDUGsxvz';
const MPESA_CONSUMER_SECRET = 'sG7eaonKJPvTZqAxNsPyPuAuRAKOTlMBR3oP3hxB7OdAKvKt5R11QkJ6SRp7NDIk';
const MPESA_ENV = process.env.MPESA_ENV || 'sandbox';

// Get transaction status from database
export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const transactionId = searchParams.get('transactionId');

    if (!transactionId) {
      return NextResponse.json({ error: 'Transaction ID required' }, { status: 400 });
    }

    const transaction = await db.select().from(mpesaTransactions).where(eq(mpesaTransactions.id, transactionId)).limit(1);

    if (transaction.length === 0) {
      return NextResponse.json({ error: 'Transaction not found' }, { status: 404 });
    }

    const tx = transaction[0];
    return NextResponse.json({
      status: tx.status,
      message: tx.resultDesc || undefined,
    });
  } catch (error) {
    console.error('Status check error:', error);
    return NextResponse.json({ error: 'Status check failed' }, { status: 500 });
  }
}

// Get OAuth token
async function getMpesaToken(): Promise<string> {
  const auth = Buffer.from(`${MPESA_CONSUMER_KEY}:${MPESA_CONSUMER_SECRET}`).toString('base64');
  const response = await fetch(
    `https://${MPESA_ENV}.safaricom.co.ke/oauth/v1/generate?grant_type=client_credentials`,
    {
      headers: {
        Authorization: `Basic ${auth}`,
      },
    }
  );
  const data = await response.json();
  return data.access_token;
}

// Check STK push status from M-Pesa API (optional - for manual checking)
export async function POST(request: Request) {
  try {
    const body = await request.json();
    const { checkoutRequestID } = body;

    if (!checkoutRequestID) {
      return NextResponse.json({ error: 'CheckoutRequestID required' }, { status: 400 });
    }

    // Get OAuth token
    const token = await getMpesaToken();

    // Check status
    const response = await fetch(
      `https://${MPESA_ENV}.safaricom.co.ke/mpesa/stkpushquery/v1/query`,
      {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          BusinessShortCode: process.env.MPESA_SHORTCODE || '174379',
          Password: '', // You'll need to generate this with timestamp
          Timestamp: '', // Current timestamp
          CheckoutRequestID: checkoutRequestID,
        }),
      }
    );

    const data = await response.json();

    if (response.ok) {
      return NextResponse.json({
        success: true,
        data,
      });
    } else {
      return NextResponse.json({ error: data.errorMessage || 'Status check failed' }, { status: 400 });
    }
  } catch (error) {
    console.error('Status check error:', error);
    return NextResponse.json({ error: 'Status check failed' }, { status: 500 });
  }
}
