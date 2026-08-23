"use client";
import { useEffect, useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import Link from "next/link";

const NAV = [
  { href: "/admin", label: "Overview" },
  { href: "/admin/users", label: "Users" },
  { href: "/admin/transactions", label: "Transactions" },
  { href: "/admin/audit", label: "Audit log" },
  { href: "/admin/settings", label: "Settings" },
];

export default function AdminShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const isLoginPage = pathname === "/admin/login";
  const [admin, setAdmin] = useState<{ name: string; email: string } | null>(null);
  const [checked, setChecked] = useState(false);

  // The API routes are the real access boundary — every /api/admin handler
  // calls requireAdmin(). This check only decides what chrome to render.
  useEffect(() => {
    let cancelled = false;
    fetch("/api/admin/me")
      .then(r => (r.ok ? r.json() : null))
      .then(data => {
        if (cancelled) return;
        setAdmin(data?.admin ?? null);
        setChecked(true);
        if (!data?.admin && !isLoginPage) router.replace("/admin/login");
      })
      .catch(() => {
        if (!cancelled) setChecked(true);
      });
    return () => {
      cancelled = true;
    };
  }, [pathname, isLoginPage, router]);

  const signOut = async () => {
    await fetch("/api/admin/logout", { method: "POST" });
    router.replace("/admin/login");
  };

  if (isLoginPage) return <>{children}</>;

  if (!checked || !admin) {
    return (
      <div style={{ minHeight: "100vh", display: "grid", placeItems: "center", background: "var(--bg)" }}>
        <p style={{ color: "var(--text-muted)", fontSize: 14 }}>
          {checked ? "Redirecting to sign in…" : "Checking your session…"}
        </p>
      </div>
    );
  }

  return (
    <div style={{ minHeight: "100vh", background: "var(--bg)" }}>
      <header
        style={{
          background: "var(--ink)",
          borderBottom: "1px solid rgba(255,255,255,0.08)",
          padding: "0 20px",
          position: "sticky",
          top: 0,
          zIndex: 40,
        }}
      >
        <div style={{ maxWidth: 1180, margin: "0 auto", display: "flex", alignItems: "center", gap: 24, height: 56 }}>
          <span
            style={{
              fontFamily: "'DM Mono', monospace",
              fontSize: 13,
              letterSpacing: "0.16em",
              color: "var(--on-ink)",
              fontWeight: 500,
              whiteSpace: "nowrap",
            }}
          >
            WINTRADEIN <span style={{ color: "var(--accent-bright)" }}>ADMIN</span>
          </span>
          <nav style={{ display: "flex", gap: 4, flex: 1, overflowX: "auto" }}>
            {NAV.map(item => {
              const active = pathname === item.href;
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  style={{
                    padding: "7px 12px",
                    borderRadius: 7,
                    fontSize: 13,
                    fontWeight: active ? 600 : 500,
                    textDecoration: "none",
                    whiteSpace: "nowrap",
                    color: active ? "var(--on-ink)" : "var(--on-ink-muted)",
                    background: active ? "rgba(255,255,255,0.1)" : "transparent",
                  }}
                >
                  {item.label}
                </Link>
              );
            })}
          </nav>
          <span style={{ fontSize: 12, color: "var(--on-ink-muted)", whiteSpace: "nowrap" }}>{admin.email}</span>
          <button
            onClick={signOut}
            style={{
              background: "transparent",
              border: "1px solid rgba(255,255,255,0.10)",
              color: "var(--on-ink)",
              padding: "6px 12px",
              borderRadius: 7,
              fontSize: 12,
              fontWeight: 600,
              cursor: "pointer",
              fontFamily: "inherit",
            }}
          >
            Sign out
          </button>
        </div>
      </header>
      <main style={{ maxWidth: 1180, margin: "0 auto", padding: "24px 20px 64px" }}>{children}</main>
    </div>
  );
}
