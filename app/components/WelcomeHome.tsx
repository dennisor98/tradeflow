"use client";
import { useEffect, useMemo, useState, useSyncExternalStore } from "react";
import {
  SESSION_CLOCK,
  SESSION_DURATION_TEXT,
  SESSION_LABEL,
  SESSION_SECONDS,
  formatClock,
} from "@/lib/trading-session";
import { useApp } from "../context/AppContext";
import Logo from "./Logo";

const TICKER_SYMBOLS = ["BTCUSDT", "ETHUSDT", "SOLUSDT", "BNBUSDT", "XRPUSDT"];

// The sample session replays a full session in this long, so a visitor sees
// the whole mechanic — clock, price, settlement — without waiting it out.
const REPLAY_MS = 30000;
const SETTLED_HOLD_MS = 2600;

interface Ticker { symbol: string; price: number; changePct: number; }

/** Deterministic PRNG so the first paint matches between server and client. */
function mulberry32(seed: number) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Relative price path for the sample session, as deviation from entry. */
function makeWalk(seed: number, points = 64) {
  const rand = mulberry32(seed);
  const out = [0];
  let v = 0;
  for (let i = 1; i < points; i++) {
    v += (rand() - 0.5) * 0.0024;
    out.push(v);
  }
  return out;
}

function subscribeToMotionPreference(onChange: () => void) {
  const mq = window.matchMedia("(prefers-reduced-motion: reduce)");
  mq.addEventListener("change", onChange);
  return () => mq.removeEventListener("change", onChange);
}

