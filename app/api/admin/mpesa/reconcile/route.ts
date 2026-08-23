import { NextResponse } from 'next/server';
import { requireAdmin, recordAudit } from '@/lib/admin-auth';
import { countUnrecordedFailures, reconcileMpesaTransactions } from '@/lib/mpesa-reconcile';

export async function GET() {
  const guard = await requireAdmin();
  if (!guard.ok) return guard.response;
  return NextResponse.json({ unrecordedFailures: await countUnrecordedFailures() });
}

/** Body: { dryRun?: boolean } — dryRun reports what would change without writing. */
export async function POST(request: Request) {
  const guard = await requireAdmin();
  if (!guard.ok) return guard.response;

  try {
    const body = await request.json().catch(() => ({}));
    const dryRun = body.dryRun !== false;

    const results = await reconcileMpesaTransactions({ dryRun });
    const summary = results.reduce<Record<string, number>>((acc, r) => {
      acc[r.action] = (acc[r.action] ?? 0) + 1;
      return acc;
    }, {});

    if (!dryRun) {
      await recordAudit({
        admin: guard.admin,
        action: 'mpesa.reconcile',
        details: { examined: results.length, summary },
      });
    }

    return NextResponse.json({ dryRun, examined: results.length, summary, results });
  } catch (error) {
    console.error('Reconcile error:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Reconcile failed' },
      { status: 500 }
    );
  }
}
