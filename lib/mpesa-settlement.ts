import { and, eq, inArray } from 'drizzle-orm';
import { db } from '@/lib/db';
import { mpesaTransactions, transactions, users } from '@/lib/schema';
import { sendDepositEmail } from '@/lib/email';
import { logMpesa } from '@/lib/mpesa';
import { DEFAULT_USD_TO_KES_RATE, getSettings, getUsdToKesRate, resolveAccountType } from '@/lib/settings';

export type SettlementResult =
  | { settled: true; outcome: 'completed' | 'failed'; usdAmount?: number }
  | { settled: false; reason: 'not-found' | 'already-settled' };

/**
 * Moves a pending M-Pesa transaction to its final state, exactly once.
 *
 * Both the poller and the callback can reach a transaction at the same moment,
 * and pm2 runs several workers, so the transition is a conditional UPDATE
 * guarded on status='pending'. Only the caller whose UPDATE actually matched a
 * row goes on to touch the balance — everyone else is told it was already
 * settled. Without that guard a customer could be credited twice for one push.
 */
export async function settleMpesaTransaction(params: {
  transactionId: string;
  outcome: 'completed' | 'failed';
  resultCode?: string | null;
  resultDesc?: string | null;
  mpesaReceiptNumber?: string | null;
  transactionDate?: string | null;
  source: 'poll' | 'callback';
  /**
   * Statuses this settlement is allowed to claim from. Defaults to pending.
   * Pass ['pending','failed'] to correct a transaction that was marked failed
   * prematurely and which Safaricom has since confirmed as paid.
   */
  fromStatuses?: string[];
}): Promise<SettlementResult> {
  const { transactionId, outcome, source } = params;
  const fromStatuses = params.fromStatuses ?? ['pending'];

  const rows = await db
    .select()
    .from(mpesaTransactions)
    .where(eq(mpesaTransactions.id, transactionId))
    .limit(1);
  const tx = rows[0];
  if (!tx) return { settled: false, reason: 'not-found' };

  // Atomic claim: whoever flips pending -> final owns the side effects.
  const claim = await db
    .update(mpesaTransactions)
    .set({
      status: outcome,
      resultCode: params.resultCode ?? undefined,
      resultDesc: params.resultDesc ?? undefined,
      mpesaReceiptNumber: params.mpesaReceiptNumber ?? undefined,
      transactionDate: params.transactionDate ?? undefined,
    })
    .where(and(eq(mpesaTransactions.id, transactionId), inArray(mpesaTransactions.status, fromStatuses)));

  const affected = (claim as unknown as [{ affectedRows: number }])[0]?.affectedRows ?? 0;
  if (affected === 0) {
    logMpesa('settle.skipped', { transactionId, source, reason: 'already settled by another path' });
    return { settled: false, reason: 'already-settled' };
  }

  logMpesa('settle.claimed', { transactionId, source, outcome, resultCode: params.resultCode, resultDesc: params.resultDesc });

  const userRows = await db.select().from(users).where(eq(users.id, tx.userId)).limit(1);
  const user = userRows[0];
  if (!user) return { settled: true, outcome };

  const kesAmount = parseFloat(tx.amount.toString());

  // Use the rate captured when the push was created, so the customer is
  // credited at exactly the rate they were quoted even if an admin has since
  // changed it. Rows created before this column existed fall back to the
  // current setting.
  const lockedRate = tx.usdToKesRate ? parseFloat(tx.usdToKesRate.toString()) : NaN;
  const rate = Number.isFinite(lockedRate) && lockedRate > 0
    ? lockedRate
    : (await getUsdToKesRate().catch(() => DEFAULT_USD_TO_KES_RATE));

  const usdAmount = Math.round((kesAmount / rate) * 100) / 100;

  if (outcome === 'failed') {
    // Record the attempt in the user-visible history. A failed deposit that
    // leaves no trace looks to the customer like their payment vanished, and
    // gives support nothing to search on. Balance is untouched; the row exists
    // purely as a record. Keyed on the M-Pesa transaction id so a retry from
    // the other settlement path cannot duplicate it.
    const existingFailed = await db
      .select()
      .from(transactions)
      .where(eq(transactions.id, tx.id))
      .limit(1);

    if (existingFailed.length === 0) {
      await db.insert(transactions).values({
        id: tx.id,
        userId: user.id,
        type: 'deposit',
        amount: usdAmount.toFixed(2),
        status: 'failed',
        label: params.resultDesc
          ? `M-Pesa deposit failed — ${params.resultDesc}`
          : 'M-Pesa deposit failed',
        time: Date.now(),
      });
    }

    logMpesa('settle.recorded-failure', { transactionId, source, kesAmount, usdAmount, reason: params.resultDesc });

    await sendDepositEmail({
      to: user.email,
      name: user.name,
      status: 'failure',
      amountKes: kesAmount,
      method: 'M-Pesa',
      reference: tx.checkoutRequestID,
      message: params.resultDesc ?? undefined,
    }).catch(err => logMpesa('settle.email-failed', { transactionId, error: String(err) }));
    return { settled: true, outcome };
  }

  const currentBalance = parseFloat(user.balance.toString());
  const newBalance = Math.round((currentBalance + usdAmount) * 100) / 100;
  const currentMaxDeposit = parseFloat(user.maxSingleDeposit?.toString() || '0');
  const newMaxDeposit = Math.max(currentMaxDeposit, usdAmount);

  const userUpdates: { balance: string; maxSingleDeposit: string; accountType?: string } = {
    balance: newBalance.toFixed(2),
    maxSingleDeposit: newMaxDeposit.toFixed(2),
  };
  const promotion = resolveAccountType(newMaxDeposit, user.accountType, await getSettings());
  if (promotion) userUpdates.accountType = promotion;

  await db.update(users).set(userUpdates).where(eq(users.id, user.id));

  // Reuses the M-Pesa transaction id as the history row id, so a retry from
  // either path cannot produce a second entry.
  const existingHistory = await db
    .select()
    .from(transactions)
    .where(eq(transactions.id, tx.id))
    .limit(1);

  const historyLabel = params.mpesaReceiptNumber
    ? `M-Pesa Deposit (${params.mpesaReceiptNumber})`
    : 'M-Pesa Deposit';

  if (existingHistory.length === 0) {
    await db.insert(transactions).values({
      id: tx.id,
      userId: user.id,
      type: 'deposit',
      amount: usdAmount.toFixed(2),
      status: 'completed',
      label: historyLabel,
      time: Date.now(),
    });
  } else if (existingHistory[0].status !== 'completed') {
    // Recovering a transaction that had been written off as failed.
    await db
      .update(transactions)
      .set({ status: 'completed', amount: usdAmount.toFixed(2), label: historyLabel })
      .where(eq(transactions.id, tx.id));
  }

  logMpesa('settle.credited', { transactionId, source, kesAmount, usdToKesRate: rate, usdAmount, balanceBefore: currentBalance, balanceAfter: newBalance });

  await sendDepositEmail({
    to: user.email,
    name: user.name,
    status: 'success',
    amountUsd: usdAmount,
    amountKes: kesAmount,
    method: 'M-Pesa',
    reference: params.mpesaReceiptNumber ?? tx.checkoutRequestID,
  }).catch(err => logMpesa('settle.email-failed', { transactionId, error: String(err) }));

  return { settled: true, outcome, usdAmount };
}

