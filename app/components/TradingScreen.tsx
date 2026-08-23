"use client";
import { useState, useEffect, useRef, useCallback } from "react";
import { useApp, winRateFor } from "../context/AppContext";
import { SESSION_LABEL, SESSION_SECONDS, formatClock } from "@/lib/trading-session";

// const ASSETS = [
//   { symbol: "EUR/USD", base: 1.0847, decimals: 4, volatility: 0.0001 },
//   { symbol: "GBP/USD", base: 1.2634, decimals: 4, volatility: 0.00012 },
//   { symbol: "BTC/USD", base: 67842, decimals: 0, volatility: 0.002 },
//   { symbol: "XAU/USD", base: 2341.5, decimals: 1, volatility: 0.0005 },
//   { symbol: "OIL/USD", base: 78.42, decimals: 2, volatility: 0.001 },
// ];

// const DURATIONS = [
//   { label: "30s", value: 30 },
//   { label: "1m", value: 60 },
//   { label: "5m", value: 300 },
//   { label: "15m", value: 900 },
// ];

// Session length comes from lib/trading-session so the home page and the
// trading screen can never disagree about how long a session runs.
const SESSION = { label: SESSION_LABEL, value: SESSION_SECONDS };

const AMOUNTS = [10, 25, 50, 100, 250];

// Only reached if a trade settles before /api/settings responds. Mirrors the
// defaults in lib/settings so the two cannot quietly disagree.
const DEFAULT_WIN_RATES: Record<string, number> = { normal: 30, vip: 50, vvip: 70 };

// Calculate payout rate based on amount staked (profit percentage only, not including stake)
function getPayoutRate(amount: number): number {
  // Base profit percentage increases with amount
  // $10 = 2%, $25 = 3%, $50 = 4%, increasing gradually
  if (amount < 10) return 0.01; // 1% for amounts below $10
  if (amount < 25) return 0.02; // 2% for $10-$24
  if (amount < 50) return 0.03; // 3% for $25-$49
  if (amount < 100) return 0.04; // 4% for $50-$99
  if (amount < 250) return 0.05; // 5% for $100-$249
  if (amount < 500) return 0.06; // 6% for $250-$499
  if (amount < 1000) return 0.07; // 7% for $500-$999
  if (amount < 2000) return 0.08; // 8% for $1000-$1999
  if (amount < 5000) return 0.09; // 9% for $2000-$4999
  return 0.10; // 10% for $5000+
}

function generateCandles(base: number, count = 60) {
  const candles = [];
  let price = base;
  for (let i = 0; i < count; i++) {
    const open = price;
    const move = (Math.random() - 0.48) * base * 0.003;
    const close = open + move;
    const high = Math.max(open, close) + Math.random() * base * 0.001;
    const low = Math.min(open, close) - Math.random() * base * 0.001;
    candles.push({ open, high, low, close, time: i });
    price = close;
  }
  return candles;
}

interface Candle { open: number; high: number; low: number; close: number; time: number; }

