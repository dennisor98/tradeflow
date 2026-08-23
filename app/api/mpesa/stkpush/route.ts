import { NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { mpesaTransactions, transactions } from '@/lib/schema';
import { getMinDepositUsd, getUsdToKesRate } from '@/lib/settings';
import {
  DarajaError,
  MPESA_BASE_URL,
  MPESA_PARTY_B,
  MPESA_SHORTCODE,
  MPESA_TRANSACTION_TYPE,
  darajaPassword,
  darajaTimestamp,
  getMpesaToken,
  logMpesa,
  maskPhone,
  mpesaCallbackUrl,
  mpesaConfigSummary,
  readDarajaJson,
} from '@/lib/mpesa';

export async function POST(request: Request) {
  // Ties this request to its Daraja response and, later, its callback.
  const trace = crypto.randomUUID().slice(0, 8);

  // Captured as soon as they are known so the catch below can still record the
  // attempt. Most Daraja refusals arrive as HTTP 4xx, which throws rather than
  // reaching the declined branch, so without this they would go unrecorded.
  let context: { userId: string; amountKes: number; amountUsd: number; rate: number; phone: string } | null = null;
  let recorded = false;

  try {
    const body = await request.json();
    const { phone, amountUsd, userId } = body;

    if (!phone || !amountUsd || !userId) {
      logMpesa('stk.rejected', { trace, reason: 'missing fields', has: { phone: !!phone, amountUsd: !!amountUsd, userId: !!userId } });
      return NextResponse.json({ error: 'Missing required fields' }, { status: 400 });
    }

    const usd = Number(amountUsd);
    if (!Number.isFinite(usd) || usd <= 0) {
      return NextResponse.json({ error: 'Amount must be a positive number' }, { status: 400 });
    }

    // Re-checked here because the deposit screen's gate is only a convenience.
    const minDeposit = await getMinDepositUsd();
    if (usd < minDeposit) {
      logMpesa('stk.rejected', { trace, reason: 'below minimum', amountUsd: usd, minDeposit });
      return NextResponse.json(
        { error: `Minimum deposit is $${minDeposit.toFixed(2)}` },
        { status: 400 },
      );
    }

    // The rate is resolved server-side and stored on the row. The client sends
    // dollars, never the shilling figure, so it cannot pick its own rate.
    const rate = await getUsdToKesRate();
    const amount = Math.round(usd * rate);

    let formattedPhone = String(phone).replace(/\D/g, '');
    if (formattedPhone.startsWith('0')) formattedPhone = '254' + formattedPhone.slice(1);

    context = { userId, amountKes: amount, amountUsd: usd, rate, phone: formattedPhone };

    const config = mpesaConfigSummary();
    logMpesa('stk.start', {
      trace,
      userId,
      phone: maskPhone(formattedPhone),
      phoneDigits: formattedPhone.length,
      amountUsd: usd,
      amountKes: amount,
      usdToKesRate: rate,
      config,
    });

    if (!config.shortcodeMatchesPartyB) {
      logMpesa('stk.warning', {
        trace,
        message:
          'BusinessShortCode and PartyB differ. That is a till (BuyGoods) setup — ' +
          'if the push never arrives, try MPESA_TRANSACTION_TYPE=CustomerBuyGoodsOnline.',
        businessShortCode: config.businessShortCode,
        partyB: config.partyB,
        transactionType: config.transactionType,
      });
    }
    if (formattedPhone.length !== 12 || !formattedPhone.startsWith('254')) {
      logMpesa('stk.warning', {
        trace,
        message: 'Phone is not in 2547XXXXXXXX form; Safaricom will not deliver the prompt.',
        phone: maskPhone(formattedPhone),
        digits: formattedPhone.length,
      });
    }

    const callBackURL = mpesaCallbackUrl();
    const token = await getMpesaToken();
    logMpesa('stk.token', { trace, ok: true, tokenPrefix: token.slice(0, 6) });

    const timestamp = darajaTimestamp();
    const stkPushRequest = {
      BusinessShortCode: MPESA_SHORTCODE,
      Password: darajaPassword(timestamp),
      Timestamp: timestamp,
      TransactionType: MPESA_TRANSACTION_TYPE,
      Amount: amount,
      PartyA: formattedPhone,
      PartyB: MPESA_PARTY_B,
      PhoneNumber: formattedPhone,
      CallBackURL: callBackURL,
      AccountReference: `Wintradein-${userId}`,
      TransactionDesc: `Deposit of ${amount}`,
    };

    // Password is derived from the passkey — log its shape, never its value.
    logMpesa('stk.request', {
      trace,
      url: `${MPESA_BASE_URL}/mpesa/stkpush/v1/processrequest`,
      payload: { ...stkPushRequest, Password: `<${stkPushRequest.Password.length} chars>`, PartyA: maskPhone(formattedPhone), PhoneNumber: maskPhone(formattedPhone) },
    });

    const started = Date.now();
    const stkPushResponse = await fetch(`${MPESA_BASE_URL}/mpesa/stkpush/v1/processrequest`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify(stkPushRequest),
      cache: 'no-store',
    });

    // Read as text first so the raw body is logged even when it isn't JSON.
    const rawBody = await stkPushResponse.text();
    logMpesa('stk.response', {
      trace,
      httpStatus: stkPushResponse.status,
      ms: Date.now() - started,
      contentType: stkPushResponse.headers.get('content-type'),
      rawBody: rawBody.slice(0, 800) || '(empty)',
    });

    const stkPushData = await readDarajaJson(
      new Response(rawBody, { status: stkPushResponse.status, headers: stkPushResponse.headers }),
      'M-Pesa STK push'
    );

    if (stkPushData.ResponseCode === '0') {
      const transactionId = crypto.randomUUID();
      await db.insert(mpesaTransactions).values({
        id: transactionId,
        userId,
        checkoutRequestID: stkPushData.CheckoutRequestID,
        merchantRequestID: stkPushData.MerchantRequestID,
        amount: amount.toString(),
        phoneNumber: formattedPhone,
        status: 'pending',
        usdToKesRate: rate.toFixed(4),
      });

      logMpesa('stk.accepted', {
        trace,
        transactionId,
        checkoutRequestID: stkPushData.CheckoutRequestID,
        merchantRequestID: stkPushData.MerchantRequestID,
        customerMessage: stkPushData.CustomerMessage,
        note: 'Safaricom accepted the request. If no prompt appears, the failure is downstream — wait for stk.callback, or run scripts/mpesa-doctor.mjs query <CheckoutRequestID>.',
      });

      return NextResponse.json({
        success: true,
        checkoutRequestID: stkPushData.CheckoutRequestID,
        merchantRequestID: stkPushData.MerchantRequestID,
        transactionId,
        amountKes: amount,
        usdToKesRate: rate,
        message: 'STK push sent successfully',
      });
    }

    const reason =
      stkPushData.errorMessage || stkPushData.ResponseDescription || 'STK push failed';

    logMpesa('stk.declined', {
      trace,
      responseCode: stkPushData.ResponseCode,
      responseDescription: stkPushData.ResponseDescription,
      errorCode: stkPushData.errorCode,
      errorMessage: stkPushData.errorMessage,
    });

    // Safaricom refused before a CheckoutRequestID existed, so there is nothing
    // to poll — but the attempt still has to be recorded, otherwise a customer
    // whose deposit never started sees no evidence of it anywhere.
    await recordFailedAttempt({ trace, ...context, reason });
    recorded = true;

    return NextResponse.json({ error: reason }, { status: 400 });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    logMpesa('stk.error', { trace, message });
    console.error('STK push error:', error);

    // If we got far enough to know who was paying and how much, the customer
    // made a real attempt and it has to show up in their history.
    if (context && !recorded) {
      await recordFailedAttempt({ trace, ...context, reason: darajaReason(error) ?? message });
    }

    // A refusal from Daraja is a client-side failure, not a server fault.
    const isRefusal = error instanceof DarajaError && error.httpStatus >= 400 && error.httpStatus < 500;
    return NextResponse.json(
      { error: isRefusal ? (darajaReason(error) ?? message) : message },
      { status: isRefusal ? 400 : 500 }
    );
  }
}