/**
 * Records the M-Pesa receipt number on an already-settled transaction.
 * The STK query API never returns it, so this is the callback's real job.
 */
export async function attachReceiptNumber(params: {
  checkoutRequestID: string;
  mpesaReceiptNumber?: string | null;
  transactionDate?: string | null;
  resultCode?: string | null;
  resultDesc?: string | null;
}) {
  const updates: Record<string, string> = {};
  if (params.mpesaReceiptNumber) updates.mpesaReceiptNumber = params.mpesaReceiptNumber;
  if (params.transactionDate) updates.transactionDate = params.transactionDate;
  if (params.resultCode) updates.resultCode = params.resultCode;
  if (params.resultDesc) updates.resultDesc = params.resultDesc;
  if (Object.keys(updates).length === 0) return;

  await db
    .update(mpesaTransactions)
    .set(updates)
    .where(eq(mpesaTransactions.checkoutRequestID, params.checkoutRequestID));

  // Backfill the receipt into the user-visible history row too.
  if (params.mpesaReceiptNumber) {
    const rows = await db
      .select()
      .from(mpesaTransactions)
      .where(eq(mpesaTransactions.checkoutRequestID, params.checkoutRequestID))
      .limit(1);
    if (rows[0]) {
      await db
        .update(transactions)
        .set({ label: `M-Pesa Deposit (${params.mpesaReceiptNumber})` })
        .where(eq(transactions.id, rows[0].id));
    }
  }
}


/**
 * Writes the customer-visible history row for a transaction that is already
 * marked failed but has none.
 *
 * Needed because failures settled before failure-recording existed left no
 * trace in the transactions table, so they are invisible in the app and in the
 * admin console. Safe to call repeatedly.
 */
export async function ensureFailureRecorded(transactionId: string): Promise<boolean> {
  const rows = await db
    .select()
    .from(mpesaTransactions)
    .where(eq(mpesaTransactions.id, transactionId))
    .limit(1);
  const tx = rows[0];
  if (!tx || tx.status !== 'failed') return false;

  const existing = await db
    .select()
    .from(transactions)
    .where(eq(transactions.id, tx.id))
    .limit(1);
  if (existing.length > 0) return false;

  const kesAmount = parseFloat(tx.amount.toString());
  const lockedRate = tx.usdToKesRate ? parseFloat(tx.usdToKesRate.toString()) : NaN;
  const rate = Number.isFinite(lockedRate) && lockedRate > 0
    ? lockedRate
    : (await getUsdToKesRate().catch(() => DEFAULT_USD_TO_KES_RATE));

  await db.insert(transactions).values({
    id: tx.id,
    userId: tx.userId,
    type: 'deposit',
    amount: (Math.round((kesAmount / rate) * 100) / 100).toFixed(2),
    status: 'failed',
    label: tx.resultDesc ? `M-Pesa deposit failed — ${tx.resultDesc}` : 'M-Pesa deposit failed',
    time: new Date(tx.createdAt).getTime(),
  });

  logMpesa('backfill.failure-recorded', { transactionId, reason: tx.resultDesc });
  return true;
}
