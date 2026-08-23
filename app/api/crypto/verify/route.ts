import { NextRequest, NextResponse } from "next/server";
import { getRedis } from "@/lib/redis";
import { TronWeb } from "tronweb";
import { db } from "@/lib/db";
import { users } from "@/lib/schema";
import { sendDepositEmail } from "@/lib/email";
import { eq } from "drizzle-orm";
import { getMinDepositUsd } from "@/lib/settings";

const DEPOSIT_ADDRESS_KEY = "crypto:deposit:address";

// Initialize TronWeb with public endpoint
const tronWeb = new TronWeb({
  fullNode: "https://api.trongrid.io",
  solidityNode: "https://api.trongrid.io",
  eventServer: "https://api.trongrid.io",
});

function getStringValue(value: unknown, key: string) {
  if (typeof value !== "object" || value === null || !(key in value)) return undefined;
  const result = (value as Record<string, unknown>)[key];
  return typeof result === "string" ? result : undefined;
}

async function verifyTransactionOnBlockchain(txId: string, address: string): Promise<boolean> {
  try {
    // Get transaction details from TRON blockchain
    const transaction = await tronWeb.trx.getTransaction(txId);
    console.log("Transaction:", transaction);
    
    if (!transaction || !transaction.raw_data || !transaction.raw_data.contract || transaction.raw_data.contract.length === 0) {
      console.log("Transaction not found on blockchain");
      return false;
    }
    
    // Check if the transaction is to the deposit address
    const contract = transaction.raw_data.contract[0];
    const contractType = contract.type;
    
    let toAddressHex: string;
    
    // Handle different contract types
    if (contractType === "TransferContract") {
      // TRX transfer
      const toAddress = getStringValue(contract.parameter.value, "to_address");
      if (!toAddress) return false;
      toAddressHex = toAddress;
    } else if (contractType === "TriggerSmartContract") {
      // TRC20 token transfer (like USDT)
      const contractAddress = getStringValue(contract.parameter.value, "contract_address");
      if (!contractAddress) return false;
      toAddressHex = contractAddress;
    } else {
      console.log("Unsupported contract type:", contractType);
      return false;
    }
    
    const toAddress = tronWeb.address.fromHex(toAddressHex);
    
    if (toAddress.toLowerCase() !== address.toLowerCase()) {
      console.log("Transaction is not to the deposit address");
      return false;
    }
    
    // Check if transaction is confirmed (has block number)
    if (!transaction.ret || transaction.ret[0].contractRet !== "SUCCESS") {
      console.log("Transaction not confirmed or failed");
      return false;
    }
    
    console.log("Transaction verified successfully");
    return true;
  } catch (error) {
    console.error("Blockchain verification error:", error);
    return false;
  }
}

export async function POST(request: NextRequest) {
  try {
    const { txId, amount, userId } = await request.json();
    
    if (!txId || !amount || !userId) {
      return NextResponse.json({ error: "txId, amount, and userId are required" }, { status: 400 });
    }

    const usd = parseFloat(amount);
    if (!Number.isFinite(usd) || usd <= 0) {
      return NextResponse.json({ error: "Amount must be a positive number" }, { status: 400 });
    }

    // Re-checked here because the deposit screen's gate is only a convenience.
    const minDeposit = await getMinDepositUsd();
    if (usd < minDeposit) {
      return NextResponse.json(
        { error: `Minimum deposit is $${minDeposit.toFixed(2)}` },
        { status: 400 },
      );
    }
    
    const redis = getRedis();
    const depositAddress = await redis.get(DEPOSIT_ADDRESS_KEY);
    
    if (!depositAddress) {
      return NextResponse.json({ error: "Deposit address not initialized" }, { status: 400 });
    }
    
    // Store pending transaction for tracking
    await redis.hset(
      `crypto:pending:${depositAddress}`,
      txId,
      JSON.stringify({
        txId,
        amount: usd,
        userId,
        timestamp: Date.now(),
        status: "pending",
      })
    );
    
    // Verify transaction on blockchain
    const isValid = await verifyTransactionOnBlockchain(txId, depositAddress);
    
    if (isValid) {
      // Update transaction status to verified
      await redis.hset(
        `crypto:pending:${depositAddress}`,
        txId,
        JSON.stringify({
          txId,
          amount: usd,
          userId,
          timestamp: Date.now(),
          status: "verified",
        })
      );
      
      // Mark for balance update (handled by separate process)
      await redis.lpush("crypto:verified:queue", JSON.stringify({
        txId,
        amount: usd,
        userId,
        depositAddress,
      }));
      
      return NextResponse.json({ success: true, verified: true, message: "Transaction verified successfully" });
    } else {
      const userResult = await db.select().from(users).where(eq(users.id, userId)).limit(1);
      if (userResult.length > 0) {
        await sendDepositEmail({
          to: userResult[0].email,
          name: userResult[0].name,
          status: "failure",
          amountUsd: usd,
          method: "USDT / Crypto",
          reference: txId,
          message: "Transaction not found or not confirmed yet",
        });
      }

      return NextResponse.json({ success: false, verified: false, message: "Transaction not found or not confirmed yet" });
    }
  } catch (error) {
    console.error("Error verifying transaction:", error);
    return NextResponse.json({ error: "Failed to verify transaction" }, { status: 500 });
  }
}

// GET - Check verification status
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const txId = searchParams.get("txId");
    
    if (!txId) {
      return NextResponse.json({ error: "txId is required" }, { status: 400 });
    }
    
    const redis = getRedis();
    const depositAddress = await redis.get(DEPOSIT_ADDRESS_KEY);
    
    if (!depositAddress) {
      return NextResponse.json({ error: "Deposit address not initialized" }, { status: 400 });
    }
    
    const pendingTx = await redis.hget(`crypto:pending:${depositAddress}`, txId);
    
    if (!pendingTx) {
      return NextResponse.json({ error: "Transaction not found" }, { status: 404 });
    }
    
    const txData = JSON.parse(pendingTx);
    return NextResponse.json({ status: txData.status, data: txData });
  } catch (error) {
    console.error("Error checking transaction status:", error);
    return NextResponse.json({ error: "Failed to check transaction status" }, { status: 500 });
  }
}
