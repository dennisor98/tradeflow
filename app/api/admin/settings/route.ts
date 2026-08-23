import { NextResponse } from 'next/server';
import { requireAdmin, recordAudit } from '@/lib/admin-auth';
import {
  SETTING_DEFS,
  SETTING_NAMES,
  type SettingName,
  getSetting,
  getSettingRows,
  getSettings,
  parseSetting,
  setSetting,
} from '@/lib/settings';

export async function GET() {
  const guard = await requireAdmin();
  if (!guard.ok) return guard.response;

  const [values, rows] = await Promise.all([getSettings(), getSettingRows()]);

  // One entry per setting, so the screen can show provenance per field rather
  // than one "last changed" line covering everything.
  const meta = Object.fromEntries(
    SETTING_NAMES.map(name => {
      const def = SETTING_DEFS[name];
      const row = rows.find(r => r.key === def.key);
      return [name, {
        value: values[name],
        isDefault: !row,
        default: def.default,
        min: def.min,
        max: def.max,
        label: def.label,
        percent: Boolean((def as { percent?: boolean }).percent),
        updatedBy: row?.updatedBy ?? null,
        updatedAt: row?.updatedAt ?? null,
      }];
    }),
  );

  return NextResponse.json({ ...values, settings: meta });
}

export async function PATCH(request: Request) {
  const guard = await requireAdmin();
  if (!guard.ok) return guard.response;

  try {
    const body = await request.json();

    const supplied = SETTING_NAMES.filter(name => body[name] !== undefined);
    if (supplied.length === 0) {
      return NextResponse.json({ error: 'No settings supplied' }, { status: 400 });
    }

    // Validate everything before writing anything, so a bad field in a
    // multi-field save cannot leave half the values applied.
    const parsed: Partial<Record<SettingName, number>> = {};
    for (const name of supplied) {
      const result = parseSetting(SETTING_DEFS[name], body[name]);
      if (!result.ok) return NextResponse.json({ error: result.error }, { status: 400 });
      parsed[name] = result.value;
    }

    // The two tiers share one ladder, so a save that would invert them is
    // rejected whether it names one threshold or both.
    const current = await getSettings();
    const vip = parsed.vipThresholdUsd ?? current.vipThresholdUsd;
    const vvip = parsed.vvipThresholdUsd ?? current.vvipThresholdUsd;
    if (vvip < vip) {
      return NextResponse.json(
        { error: 'VVIP qualifying deposit must be at least the VIP qualifying deposit' },
        { status: 400 },
      );
    }

    const changed: SettingName[] = [];
    for (const name of supplied) {
      const def = SETTING_DEFS[name];
      const value = parsed[name]!;
      // An unset setting is still written when it matches the default, so an
      // admin can pin a value rather than leaving it riding on the fallback.
      const stored = await getSetting(def.key);
      if (stored !== null && current[name] === value) continue;

      await setSetting(def.key, String(value), guard.admin.email);
      await recordAudit({
        admin: guard.admin,
        action: 'settings.update',
        details: { key: def.key, from: current[name], to: value },
      });
      changed.push(name);
    }

    return NextResponse.json({ ...(await getSettings()), changed });
  } catch (error) {
    console.error('Admin settings update error:', error);
    return NextResponse.json({ error: 'Failed to update settings' }, { status: 500 });
  }
}
