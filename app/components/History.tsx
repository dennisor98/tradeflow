"use client";
import { useState } from "react";
import { useApp } from "../context/AppContext";

export default function History() {
  const { trades, transactions, navigate } = useApp();
  const [activeTab, setActiveTab] = useState<"trades" | "transactions">("trades");

  // Sort trades by startTime (most recent first)
  const sortedTrades = [...trades].sort((a, b) => (b.startTime || 0) - (a.startTime || 0));

  // Sort transactions by time (most recent first)
  const sortedTransactions = [...transactions].sort((a, b) => (b.time || 0) - (a.time || 0));

  return (
    <div style={{ minHeight: "100vh", background: "var(--bg)" }}>
      <div style={{ background: "var(--surface)", borderBottom: "1px solid var(--border)", padding: "14px 16px", display: "flex", alignItems: "center", gap: 12 }}>
        <button onClick={() => navigate("dashboard")} style={{ background: "none", border: "none", color: "var(--text-secondary)", fontSize: 22, cursor: "pointer" }}>←</button>
        <h1 style={{ fontWeight: 700, fontSize: 18 }}>History</h1>
      </div>
      <div style={{ maxWidth: 480, margin: "0 auto", padding: "16px" }}>
        {/* Tabs */}
        <div style={{ display: "flex", gap: 8, marginBottom: 16 }}>
          <button
            onClick={() => setActiveTab("trades")}
            style={{
              flex: 1,
              padding: "12px",
              background: activeTab === "trades" ? "var(--accent)" : "var(--surface)",
              color: activeTab === "trades" ? "white" : "var(--text-primary)",
              border: activeTab === "trades" ? "none" : "1px solid var(--border)",
              borderRadius: "var(--radius)",
              fontSize: 14,
              fontWeight: 600,
              cursor: "pointer",
              fontFamily: "inherit"
            }}
          >
            Trades
          </button>
          <button
            onClick={() => setActiveTab("transactions")}
            style={{
              flex: 1,
              padding: "12px",
              background: activeTab === "transactions" ? "var(--accent)" : "var(--surface)",
              color: activeTab === "transactions" ? "white" : "var(--text-primary)",
              border: activeTab === "transactions" ? "none" : "1px solid var(--border)",
              borderRadius: "var(--radius)",
              fontSize: 14,
              fontWeight: 600,
              cursor: "pointer",
              fontFamily: "inherit"
            }}
          >
            Transactions
          </button>
        </div>

        {/* Stats - Only show on trades tab */}
        {activeTab === "trades" && (
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10, marginBottom: 16 }}>
            {[
              { label: "Total Trades", value: trades.length, color: "var(--text-primary)" },
              { label: "Win Rate", value: trades.length ? `${Math.round((trades.filter(t => t.result==="win").length / trades.length) * 100)}%` : "0%", color: "var(--up)" },
              { label: "Wins", value: trades.filter(t => t.result==="win").length, color: "var(--up)" },
              { label: "Losses", value: trades.filter(t => t.result==="loss").length, color: "var(--down)" },
            ].map(s => (
              <div key={s.label} style={{ background: "var(--surface)", borderRadius: "var(--radius)", border: "1px solid var(--border)", padding: "14px" }}>
                <p style={{ fontSize: 12, color: "var(--text-muted)", marginBottom: 4 }}>{s.label}</p>
                <p style={{ fontSize: 24, fontWeight: 700, color: s.color }}>{s.value}</p>
              </div>
            ))}
          </div>
        )}

        {/* Trades - Only show on trades tab */}
        {activeTab === "trades" && (
          <div style={{ background: "var(--surface)", borderRadius: "var(--radius-lg)", border: "1px solid var(--border)", overflow: "hidden" }}>
            <div style={{ padding: "14px 16px", borderBottom: "1px solid var(--border)" }}>
              <p style={{ fontWeight: 600, fontSize: 15 }}>Trades</p>
            </div>
            {sortedTrades.length === 0 ? (
              <div style={{ padding: "40px", textAlign: "center", color: "var(--text-muted)" }}>
                <div style={{ fontSize: 32, marginBottom: 8 }}>📊</div>
                <p style={{ fontSize: 14 }}>No trades yet</p>
              </div>
            ) : sortedTrades.map(t => (
              <div key={t.id} style={{ padding: "14px 16px", borderBottom: "1px solid var(--border)", display: "flex", alignItems: "center", gap: 12 }}>
                <div style={{ width: 40, height: 40, borderRadius: 10, background: t.result === "win" ? "var(--up-bg)" : "var(--down-bg)", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 16, flexShrink: 0 }}>
                  {t.direction === "over" ? "▲" : "▼"}
                </div>
                <div style={{ flex: 1 }}>
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                    <span style={{ fontWeight: 600, fontSize: 14 }}>{t.asset}</span>
                    <span style={{ fontWeight: 700, fontSize: 14, color: t.result === "win" ? "var(--up)" : "var(--down)" }}>
                      {t.result === "win" ? `+$${parseFloat(String(t.payout||0)).toFixed(2)}` : `-$${parseFloat(String(t.amount)).toFixed(2)}`}
                    </span>
                  </div>
                  <div style={{ display: "flex", justifyContent: "space-between", marginTop: 2 }}>
                    <span style={{ fontSize: 12, color: "var(--text-muted)" }}>{t.direction.toUpperCase()} · ${t.amount} · {t.duration}s</span>
                    <span style={{ fontSize: 12, fontWeight: 600, padding: "2px 8px", borderRadius: 20, background: t.result === "win" ? "var(--up-bg)" : "var(--down-bg)", color: t.result === "win" ? "var(--up)" : "var(--down)" }}>
                      {t.result?.toUpperCase()}
                    </span>
                  </div>
                  {t.initialBalance !== undefined && t.finalBalance !== undefined && (
                    <div style={{ marginTop: 4, paddingTop: 4, borderTop: "1px dashed var(--border)", display: "flex", justifyContent: "space-between" }}>
                      <span style={{ fontSize: 11, color: "var(--text-muted)" }}>Balance: ${parseFloat(String(t.initialBalance)).toFixed(2)} → ${parseFloat(String(t.finalBalance)).toFixed(2)}</span>
                    </div>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}

        {/* Transactions - Only show on transactions tab */}
        {activeTab === "transactions" && (
          <div style={{ background: "var(--surface)", borderRadius: "var(--radius-lg)", border: "1px solid var(--border)", overflow: "hidden" }}>
            <div style={{ padding: "14px 16px", borderBottom: "1px solid var(--border)" }}>
              <p style={{ fontWeight: 600, fontSize: 15 }}>All Transactions</p>
            </div>
            {sortedTransactions.filter(tx => ["deposit","withdrawal"].includes(tx.type)).length === 0 ? (
              <div style={{ padding: "40px", textAlign: "center", color: "var(--text-muted)" }}>
                <p style={{ fontSize: 14 }}>No transactions yet</p>
              </div>
            ) : sortedTransactions.filter(tx => ["deposit","withdrawal"].includes(tx.type)).map(tx => (
              <div key={tx.id} style={{ padding: "14px 16px", borderBottom: "1px solid var(--border)", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                  <div style={{ width: 36, height: 36, borderRadius: 8, background: tx.type === "deposit" ? "var(--up-bg)" : "var(--down-bg)", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 16 }}>
                    {tx.type === "deposit" ? "↓" : "↑"}
                  </div>
                  <div>
                    <p style={{ fontSize: 14, fontWeight: 500 }}>{tx.label}</p>
                    <p style={{ fontSize: 12, color: "var(--text-muted)" }}>{new Date(tx.time).toLocaleString()}</p>
                  </div>
                </div>
                <span style={{ fontWeight: 700, color: tx.type === "deposit" ? "var(--up)" : "var(--down)" }}>
                  {tx.type === "deposit" ? "+" : "-"}${parseFloat(String(tx.amount)).toFixed(2)}
                </span>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