export default function TradingScreen() {
  const { balance, navigate, addBalance, deductBalance, addTrade, addTransaction, accountType, refreshData, settings } = useApp();

  // The settle callback lives inside an interval closure created when the trade
  // was placed, so it reads the ref rather than a captured render's value.
  const settingsRef = useRef(settings);
  useEffect(() => { settingsRef.current = settings; }, [settings]);
  const [assets, setAssets] = useState<any[]>([]);
  const [asset, setAsset] = useState<any | null>(null);
  const [loading, setLoading] = useState(true);
  const duration = SESSION;
  const [amount, setAmount] = useState(25);
  const [customAmount, setCustomAmount] = useState("");
  const [candles, setCandles] = useState<Candle[]>([]);
  const [currentPrice, setCurrentPrice] = useState<number>(0);
  const [activeTrade, setActiveTrade] = useState<{ direction: "over"|"under"; entryPrice: number; timeLeft: number; amount: number; id: string } | null>(null);
  const [result, setResult] = useState<{ won: boolean; profit: number } | null>(null);
  const [showAssets, setShowAssets] = useState(false);
  const [chartType, setChartType] = useState<"candle" | "line">("line");
  const [showChartTypeDropdown, setShowChartTypeDropdown] = useState(false);
  const [assetSearch, setAssetSearch] = useState("");
  const [isPlacingTrade, setIsPlacingTrade] = useState(false);
  const isPlacingTradeRef = useRef(false);
  const activeTradeRef = useRef(false);

  useEffect(() => {
    fetch('https://api.binance.com/api/v3/ticker/price')
      .then(r => r.json())
      .then(data => {
        const usdtPairs = data
          .filter((s: any) => s.symbol.endsWith('USDT'))
          .map((s: any) => ({
            symbol: s.symbol.replace('USDT', '/USDT'),
            base: parseFloat(s.price),
            decimals: 2,
            volatility: 0.001,
          }));
        setAssets(usdtPairs);
        if (usdtPairs.length > 0) {
          setAsset(usdtPairs[0]);
          setCandles(generateCandles(usdtPairs[0].base));
          setCurrentPrice(usdtPairs[0].base);
        }
        setLoading(false);
      })
      .catch(err => {
        console.error("Failed to fetch assets:", err);
        setLoading(false);
      });
  }, []);

  // // Deriv-style: each of the 10 circles has its own independent percentage value
  // const [volatilityData, setVolatilityData] = useState<number[]>(
  //   () => Array.from({ length: 10 }, () => parseFloat((8 + Math.random() * 6).toFixed(1)))
  // );
  const [activeVolIndex, setActiveVolIndex] = useState(1);

  const timerRef = useRef<NodeJS.Timeout | null>(null);
  const entryPriceRef = useRef<number>(0);
  const tradeIdRef = useRef<string>("");
  const tradeCompletedRef = useRef(false);
  const tradeAmount = customAmount ? parseFloat(customAmount) || 0 : amount;
  const payout = getPayoutRate(tradeAmount);

  const tickPrice = useCallback(() => {
    if (!asset) return;
    setCandles(prev => {
      const last = prev[prev.length - 1];
      const move = (Math.random() - 0.5) * asset.base * asset.volatility;
      const newClose = Math.max(last.close + move, asset.base * 0.95);
      const newCandle: Candle = {
        open: last.close,
        high: Math.max(last.close, newClose) + Math.random() * asset.base * asset.volatility * 0.5,
        low: Math.min(last.close, newClose) - Math.random() * asset.base * asset.volatility * 0.5,
        close: newClose,
        time: last.time + 1,
      };
      setCurrentPrice(newClose);
      return [...prev.slice(-59), newCandle];
    });

    // Update all 10 volatility circles independently, each nudging slightly each tick
    // setVolatilityData(prev =>
    //   prev.map(v => parseFloat(Math.min(20, Math.max(4, v + (Math.random() - 0.5) * 1.2)).toFixed(1)))
    // );
    // Randomly move the "active" highlighted circle
    // setActiveVolIndex(Math.floor(Math.random() * 10));
  }, [asset?.base, asset?.volatility]);

  useEffect(() => {
    const id = setInterval(tickPrice, 1000);
    return () => clearInterval(id);
  }, [tickPrice]);

  useEffect(() => {
    if (asset) {
      setCandles(generateCandles(asset.base));
      setCurrentPrice(asset.base);
    }
  }, [asset]);

  const placeTrade = (direction: "over" | "under") => {
    if (tradeAmount < 1 || tradeAmount > balance) return;
    if (isPlacingTrade || activeTradeRef.current) return;
    setIsPlacingTrade(true);
    activeTradeRef.current = true;
    setResult(null);
    tradeCompletedRef.current = false;
    const id = crypto.randomUUID();
    entryPriceRef.current = currentPrice;
    tradeIdRef.current = id;
    deductBalance(tradeAmount);
    setActiveTrade({ direction, entryPrice: currentPrice, timeLeft: duration.value, amount: tradeAmount, id });

    let timeLeft = duration.value;
    timerRef.current = setInterval(() => {
      timeLeft--;
      setActiveTrade(prev => prev ? { ...prev, timeLeft } : null);
      if (timeLeft <= 0 && !tradeCompletedRef.current) {
        tradeCompletedRef.current = true;
        clearInterval(timerRef.current!);
        setCurrentPrice(price => {
          // Win rate per tier is admin-configured; settingsRef holds the latest
          // snapshot so a session that started before a change still settles.
          const winRatePercent = settingsRef.current
            ? winRateFor(accountType, settingsRef.current)
            : DEFAULT_WIN_RATES[accountType];

          // Determine if the trade wins based on the win rate
          const randomFactor = Math.random();
          const won = randomFactor < winRatePercent / 100;
          
          const profit = won ? tradeAmount * payout : 0;
          const balanceBeforeTrade = balance;
          if (won) {
            addBalance(tradeAmount + profit);
          }
          const balanceAfterTrade = won ? balanceBeforeTrade + profit : balanceBeforeTrade - tradeAmount;
          addTrade({ id: tradeIdRef.current, asset: asset.symbol, direction, amount: tradeAmount, entryPrice: entryPriceRef.current, targetPrice: price, duration: duration.value, startTime: Date.now(), result: won ? "win" : "loss", payout: profit, initialBalance: balanceBeforeTrade, finalBalance: balanceAfterTrade });
          addTransaction({ id: tradeIdRef.current, type: won ? "trade_win" : "trade_loss", amount: won ? tradeAmount + profit : tradeAmount, time: Date.now(), status: "completed", label: `${won ? "Win" : "Loss"}: ${direction.toUpperCase()} ${asset.symbol}` });
          setResult({ won, profit: won ? profit : tradeAmount });
          setActiveTrade(null);
          activeTradeRef.current = false;
          setIsPlacingTrade(false);
          console.log(`Trade result: won=${won}, stake=${tradeAmount}, payout_rate=${payout}, profit=${profit}, total_return=${tradeAmount + profit}, balance_before=${balanceBeforeTrade}, balance_after=${balanceAfterTrade}`);
          refreshData();
          return price;
        });
      }
    }, 1000);
  };

  useEffect(() => () => { if (timerRef.current) clearInterval(timerRef.current); }, []);

  // Chart dimensions
  const W = 400, H = 180, PAD = { t: 8, r: 70, b: 24, l: 52 };
  const chartW = W - PAD.l - PAD.r;
  const chartH = H - PAD.t - PAD.b;
  const visibleCandles = candles.slice(-40);
  const prices = visibleCandles.flatMap(c => [c.high, c.low]);
  const minP = Math.min(...prices), maxP = Math.max(...prices);
  const range = maxP - minP || 1;
  const toY = (p: number) => PAD.t + ((maxP - p) / range) * chartH;
  const cw = chartW / visibleCandles.length;

  const formatPrice = (p: number) => p.toLocaleString("en", { minimumFractionDigits: asset.decimals, maximumFractionDigits: asset.decimals });

  const filteredAssets = assets.filter(a =>
    a.symbol.toLowerCase().includes(assetSearch.toLowerCase())
  );

  if (loading || !asset) {
    return (
      <div style={{ minHeight: "100vh", background: "var(--bg)", display: "flex", alignItems: "center", justifyContent: "center" }}>
        <div style={{ textAlign: "center" }}>
          <div style={{ fontSize: 40, marginBottom: 16 }}>📊</div>
          <p style={{ fontSize: 16, color: "var(--text-muted)" }}>Loading market data...</p>
        </div>
      </div>
    );
  }

  return (
    <div style={{ minHeight: "100vh", background: "var(--bg)", display: "flex", flexDirection: "column" }}>
      {/* Header */}
      <div className="app-bar" style={{ background: "var(--surface)", borderBottom: "1px solid var(--border)", paddingTop: 12, paddingBottom: 12, display: "flex", alignItems: "center", justifyContent: "space-between", position: "sticky", top: 0, zIndex: 50 }}>
        <button onClick={() => navigate("dashboard")} style={{ background: "none", border: "none", color: "var(--text-secondary)", fontSize: 22, cursor: "pointer", lineHeight: 1 }}>←</button>
        <div>
          <p style={{ textAlign: "center", fontSize: 12, color: "var(--text-muted)", marginBottom: 1 }}>Balance</p>
          <p style={{ fontWeight: 700, fontSize: 16, textAlign: "center", color: "var(--accent)", fontFamily: "'DM Mono', monospace" }}>${balance.toFixed(2)}</p>
        </div>
        <div style={{ width: 32, height: 32, borderRadius: "50%", background: "var(--accent-light)", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 14 }}>📊</div>
      </div>

      <div className="app-shell" style={{ flex: 1, overflowY: "auto", padding: "12px 14px", paddingBottom: 100 }}>
        {/* Asset Selector */}
        <div style={{ background: "var(--surface)", borderRadius: "var(--radius)", border: "1px solid var(--border)", padding: "10px 14px", marginBottom: 12, cursor: "pointer", position: "relative" }} onClick={() => setShowAssets(!showAssets)}>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
            <div>
              <p style={{ fontSize: 11, color: "var(--text-muted)", marginBottom: 1 }}>Asset</p>
              <p style={{ fontWeight: 700, fontSize: 18 }}>{asset.symbol}</p>
            </div>
            <div style={{ textAlign: "right" }}>
              <p style={{ fontFamily: "'DM Mono', monospace", fontWeight: 700, fontSize: 20 }}>{formatPrice(currentPrice)}</p>
              <p style={{ fontSize: 12, color: currentPrice >= asset.base ? "var(--up)" : "var(--down)", fontWeight: 500 }}>
                {currentPrice >= asset.base ? "▲" : "▼"} {(((currentPrice - asset.base) / asset.base) * 100).toFixed(3)}%
              </p>
            </div>
          </div>
          {showAssets && (
            <div onClick={(e) => e.stopPropagation()} style={{ position: "absolute", top: "100%", left: 0, right: 0, background: "var(--surface)", border: "1px solid var(--border)", borderRadius: "var(--radius)", marginTop: 4, zIndex: 100, boxShadow: "var(--shadow-md)", overflow: "hidden" }}>
              {/* Search Input */}
              <div style={{ padding: "10px", borderBottom: "1px solid var(--border)" }}>
                <input
                  type="text"
                  placeholder="Search assets..."
                  value={assetSearch}
                  onChange={(e) => setAssetSearch(e.target.value)}
                  style={{
                    width: "100%",
                    padding: "8px 12px",
                    border: "1px solid var(--border)",
                    borderRadius: "var(--radius)",
                    fontSize: 14,
                    outline: "none",
                    background: "var(--bg)",
                    color: "var(--text-primary)",
                    fontFamily: "inherit"
                  }}
                />
              </div>
              {/* Scrollable Asset List */}
              <div style={{ maxHeight: 300, overflowY: "auto" }}>
                {filteredAssets.length === 0 ? (
                  <div style={{ padding: "20px", textAlign: "center", color: "var(--text-muted)" }}>
                    No assets found
                  </div>
                ) : filteredAssets.map(a => (
                  <div key={a.symbol} onClick={() => { setAsset(a); setShowAssets(false); setCandles(generateCandles(a.base)); setCurrentPrice(a.base); setAssetSearch(""); }}
                    style={{ padding: "12px 16px", display: "flex", justifyContent: "space-between", alignItems: "center", borderBottom: "1px solid var(--border)", background: a.symbol === asset?.symbol ? "var(--accent-light)" : "transparent", cursor: "pointer" }}>
                    <span style={{ fontWeight: 600, color: a.symbol === asset?.symbol ? "var(--accent)" : "var(--text-primary)" }}>{a.symbol}</span>
                    <span style={{ fontSize: 13, fontFamily: "'DM Mono', monospace" }}>{a.base.toLocaleString()}</span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* Chart */}
        <div style={{ background: "var(--surface)", borderRadius: "var(--radius)", border: "1px solid var(--border)", padding: "12px", marginBottom: 12 }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8 }}>
            <span style={{ fontSize: 12, fontWeight: 600, color: "var(--text-secondary)" }}>Price Chart</span>
            <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
              <div style={{ position: "relative" }}>
                <button
                  onClick={() => setShowChartTypeDropdown(!showChartTypeDropdown)}
                  style={{
                    padding: "4px 12px",
                    borderRadius: 16,
                    border: "1px solid var(--border)",
                    background: "var(--surface)",
                    color: "var(--text-primary)",
                    fontSize: 11,
                    fontWeight: 500,
                    cursor: "pointer",
                    fontFamily: "inherit",
                    display: "flex",
                    alignItems: "center",
                    gap: 4
                  }}
                >
                  <span style={{ display: "flex", alignItems: "center", gap: 6 }}>
                    {chartType === "candle" ? (
                      <svg width="16" height="16" viewBox="0 0 16 16" fill="none" style={{ flexShrink: 0 }}>
                        <rect x="7" y="2" width="2" height="12" fill="var(--text-primary)"/>
                        <rect x="5" y="4" width="6" height="3" stroke="var(--text-primary)" strokeWidth="1.5" fill="none"/>
                        <rect x="5" y="9" width="6" height="3" stroke="var(--text-primary)" strokeWidth="1.5" fill="none"/>
                      </svg>
                    ) : (
                      <svg width="16" height="16" viewBox="0 0 16 16" fill="none" style={{ flexShrink: 0 }}>
                        <path d="M2 12L6 8L9 10L14 4" stroke="var(--text-primary)" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
                      </svg>
                    )}
                    <span>{chartType === "candle" ? "Candles" : "Line"}</span>
                  </span>
                  <span>▼</span>
                </button>
                {showChartTypeDropdown && (
                  <div
                    onClick={(e) => e.stopPropagation()}
                    style={{
                      position: "absolute",
                      top: "100%",
                      right: 0,
                      marginTop: 4,
                      background: "var(--surface)",
                      border: "1px solid var(--border)",
                      borderRadius: "var(--radius)",
                      boxShadow: "var(--shadow-md)",
                      overflow: "hidden",
                      zIndex: 100
                    }}
                  >
                    <div
                      onClick={() => { setChartType("candle"); setShowChartTypeDropdown(false); }}
                      style={{
                        padding: "8px 16px",
                        cursor: "pointer",
                        fontSize: 12,
                        fontWeight: 500,
                        color: chartType === "candle" ? "var(--accent)" : "var(--text-primary)",
                        background: chartType === "candle" ? "var(--accent-light)" : "transparent",
                        display: "flex",
                        alignItems: "center",
                        gap: 8
                      }}
                    >
                      <svg width="18" height="18" viewBox="0 0 16 16" fill="none" style={{ flexShrink: 0 }}>
                        <rect x="7" y="2" width="2" height="12" fill={chartType === "candle" ? "var(--accent)" : "var(--text-primary)"}/>
                        <rect x="5" y="4" width="6" height="3" stroke={chartType === "candle" ? "var(--accent)" : "var(--text-primary)"} strokeWidth="1.5" fill="none"/>
                        <rect x="5" y="9" width="6" height="3" stroke={chartType === "candle" ? "var(--accent)" : "var(--text-primary)"} strokeWidth="1.5" fill="none"/>
                      </svg>
                      <span>Candles</span>
                    </div>
                    <div
                      onClick={() => { setChartType("line"); setShowChartTypeDropdown(false); }}
                      style={{
                        padding: "8px 16px",
                        cursor: "pointer",
                        fontSize: 12,
                        fontWeight: 500,
                        color: chartType === "line" ? "var(--accent)" : "var(--text-primary)",
                        background: chartType === "line" ? "var(--accent-light)" : "transparent",
                        display: "flex",
                        alignItems: "center",
                        gap: 8
                      }}
                    >
                      <svg width="18" height="18" viewBox="0 0 16 16" fill="none" style={{ flexShrink: 0 }}>
                        <path d="M2 12L6 8L9 10L14 4" stroke={chartType === "line" ? "var(--accent)" : "var(--text-primary)"} strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
                      </svg>
                      <span>Line</span>
                    </div>
                  </div>
                )}
              </div>
              <span style={{ fontSize: 11, color: "var(--accent)", background: "var(--accent-light)", padding: "2px 8px", borderRadius: 20, fontWeight: 500 }}>● LIVE</span>
            </div>
          </div>
          <svg width="100%" viewBox={`0 0 ${W} ${H}`} style={{ display: "block", maxWidth: 560, margin: "0 auto" }}>
            {[0, 0.25, 0.5, 0.75, 1].map(r => {
              const y = PAD.t + r * chartH;
              const price = maxP - r * range;
              return (
                <g key={r}>
                  <line x1={PAD.l} y1={y} x2={W - PAD.r} y2={y} stroke="var(--border)" strokeWidth="0.5" />
                  <text x={PAD.l - 4} y={y + 4} textAnchor="end" fontSize="8" fill="var(--text-muted)" fontFamily="DM Mono">
                    {price.toFixed(asset.decimals < 2 ? 0 : 2)}
                  </text>
                </g>
              );
            })}
            {activeTrade && (
              <line x1={PAD.l} y1={toY(activeTrade.entryPrice)} x2={W - PAD.r} y2={toY(activeTrade.entryPrice)}
                stroke={activeTrade.direction === "over" ? "var(--up)" : "var(--down)"} strokeWidth="1" strokeDasharray="4,2" />
            )}
            <line x1={PAD.l} y1={toY(currentPrice)} x2={W - PAD.r} y2={toY(currentPrice)} stroke="var(--accent)" strokeWidth="0.75" strokeDasharray="2,2" opacity="0.4" />
            {chartType === "line" ? (
              <>
                <rect x={PAD.l} y={PAD.t} width={chartW} height={chartH} fill="var(--surface)" />
                <defs>
                  <linearGradient id="areaGradient" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="var(--accent)" stopOpacity="0.3" />
                    <stop offset="100%" stopColor="var(--accent)" stopOpacity="0.05" />
                  </linearGradient>
                </defs>
                <path
                  d={`M${PAD.l + cw / 2},${toY(visibleCandles[0]?.close || currentPrice)} ` +
                    visibleCandles.map((c, i) => `L${PAD.l + i * cw + cw / 2},${toY(c.close)}`).join(" ") +
                    ` L${PAD.l + (visibleCandles.length - 1) * cw + cw / 2},${PAD.t + chartH} L${PAD.l + cw / 2},${PAD.t + chartH} Z`}
                  fill="url(#areaGradient)"
                />
                <path
                  d={`M${PAD.l + cw / 2},${toY(visibleCandles[0]?.close || currentPrice)} ` +
                    visibleCandles.map((c, i) => {
                      if (i === 0) return "";
                      const prevX = PAD.l + (i - 1) * cw + cw / 2;
                      const prevY = toY(visibleCandles[i - 1].close);
                      const currX = PAD.l + i * cw + cw / 2;
                      const currY = toY(c.close);
                      return `Q${(prevX + currX) / 2},${prevY} ${currX},${currY}`;
                    }).join(" ")}
                  fill="none" stroke="var(--accent)" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"
                />
              </>
            ) : (
              visibleCandles.map((c, i) => {
                const x = PAD.l + i * cw + cw * 0.1;
                const candleW = Math.max(cw * 0.7, 2);
                const bullish = c.close >= c.open;
                const color = bullish ? "var(--up)" : "var(--down)";
                const bodyTop = Math.min(toY(c.open), toY(c.close));
                const bodyH = Math.max(Math.abs(toY(c.open) - toY(c.close)), 1);
                const centerX = PAD.l + i * cw + cw / 2;
                return (
                  <g key={i}>
                    <line x1={centerX} y1={toY(c.high)} x2={centerX} y2={toY(c.low)} stroke={color} strokeWidth="0.8" />
                    <rect x={x} y={bodyTop} width={candleW} height={bodyH} fill={color} opacity={0.85} rx="0.5" />
                  </g>
                );
              })
            )}
            <rect x={W - PAD.r + 4} y={toY(currentPrice) - 10} width={62} height={20} rx="4" fill="var(--accent)" />
            <text x={W - PAD.r + 35} y={toY(currentPrice) + 4} textAnchor="middle" fontSize="9" fill="var(--on-accent)" fontFamily="DM Mono" fontWeight="600">
              {formatPrice(currentPrice)}
            </text>
          </svg>
        </div>

        {/* Active Trade Banner */}
        {activeTrade && (
          <div style={{ background: activeTrade.direction === "over" ? "var(--up-bg)" : "var(--down-bg)", borderRadius: "var(--radius)", border: `1px solid ${activeTrade.direction === "over" ? "var(--up)" : "var(--down)"}`, padding: "14px 16px", marginBottom: 12 }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8 }}>
              <div>
                <span style={{ fontWeight: 700, fontSize: 15, color: activeTrade.direction === "over" ? "var(--up)" : "var(--down)" }}>
                  {activeTrade.direction === "over" ? "▲ BUY" : "▼ SELL"} {asset.symbol}
                </span>
                <p style={{ fontSize: 12, color: "var(--text-secondary)", marginTop: 2 }}>Entry: <strong style={{ fontFamily: "'DM Mono', monospace" }}>{formatPrice(activeTrade.entryPrice)}</strong></p>
              </div>
              <div style={{ textAlign: "right" }}>
                <div style={{ fontSize: 28, fontWeight: 700, fontFamily: "'DM Mono', monospace", color: activeTrade.direction === "over" ? "var(--up)" : "var(--down)" }}>{formatClock(activeTrade.timeLeft)}</div>
                <div style={{ fontSize: 11, color: "var(--text-muted)" }}>remaining</div>
              </div>
            </div>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 8 }}>
              {[
                { label: "Invested", val: `$${activeTrade.amount.toFixed(2)}` },
                { label: "Payout", val: `$${(activeTrade.amount * payout).toFixed(2)}` },
                { label: "Current", val: currentPrice > activeTrade.entryPrice ? "▲ Above" : "▼ Below" },
              ].map(item => (
                <div key={item.label} style={{ background: "rgba(255,255,255,0.05)", borderRadius: 8, padding: "8px", textAlign: "center" }}>
                  <div style={{ fontSize: 11, color: "var(--text-muted)" }}>{item.label}</div>
                  <div style={{ fontSize: 13, fontWeight: 600 }}>{item.val}</div>
                </div>
              ))}
            </div>
            <div style={{ marginTop: 10, height: 4, background: "rgba(255,255,255,0.10)", borderRadius: 2, overflow: "hidden" }}>
              <div style={{ height: "100%", background: activeTrade.direction === "over" ? "var(--up)" : "var(--down)", width: `${(1 - activeTrade.timeLeft / duration.value) * 100}%`, transition: "width 1s linear", borderRadius: 2 }} />
            </div>
          </div>
        )}

        {/* Result Banner */}
        {result && (
          <div style={{ background: result.won ? "var(--up-bg)" : "var(--down-bg)", borderRadius: "var(--radius)", border: `1px solid ${result.won ? "var(--up)" : "var(--down)"}`, padding: "16px", marginBottom: 12, textAlign: "center" }}>
            <div style={{ fontSize: 32, marginBottom: 4 }}>{result.won ? "🎉" : "😔"}</div>
            <div style={{ fontWeight: 700, fontSize: 20, color: result.won ? "var(--up)" : "var(--down)" }}>
              {result.won ? `+$${result.profit.toFixed(2)} Profit!` : `-$${result.profit.toFixed(2)} Loss`}
            </div>
            <div style={{ fontSize: 13, color: "var(--text-secondary)", marginTop: 4 }}>{result.won ? "Excellent trade!" : "Better luck next time"}</div>
          </div>
        )}

        {/* Duration */}
        <div style={{ background: "var(--surface)", borderRadius: "var(--radius)", border: "1px solid var(--border)", padding: "12px 14px", marginBottom: 10 }}>
          <p style={{ fontSize: 12, color: "var(--text-muted)", marginBottom: 8, fontWeight: 500 }}>EXPIRY TIME</p>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "9px 12px", borderRadius: 8, border: "1px solid var(--accent)", background: "var(--accent-light)" }}>
            <span style={{ fontSize: 13, color: "var(--text-secondary)" }}>Trading session</span>
            <span style={{ fontWeight: 700, fontSize: 15, color: "var(--accent)", fontFamily: "'DM Mono', monospace" }}>{duration.label}</span>
          </div>
        </div>

        {/* Amount */}
        <div style={{ background: "var(--surface)", borderRadius: "var(--radius)", border: "1px solid var(--border)", padding: "12px 14px", marginBottom: 10 }}>
          <p style={{ fontSize: 12, color: "var(--text-muted)", marginBottom: 8, fontWeight: 500 }}>TRADE AMOUNT</p>
          <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginBottom: 8 }}>
            {AMOUNTS.map(a => (
              <button key={a} onClick={() => { setAmount(a); setCustomAmount(""); }} style={{ padding: "7px 12px", borderRadius: 8, border: "1px solid", borderColor: amount === a && !customAmount ? "var(--accent)" : "var(--border)", background: amount === a && !customAmount ? "var(--accent-light)" : "transparent", color: amount === a && !customAmount ? "var(--accent)" : "var(--text-secondary)", fontWeight: 600, fontSize: 13, cursor: "pointer", fontFamily: "inherit" }}>
                ${a}
              </button>
            ))}
          </div>
          <input
            type="number"
            placeholder="Custom amount..."
            value={customAmount}
            onChange={e => setCustomAmount(e.target.value)}
            style={{ width: "100%", padding: "10px 12px", border: "1px solid var(--border)", borderRadius: 8, fontSize: 14, outline: "none", fontFamily: "inherit", color: "var(--text-primary)", background: "var(--bg)" }}
          />
          <div style={{ display: "flex", justifyContent: "space-between", marginTop: 6 }}>
            <span style={{ fontSize: 12, color: "var(--text-muted)" }}>Profit rate: {(payout * 100).toFixed(0)}%</span>
            <span style={{ fontSize: 12, color: "var(--text-muted)" }}>Max win: <strong style={{ color: "var(--up)" }}>${(tradeAmount * (1 + payout)).toFixed(2)}</strong></span>
          </div>
        </div>

        {/* Trade Buttons */}
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10, marginBottom: 12 }}>
          <button
            onClick={() => placeTrade("under")}
            disabled={isPlacingTrade || !!activeTrade || tradeAmount < 1 || tradeAmount > balance}
            style={{ padding: "6px 6px", background: isPlacingTrade || !!activeTrade || tradeAmount > balance ? "var(--surface-2)" : "var(--down)", color: isPlacingTrade || !!activeTrade || tradeAmount > balance ? "var(--text-muted)" : "var(--on-accent)", border: "none", borderRadius: "var(--radius)", fontSize: 16, fontWeight: 700, cursor: isPlacingTrade || !!activeTrade || tradeAmount > balance ? "not-allowed" : "pointer", fontFamily: "inherit", transition: "all 0.15s", boxShadow: !isPlacingTrade && !activeTrade && tradeAmount <= balance ? "0 4px 14px rgba(220,38,38,0.3)" : "none" }}>
            <div style={{ fontSize: 10, marginBottom: 2 }}>▼ SELL</div>
            {/* <div>SELL</div> */}
            <div style={{ fontSize: 10, opacity: 0.8, marginTop: 2 }}>Price goes down</div>
          </button>
          <button
            onClick={() => placeTrade("over")}
            disabled={isPlacingTrade || !!activeTrade || tradeAmount < 1 || tradeAmount > balance}
            style={{ padding: "6px 6px", background: isPlacingTrade || !!activeTrade || tradeAmount > balance ? "var(--surface-2)" : "var(--up)", color: isPlacingTrade || !!activeTrade || tradeAmount > balance ? "var(--text-muted)" : "var(--on-accent)", border: "none", borderRadius: "var(--radius)", fontSize: 16, fontWeight: 700, cursor: isPlacingTrade || !!activeTrade || tradeAmount > balance ? "not-allowed" : "pointer", fontFamily: "inherit", transition: "all 0.15s", boxShadow: !isPlacingTrade && !activeTrade && tradeAmount <= balance ? "0 4px 14px rgba(22,163,74,0.3)" : "none" }}>
            <div style={{ fontSize: 10, marginBottom: 2 }}>▲ BUY</div>
            {/* <div>BUY</div> */}
            <div style={{ fontSize: 10, opacity: 0.8, marginTop: 2 }}>Price goes up</div>
          </button>
        </div>

        {tradeAmount > balance && (
          <div style={{ textAlign: "center", padding: "10px", background: "var(--danger-light)", borderRadius: 8, border: "1px solid var(--down)" }}>
            <p style={{ fontSize: 13, color: "var(--danger)", fontWeight: 500 }}>Insufficient balance. <span style={{ cursor: "pointer", textDecoration: "underline" }} onClick={() => navigate("deposit")}>Deposit funds →</span></p>
          </div>
        )}
      </div>
    </div>
  );
}
