import Link from "next/link";

export default function StripeCancelPage() {
  return (
    <div style={{ minHeight: "100vh", background: "var(--bg)", display: "flex", alignItems: "center", justifyContent: "center", padding: 24 }}>
      <div style={{ maxWidth: 480, width: "100%", textAlign: "center", background: "var(--surface)", border: "1px solid var(--border)", borderRadius: "var(--radius-lg)", padding: 24 }}>
        <h1 style={{ fontSize: 28, fontWeight: 700, marginBottom: 10 }}>Checkout canceled</h1>
        <p style={{ color: "var(--text-secondary)", marginBottom: 20 }}>
          Your Stripe payment was canceled. No funds were charged.
        </p>
        <Link href="/" style={{ display: "inline-block", padding: "12px 18px", background: "var(--accent)", color: "white", borderRadius: "var(--radius)", textDecoration: "none", fontWeight: 600 }}>
          Return to TradeFlow
        </Link>
      </div>
    </div>
  );
}
