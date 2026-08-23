import { NextResponse } from 'next/server';
import { getAdmin } from '@/lib/admin-auth';

export async function GET() {
  const admin = await getAdmin();
  if (!admin) return NextResponse.json({ error: 'Not authorised' }, { status: 401 });
  return NextResponse.json({ admin }, { status: 200 });
}
