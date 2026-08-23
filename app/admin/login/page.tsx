"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { Banner, Button, input, panel } from "../admin-ui";

export default function AdminLoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState<{ type: "error" | "success"; text: string } | null>(null);

  const signIn = async () => {
    setLoading(true);
    setMessage(null);
    const res = await fetch("/api/admin/login", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email, password }),
    }).catch(() => null);

    const data = res ? await res.json().catch(() => ({})) : {};

    if (res && res.ok) {
      router.replace("/admin");
      return;
    }
    setMessage({ type: "error", text: data.error || "Could not reach the server" });
    setLoading(false);
  };

  const label: React.CSSProperties = {
    fontSize: 12,
    fontWeight: 600,
    color: "var(--text-secondary)",
    display: "block",
    marginBottom: 5,
  };

  return (
    <div style={{ minHeight: "100vh", background: "var(--ink)", display: "grid", placeItems: "center", padding: 24 }}>
      <div style={{ width: "100%", maxWidth: 380 }}>
        <p
          style={{
            fontFamily: "'DM Mono', monospace",
            fontSize: 13,
            letterSpacing: "0.16em",
            color: "var(--on-ink)",
            marginBottom: 20,
            textAlign: "center",
          }}
        >
          WINTRADEIN <span style={{ color: "var(--accent-bright)" }}>ADMIN</span>
        </p>

        <div style={{ ...panel, padding: 24 }}>
          <h1 style={{ fontSize: 19, fontWeight: 700, marginBottom: 6 }}>Sign in</h1>
          <p style={{ fontSize: 13, color: "var(--text-secondary)", marginBottom: 18, lineHeight: 1.5 }}>
            Administrator access only.
          </p>

          <Banner message={message} />

          <form
            onSubmit={e => {
              e.preventDefault();
              if (email && password && !loading) signIn();
            }}
          >
            <label style={label} htmlFor="admin-email">Email</label>
            <input
              id="admin-email"
              type="email"
              required
              autoFocus
              autoComplete="username"
              placeholder="admin@example.com"
              value={email}
              onChange={e => setEmail(e.target.value)}
              style={{ ...input, width: "100%", marginBottom: 14 }}
            />

            <label style={label} htmlFor="admin-password">Password</label>
            <input
              id="admin-password"
              type="password"
              required
              autoComplete="current-password"
              placeholder="••••••••••••"
              value={password}
              onChange={e => setPassword(e.target.value)}
              style={{ ...input, width: "100%", marginBottom: 18 }}
            />

            <Button type="submit" tone="primary" disabled={loading || !email || !password}>
              {loading ? "Signing in…" : "Sign in"}
            </Button>
          </form>
        </div>
      </div>
    </div>
  );
}
