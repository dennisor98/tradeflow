import { NextRequest, NextResponse } from "next/server";
import { getRedis } from "@/lib/redis";

const DEPOSIT_ADDRESS_KEY = "crypto:deposit:address";

// GET - Retrieve the deposit address
export async function GET() {
  try {
    const redis = getRedis();
    const address = await redis.get(DEPOSIT_ADDRESS_KEY);
    
    if (!address) {
      return NextResponse.json({ error: "Deposit address not initialized" }, { status: 404 });
    }
    
    return NextResponse.json({ address: String(address) });
  } catch (error) {
    console.error("Error fetching deposit address:", error);
    return NextResponse.json({ error: "Failed to fetch deposit address" }, { status: 500 });
  }
}

// POST - Set the deposit address (called on app start)
export async function POST(request: NextRequest) {
  try {
    const { address } = await request.json();
    
    if (!address) {
      return NextResponse.json({ error: "Address is required" }, { status: 400 });
    }
    
    const redis = getRedis();
    await redis.set(DEPOSIT_ADDRESS_KEY, String(address));
    
    return NextResponse.json({ success: true, address: String(address) });
  } catch (error) {
    console.error("Error setting deposit address:", error);
    return NextResponse.json({ error: "Failed to set deposit address" }, { status: 500 });
  }
}
