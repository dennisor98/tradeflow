import { NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { mpesaTransactions } from '@/lib/schema';
import { eq, sql } from 'drizzle-orm';
import { STK_RESULT_MEANINGS, logMpesa, queryStkStatus } from '@/lib/mpesa';
import { settleMpesaTransaction } from '@/lib/mpesa-settlement';

/** Daraja should not be queried on every client tick. */
const MIN_QUERY_INTERVAL_SECONDS = 6;
/** After this long with no verdict, tell the UI to stop expecting one shortly. */
const STALE_SECONDS = 180;

/**
 * Status of an M-Pesa deposit.
 *
 * While the transaction is pending this actively asks Safaricom what happened
 * rather than waiting for the callback, and settles the transaction from that
 * answer. The callback is only needed afterwards to supply the M-Pesa receipt
 * number, which the query API does not return.
 */
export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const transactionId = searchParams.get('transactionId');

    if (!transactionId) {
      return NextResponse.json({ error: 'Transaction ID required' }, { status: 400 });
    }

    // All time arithmetic is done by MySQL. Drizzle serialises a JS Date to
    // UTC while the database clock is East Africa Time, so mixing the two in a
    // comparison silently made every row look hours old and disabled the
    // throttle entirely. Reading and writing the instant in SQL avoids that.
    const rows = await db
      .select({
        tx: mpesaTransactions,
        ageSeconds: sql<number>`timestampdiff(second, ${mpesaTransactions.createdAt}, now())`,
        sinceLastQuerySeconds: sql<
          number | null
        >`timestampdiff(second, ${mpesaTransactions.lastQueriedAt}, now())`,
      })
      .from(mpesaTransactions)
      .where(eq(mpesaTransactions.id, transactionId))
      .limit(1);
    const row = rows[0];

    if (!row) return NextResponse.json({ error: 'Transaction not found' }, { status: 404 });

    const tx = row.tx;
    if (tx.status !== 'pending') {
      return NextResponse.json({
        status: tx.status,
        message: tx.resultDesc || undefined,
        mpesaReceiptNumber: tx.mpesaReceiptNumber || undefined,
      });
    }

    const stale = Number(row.ageSeconds ?? 0) > STALE_SECONDS;

    // Claim this poll slot before calling out, so concurrent workers don't all
    // query Safaricom for the same transaction at once. The conditional UPDATE
    // is what actually enforces the interval; only the worker whose UPDATE
    // matched a row goes on to contact Daraja.
    const claim = await db
      .update(mpesaTransactions)
      .set({ lastQueriedAt: sql`now()`, queryCount: sql`${mpesaTransactions.queryCount} + 1` })
      .where(
        sql`${mpesaTransactions.id} = ${transactionId}
            and ${mpesaTransactions.status} = 'pending'
            and (${mpesaTransactions.lastQueriedAt} is null
                 or ${mpesaTransactions.lastQueriedAt} <= date_sub(now(), interval ${MIN_QUERY_INTERVAL_SECONDS} second))`
      );

    if (((claim as unknown as [{ affectedRows: number }])[0]?.affectedRows ?? 0) === 0) {
      return NextResponse.json({ status: 'pending', stale, polled: false });
    }

    let outcome;
    try {
      outcome = await queryStkStatus(tx.checkoutRequestID);
    } catch (error) {
      // A query failure must not fail the poll; the transaction stays pending
      // and the next tick tries again.
      logMpesa('poll.error', { transactionId, message: error instanceof Error ? error.message : String(error) });
      return NextResponse.json({ status: 'pending', stale, polled: true });
    }

    logMpesa('poll.result', {
      transactionId,
      checkoutRequestID: tx.checkoutRequestID,
      queryCount: tx.queryCount + 1,
      ageSeconds: Number(row.ageSeconds ?? 0),
      state: outcome.state,
      resultCode: outcome.resultCode,
      resultDesc: outcome.resultDesc,
      httpStatus: outcome.httpStatus,
      raw: outcome.raw,
    });

    if (outcome.state === 'success' || outcome.state === 'failed') {
      const meaning = outcome.resultCode ? STK_RESULT_MEANINGS[outcome.resultCode] : undefined;
      await settleMpesaTransaction({
        transactionId: tx.id,
        outcome: outcome.state === 'success' ? 'completed' : 'failed',
        resultCode: outcome.resultCode,
        resultDesc: meaning ?? outcome.resultDesc,
        source: 'poll',
      });

      return NextResponse.json({
        status: outcome.state === 'success' ? 'completed' : 'failed',
        message: meaning ?? outcome.resultDesc,
        settledBy: 'poll',
      });
    }

    return NextResponse.json({ status: 'pending', stale, polled: true });
  } catch (error) {
    console.error('Status check error:', error);
    return NextResponse.json({ error: 'Status check failed' }, { status: 500 });
  }
}

/** Manual reconcile for a specific CheckoutRequestID. */
export async function POST(request: Request) {
  try {
    const { checkoutRequestID } = await request.json();
    if (!checkoutRequestID) {
      return NextResponse.json({ error: 'CheckoutRequestID required' }, { status: 400 });
    }

    const outcome = await queryStkStatus(checkoutRequestID);
    logMpesa('query.manual', { checkoutRequestID, ...outcome });

    const rows = await db
      .select()
      .from(mpesaTransactions)
      .where(eq(mpesaTransactions.checkoutRequestID, checkoutRequestID))
      .limit(1);

    if (rows[0] && (outcome.state === 'success' || outcome.state === 'failed')) {
      await settleMpesaTransaction({
        transactionId: rows[0].id,
        outcome: outcome.state === 'success' ? 'completed' : 'failed',
        resultCode: outcome.resultCode,
        resultDesc: (outcome.resultCode && STK_RESULT_MEANINGS[outcome.resultCode]) ?? outcome.resultDesc,
        source: 'poll',
      });
    }

    return NextResponse.json({
      success: true,
      state: outcome.state,
      resultCode: outcome.resultCode,
      meaning: outcome.resultCode ? STK_RESULT_MEANINGS[outcome.resultCode] : undefined,
      resultDesc: outcome.resultDesc,
    });
  } catch (error) {
    console.error('Status check error:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Status check failed' },
      { status: 500 }
    );
  }
}
