/**
 * The Wintradein mark: two candlesticks, the left one bearish and hollow, the
 * right one bullish and filled and sitting higher — the shape of a session that
 * closed up. Candlesticks read as "trading" the way nothing generic can, and
 * the hollow/filled pairing is the convention real charts use.
 *
 * Wicks are drawn as separate segments above and below each body rather than
 * one line behind it, so the hollow candle needs no fill to mask the wick and
 * the mark sits correctly on any background.
 */
export default function Logo({
  size = 34,
  glow = false,
}: {
  /** Edge of the rounded tile; the mark scales with it. */
  size?: number;
  glow?: boolean;
}) {
  return (
    <div
      style={{
        width: size,
        height: size,
        borderRadius: size * 0.29,
        background: "var(--accent)",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        flexShrink: 0,
        boxShadow: glow ? "0 4px 16px rgba(26,107,60,0.5)" : undefined,
      }}
    >
      <svg
        width={size * 0.56}
        height={size * 0.56}
        viewBox="0 0 36 36"
        fill="none"
        aria-hidden="true"
      >
        <g stroke="var(--on-accent)" strokeWidth="2.4" strokeLinecap="round">
          {/* bearish candle — hollow body, longer wicks */}
          <path d="M10.5 9v5" />
          <rect x="6" y="14" width="9" height="12" rx="1.6" />
          <path d="M10.5 26v5" />
          {/* bullish candle — filled body, closing higher */}
          <path d="M25.5 4v2.8" />
          <path d="M25.5 21.2V26" />
        </g>
        <rect x="19.8" y="6.8" width="11.4" height="14.4" rx="2.8" fill="var(--on-accent)" />
      </svg>
    </div>
  );
}