/** Daraja puts the useful text in errorMessage; fall back to the raw body. */
function darajaReason(error: unknown): string | null {
  if (!(error instanceof DarajaError)) return null;
  try {
    const parsed = JSON.parse(error.body);
    return parsed.errorMessage || parsed.ResponseDescription || null;
  } catch {
    return null;
  }
}

/**
 * Persists an attempt that never reached a CheckoutRequestID: one row in
 * mpesa_transactions for operations, one in transactions for the customer's
 * own history. Marked failed immediately so the poller ignores it.
 */
async function recordFailedAttempt(input: {
  trace: string;
  userId: string;
  amountKes: number;
  amountUsd: number;
  rate: number;
  phone: string;
  reason: string;
}) {
  try {
    const id = crypto.randomUUID();
    await db.insert(mpesaTransactions).values({
      id,
      userId: input.userId,
      // No CheckoutRequestID was issued; this keeps the column unique and
      // makes the origin obvious when reading the table.
      checkoutRequestID: `declined-${input.trace}`,
      amount: input.amountKes.toString(),
      phoneNumber: input.phone,
      status: 'failed',
      resultDesc: input.reason.slice(0, 255),
      usdToKesRate: input.rate.toFixed(4),
    });

    await db.insert(transactions).values({
      id,
      userId: input.userId,
      type: 'deposit',
      amount: input.amountUsd.toFixed(2),
      status: 'failed',
      label: `M-Pesa deposit failed — ${input.reason}`.slice(0, 255),
      time: Date.now(),
    });
  } catch (error) {
    // Never let bookkeeping turn a declined push into a 500.
    logMpesa('stk.record-failure-error', {
      trace: input.trace,
      message: error instanceof Error ? error.message : String(error),
    });
  }
}
