import { NextResponse } from 'next/server';
import { getSettings } from '@/lib/settings';

/**
 * Public settings the app screens need to quote amounts, show tier benefits
 * and settle a session. Every value here is already visible to a signed-in
 * user, and the tier ladder is advertised on the home page by design.
 */
export async function GET() {
  return NextResponse.json(await getSettings(), { status: 200 });
}
