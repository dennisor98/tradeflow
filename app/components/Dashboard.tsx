"use client";
import { useApp } from "../context/AppContext";

const assets = [
  { symbol: "EUR/USD", price: 1.0847, change: 0.0012, pct: 0.11 },
  { symbol: "GBP/USD", price: 1.2634, change: -0.0023, pct: -0.18 },
  { symbol: "BTC/USD", price: 67842, change: 1243, pct: 1.87 },
  { symbol: "XAU/USD", price: 2341.5, change: -8.3, pct: -0.35 },
  { symbol: "OIL/USD", price: 78.42, change: 0.87, pct: 1.12 },
];

export default function Dashboard() {
  const { user, balance, trades, transactions, navigate, accountType, maxSingleDeposit } = useApp();
  const wins = trades.filter(t => t.result === "win").length;
  const losses = trades.filter(t => t.result === "loss").length;
  const winRate = trades.length ? Math.round((wins / trades.length) * 100) : 0;

  return (
    <div style={{ minHeight: "100vh", background: "var(--bg)" }}>
      {/* Header */}
      <div style={{ background: "var(--surface)", borderBottom: "1px solid var(--border)", padding: "16px 20px", display: "flex", alignItems: "center", justifyContent: "space-between", position: "sticky", top: 0, zIndex: 50 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <div style={{ width: 34, height: 34, borderRadius: 10, background: "var(--accent)", display: "flex", alignItems: "center", justifyContent: "center" }}>
            <svg width="18" height="18" fill="none" viewBox="0 0 36 36"><path d="M18 4L32 12V24L18 32L4 24V12L18 4Z" stroke="white" strokeWidth="2.5" fill="rgba(255,255,255,0.2)"/><path d="M12 20L16 24L24 14" stroke="white" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"/></svg>
          </div>
          <span style={{ fontWeight: 700, fontSize: 18, letterSpacing: "-0.3px" }}>TradeFlow</span>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
          <div style={{ width: 36, height: 36, borderRadius: "50%", background: "var(--accent-light)", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 14, fontWeight: 600, color: "var(--accent)" }}>
            {user?.name.charAt(0).toUpperCase()}
          </div>
        </div>
      </div>

      <div style={{ maxWidth: 480, margin: "0 auto", padding: "20px 16px" }}>
        {/* Account Type Badge */}
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16 }}>
          <div style={{ 
            padding: "6px 14px", 
            borderRadius: 20, 
            background: accountType === "vvip" ? "linear-gradient(135deg, #FF00FF 0%, #8B00FF 100%)" : accountType === "vip" ? "linear-gradient(135deg, #FFD700 0%, #FFA500 100%)" : "var(--surface)",
            border: accountType === "normal" ? "1px solid var(--border)" : "none",
            color: accountType === "normal" ? "var(--text-muted)" : "white",
            fontSize: 12, 
            fontWeight: 700,
            letterSpacing: "0.5px",
            textTransform: "uppercase"
          }}>
            {accountType === "vvip" ? "💎 VVIP Account" : accountType === "vip" ? "👑 VIP Account" : "👤 Normal Account"}
          </div>
          <button onClick={() => navigate("profile")} style={{ background: "var(--surface)", border: "1px solid var(--border)", borderRadius: "50%", width: 40, height: 40, color: "var(--text-secondary)", fontSize: 20, cursor: "pointer", padding: 0, display: "flex", alignItems: "center", justifyContent: "center" }}>
            👤
          </button>
        </div>

        {/* Balance Card */}
        <div style={{ background: "linear-gradient(135deg, #1a6b3c 0%, #2d9459 100%)", borderRadius: 20, padding: "24px", marginBottom: 20, color: "white", position: "relative", overflow: "hidden" }}>
          <div style={{ position: "absolute", top: -20, right: -20, width: 120, height: 120, borderRadius: "50%", background: "rgba(255,255,255,0.06)" }} />
          <div style={{ position: "absolute", bottom: -30, right: 30, width: 80, height: 80, borderRadius: "50%", background: "rgba(255,255,255,0.04)" }} />
          <p style={{ fontSize: 13, opacity: 0.75, marginBottom: 4, fontWeight: 500 }}>Available Balance</p>
          <p style={{ fontSize: 38, fontWeight: 700, letterSpacing: "-1px", marginBottom: 20 }}>${balance.toLocaleString("en", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</p>
          <div style={{ display: "flex", gap: 10 }}>
            <button onClick={() => navigate("deposit")} style={{ flex: 1, padding: "11px", background: "rgba(255,255,255,0.2)", border: "1px solid rgba(255,255,255,0.3)", borderRadius: 10, color: "white", fontWeight: 600, fontSize: 14, cursor: "pointer", fontFamily: "inherit", backdropFilter: "blur(8px)" }}>
              + Deposit
            </button>
            <button onClick={() => { console.log("Withdraw button clicked"); navigate("withdraw"); }} style={{ flex: 1, padding: "11px", background: "rgba(0,0,0,0.15)", border: "1px solid rgba(255,255,255,0.15)", borderRadius: 10, color: "white", fontWeight: 600, fontSize: 14, cursor: "pointer", fontFamily: "inherit" }}>
              Withdraw
            </button>
          </div>
        </div>

        {/* Upgrade to VIP Banner for Normal Accounts */}
        {accountType === "normal" && (
          <div style={{ 
            background: "linear-gradient(135deg, #FFD700 0%, #FFA500 100%)", 
            borderRadius: 16, 
            padding: "20px", 
            marginBottom: 20, 
            color: "#8B4513", 
            position: "relative", 
            overflow: "hidden" 
          }}>
            <div style={{ position: "absolute", top: -15, right: -15, width: 80, height: 80, borderRadius: "50%", background: "rgba(139,69,19,0.1)" }} />
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
              <div>
                <h3 style={{ fontSize: 16, fontWeight: 700, marginBottom: 4 }}>👑 Upgrade to VIP</h3>
                <p style={{ fontSize: 12, opacity: 0.85, marginBottom: 12 }}>Deposit $1000+ to unlock 50% win rate</p>
              </div>
              <button 
                onClick={() => navigate("deposit")}
                style={{ 
                  padding: "10px 20px", 
                  background: "#8B4513", 
                  color: "white", 
                  border: "none", 
                  borderRadius: 10, 
                  fontWeight: 700, 
                  fontSize: 13, 
                  cursor: "pointer",
                  fontFamily: "inherit",
                  boxShadow: "0 2px 8px rgba(0,0,0,0.15)"
                }}
              >
                Upgrade Now
              </button>
            </div>
          </div>
        )}

        {/* Upgrade to VVIP Banner for VIP Accounts */}
        {accountType === "vip" && (
          <div style={{ 
            background: "linear-gradient(135deg, #FF00FF 0%, #8B00FF 100%)", 
            borderRadius: 16, 
            padding: "20px", 
            marginBottom: 20, 
            color: "#4B0082", 
            position: "relative", 
            overflow: "hidden" 
          }}>
            <div style={{ position: "absolute", top: -15, right: -15, width: 80, height: 80, borderRadius: "50%", background: "rgba(75,0,130,0.1)" }} />
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
              <div>
                <h3 style={{ fontSize: 16, fontWeight: 700, marginBottom: 4 }}>💎 Upgrade to VVIP</h3>
                <p style={{ fontSize: 12, opacity: 0.85, marginBottom: 12 }}>Deposit $5000+ to unlock 70% win rate</p>
              </div>
              <button 
                onClick={() => navigate("deposit")}
                style={{ 
                  padding: "10px 20px", 
                  background: "#4B0082", 
                  color: "white", 
                  border: "none", 
                  borderRadius: 10, 
                  fontWeight: 700, 
                  fontSize: 13, 
                  cursor: "pointer",
                  fontFamily: "inherit",
                  boxShadow: "0 2px 8px rgba(0,0,0,0.15)"
                }}
              >
                Upgrade Now
              </button>
            </div>
          </div>
        )}

        {/* Stats Row */}
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 10, marginBottom: 20 }}>
          {[
            { label: "Total Trades", value: trades.length, icon: "📊" },
            { label: "Win Rate", value: `${winRate}%`, icon: "🎯" },
            { label: "Wins / Losses", value: `${wins}/${losses}`, icon: "⚡" },
          ].map(s => (
            <div key={s.label} style={{ background: "var(--surface)", borderRadius: "var(--radius)", border: "1px solid var(--border)", padding: "14px 12px", textAlign: "center" }}>
              <div style={{ fontSize: 20, marginBottom: 4 }}>{s.icon}</div>
              <div style={{ fontSize: 18, fontWeight: 700, color: "var(--text-primary)" }}>{s.value}</div>
              <div style={{ fontSize: 11, color: "var(--text-muted)", marginTop: 2 }}>{s.label}</div>
            </div>
          ))}
        </div>

        {/* Trade Button */}
        <button onClick={() => navigate("trade")} style={{ width: "100%", padding: "18px", background: "var(--accent)", color: "white", border: "none", borderRadius: "var(--radius)", fontSize: 16, fontWeight: 700, cursor: "pointer", marginBottom: 24, letterSpacing: "-0.2px", boxShadow: "0 4px 16px rgba(26,107,60,0.3)" }}>
          🚀 Start Trading
        </button>

        {/* Market Watch */}
        <div style={{ background: "var(--surface)", borderRadius: "var(--radius-lg)", border: "1px solid var(--border)", overflow: "hidden", marginBottom: 20 }}>
          <div style={{ padding: "16px 18px", borderBottom: "1px solid var(--border)", display: "flex", alignItems: "center", justifyContent: "space-between" }}>
            <span style={{ fontWeight: 600, fontSize: 15 }}>Market Watch</span>
            <span style={{ fontSize: 12, color: "var(--accent)", background: "var(--accent-light)", padding: "3px 8px", borderRadius: 20, fontWeight: 500 }}>● LIVE</span>
          </div>
          {assets.map((a, i) => (
            <div key={a.symbol} style={{ padding: "14px 18px", borderBottom: i < assets.length - 1 ? "1px solid var(--border)" : "none", display: "flex", alignItems: "center", justifyContent: "space-between" }}>
              <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                <div style={{ width: 36, height: 36, borderRadius: 10, background: a.change >= 0 ? "var(--up-bg)" : "var(--down-bg)", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 14 }}>
                  {a.symbol.includes("BTC") ? "₿" : a.symbol.includes("XAU") ? "🥇" : a.symbol.includes("OIL") ? "🛢" : "💱"}
                </div>
                <div>
                  <div style={{ fontWeight: 600, fontSize: 14 }}>{a.symbol}</div>
                  <div style={{ fontSize: 12, color: a.change >= 0 ? "var(--up)" : "var(--down)", fontWeight: 500 }}>{a.change >= 0 ? "▲" : "▼"} {Math.abs(a.pct).toFixed(2)}%</div>
                </div>
              </div>
              <div style={{ textAlign: "right" }}>
                <div style={{ fontWeight: 600, fontSize: 15, fontFamily: "'DM Mono', monospace" }}>{a.price.toLocaleString()}</div>
                <div style={{ fontSize: 12, color: a.change >= 0 ? "var(--up)" : "var(--down)" }}>{a.change >= 0 ? "+" : ""}{a.change.toFixed(a.symbol.includes("BTC") ? 0 : 4)}</div>
              </div>
            </div>
          ))}
        </div>

        {/* Recent Activity */}
        <div style={{ background: "var(--surface)", borderRadius: "var(--radius-lg)", border: "1px solid var(--border)", overflow: "hidden" }}>
          <div style={{ padding: "16px 18px", borderBottom: "1px solid var(--border)", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
            <span style={{ fontWeight: 600, fontSize: 15 }}>Recent Activity</span>
            <span onClick={() => navigate("history")} style={{ fontSize: 13, color: "var(--accent)", cursor: "pointer", fontWeight: 500 }}>See all</span>
          </div>
          {transactions.length === 0 ? (
            <div style={{ padding: "32px", textAlign: "center", color: "var(--text-muted)" }}>
              <div style={{ fontSize: 32, marginBottom: 8 }}>📋</div>
              <p style={{ fontSize: 14 }}>No activity yet. Make a deposit to start trading.</p>
            </div>
          ) : transactions.slice(0, 4).map(tx => (
            <div key={tx.id} style={{ padding: "14px 18px", borderBottom: "1px solid var(--border)", display: "flex", alignItems: "center", justifyContent: "space-between" }}>
              <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                <div style={{ width: 36, height: 36, borderRadius: 10, background: tx.type === "deposit" ? "var(--up-bg)" : tx.type === "withdrawal" ? "var(--down-bg)" : tx.type === "trade_win" ? "var(--up-bg)" : "var(--down-bg)", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 16 }}>
                  {tx.type === "deposit" ? "↓" : tx.type === "withdrawal" ? "↑" : tx.type === "trade_win" ? "✓" : "✗"}
                </div>
                <div>
                  <div style={{ fontSize: 14, fontWeight: 500 }}>{tx.label}</div>
                  <div style={{ fontSize: 12, color: "var(--text-muted)" }}>{new Date(tx.time).toLocaleDateString()}</div>
                </div>
              </div>
              <div style={{ fontWeight: 600, fontSize: 15, color: ["deposit","trade_win"].includes(tx.type) ? "var(--up)" : "var(--down)" }}>
                {["deposit","trade_win"].includes(tx.type) ? "+" : "-"}${parseFloat(String(tx.amount)).toFixed(2)}
              </div>
            </div>
          ))}
        </div>

        {/* Bottom Nav */}
        <div style={{ height: 80 }} />
      </div>

      {/* Bottom Nav Bar */}
      <div style={{ position: "fixed", bottom: 0, left: 0, right: 0, background: "var(--surface)", borderTop: "1px solid var(--border)", display: "flex", padding: "10px 0 20px" }}>
        {[
          { icon: "🏠", label: "Home", screen: "dashboard" },
          { icon: "📈", label: "Trade", screen: "trade" },
          { icon: "💳", label: "Deposit", screen: "deposit" },
          { icon: "📋", label: "History", screen: "history" },
        ].map(nav => (
          <button key={nav.label} onClick={() => navigate(nav.screen as any)} style={{ flex: 1, background: "none", border: "none", cursor: "pointer", display: "flex", flexDirection: "column", alignItems: "center", gap: 4, padding: "6px 0" }}>
            <span style={{ fontSize: 22 }}>{nav.icon}</span>
            <span style={{ fontSize: 11, color: nav.screen === "dashboard" ? "var(--accent)" : "var(--text-muted)", fontWeight: nav.screen === "dashboard" ? 600 : 400, fontFamily: "inherit" }}>{nav.label}</span>
          </button>
        ))}
      </div>
    </div>
  );
}
