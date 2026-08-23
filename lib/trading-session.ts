// Single source of truth for how long a trading session runs.
//
// Configured with NEXT_PUBLIC_TRADING_SESSION_MINUTES. The NEXT_PUBLIC_ prefix
// is required because the trading screen and the home page are both client
// components — the value is inlined at build time, so changing it needs a
// rebuild, not just a restart.
//
// Falls back to 10 minutes when unset, non-numeric, or not positive.

export const DEFAULT_SESSION_MINUTES = 10;

const configuredMinutes = parseFloat(process.env.NEXT_PUBLIC_TRADING_SESSION_MINUTES ?? "");

export const SESSION_MINUTES = configuredMinutes > 0 ? configuredMinutes : DEFAULT_SESSION_MINUTES;
export const SESSION_SECONDS = Math.round(SESSION_MINUTES * 60);

/** Compact badge form, e.g. "10m" or "45s". */
export const SESSION_LABEL = SESSION_SECONDS < 60 ? `${SESSION_SECONDS}s` : `${SESSION_MINUTES}m`;

/** Prose form for body copy, e.g. "10 minutes" or "45 seconds". */
export const SESSION_DURATION_TEXT =
  SESSION_SECONDS < 60
    ? `${SESSION_SECONDS} second${SESSION_SECONDS === 1 ? "" : "s"}`
    : `${SESSION_MINUTES} minute${SESSION_MINUTES === 1 ? "" : "s"}`;

/** mm:ss, the way the countdown reads on screen. */
export function formatClock(seconds: number) {
  const safe = Math.max(0, Math.round(seconds));
  const m = Math.floor(safe / 60);
  const s = safe % 60;
  return `${m}:${String(s).padStart(2, "0")}`;
}

/** Full session length as a clock reading, e.g. "10:00". */
export const SESSION_CLOCK = formatClock(SESSION_SECONDS);