export default function WelcomeHome({
  onCreateAccount,
  onSignIn,
}: {
  onCreateAccount: () => void;
  onSignIn: () => void;
}) {
  // Admin-configured, so the copy below can never drift from what the app enforces.
  const { settings } = useApp();

  const prefersReducedMotion = useSyncExternalStore(
    subscribeToMotionPreference,
    () => window.matchMedia("(prefers-reduced-motion: reduce)").matches,
    () => false
  );

  const [tickers, setTickers] = useState<Ticker[]>([]);
  const [replay, setReplay] = useState({ seed: 20260822, progress: 0, settled: false, long: true });

  // Real prices from Binance's public feed — the same source the trading
  // screen uses. If the request fails the strip simply doesn't render.
  useEffect(() => {
    const controller = new AbortController();
    const query = encodeURIComponent(JSON.stringify(TICKER_SYMBOLS));
    fetch(`https://api.binance.com/api/v3/ticker/24hr?symbols=${query}`, { signal: controller.signal })
      .then(r => (r.ok ? r.json() : Promise.reject(new Error(`Binance responded ${r.status}`))))
      .then((data: { symbol: string; lastPrice: string; priceChangePercent: string }[]) => {
        setTickers(
          data.map(d => ({
            symbol: d.symbol.replace("USDT", "/USDT"),
            price: parseFloat(d.lastPrice),
            changePct: parseFloat(d.priceChangePercent),
          }))
        );
      })
      .catch(err => {
        if (err.name !== "AbortError") console.error("Ticker feed unavailable:", err);
      });
    return () => controller.abort();
  }, []);

  // Drive the sample session. Frozen mid-session when motion is reduced.
  useEffect(() => {
    if (prefersReducedMotion) return;
    let start = Date.now();
    const id = setInterval(() => {
      const t = Date.now() - start;
      if (t <= REPLAY_MS) {
        setReplay(prev => ({ ...prev, progress: t / REPLAY_MS, settled: false }));
      } else if (t <= REPLAY_MS + SETTLED_HOLD_MS) {
        setReplay(prev => ({ ...prev, progress: 1, settled: true }));
      } else {
        start = Date.now();
        setReplay(prev => ({ seed: prev.seed + 1, progress: 0, settled: false, long: !prev.long }));
      }
    }, 50);
    return () => clearInterval(id);
  }, [prefersReducedMotion]);

  const walk = useMemo(() => makeWalk(replay.seed), [replay.seed]);
  const progress = prefersReducedMotion ? 0.62 : replay.progress;
  const settled = prefersReducedMotion ? false : replay.settled;

  const secondsLeft = Math.max(0, Math.round(SESSION_SECONDS * (1 - progress)));
  const shownPoints = Math.max(2, Math.ceil(walk.length * progress));
  const visible = walk.slice(0, shownPoints);
  const deviation = visible[visible.length - 1];
  const btc = tickers.find(t => t.symbol === "BTC/USDT");
  const entryPrice = btc ? btc.price * (1 - deviation) : null;

  // Scale to the whole walk, not the visible slice, so the line draws in
  // rather than rescaling on every tick.
  const lo = Math.min(...walk);
  const hi = Math.max(...walk);
  const span = hi - lo || 1;
  const CW = 300, CH = 72;
  const pointAt = (i: number, v: number) => {
    const x = (i / (walk.length - 1)) * CW;
    const y = CH - ((v - lo) / span) * CH;
    return `${x.toFixed(1)},${y.toFixed(1)}`;
  };
  const line = visible.map((v, i) => pointAt(i, v)).join(" ");
  const lastX = ((visible.length - 1) / (walk.length - 1)) * CW;
  const lastY = CH - ((deviation - lo) / span) * CH;

  const dirBright = replay.long ? "#4ade80" : "#f87171";

  const timeline = [
    {
      mark: "0:00",
      title: "You place the trade",
      body: "Pick a pair, pick a direction, set your stake. The stake leaves your balance and the entry price locks in.",
    },
    {
      mark: "running",
      title: "The session runs",
      body: `Live price moves against your entry for the full ${SESSION_CLOCK}. Nothing to manage — no stop to set, no position to close.`,
    },
    {
      mark: SESSION_CLOCK,
      title: "It settles",
      body: "A win returns your stake plus the profit rate for that stake. A loss keeps the stake. Either way it's over.",
    },
  ];

  // Whole dollars read better in copy; cents only appear when they exist.
  const usd = (n: number) => `$${Number.isInteger(n) ? n.toLocaleString("en-US") : n.toFixed(2)}`;

  // Rendered only once settings arrive, so the page never advertises a tier
  // ladder that disagrees with the one the app actually applies.
  const tiers = settings && [
    {
      badge: "Normal", mark: "\u{1F464}",
      amount: usd(settings.minDepositUsd),
      benefit: "Where every account starts. Full access to every pair and every session.",
    },
    {
      badge: "VIP", mark: "\u{1F451}",
      amount: usd(settings.vipThresholdUsd),
      benefit: "Winning sessions pay you more than they do on a Normal account.",
    },
    {
      badge: "VVIP", mark: "\u{1F48E}",
      amount: usd(settings.vvipThresholdUsd),
      benefit: "The most we pay out on a winning session, and priority support with it.",
    },
  ];

  // Drawn inline rather than shipped as files: they inherit the theme tokens,
  // cost no extra request, and stay crisp at any size.
  const assurances = [
    {
      title: "Deposits reflect instantly",
      body: "Pay over M-Pesa and your balance moves the moment the payment confirms. No waiting on a manual review before you can open a session.",
      art: (
        <svg viewBox="0 0 64 64" width="58" height="58" fill="none" aria-hidden="true">
          <rect x="7" y="40" width="50" height="17" rx="5" fill="var(--accent-light)" stroke="var(--accent)" strokeWidth="2" />
          <path d="M15 48.5h13" stroke="var(--accent)" strokeWidth="2.5" strokeLinecap="round" />
          <circle cx="47" cy="48.5" r="3" fill="var(--accent)" />
          <path d="M27 7v19" stroke="var(--accent)" strokeWidth="2.5" strokeLinecap="round" />
          <path d="M20 20l7 7 7-7" stroke="var(--accent)" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" />
          <path d="M46 8l-7 11h5l-2 8 8-11h-5l1-8z" fill="var(--accent)" />
        </svg>
      ),
    },
    {
      title: "Withdrawals settle instantly",
      body: "Cash out to M-Pesa and the money leaves with you straight away. Your balance and your history update in the same moment.",
      art: (
        <svg viewBox="0 0 64 64" width="58" height="58" fill="none" aria-hidden="true">
          <rect x="7" y="40" width="50" height="17" rx="5" fill="var(--accent-light)" stroke="var(--accent)" strokeWidth="2" />
          <path d="M15 48.5h13" stroke="var(--accent)" strokeWidth="2.5" strokeLinecap="round" />
          <circle cx="47" cy="48.5" r="3" fill="var(--accent)" />
          <path d="M27 26V9" stroke="var(--accent)" strokeWidth="2.5" strokeLinecap="round" />
          <path d="M20 16l7-7 7 7" stroke="var(--accent)" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" />
          <circle cx="47" cy="17" r="9" fill="var(--accent)" />
          <path d="M43 17.2l3 3 5.5-5.6" stroke="var(--on-accent)" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      ),
    },
    {
      title: "Support, 24 hours a day",
      body: "Someone is on the other end whatever the hour — every day of the week, weekends and holidays included.",
      art: (
        <svg viewBox="0 0 64 64" width="58" height="58" fill="none" aria-hidden="true">
          <circle cx="25" cy="32" r="17" fill="var(--accent-light)" stroke="var(--accent)" strokeWidth="2.5" />
          <text
            x="25" y="37" textAnchor="middle" fill="var(--accent)"
            fontSize="13" fontWeight="600" fontFamily="'DM Mono', monospace"
          >
            24/7
          </text>
          <path
            d="M42 12h13a4 4 0 014 4v9a4 4 0 01-4 4h-6l-6 5v-5a4 4 0 01-1-8"
            fill="var(--surface)" stroke="var(--accent)" strokeWidth="2.2" strokeLinejoin="round"
          />
          <path d="M46 20.5h7" stroke="var(--accent)" strokeWidth="2.2" strokeLinecap="round" />
        </svg>
      ),
    },
  ];

  const facts = [
    { k: "Built for focused trading", v: "Short sessions with clear outcomes. Nothing stays open overnight." },
    { k: "Live prices, every USDT pair", v: "Rates stream from Binance's public market feed." },
    { k: "Profit scales with your stake", v: "2% at $10, rising to 10% at $5,000 and above." },
    { k: "Fund in KES or USDT", v: "M-Pesa STK push, or USDT on-chain with a transaction hash." },
    { k: "Deposits confirmed before they credit", v: "Crypto deposits are verified on-chain by transaction hash." },
    {
      k: settings ? `${usd(settings.minDepositUsd)} minimum deposit` : "A small minimum deposit",
      v: "The smallest amount that opens a session.",
    },
    ...(settings ? [{
      k: "Upgrade to earn more",
      v: `A single deposit of ${usd(settings.vipThresholdUsd)} makes you VIP, ${usd(settings.vvipThresholdUsd)} makes you VVIP. Both earn more on a winning session.`,
    }] : []),
  ];

  const factCard: React.CSSProperties = {
    background: "var(--surface)",
    border: "1px solid var(--border)",
    borderRadius: "var(--radius)",
    padding: "15px 18px",
    boxShadow: "var(--shadow)",
  };

  return (
    <div style={{ minHeight: "100vh", background: "var(--bg)", display: "flex", flexDirection: "column" }}>
      {/*
        Anything that changes at a breakpoint lives here, not in a style prop —
        inline styles always beat classes, so a media query on an inline-styled
        property would silently lose.
      */}
      <style>{`
        @keyframes tf-marquee { from { transform: translateX(0); } to { transform: translateX(-50%); } }
        @keyframes tf-drift { from { background-position: 0 0; } to { background-position: -340px -340px; } }
        @keyframes tf-rise { from { opacity: 0; transform: translateY(14px); } to { opacity: 1; transform: none; } }
        @keyframes tf-pulse { 0%, 100% { opacity: 1; } 50% { opacity: 0.35; } }
        .tf-marquee { animation: tf-marquee 42s linear infinite; }
        .tf-drift { animation: tf-drift 90s linear infinite; }
        .tf-rise { animation: tf-rise 0.7s cubic-bezier(0.22, 1, 0.36, 1) both; }
        .tf-live-dot { animation: tf-pulse 2.4s ease-in-out infinite; }

        .tf-shell { max-width: 520px; margin: 0 auto; }
        .tf-hero { display: flex; flex-direction: column; gap: 26px; }
        .tf-actions { text-align: center; }
        .tf-cta { width: 100%; }
        .tf-timeline { max-width: 640px; }
        .tf-facts { display: grid; grid-template-columns: 1fr; gap: 10px; }
        .tf-tiers, .tf-assure { display: grid; grid-template-columns: 1fr; gap: 10px; }
        .tf-closing { max-width: 640px; margin-left: auto; margin-right: auto; }

        .tf-btn { transition: transform 0.15s ease, box-shadow 0.15s ease, background 0.15s ease; }
        .tf-btn:hover { transform: translateY(-1px); }
        .tf-btn:active { transform: translateY(0); }
        .tf-btn:focus-visible { outline: 2px solid var(--accent-bright); outline-offset: 3px; }
        .tf-link:focus-visible { outline: 2px solid var(--accent); outline-offset: 2px; border-radius: 3px; }

        @media (min-width: 900px) {
          .tf-shell { max-width: 1080px; }
          .tf-hero {
            display: grid;
            grid-template-columns: 1.05fr 1fr;
            grid-template-rows: auto auto;
            column-gap: 56px;
            row-gap: 0;
            align-items: center;
          }
          .tf-hero-copy { grid-column: 1; grid-row: 1; }
          .tf-actions { grid-column: 1; grid-row: 2; margin-top: 34px; text-align: left; }
          .tf-hero-card { grid-column: 2; grid-row: 1 / span 2; }
          .tf-cta { width: auto; min-width: 268px; }
          .tf-facts { grid-template-columns: repeat(3, 1fr); gap: 14px; }
          .tf-tiers, .tf-assure { grid-template-columns: repeat(3, 1fr); gap: 14px; }
        }

        @media (prefers-reduced-motion: reduce) {
          .tf-marquee, .tf-drift, .tf-rise, .tf-live-dot { animation: none !important; }
          .tf-btn { transition: none; }
        }
      `}</style>

      {/* ── Ink panel ─────────────────────────────────────────────── */}
      <div style={{ position: "relative", overflow: "hidden", background: `linear-gradient(165deg, var(--ink-2) 0%, var(--ink) 55%, #081410 100%)` }}>
        <div
          className="tf-drift"
          aria-hidden="true"
          style={{ position: "absolute", inset: 0, backgroundImage: "url('/market-symbols-dark.svg')", backgroundRepeat: "repeat", backgroundSize: "340px 340px", opacity: 0.3, pointerEvents: "none" }}
        />
        {/* Scrim: keeps the symbols readable as texture without letting them
            compete with the headline sitting on top of them. */}
        <div aria-hidden="true" style={{ position: "absolute", inset: 0, background: "linear-gradient(180deg, rgba(11,23,18,0.42) 0%, rgba(11,23,18,0.72) 38%, rgba(11,23,18,0.62) 100%)", pointerEvents: "none" }} />
        <div aria-hidden="true" style={{ position: "absolute", inset: 0, background: "radial-gradient(120% 75% at 50% 0%, rgba(55,178,109,0.13) 0%, rgba(11,23,18,0) 62%)", pointerEvents: "none" }} />

        {/* Live ticker */}
        {tickers.length > 0 && (
          <div style={{ position: "relative", borderBottom: "1px solid var(--ink-line)", overflow: "hidden", background: "rgba(0,0,0,0.28)" }}>
            <div style={{ display: "flex", width: "max-content" }} className="tf-marquee">
              {[0, 1].map(copy => (
                <div key={copy} aria-hidden={copy === 1} style={{ display: "flex" }}>
                  {tickers.map(t => (
                    <div key={`${copy}-${t.symbol}`} style={{ display: "flex", alignItems: "baseline", gap: 8, padding: "9px 18px", whiteSpace: "nowrap", borderRight: "1px solid var(--ink-line)" }}>
                      <span style={{ fontSize: 11, letterSpacing: "0.06em", color: "var(--on-ink-muted)", fontWeight: 500 }}>{t.symbol}</span>
                      <span style={{ fontSize: 12, fontFamily: "'DM Mono', monospace", color: "var(--on-ink)" }}>
                        {t.price.toLocaleString("en", { maximumFractionDigits: t.price < 10 ? 4 : 2 })}
                      </span>
                      <span style={{ fontSize: 11, fontFamily: "'DM Mono', monospace", color: t.changePct >= 0 ? "#4ade80" : "#f87171" }}>
                        {t.changePct >= 0 ? "+" : ""}{t.changePct.toFixed(2)}%
                      </span>
                    </div>
                  ))}
                </div>
              ))}
            </div>
          </div>
        )}

        <div className="tf-shell" style={{ position: "relative", padding: "clamp(36px, 8vw, 68px) 24px clamp(40px, 9vw, 76px)" }}>
          <div className="tf-hero">
            <div className="tf-hero-copy">
              <div className="tf-rise" style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 28 }}>
                <Logo glow />
                <span style={{ fontFamily: "'DM Mono', monospace", fontSize: 13, letterSpacing: "0.22em", color: "var(--on-ink)", fontWeight: 500 }}>WINTRADEIN</span>
              </div>

              <h1 className="tf-rise" style={{ animationDelay: "0.06s", fontSize: "clamp(34px, 7vw, 56px)", lineHeight: 1.03, letterSpacing: "-0.035em", fontWeight: 700, color: "var(--on-ink)", marginBottom: 18 }}>
                Every trade resolves<br />
                in{" "}
                <span style={{ color: "var(--accent-bright)", fontFamily: "'DM Mono', monospace", letterSpacing: "-0.02em" }}>
                  {SESSION_DURATION_TEXT}
                </span>
                .
              </h1>

              <p className="tf-rise" style={{ animationDelay: "0.12s", fontSize: 16, lineHeight: 1.6, color: "var(--on-ink-muted)", maxWidth: 440 }}>
                Trade the crypto market on your own terms. Pick a direction on any
                USDT pair and stake what you choose — the clock runs {SESSION_CLOCK},
                then the session settles against your entry price. No leverage, no
                overnight positions, nothing left open after the bell.
              </p>
            </div>

            {/* ── Sample session: the clock is the product ─────────── */}
            <div className="tf-hero-card tf-rise" style={{ animationDelay: "0.18s", background: "rgba(255,255,255,0.045)", border: "1px solid var(--ink-line)", borderRadius: "var(--radius-lg)", padding: "18px", backdropFilter: "blur(6px)" }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 10, marginBottom: 16 }}>
                <span style={{ fontSize: 10, letterSpacing: "0.14em", color: "var(--on-ink-muted)", fontFamily: "'DM Mono', monospace", whiteSpace: "nowrap" }}>
                  SAMPLE SESSION
                </span>
                <span style={{ fontSize: 11, fontWeight: 600, color: dirBright, fontFamily: "'DM Mono', monospace", letterSpacing: "0.06em", whiteSpace: "nowrap" }}>
                  {replay.long ? "▲ BUY" : "▼ SELL"} BTC/USDT
                </span>
              </div>

              <div style={{ display: "flex", alignItems: "flex-end", justifyContent: "space-between", gap: 16, marginBottom: 14 }}>
                <div>
                  <div style={{ fontSize: 10, letterSpacing: "0.12em", color: "var(--on-ink-muted)", marginBottom: 4, fontFamily: "'DM Mono', monospace" }}>
                    {settled ? "SETTLED" : "TIME LEFT"}
                  </div>
                  <div style={{ fontFamily: "'DM Mono', monospace", fontSize: 44, lineHeight: 1, fontWeight: 500, letterSpacing: "-0.02em", color: settled ? "var(--on-ink-muted)" : "var(--on-ink)", fontVariantNumeric: "tabular-nums" }}>
                    {formatClock(secondsLeft)}
                  </div>
                </div>
                <div style={{ textAlign: "right" }}>
                  <div style={{ fontSize: 10, letterSpacing: "0.12em", color: "var(--on-ink-muted)", marginBottom: 4, fontFamily: "'DM Mono', monospace" }}>FROM ENTRY</div>
                  <div style={{ fontFamily: "'DM Mono', monospace", fontSize: 20, fontWeight: 500, color: deviation >= 0 ? "#4ade80" : "#f87171" }}>
                    {deviation >= 0 ? "+" : ""}{(deviation * 100).toFixed(2)}%
                  </div>
                </div>
              </div>

              <svg viewBox={`0 0 ${CW} ${CH}`} width="100%" height="72" preserveAspectRatio="none" style={{ display: "block", marginBottom: 12 }} aria-hidden="true">
                <defs>
                  <linearGradient id="tfFill" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor={dirBright} stopOpacity="0.28" />
                    <stop offset="100%" stopColor={dirBright} stopOpacity="0" />
                  </linearGradient>
                </defs>
                <line x1="0" y1={CH - ((0 - lo) / span) * CH} x2={CW} y2={CH - ((0 - lo) / span) * CH} stroke="var(--on-ink-muted)" strokeWidth="1" strokeDasharray="3 4" opacity="0.45" />
                <polygon points={`0,${CH} ${line} ${lastX.toFixed(1)},${CH}`} fill="url(#tfFill)" />
                <polyline points={line} fill="none" stroke={dirBright} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" vectorEffect="non-scaling-stroke" />
                {!settled && <circle cx={lastX} cy={lastY} r="3" fill={dirBright} />}
              </svg>

              <div style={{ height: 3, background: "rgba(255,255,255,0.1)", borderRadius: 2, overflow: "hidden", marginBottom: 12 }}>
                <div style={{ height: "100%", width: `${progress * 100}%`, background: dirBright, borderRadius: 2 }} />
              </div>

              <div style={{ display: "flex", justifyContent: "space-between", gap: 10, fontSize: 11, color: "var(--on-ink-muted)", fontFamily: "'DM Mono', monospace" }}>
                <span>entry {entryPrice ? entryPrice.toLocaleString("en", { maximumFractionDigits: 2 }) : "—"}</span>
                <span style={{ whiteSpace: "nowrap" }}>
                  <span className="tf-live-dot" style={{ color: "var(--accent-bright)" }}>●</span> replay 20× · illustrative
                </span>
              </div>
            </div>

            <div className="tf-actions">
              <button onClick={onCreateAccount} className="tf-btn tf-cta" style={{ padding: "17px 28px", background: "var(--accent-bright)", color: "#06120c", border: "none", borderRadius: "var(--radius)", fontSize: 16, fontWeight: 700, cursor: "pointer", fontFamily: "inherit", boxShadow: "0 8px 26px rgba(55,178,109,0.28)" }}>
                Create account
              </button>
              <p style={{ marginTop: 14, fontSize: 13, color: "var(--on-ink-muted)" }}>
                Already trading here?{" "}
                <button onClick={onSignIn} className="tf-link" style={{ background: "none", border: "none", padding: 0, color: "var(--accent-bright)", cursor: "pointer", fontWeight: 600, fontSize: 13, fontFamily: "inherit" }}>
                  Sign in
                </button>
              </p>
            </div>
          </div>
        </div>
      </div>

      {/* ── Light section ─────────────────────────────────────────── */}
      <div style={{ position: "relative", overflow: "hidden", flex: 1 }}>
        <div aria-hidden="true" style={{ position: "absolute", inset: 0, backgroundImage: "url('/market-symbols-dark.svg')", backgroundRepeat: "repeat", backgroundSize: "340px 340px", opacity: 0.22, pointerEvents: "none" }} />
        <div aria-hidden="true" style={{ position: "absolute", inset: 0, background: "linear-gradient(180deg, rgba(7,19,16,0.55) 0%, rgba(7,19,16,0.86) 22%, rgba(7,19,16,0.9) 100%)", pointerEvents: "none" }} />

        <div className="tf-shell" style={{ position: "relative", padding: "clamp(36px, 8vw, 64px) 24px 44px" }}>
          <h2 style={{ fontFamily: "'DM Mono', monospace", fontSize: 11, letterSpacing: "0.18em", color: "var(--text-muted)", marginBottom: 22 }}>
            HOW A SESSION WORKS
          </h2>

          {/* Markers are clock readings, because the clock is the mechanic */}
          <ol className="tf-timeline" style={{ listStyle: "none", marginBottom: 40 }}>
            {timeline.map((s, i) => (
              <li key={s.mark} style={{ display: "flex", gap: 16 }}>
                <div style={{ display: "flex", flexDirection: "column", alignItems: "center", flexShrink: 0, width: 62 }}>
                  <span style={{ fontFamily: "'DM Mono', monospace", fontSize: s.mark === "running" ? 10 : 13, fontWeight: 500, color: i === 2 ? "var(--accent)" : "var(--text-secondary)", letterSpacing: s.mark === "running" ? "0.1em" : "0", paddingTop: 2 }}>
                    {s.mark === "running" ? "↓" : s.mark}
                  </span>
                  {i < timeline.length - 1 && <span style={{ flex: 1, width: 1, background: "var(--border-strong)", marginTop: 8, minHeight: 26 }} />}
                </div>
                <div style={{ paddingBottom: i < timeline.length - 1 ? 24 : 0 }}>
                  <div style={{ fontSize: 15, fontWeight: 600, color: "var(--text-primary)", marginBottom: 4 }}>{s.title}</div>
                  <div style={{ fontSize: 14, lineHeight: 1.55, color: "var(--text-secondary)" }}>{s.body}</div>
                </div>
              </li>
            ))}
          </ol>

          {/* Trust signals — illustration carries the idea, copy carries the detail */}
          <h2 style={{ fontFamily: "'DM Mono', monospace", fontSize: 11, letterSpacing: "0.18em", color: "var(--text-muted)", marginBottom: 18 }}>
            WHAT YOU CAN COUNT ON
          </h2>
          <div className="tf-assure" style={{ marginBottom: 40 }}>
            {assurances.map(a => (
              <div key={a.title} style={{ ...factCard, padding: "20px 20px 22px" }}>
                <div style={{ marginBottom: 10 }}>{a.art}</div>
                <div style={{ fontSize: 15, fontWeight: 600, color: "var(--text-primary)", marginBottom: 5 }}>{a.title}</div>
                <div style={{ fontSize: 13, lineHeight: 1.55, color: "var(--text-secondary)" }}>{a.body}</div>
              </div>
            ))}
          </div>

          {/* Tier ladder — thresholds and win rates come from admin settings */}
          {tiers && (
            <>
              <h2 style={{ fontFamily: "'DM Mono', monospace", fontSize: 11, letterSpacing: "0.18em", color: "var(--text-muted)", marginBottom: 18 }}>
                ACCOUNT TIERS
              </h2>
              <div className="tf-tiers" style={{ marginBottom: 26 }}>
                {tiers.map(t => (
                  <div key={t.badge} style={factCard}>
                    <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 8 }}>
                      <span style={{ fontSize: 18 }}>{t.mark}</span>
                      <span style={{ fontSize: 14, fontWeight: 600, color: "var(--text-primary)" }}>{t.badge}</span>
                    </div>
                    <div style={{ fontSize: 12, color: "var(--text-muted)", marginBottom: 2 }}>from a single deposit of</div>
                    <div style={{ fontFamily: "'DM Mono', monospace", fontSize: 26, fontWeight: 500, color: "var(--accent)", lineHeight: 1.1, marginBottom: 8 }}>
                      {t.amount}
                    </div>
                    <div style={{ fontSize: 13, lineHeight: 1.5, color: "var(--text-secondary)" }}>{t.benefit}</div>
                  </div>
                ))}
              </div>
              <p style={{ fontSize: 13, lineHeight: 1.55, color: "var(--text-secondary)", marginBottom: 30 }}>
                Your tier is set by your largest single deposit, and it never drops once reached.
                Upgrading lifts what a winning session returns on every trade that follows.
              </p>
            </>
          )}

          <div className="tf-facts" style={{ marginBottom: 26 }}>
            {facts.map(f => (
              <div key={f.k} style={factCard}>
                <div style={{ fontSize: 14, fontWeight: 600, color: "var(--text-primary)", marginBottom: 3 }}>{f.k}</div>
                <div style={{ fontSize: 13, lineHeight: 1.5, color: "var(--text-secondary)" }}>{f.v}</div>
              </div>
            ))}
          </div>

          <div className="tf-closing">
            <div style={{ display: "flex", alignItems: "center", gap: 10, background: "var(--surface)", border: "1px solid var(--border)", borderRadius: "var(--radius)", padding: "14px 16px", marginBottom: 28 }}>
              <span style={{ fontFamily: "'DM Mono', monospace", fontSize: 13, fontWeight: 500, color: "var(--accent)", background: "var(--accent-light)", padding: "4px 9px", borderRadius: 6, flexShrink: 0 }}>
                {SESSION_LABEL}
              </span>
              <span style={{ fontSize: 13, lineHeight: 1.5, color: "var(--text-secondary)" }}>
                Every session on Wintradein runs the same {SESSION_CLOCK}. You always know when you&apos;re out.
              </span>
            </div>

            <div style={{ textAlign: "center" }}>
              <button onClick={onCreateAccount} className="tf-btn tf-cta" style={{ padding: "16px 28px", background: "var(--accent)", color: "var(--on-accent)", border: "none", borderRadius: "var(--radius)", fontSize: 15, fontWeight: 600, cursor: "pointer", fontFamily: "inherit", boxShadow: "0 4px 14px rgba(26,107,60,0.3)" }}>
                Create account
              </button>
            </div>

            <p style={{ fontSize: 12, lineHeight: 1.6, color: "var(--text-muted)", marginTop: 24, textAlign: "center" }}>
              Trading involves risk. You can lose the full amount you stake on a session.
              Only trade money you can afford to lose. You must be 18 or older.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
