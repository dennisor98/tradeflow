import { NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { mpesaTransactions } from '@/lib/schema';

const MPESA_CONSUMER_KEY = 'jJJNi8StDAUxA2ceMQX4quIlaHoZMDNyVBHGTHLtRDUGsxvz';
const MPESA_CONSUMER_SECRET = 'sG7eaonKJPvTZqAxNsPyPuAuRAKOTlMBR3oP3hxB7OdAKvKt5R11QkJ6SRp7NDIk';
const MPESA_PASSKEY = process.env.MPESA_PASSKEY || '';
const MPESA_SHORTCODE = process.env.MPESA_SHORTCODE || '174379';
const MPESA_ENV = process.env.MPESA_ENV || 'sandbox';

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

// STK Push endpoint
export async function POST(request: Request) {
  try {
    const body = await request.json();
    const { phone, amount, userId } = body;

    if (!phone || !amount || !userId) {
      return NextResponse.json({ error: 'Missing required fields' }, { status: 400 });
    }

    // Format phone number (remove +, ensure starts with 254)
    let formattedPhone = phone.replace(/\D/g, '');
    if (formattedPhone.startsWith('0')) {
      formattedPhone = '254' + formattedPhone.slice(1);
    }

    // Get OAuth token
    const token = await getMpesaToken();

    // Generate timestamp
    const date = new Date();
    const timestamp = date.getFullYear() +
      ('0' + (date.getMonth() + 1)).slice(-2) +
      ('0' + date.getDate()).slice(-2) +
      ('0' + date.getHours()).slice(-2) +
      ('0' + date.getMinutes()).slice(-2) +
      ('0' + date.getSeconds()).slice(-2);

    // Generate password
    const password = Buffer.from(MPESA_SHORTCODE + MPESA_PASSKEY + timestamp).toString('base64');

    // STK Push request
    const stkPushResponse = await fetch(
      `https://${MPESA_ENV}.safaricom.co.ke/mpesa/stkpush/v1/processrequest`,
      {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          BusinessShortCode: MPESA_SHORTCODE,
          Password: password,
          Timestamp: timestamp,
          TransactionType: 'CustomerPayBillOnline',
          Amount: 1,
          PartyA: formattedPhone,
          PartyB: MPESA_SHORTCODE,
          PhoneNumber: formattedPhone,
          CallBackURL: `${process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000'}/api/mpesa/callback`,
          AccountReference: `TradeFlow-${userId}`,
          TransactionDesc: `Deposit of ${amount}`,
        }),
      }
    );

    const stkPushData = await stkPushResponse.json();

    if (stkPushResponse.ok && stkPushData.ResponseCode === '0') {
      const checkoutRequestID = stkPushData.CheckoutRequestID;
      const merchantRequestID = stkPushData.MerchantRequestID;

      // Store the transaction in database
      const transactionId = crypto.randomUUID();
      await db.insert(mpesaTransactions).values({
        id: transactionId,
        userId,
        checkoutRequestID,
        merchantRequestID,
        amount: amount.toString(),
        phoneNumber: formattedPhone,
        status: 'pending',
      });

      return NextResponse.json({
        success: true,
        checkoutRequestID,
        merchantRequestID,
        transactionId,
        message: 'STK push sent successfully',
      });
    } else {
      return NextResponse.json(
        { error: stkPushData.errorMessage || 'STK push failed' },
        { status: 400 }
      );
    }
  } catch (error) {
    console.error('STK push error:', error);
    return NextResponse.json({ error: 'STK push failed' }, { status: 500 });
  }
}
