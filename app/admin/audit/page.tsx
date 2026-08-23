"use client";
import { useCallback, useEffect, useState } from "react";
import { Button, panel, td, th, when } from "../admin-ui";

interface Entry {
  id: string; adminEmail: string; action: string;
  targetUserEmail: string | null; details: string | null; createdAt: string;
}

export default function AdminAuditPage() {
  const [entries, setEntries] = useState<Entry[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    try {
      const res = await fetch(`/api/admin/audit?page=${page}`);
      const data = await res.json();
      setEntries(data.entries || []);
      setTotal(data.total || 0);
    } finally {
      setLoading(false);
    }
  }, [page]);

  useEffect(() => { load(); }, [load]);

  const pages = Math.max(1, Math.ceil(total / 50));

  return (
    <>
      <h1 style={{ fontSize: 21, fontWeight: 700, marginBottom: 4 }}>Audit log</h1>
      <p style={{ fontSize: 13, color: "var(--text-secondary)", marginBottom: 18 }}>
        Every administrative action, including all balance changes. Append-only.
      </p>

      <div style={{ ...panel, overflowX: "auto" }}>
        <table style={{ width: "100%", borderCollapse: "collapse", minWidth: 780 }}>
          <thead>
            <tr>
              <th style={th}>When</th><th style={th}>Admin</th><th style={th}>Action</th>
              <th style={th}>Target</th><th style={th}>Details</th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr><td style={{ ...td, color: "var(--text-muted)" }} colSpan={5}>Loading…</td></tr>
            ) : entries.length === 0 ? (
              <tr><td style={{ ...td, color: "var(--text-muted)" }} colSpan={5}>Nothing recorded yet.</td></tr>
            ) : entries.map(e => (
              <tr key={e.id}>
                <td style={{ ...td, color: "var(--text-muted)", fontSize: 12, whiteSpace: "nowrap" }}>{when(e.createdAt)}</td>
                <td style={{ ...td, fontSize: 12 }}>{e.adminEmail}</td>
                <td style={{ ...td, fontFamily: "'DM Mono', monospace", fontSize: 12, fontWeight: 500 }}>{e.action}</td>
                <td style={{ ...td, fontSize: 12, color: "var(--text-secondary)" }}>{e.targetUserEmail || "—"}</td>
                <td style={{ ...td, fontFamily: "'DM Mono', monospace", fontSize: 11, color: "var(--text-secondary)", maxWidth: 340, wordBreak: "break-all" }}>
                  {e.details || "—"}
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
