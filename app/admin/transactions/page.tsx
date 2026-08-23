"use client";
import { Suspense, useCallback, useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import { Banner, Button, Tag, input, money, panel, td, th, when } from "../admin-ui";

interface Row {
  id: string; userId: string; userName: string; userEmail: string;
  type: string; amount: string; status: string; label: string; createdAt: string;
}

function TransactionsView() {
  const searchParams = useSearchParams();
  const [rows, setRows] = useState<Row[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [status, setStatus] = useState(searchParams.get("status") || "");
  const [type, setType] = useState("");
  const [q, setQ] = useState("");
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState("");
  const [unrecorded, setUnrecorded] = useState(0);
  const [reconciling, setReconciling] = useState(false);
  const [message, setMessage] = useState<{ type: "error" | "success"; text: string } | null>(null);

  const load = useCallback(async () => {
    const params = new URLSearchParams({ page: String(page) });
    if (status) params.set("status", status);
    if (type) params.set("type", type);
    if (q) params.set("q", q);

    try {
      const res = await fetch(`/api/admin/transactions?${params}`);
      const data = res.ok ? await res.json() : null;
      if (data) {
        setRows(data.transactions);
        setTotal(data.total);
      } else {
        setMessage({ type: "error", text: "Could not load transactions" });
      }
    } finally {
      setLoading(false);
    }
  }, [page, status, type, q]);

  useEffect(() => { load(); }, [load]);

  useEffect(() => {
    fetch("/api/admin/mpesa/reconcile")
      .then(r => (r.ok ? r.json() : null))
      .then(d => { if (d) setUnrecorded(d.unrecordedFailures); })
      .catch(() => {});
  }, []);

  const reconcile = async (dryRun: boolean) => {
    setReconciling(true);
    setMessage(null);
    const res = await fetch("/api/admin/mpesa/reconcile", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ dryRun }),
    }).catch(() => null);
    const d = res ? await res.json().catch(() => null) : null;

    if (!d || d.error) {
      setMessage({ type: "error", text: d?.error || "Reconcile failed" });
    } else {
      const parts = Object.entries(d.summary as Record<string, number>).map(([k, v]) => `${v} ${k.replace(/-/g, " ")}`);
      setMessage({
        type: "success",
        text: `${dryRun ? "Dry run — nothing changed. Would apply" : "Reconciled"}: ${parts.join(", ") || "no changes needed"} (${d.examined} examined).`,
      });
      if (!dryRun) load();
    }
    setReconciling(false);
  };

  const settle = async (row: Row, next: "completed" | "failed") => {
    const credit =
      next === "completed" &&
      row.type === "deposit" &&
      confirm(`Credit ${money(row.amount)} to ${row.userName}'s balance as well as marking this deposit completed?`);

    setBusyId(row.id);
    setMessage(null);
    try {
      const res = await fetch(`/api/admin/transactions/${row.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: next, creditBalance: credit }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      setMessage({
        type: "success",
        text: `Marked ${next}${data.balanceAfter !== null ? ` · balance now ${money(data.balanceAfter)}` : ""}`,
      });
      load();
    } catch (error) {
      setMessage({ type: "error", text: (error as Error).message });
    } finally {
      setBusyId("");
    }
  };

  const pages = Math.max(1, Math.ceil(total / 30));

  return (
    <>
      <h1 style={{ fontSize: 21, fontWeight: 700, marginBottom: 4 }}>Transactions</h1>
      <p style={{ fontSize: 13, color: "var(--text-secondary)", marginBottom: 18 }}>
        {total} record{total === 1 ? "" : "s"}. Pending deposits can be settled and credited here.
      </p>

      <Banner message={message} />

      <div style={{ ...panel, padding: "14px 16px", marginBottom: 14, display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
        <div style={{ flex: 1, minWidth: 240 }}>
          <div style={{ fontSize: 13, fontWeight: 600, marginBottom: 2 }}>Reconcile M-Pesa with Safaricom</div>
          <div style={{ fontSize: 12, color: "var(--text-secondary)", lineHeight: 1.5 }}>
            Asks Safaricom about every unresolved push: settles ones stuck pending, credits any
            wrongly written off, and adds history rows for failures that have none.
            {unrecorded > 0 && (
              <strong style={{ color: "var(--warning)" }}> {unrecorded} failure{unrecorded === 1 ? "" : "s"} currently missing a record.</strong>
            )}
          </div>
        </div>
        <Button onClick={() => reconcile(true)} disabled={reconciling}>
          {reconciling ? "Working…" : "Preview"}
        </Button>
        <Button tone="primary" onClick={() => reconcile(false)} disabled={reconciling}>
          Reconcile now
        </Button>
      </div>

      <form
        onSubmit={e => { e.preventDefault(); setLoading(true); setPage(1); load(); }}
        style={{ display: "flex", gap: 8, marginBottom: 14, flexWrap: "wrap" }}
      >
        <input placeholder="Search user or label" value={q} onChange={e => setQ(e.target.value)} style={{ ...input, flex: 1, minWidth: 190 }} />
        <select value={status} onChange={e => { setLoading(true); setStatus(e.target.value); setPage(1); }} style={{ ...input, cursor: "pointer" }}>
          <option value="">Any status</option>
          <option value="pending">Pending</option>
          <option value="completed">Completed</option>
          <option value="failed">Failed</option>
        </select>
        <select value={type} onChange={e => { setLoading(true); setType(e.target.value); setPage(1); }} style={{ ...input, cursor: "pointer" }}>
          <option value="">Any type</option>
          <option value="deposit">Deposit</option>
          <option value="withdrawal">Withdrawal</option>
          <option value="trade_win">Trade win</option>
          <option value="trade_loss">Trade loss</option>
        </select>
        <Button type="submit" tone="primary">Search</Button>
      </form>

      <div style={{ ...panel, overflowX: "auto" }}>
        <table style={{ width: "100%", borderCollapse: "collapse", minWidth: 800 }}>
          <thead>
            <tr>
              <th style={th}>User</th><th style={th}>Type</th><th style={th}>Amount</th>
              <th style={th}>Status</th><th style={th}>Label</th><th style={th}>When</th><th style={th} />
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr><td style={{ ...td, color: "var(--text-muted)" }} colSpan={7}>Loading…</td></tr>
            ) : rows.length === 0 ? (
              <tr><td style={{ ...td, color: "var(--text-muted)" }} colSpan={7}>No transactions match those filters.</td></tr>
            ) : rows.map(r => (
              <tr key={r.id}>
                <td style={td}>
                  <div style={{ fontWeight: 600 }}>{r.userName}</div>
                  <div style={{ fontSize: 12, color: "var(--text-muted)" }}>{r.userEmail}</div>
                </td>
                <td style={{ ...td, fontSize: 12 }}>{r.type.replace("_", " ")}</td>
                <td style={{ ...td, fontFamily: "'DM Mono', monospace", fontWeight: 600 }}>{money(r.amount)}</td>
                <td style={td}><Tag value={r.status} /></td>
                <td style={{ ...td, color: "var(--text-secondary)", fontSize: 12, maxWidth: 240 }}>{r.label}</td>
                <td style={{ ...td, color: "var(--text-muted)", fontSize: 12 }}>{when(r.createdAt)}</td>
                <td style={td}>
                  {r.status === "pending" && (
                    <div style={{ display: "flex", gap: 6 }}>
                      <Button tone="primary" disabled={busyId === r.id} onClick={() => settle(r, "completed")}>Approve</Button>
                      <Button tone="danger" disabled={busyId === r.id} onClick={() => settle(r, "failed")}>Reject</Button>
                    </div>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div style={{ display: "flex", gap: 8, alignItems: "center", marginTop: 14 }}>
        <Button onClick={() => { setLoading(true); setPage(p => Math.max(1, p - 1)); }} disabled={page <= 1}>Previous</Button>
        <span style={{ fontSize: 13, color: "var(--text-secondary)" }}>Page {page} of {pages}</span>
        <Button onClick={() => { setLoading(true); setPage(p => Math.min(pages, p + 1)); }} disabled={page >= pages}>Next</Button>
      </div>
    </>
  );
}

export default function AdminTransactionsPage() {
  return (
    <Suspense fallback={<p style={{ color: "var(--text-muted)", fontSize: 14 }}>Loading…</p>}>
      <TransactionsView />
    </Suspense>
  );
}
