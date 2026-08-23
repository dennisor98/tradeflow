import { NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { mpesaTransactions } from '@/lib/schema';
import { eq } from 'drizzle-orm';
import { STK_RESULT_MEANINGS, logMpesa } from '@/lib/mpesa';
import { attachReceiptNumber, settleMpesaTransaction } from '@/lib/mpesa-settlement';

type MpesaCallbackItem = { Name: string; Value?: string | number };

function getCallbackValue(items: MpesaCallbackItem[] | undefined, name: string) {
  const value = items?.find(item => item.Name === name)?.Value;
  return value === undefined ? undefined : String(value);
}

/**
 * M-Pesa callback.
 *
 * Settlement is normally done by polling the STK query API (see
 * app/api/mpesa/status), so this callback's main job is to record the M-Pesa
 * receipt number, which the query API never returns.
 *
 * It still settles a transaction that is somehow *also* still pending — that
 * happens when nobody polled, typically because the customer closed the
 * browser right after paying. Dropping that case would take a payment and
 * never credit it. settleMpesaTransaction() claims the row atomically, so this
 * cannot double-credit alongside the poller.
 */
export async function POST(request: Request) {
  const raw = await request.text();
  logMpesa('callback.received', { bytes: raw.length, rawBody: raw.slice(0, 1200) || '(empty)' });

  try {
    const body = JSON.parse(raw);
    const stkCallback = body?.Body?.stkCallback;

    if (!stkCallback?.CheckoutRequestID) {
      logMpesa('callback.malformed', { reason: 'no CheckoutRequestID in payload' });
      return NextResponse.json({ ResultCode: 0, ResultDesc: 'Accepted' });
    }

    const { CheckoutRequestID, ResultCode, ResultDesc, CallbackMetadata } = stkCallback;
    const resultCode = String(ResultCode);
    const succeeded = resultCode === '0';

    const items = CallbackMetadata?.Item as MpesaCallbackItem[] | undefined;
    const mpesaReceiptNumber = getCallbackValue(items, 'MpesaReceiptNumber');
    const transactionDate = getCallbackValue(items, 'TransactionDate');
    const phoneNumber = getCallbackValue(items, 'PhoneNumber');

    logMpesa(succeeded ? 'callback.success' : 'callback.failed', {
      checkoutRequestID: CheckoutRequestID,
      resultCode,
      resultDesc: ResultDesc,
      meaning: STK_RESULT_MEANINGS[resultCode],
      mpesaReceiptNumber,
      phoneNumber: phoneNumber ? `${phoneNumber.slice(0, 6)}***${phoneNumber.slice(-3)}` : undefined,
    });

    const rows = await db
      .select()
      .from(mpesaTransactions)
      .where(eq(mpesaTransactions.checkoutRequestID, CheckoutRequestID))
      .limit(1);
    const tx = rows[0];

    if (!tx) {
      logMpesa('callback.unknown-transaction', { checkoutRequestID: CheckoutRequestID });
      return NextResponse.json({ ResultCode: 0, ResultDesc: 'Accepted' });
    }

    // Safaricom says this was paid but we had already written it off. That
    // happens if a still-processing reply was misread as a verdict. Credit the
    // customer rather than leaving them out of pocket.
    const needsRecovery = succeeded && tx.status === 'failed';

    if (tx.status === 'pending' || needsRecovery) {
      // Poller never got there. Settle from the callback instead.
      const result = await settleMpesaTransaction({
        transactionId: tx.id,
        outcome: succeeded ? 'completed' : 'failed',
        resultCode,
        resultDesc: STK_RESULT_MEANINGS[resultCode] ?? ResultDesc,
        mpesaReceiptNumber,
        transactionDate,
        source: 'callback',
        fromStatuses: needsRecovery ? ['pending', 'failed'] : ['pending'],
      });
      logMpesa(needsRecovery ? 'callback.recovered' : 'callback.settled', {
        checkoutRequestID: CheckoutRequestID,
        previousStatus: tx.status,
        ...result,
      });
    } else {
      // Already settled by the poller — this is the receipt number arriving.
      await attachReceiptNumber({
        checkoutRequestID: CheckoutRequestID,
        mpesaReceiptNumber,
        transactionDate,
        resultCode,
        resultDesc: STK_RESULT_MEANINGS[resultCode] ?? ResultDesc,
      });
      logMpesa('callback.receipt-attached', {
        checkoutRequestID: CheckoutRequestID,
        mpesaReceiptNumber,
        transactionStatus: tx.status,
      });
    }

    // Always acknowledge, otherwise Safaricom retries.
    return NextResponse.json({ ResultCode: 0, ResultDesc: 'Accepted' });
  } catch (error) {
    logMpesa('callback.error', { message: error instanceof Error ? error.message : String(error) });
    console.error('M-Pesa callback error:', error);
    return NextResponse.json({ ResultCode: 0, ResultDesc: 'Accepted' });
  }
}
