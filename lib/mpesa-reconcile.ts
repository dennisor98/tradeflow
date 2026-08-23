import { eq, inArray } from 'drizzle-orm';
import { db } from '@/lib/db';
import { mpesaTransactions, transactions } from '@/lib/schema';
import { STK_RESULT_MEANINGS, logMpesa, queryStkStatus } from '@/lib/mpesa';
import { ensureFailureRecorded, settleMpesaTransaction } from '@/lib/mpesa-settlement';

export type ReconcileOutcome = {
  transactionId: string;
  checkoutRequestID: string;
  amountKes: string;
  wasStatus: string;
  action:
    | 'credited'
    | 'marked-failed'
    | 'history-backfilled'
    | 'left-pending'
    | 'skipped-no-verdict'
    | 'skipped-synthetic';
  detail?: string;
};

/** Safaricom spike-arrests aggressive querying, so requests are spaced out. */
const GAP_MS = 500;
const MAX_BATCH = 25;

/**
 * Brings M-Pesa transactions back in step with Safaricom.
 *
 * Covers three situations that leave the ledger wrong:
 *   - stuck pending, because no callback arrived and nobody polled
 *   - marked failed while actually paid (an in-flight reply misread as final)
 *   - marked failed with no customer-visible history row
 */
export async function reconcileMpesaTransactions(options: { dryRun: boolean; limit?: number }) {
  const rows = await db
    .select()
    .from(mpesaTransactions)
    .where(inArray(mpesaTransactions.status, ['pending', 'failed']))
    .limit(Math.min(options.limit ?? MAX_BATCH, MAX_BATCH));

  const results: ReconcileOutcome[] = [];

  for (const tx of rows) {
    const base = {
      transactionId: tx.id,
      checkoutRequestID: tx.checkoutRequestID,
      amountKes: tx.amount.toString(),
      wasStatus: tx.status,
    };

    // Refused before Safaricom issued an id — there is nothing to ask about.
    if (tx.checkoutRequestID.startsWith('declined-')) {
      if (!options.dryRun) await ensureFailureRecorded(tx.id);
      results.push({ ...base, action: 'skipped-synthetic', detail: 'No CheckoutRequestID to query' });
      continue;
    }

    let outcome;
    try {
      outcome = await queryStkStatus(tx.checkoutRequestID);
    } catch (error) {
      results.push({ ...base, action: 'skipped-no-verdict', detail: error instanceof Error ? error.message : String(error) });
      await new Promise(r => setTimeout(r, GAP_MS));
      continue;
    }

    const meaning = outcome.resultCode ? STK_RESULT_MEANINGS[outcome.resultCode] : undefined;
    const detail = `${outcome.resultCode ?? '-'} ${meaning ?? outcome.resultDesc ?? ''}`.trim();

    if (outcome.state === 'success') {
      if (!options.dryRun) {
        await settleMpesaTransaction({
          transactionId: tx.id,
          outcome: 'completed',
          resultCode: outcome.resultCode,
          resultDesc: meaning ?? outcome.resultDesc,
          source: 'poll',
          // Recovers a row wrongly written off as failed.
          fromStatuses: ['pending', 'failed'],
        });
      }
      results.push({ ...base, action: 'credited', detail });
    } else if (outcome.state === 'failed') {
      if (!options.dryRun) {
        if (tx.status === 'pending') {
          await settleMpesaTransaction({
            transactionId: tx.id,
            outcome: 'failed',
            resultCode: outcome.resultCode,
            resultDesc: meaning ?? outcome.resultDesc,
            source: 'poll',
          });
        } else {
          // Already failed; it is the missing history row we are here for.
          await db
            .update(mpesaTransactions)
            .set({ resultCode: outcome.resultCode, resultDesc: meaning ?? outcome.resultDesc })
            .where(eq(mpesaTransactions.id, tx.id));
          await ensureFailureRecorded(tx.id);
        }
      }
      results.push({
        ...base,
        action: tx.status === 'pending' ? 'marked-failed' : 'history-backfilled',
        detail,
      });
    } else {
      results.push({
        ...base,
        action: outcome.state === 'pending' ? 'left-pending' : 'skipped-no-verdict',
        detail: detail || outcome.resultDesc || `HTTP ${outcome.httpStatus}`,
      });
    }

    await new Promise(r => setTimeout(r, GAP_MS));
  }

  logMpesa('reconcile.run', { dryRun: options.dryRun, examined: rows.length });
  return results;
}

/** Failed M-Pesa rows that have no customer-visible history row. */
export async function countUnrecordedFailures() {
  const failed = await db
    .select({ id: mpesaTransactions.id })
    .from(mpesaTransactions)
    .where(eq(mpesaTransactions.status, 'failed'));
  if (failed.length === 0) return 0;

  const ids = failed.map(f => f.id);
  const present = await db
    .select({ id: transactions.id })
    .from(transactions)
    .where(inArray(transactions.id, ids));
  const have = new Set(present.map(p => p.id));
  return ids.filter(id => !have.has(id)).length;
}
