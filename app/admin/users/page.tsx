"use client";
import { useCallback, useEffect, useState } from "react";
import { Banner, Button, Tag, input, money, panel, td, th, when } from "../admin-ui";

interface Row {
  id: string; name: string; email: string; phone: string;
  balance: string; accountType: string; role: string; isActive: number; createdAt: string;
}

export default function AdminUsersPage() {
  const [rows, setRows] = useState<Row[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [q, setQ] = useState("");
  const [roleFilter, setRoleFilter] = useState("");
  const [loading, setLoading] = useState(true);
  const [selected, setSelected] = useState<Row | null>(null);
  const [message, setMessage] = useState<{ type: "error" | "success"; text: string } | null>(null);

  const load = useCallback(async () => {
    const params = new URLSearchParams({ page: String(page) });
    if (q) params.set("q", q);
    if (roleFilter) params.set("role", roleFilter);

    try {
      const res = await fetch(`/api/admin/users?${params}`);
      const data = res.ok ? await res.json() : null;
      if (data) {
        setRows(data.users);
        setTotal(data.total);
      } else {
        setMessage({ type: "error", text: "Could not load users" });
      }
    } finally {
      setLoading(false);
    }
  }, [page, q, roleFilter]);

  useEffect(() => { load(); }, [load]);

  const pages = Math.max(1, Math.ceil(total / 25));

  return (
    <>
      <h1 style={{ fontSize: 21, fontWeight: 700, marginBottom: 4 }}>Users</h1>
      <p style={{ fontSize: 13, color: "var(--text-secondary)", marginBottom: 18 }}>
        {total} account{total === 1 ? "" : "s"}. Select a row to manage balance, role and status.
      </p>

      <Banner message={message} />

      <form
        onSubmit={e => { e.preventDefault(); setLoading(true); setPage(1); load(); }}
        style={{ display: "flex", gap: 8, marginBottom: 14, flexWrap: "wrap" }}
      >
        <input
          placeholder="Search name, email or phone"
          value={q}
          onChange={e => setQ(e.target.value)}
          style={{ ...input, flex: 1, minWidth: 200 }}
        />
        <select value={roleFilter} onChange={e => { setLoading(true); setRoleFilter(e.target.value); setPage(1); }} style={{ ...input, cursor: "pointer" }}>
          <option value="">All roles</option>
          <option value="user">User</option>
          <option value="marketer">Marketer</option>
          <option value="admin">Admin</option>
        </select>
        <Button type="submit" tone="primary">Search</Button>
      </form>

      <div style={{ ...panel, overflowX: "auto" }}>
        <table style={{ width: "100%", borderCollapse: "collapse", minWidth: 720 }}>
          <thead>
            <tr>
              <th style={th}>Name</th><th style={th}>Email</th><th style={th}>Balance</th>
              <th style={th}>Tier</th><th style={th}>Role</th><th style={th}>Status</th>
              <th style={th}>Joined</th><th style={th} />
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr><td style={{ ...td, color: "var(--text-muted)" }} colSpan={8}>Loading…</td></tr>
            ) : rows.length === 0 ? (
              <tr><td style={{ ...td, color: "var(--text-muted)" }} colSpan={8}>No users match that search.</td></tr>
            ) : rows.map(r => (
              <tr key={r.id}>
                <td style={{ ...td, fontWeight: 600 }}>{r.name}</td>
                <td style={{ ...td, color: "var(--text-secondary)" }}>{r.email}</td>
                <td style={{ ...td, fontFamily: "'DM Mono', monospace", fontWeight: 600 }}>{money(r.balance)}</td>
                <td style={td}><Tag value={r.accountType} /></td>
                <td style={td}><Tag value={r.role} /></td>
                <td style={td}><Tag value={r.isActive === 1 ? "active" : "inactive"} /></td>
                <td style={{ ...td, color: "var(--text-muted)", fontSize: 12 }}>{when(r.createdAt)}</td>
                <td style={td}><Button onClick={() => { setSelected(r); setMessage(null); }}>Manage</Button></td>
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

      {selected && (
        <ManageUser
          user={selected}
          onClose={() => setSelected(null)}
          onDone={(text) => { setMessage({ type: "success", text }); setSelected(null); load(); }}
        />
      )}
    </>
  );
}

function ManageUser({ user, onClose, onDone }: { user: Row; onClose: () => void; onDone: (text: string) => void }) {
  const [amount, setAmount] = useState("");
  const [reason, setReason] = useState("");
  const [role, setRole] = useState(user.role);
  const [tier, setTier] = useState(user.accountType);
  const [isActive, setIsActive] = useState(user.isActive === 1);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  const adjust = async (sign: 1 | -1) => {
    const value = parseFloat(amount);
    if (!Number.isFinite(value) || value <= 0) return setError("Enter an amount greater than zero");
    if (reason.trim().length < 3) return setError("Give a reason — it is written to the audit log");
    setBusy(true); setError("");
    try {
      const res = await fetch(`/api/admin/users/${user.id}/balance`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ amount: sign * value, reason: reason.trim() }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      onDone(`${user.name}: balance ${money(data.balanceBefore)} → ${money(data.balanceAfter)}`);
    } catch (e) {
      setError((e as Error).message);
      setBusy(false);
    }
  };

  const saveProfile = async () => {
    setBusy(true); setError("");
    try {
      const res = await fetch(`/api/admin/users/${user.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ role, accountType: tier, isActive }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      onDone(`${user.name}: profile updated`);
    } catch (e) {
      setError((e as Error).message);
      setBusy(false);
    }
  };

  const label: React.CSSProperties = { fontSize: 12, fontWeight: 600, color: "var(--text-secondary)", display: "block", marginBottom: 5 };

  return (
    <div
      onClick={onClose}
      style={{ position: "fixed", inset: 0, background: "rgba(10,20,15,0.55)", display: "grid", placeItems: "center", padding: 20, zIndex: 100, overflowY: "auto" }}
    >
      <div onClick={e => e.stopPropagation()} style={{ ...panel, width: "100%", maxWidth: 460, padding: 22 }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 4 }}>
          <h2 style={{ fontSize: 17, fontWeight: 700 }}>{user.name}</h2>
          <button onClick={onClose} style={{ background: "none", border: "none", fontSize: 20, cursor: "pointer", color: "var(--text-muted)", lineHeight: 1 }}>×</button>
        </div>
        <p style={{ fontSize: 13, color: "var(--text-secondary)", marginBottom: 4 }}>{user.email} · {user.phone}</p>
        <p style={{ fontFamily: "'DM Mono', monospace", fontSize: 22, fontWeight: 700, marginBottom: 18 }}>{money(user.balance)}</p>

        {error && (
          <div style={{ background: "var(--down-bg)", color: "var(--down)", border: "1px solid var(--down)", padding: "10px 12px", borderRadius: "var(--radius-sm)", fontSize: 13, marginBottom: 14 }}>
            {error}
          </div>
        )}

        <div style={{ borderTop: "1px solid var(--border)", paddingTop: 16, marginBottom: 18 }}>
          <h3 style={{ fontSize: 13, fontWeight: 700, marginBottom: 10 }}>Adjust balance</h3>
          <div style={{ display: "flex", gap: 8, marginBottom: 10 }}>
            <input
              type="number" step="0.01" min="0" placeholder="0.00" value={amount}
              onChange={e => setAmount(e.target.value)}
              style={{ ...input, flex: 1, fontFamily: "'DM Mono', monospace" }}
            />
          </div>
          <input
            placeholder="Reason (recorded in the audit log)"
            value={reason}
            onChange={e => setReason(e.target.value)}
            style={{ ...input, width: "100%", marginBottom: 10 }}
          />
          <div style={{ display: "flex", gap: 8 }}>
            <Button tone="primary" onClick={() => adjust(1)} disabled={busy}>Credit</Button>
            <Button tone="danger" onClick={() => adjust(-1)} disabled={busy}>Debit</Button>
          </div>
        </div>

        <div style={{ borderTop: "1px solid var(--border)", paddingTop: 16 }}>
          <h3 style={{ fontSize: 13, fontWeight: 700, marginBottom: 10 }}>Profile</h3>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10, marginBottom: 12 }}>
            <div>
              <label style={label}>Role</label>
              <select value={role} onChange={e => setRole(e.target.value)} style={{ ...input, width: "100%", cursor: "pointer" }}>
                <option value="user">User</option>
                <option value="marketer">Marketer</option>
                <option value="admin">Admin</option>
              </select>
            </div>
            <div>
              <label style={label}>Tier</label>
              <select value={tier} onChange={e => setTier(e.target.value)} style={{ ...input, width: "100%", cursor: "pointer" }}>
                <option value="normal">Normal</option>
                <option value="vip">VIP</option>
                <option value="vvip">VVIP</option>
              </select>
            </div>
          </div>
          <label style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 13, marginBottom: 14, cursor: "pointer" }}>
            <input type="checkbox" checked={isActive} onChange={e => setIsActive(e.target.checked)} />
            Account active (can sign in and trade)
          </label>
          <Button tone="primary" onClick={saveProfile} disabled={busy}>Save profile</Button>
        </div>
      </div>
    </div>
  );
}
