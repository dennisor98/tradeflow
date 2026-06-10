import { NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { mpesaTransactions, transactions, users } from '@/lib/schema';
import { eq } from 'drizzle-orm';
import { sendDepositEmail } from '@/lib/email';

const USD_TO_KES_RATE = 130; // Conversion rate

type MpesaCallbackItem = {
  Name: string;
  Value?: string | number;
};

function getCallbackValue(items: MpesaCallbackItem[], name: string) {
  const value = items.find((item) => item.Name === name)?.Value;
  return value === undefined ? undefined : String(value);
}

async function ensureDepositHistory(input: {
  id: string;
  userId: string;
  amountUsd: number;
  mpesaReceiptNumber?: string | null;
}) {
  const existingHistory = await db.select()
    .from(transactions)
    .where(eq(transactions.id, input.id))
    .limit(1);

  if (existingHistory.length > 0) return;

  await db.insert(transactions).values({
    id: input.id,
    userId: input.userId,
    type: 'deposit',
    amount: input.amountUsd.toFixed(2),
    status: 'completed',
    label: input.mpesaReceiptNumber
      ? `M-Pesa Deposit (${input.mpesaReceiptNumber})`
      : 'M-Pesa Deposit',
    time: Date.now(),
  });
}

// M-Pesa callback endpoint
export async function POST(request: Request) {
  try {
    const body = await request.json();
    console.log('M-Pesa Callback received:', JSON.stringify(body, null, 2));

    const { Body } = body;
    const { stkCallback } = Body;
    const { CheckoutRequestID, ResultCode, ResultDesc, CallbackMetadata } = stkCallback;
    const resultCode = String(ResultCode);

    if (resultCode === '0') {
      // Transaction successful
      const callbackItems = CallbackMetadata.Item as MpesaCallbackItem[];
      const amount = getCallbackValue(callbackItems, 'Amount');
      const mpesaReceiptNumber = getCallbackValue(callbackItems, 'MpesaReceiptNumber');
      const transactionDate = getCallbackValue(callbackItems, 'TransactionDate');
      const phoneNumber = getCallbackValue(callbackItems, 'PhoneNumber');

      console.log('Successful M-Pesa transaction:', {
        CheckoutRequestID,
        amount,
        mpesaReceiptNumber,
        phoneNumber,
      });

      // Update transaction status in database
      const existingTransaction = await db.select().from(mpesaTransactions).where(eq(mpesaTransactions.checkoutRequestID, CheckoutRequestID)).limit(1);

      if (existingTransaction.length > 0) {
        const transaction = existingTransaction[0];

        if (transaction.status === 'completed') {
          return NextResponse.json({
            ResultCode: 0,
            ResultDesc: 'Success',
            ThirdPartyTransID: transaction.mpesaReceiptNumber,
          });
        }
        
        // Update transaction status
        await db.update(mpesaTransactions)
          .set({
            status: 'completed',
            resultCode,
            resultDesc: ResultDesc,
            mpesaReceiptNumber,
            transactionDate,
          })
          .where(eq(mpesaTransactions.id, transaction.id));

        // Convert KES to USD and credit user balance
        const kesAmount = parseFloat(amount || '0');
        const usdAmount = kesAmount / USD_TO_KES_RATE;
        
        // Get current user balance
        const userResult = await db.select().from(users).where(eq(users.id, transaction.userId)).limit(1);
        
        if (userResult.length > 0) {
          const user = userResult[0];
          const currentBalance = parseFloat(user.balance as string);
          const newBalance = currentBalance + usdAmount;
          const currentMaxDeposit = parseFloat(user.maxSingleDeposit?.toString() || '0');
          const newMaxDeposit = Math.max(currentMaxDeposit, usdAmount);
          const userUpdates: {
            balance: string;
            maxSingleDeposit: string;
            accountType?: string;
          } = {
            balance: newBalance.toFixed(2),
            maxSingleDeposit: newMaxDeposit.toFixed(2),
          };

          if (newMaxDeposit >= 5000 && user.accountType !== 'vvip') {
            userUpdates.accountType = 'vvip';
          } else if (newMaxDeposit >= 1000 && user.accountType === 'normal') {
            userUpdates.accountType = 'vip';
          }
          
          await db.update(users)
            .set(userUpdates)
            .where(eq(users.id, transaction.userId));

          await ensureDepositHistory({
            id: transaction.id,
            userId: transaction.userId,
            amountUsd: usdAmount,
            mpesaReceiptNumber,
          });

          await sendDepositEmail({
            to: user.email,
            name: user.name,
            status: 'success',
            amountUsd: usdAmount,
            amountKes: kesAmount,
            method: 'M-Pesa',
            reference: mpesaReceiptNumber,
          });
        }
      }

      return NextResponse.json({
        ResultCode: 0,
        ResultDesc: 'Success',
        ThirdPartyTransID: mpesaReceiptNumber,
      });
    } else {
      // Transaction failed
      console.log('Failed M-Pesa transaction:', {
        CheckoutRequestID,
        ResultCode,
        ResultDesc,
      });

      // Update transaction status to failed in database
      const existingTransaction = await db.select().from(mpesaTransactions).where(eq(mpesaTransactions.checkoutRequestID, CheckoutRequestID)).limit(1);

      if (existingTransaction.length > 0) {
        const transaction = existingTransaction[0];

        if (transaction.status === 'failed') {
          return NextResponse.json({
            ResultCode: ResultCode,
            ResultDesc: ResultDesc,
          });
        }

        await db.update(mpesaTransactions)
          .set({
            status: 'failed',
            resultCode,
            resultDesc: ResultDesc,
          })
          .where(eq(mpesaTransactions.id, transaction.id));

        const userResult = await db.select().from(users).where(eq(users.id, transaction.userId)).limit(1);
        if (userResult.length > 0) {
          await sendDepositEmail({
            to: userResult[0].email,
            name: userResult[0].name,
            status: 'failure',
            amountKes: parseFloat(transaction.amount as string),
            method: 'M-Pesa',
            reference: CheckoutRequestID,
            message: ResultDesc,
          });
        }
      }

      return NextResponse.json({
        ResultCode: ResultCode,
        ResultDesc: ResultDesc,
      });
    }
  } catch (error) {
    console.error('M-Pesa callback error:', error);
    return NextResponse.json({ error: 'Callback processing failed' }, { status: 500 });
  }
}
