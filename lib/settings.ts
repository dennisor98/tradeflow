import { inArray, eq } from 'drizzle-orm';
import { db } from '@/lib/db';
import { platformSettings } from '@/lib/schema';

/**
 * Every admin-tunable number lives in this registry. Adding a setting means
 * adding one entry here — the public API, the admin API, validation and the
 * audit log all read from it, so there is nowhere else to remember to update.
 */
export interface SettingDef {
  /** Column value in platform_settings. */
  key: string;
  /** Name this setting travels under in JSON, for both API surfaces. */
  field: string;
  /** Used until an admin sets one, and if the database is unreachable. */
  default: number;
  min: number;
  max: number;
  decimals: number;
  /** Human name, used in validation messages and the audit trail. */
  label: string;
  /** Rendered as a percentage rather than a dollar figure. */
  percent?: boolean;
}

export const SETTING_DEFS = {
  usdToKesRate: {
    key: 'usd_to_kes_rate', field: 'usdToKesRate', default: 130,
    min: 1, max: 100_000, decimals: 4, label: 'Exchange rate',
  },
  minDepositUsd: {
    key: 'min_deposit_usd', field: 'minDepositUsd', default: 10,
    min: 1, max: 100_000, decimals: 2, label: 'Minimum deposit',
  },
  vipThresholdUsd: {
    key: 'vip_threshold_usd', field: 'vipThresholdUsd', default: 1000,
    min: 1, max: 10_000_000, decimals: 2, label: 'VIP qualifying deposit',
  },
  vvipThresholdUsd: {
    key: 'vvip_threshold_usd', field: 'vvipThresholdUsd', default: 5000,
    min: 1, max: 10_000_000, decimals: 2, label: 'VVIP qualifying deposit',
  },
  winRateNormal: {
    key: 'win_rate_normal', field: 'winRateNormal', default: 30,
    min: 0, max: 100, decimals: 1, label: 'Normal win rate', percent: true,
  },
  winRateVip: {
    key: 'win_rate_vip', field: 'winRateVip', default: 50,
    min: 0, max: 100, decimals: 1, label: 'VIP win rate', percent: true,
  },
  winRateVvip: {
    key: 'win_rate_vvip', field: 'winRateVvip', default: 70,
    min: 0, max: 100, decimals: 1, label: 'VVIP win rate', percent: true,
  },
} as const satisfies Record<string, SettingDef>;

export type SettingName = keyof typeof SETTING_DEFS;
export type SettingsSnapshot = Record<SettingName, number>;

export const SETTING_NAMES = Object.keys(SETTING_DEFS) as SettingName[];

/** Kept for callers that predate the registry. */
export const DEFAULT_USD_TO_KES_RATE = SETTING_DEFS.usdToKesRate.default;
export const DEFAULT_MIN_DEPOSIT_USD = SETTING_DEFS.minDepositUsd.default;

/**
 * Short in-process cache. Settlement, every deposit page load and every
 * settled trade read these, so a per-request query is wasteful, but the values
 * must not go stale for long.
 *
 * Each pm2 worker caches separately, so after an admin saves a value it can
 * take up to CACHE_TTL_MS for every worker to pick it up. That is safe because
 * the rate is copied onto each M-Pesa transaction when it is created, so a
 * deposit is always credited at the rate it was quoted.
 */
const CACHE_TTL_MS = 10_000;
const cache = new Map<string, { value: string; expires: number }>();

export function invalidateSettingsCache() {
  cache.clear();
}

export async function getSetting(key: string): Promise<string | null> {
  const hit = cache.get(key);
  if (hit && hit.expires > Date.now()) return hit.value;

  try {
    const rows = await db
      .select()
      .from(platformSettings)
      .where(eq(platformSettings.key, key))
      .limit(1);
    const value = rows[0]?.value ?? null;
    if (value !== null) cache.set(key, { value, expires: Date.now() + CACHE_TTL_MS });
    return value;
  } catch (error) {
    console.error(`Failed to read setting "${key}":`, error);
    return null;
  }
}

export async function setSetting(key: string, value: string, updatedBy?: string) {
  await db
    .insert(platformSettings)
    .values({ key, value, updatedBy })
    .onDuplicateKeyUpdate({ set: { value, updatedBy } });
  cache.delete(key);
}

export function parseSetting(
  def: SettingDef,
  input: unknown,
): { ok: true; value: number } | { ok: false; error: string } {
  const value = typeof input === 'number' ? input : parseFloat(String(input ?? '').trim());
  if (!Number.isFinite(value)) return { ok: false, error: `${def.label} must be a number` };
  if (value < def.min || value > def.max) {
    const unit = def.percent ? '%' : '';
    return { ok: false, error: `${def.label} must be between ${def.min}${unit} and ${def.max}${unit}` };
  }
  const factor = 10 ** def.decimals;
  return { ok: true, value: Math.round(value * factor) / factor };
}

async function readSetting(def: SettingDef): Promise<number> {
  const raw = await getSetting(def.key);
  if (raw === null) return def.default;
  const parsed = parseSetting(def, raw);
  if (!parsed.ok) {
    console.error(`Stored ${def.key} is invalid ("${raw}"), using default`);
    return def.default;
  }
  return parsed.value;
}

/**
 * Every setting in one shot. Reads go through the same cache as the
 * single-value helpers, so this costs at most one query per key per TTL.
 */
export async function getSettings(): Promise<SettingsSnapshot> {
  const entries = await Promise.all(
    SETTING_NAMES.map(async name => [name, await readSetting(SETTING_DEFS[name])] as const),
  );
  return Object.fromEntries(entries) as SettingsSnapshot;
}

/** The live USD → KES rate. Falls back to the default if unset or unreadable. */
export const getUsdToKesRate = () => readSetting(SETTING_DEFS.usdToKesRate);

/** The smallest deposit the platform accepts, in USD. */
export const getMinDepositUsd = () => readSetting(SETTING_DEFS.minDepositUsd);

/** Rows behind the settings, for the admin screen's "last changed by" lines. */
export async function getSettingRows() {
  return db
    .select()
    .from(platformSettings)
    .where(inArray(platformSettings.key, SETTING_NAMES.map(n => SETTING_DEFS[n].key)));
}

export type AccountTier = 'normal' | 'vip' | 'vvip';

export const TIER_ORDER: AccountTier[] = ['normal', 'vip', 'vvip'];

/**
 * The tier a deposit history qualifies for, or null when nothing changes.
 *
 * Promotion only — a threshold raised after the fact never demotes someone who
 * already qualified, which is why the caller's current tier is consulted.
 */
export function resolveAccountType(
  maxSingleDeposit: number,
  current: string,
  thresholds: { vipThresholdUsd: number; vvipThresholdUsd: number },
): AccountTier | null {
  if (maxSingleDeposit >= thresholds.vvipThresholdUsd && current !== 'vvip') return 'vvip';
  if (maxSingleDeposit >= thresholds.vipThresholdUsd && current === 'normal') return 'vip';
  return null;
}
