"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import { money, panel } from "./admin-ui";

interface Stats {
  users: { total: number; active: number; marketers: number; admins: number; heldBalance: string };
  transactions: { deposits: string; withdrawals: string; pendingCount: number };
  trades: { total: number; wins: number; staked: string; paidOut: string };
  today: {
    depositTotal: string; depositCount: number; depositPendingTotal: string;
    withdrawalTotal: string; withdrawalCount: number;
    withdrawalPendingTotal: string; withdrawalPendingCount: number;
    adjustmentCount: number; adjustmentNet: string;
    tradeCount: number; tradeWins: number; tradeStaked: string; tradePaidOut: string;
  };
}

function Stat({ label, value, hint, accent }: { label: string; value: string; hint?: string; accent?: boolean }) {
  return (
    <div style={{ ...panel, padding: "16px 18px", ...(accent ? { borderColor: "var(--accent)", background: "var(--accent-light)" } : null) }}>
      <div style={{ fontSize: 11, letterSpacing: "0.08em", textTransform: "uppercase", color: "var(--text-muted)", fontWeight: 600, marginBottom: 8 }}>
        {label}
      </div>
      <div style={{ fontSize: 26, fontWeight: 700, fontFamily: "'DM Mono', monospace", letterSpacing: "-0.02em", color: accent ? "var(--accent)" : undefined }}>{value}</div>
      {hint && <div style={{ fontSize: 12, color: "var(--text-secondary)", marginTop: 5 }}>{hint}</div>}
    </div>
  );
}

export default function AdminOverview() {
  const [stats, setStats] = useState<Stats | null>(null);
  const [error, setError] = useState("");

  useEffect(() => {
    fetch("/api/admin/stats")
      .then(r => (r.ok ? r.json() : Promise.reject(new Error("Could not load stats"))))
      .then(setStats)
      .catch(e => setError(e.message));
  }, []);

  if (error) return <p style={{ color: "var(--danger)", fontSize: 14 }}>{error}</p>;
  if (!stats) return <p style={{ color: "var(--text-muted)", fontSize: 14 }}>Loading…</p>;

  const n = (v: unknown) => Number(v ?? 0);
  const winRate = n(stats.trades.total) > 0 ? (n(stats.trades.wins) / n(stats.trades.total)) * 100 : 0;
  const t = stats.today;
  const netToday = n(t.depositTotal) - n(t.withdrawalTotal);

  return (
    <>
      <h1 style={{ fontSize: 21, fontWeight: 700, marginBottom: 4 }}>Overview</h1>
      <p style={{ fontSize: 13, color: "var(--text-secondary)", marginBottom: 22 }}>
        Today so far, then totals across all users.
      </p>

      <div style={{ display: "flex", alignItems: "baseline", gap: 10, marginBottom: 12 }}>
        <h2 style={{ fontFamily: "'DM Mono', monospace", fontSize: 11, letterSpacing: "0.14em", color: "var(--text-muted)" }}>
          TODAY
        </h2>
        <span style={{ fontSize: 12, color: "var(--text-muted)" }}>
          since midnight · {new Date().toLocaleDateString("en-GB", { weekday: "short", day: "numeric", month: "short" })}
        </span>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(210px, 1fr))", gap: 12, marginBottom: 12 }}>
        <Stat
          accent
          label="Deposited today"
          value={money(t.depositTotal)}
          hint={`${n(t.depositCount)} deposit${n(t.depositCount) === 1 ? "" : "s"}${
            Number(t.depositPendingTotal) > 0 ? ` · ${money(t.depositPendingTotal)} still pending` : ""
          }`}
        />
        <Stat
          accent
          label="Trades today"
          value={String(n(t.tradeCount))}
          hint={
            n(t.tradeCount) > 0
              ? `${money(t.tradeStaked)} staked · ${((n(t.tradeWins) / n(t.tradeCount)) * 100).toFixed(0)}% won · ${money(t.tradePaidOut)} paid out`
              : "No trades placed yet today"
          }
        />
        <Stat
          accent
          label="Withdrawn today"
          value={money(t.withdrawalTotal)}
          hint={`${n(t.withdrawalCount)} withdrawal${n(t.withdrawalCount) === 1 ? "" : "s"}${
            n(t.withdrawalPendingCount) > 0
              ? ` · ${n(t.withdrawalPendingCount)} pending worth ${money(t.withdrawalPendingTotal)}`
              : ""
          }`}
        />
      </div>

      <p style={{ fontSize: 12, color: "var(--text-muted)", marginBottom: 26, lineHeight: 1.5 }}>
        Net today: <strong style={{ color: netToday >= 0 ? "var(--up)" : "var(--down)" }}>
          {netToday >= 0 ? "+" : "−"}{money(Math.abs(netToday))}
        </strong> in customer funds (deposits less withdrawals).
        {n(t.adjustmentCount) > 0 && (
          <> Excludes {n(t.adjustmentCount)} admin balance adjustment{n(t.adjustmentCount) === 1 ? "" : "s"} totalling{" "}
          {Number(t.adjustmentNet) >= 0 ? "+" : "−"}{money(Math.abs(Number(t.adjustmentNet)))}.</>
        )}
      </p>

      <h2 style={{ fontFamily: "'DM Mono', monospace", fontSize: 11, letterSpacing: "0.14em", color: "var(--text-muted)", marginBottom: 12 }}>
        ALL TIME
      </h2>

      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(210px, 1fr))", gap: 12, marginBottom: 26 }}>
        <Stat label="Users" value={String(n(stats.users.total))} hint={`${n(stats.users.active)} active · ${n(stats.users.marketers)} marketers · ${n(stats.users.admins)} admins`} />
        <Stat label="Customer balances" value={money(stats.users.heldBalance)} hint="Total currently credited to users" />
        <Stat label="Deposits settled" value={money(stats.transactions.deposits)} />
        <Stat label="Withdrawals settled" value={money(stats.transactions.withdrawals)} />
        <Stat label="Trades placed" value={String(n(stats.trades.total))} hint={`${winRate.toFixed(1)}% settled as wins`} />
        <Stat label="Staked / paid out" value={money(stats.trades.staked)} hint={`${money(stats.trades.paidOut)} paid out in profit`} />
      </div>

      {n(stats.transactions.pendingCount) > 0 && (
        <div style={{ ...panel, padding: "14px 18px", display: "flex", alignItems: "center", justifyContent: "space-between", gap: 14, flexWrap: "wrap" }}>
          <span style={{ fontSize: 14 }}>
            <strong>{n(stats.transactions.pendingCount)}</strong> transaction
            {n(stats.transactions.pendingCount) === 1 ? "" : "s"} awaiting settlement.
          </span>
          <Link href="/admin/transactions?status=pending" style={{ color: "var(--accent)", fontSize: 13, fontWeight: 600 }}>
            Review them →
          </Link>
        </div>
      )}
    </>
  );
}
