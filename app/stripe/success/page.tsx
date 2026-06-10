"use client";

import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { useEffect, useState } from "react";

type ConfirmResult = {
  success?: boolean;
  amountUsd?: number;
  alreadyProcessed?: boolean;
  error?: string;
};

export default function StripeSuccessPage() {
  const searchParams = useSearchParams();
  const sessionId = searchParams.get("session_id");

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [amountUsd, setAmountUsd] = useState<number | null>(null);
  const [alreadyProcessed, setAlreadyProcessed] = useState(false);

  useEffect(() => {
    const confirmPayment = async () => {
      if (!sessionId) {
        setError("Missing Stripe session ID.");
        setLoading(false);
        return;
      }

      try {
        const response = await fetch(`/api/stripe/confirm-session?session_id=${encodeURIComponent(sessionId)}`);
        const data = await response.json() as ConfirmResult;

        if (!response.ok || !data.success) {
          setError(data.error || "Unable to confirm payment. Please contact support.");
          setLoading(false);
          return;
        }

        if (typeof data.amountUsd === "number") {
          setAmountUsd(data.amountUsd);
        }

        setAlreadyProcessed(Boolean(data.alreadyProcessed));
        setLoading(false);
      } catch {
        setError("Unable to confirm payment. Please contact support.");
        setLoading(false);
      }
    };

    confirmPayment();
  }, [sessionId]);

  if (loading) {
    return (
      <div style={{ minHeight: "100vh", background: "var(--bg)", display: "flex", alignItems: "center", justifyContent: "center", padding: 24 }}>
        <div style={{ textAlign: "center", maxWidth: 420 }}>
          <h1 style={{ fontSize: 28, fontWeight: 700, marginBottom: 8 }}>Confirming payment...</h1>
          <p style={{ color: "var(--text-secondary)" }}>Please wait while we verify your Stripe payment.</p>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div style={{ minHeight: "100vh", background: "var(--bg)", display: "flex", alignItems: "center", justifyContent: "center", padding: 24 }}>
        <div style={{ maxWidth: 480, width: "100%", textAlign: "center", background: "var(--surface)", border: "1px solid var(--border)", borderRadius: "var(--radius-lg)", padding: 24 }}>
          <h1 style={{ fontSize: 26, fontWeight: 700, marginBottom: 10 }}>Payment confirmation failed</h1>
          <p style={{ color: "var(--text-secondary)", marginBottom: 20 }}>{error}</p>
          <Link href="/" style={{ display: "inline-block", padding: "12px 18px", background: "var(--accent)", color: "white", borderRadius: "var(--radius)", textDecoration: "none", fontWeight: 600 }}>
            Return to TradeFlow
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div style={{ minHeight: "100vh", background: "var(--bg)", display: "flex", alignItems: "center", justifyContent: "center", padding: 24 }}>
      <div style={{ maxWidth: 480, width: "100%", textAlign: "center", background: "var(--surface)", border: "1px solid var(--border)", borderRadius: "var(--radius-lg)", padding: 24 }}>
        <div style={{ width: 80, height: 80, borderRadius: "50%", background: "var(--up-bg)", display: "flex", alignItems: "center", justifyContent: "center", margin: "0 auto 18px", fontSize: 36 }}>✓</div>
        <h1 style={{ fontSize: 28, fontWeight: 700, marginBottom: 8 }}>Payment successful</h1>
        <p style={{ color: "var(--text-secondary)", marginBottom: 12 }}>
          {alreadyProcessed ? "This Stripe payment was already applied to your account." : "Your Stripe payment has been applied to your TradeFlow account."}
        </p>
        {amountUsd !== null && (
          <p style={{ fontSize: 20, fontWeight: 700, marginBottom: 20, color: "var(--up)" }}>
            ${amountUsd.toFixed(2)} credited
          </p>
        )}
        <Link href="/" style={{ display: "inline-block", padding: "12px 18px", background: "var(--accent)", color: "white", borderRadius: "var(--radius)", textDecoration: "none", fontWeight: 600 }}>
          Back to TradeFlow
        </Link>
      </div>
    </div>
  );
}
