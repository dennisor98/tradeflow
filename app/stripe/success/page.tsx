import { Suspense } from "react";
import StripeSuccessClient from "./StripeSuccessClient";

function StripeSuccessFallback() {
  return (
    <div style={{ minHeight: "100vh", background: "var(--bg)", display: "flex", alignItems: "center", justifyContent: "center", padding: 24 }}>
      <div style={{ textAlign: "center", maxWidth: 420 }}>
        <h1 style={{ fontSize: 28, fontWeight: 700, marginBottom: 8 }}>Confirming payment...</h1>
        <p style={{ color: "var(--text-secondary)" }}>Please wait while we verify your Stripe payment.</p>
      </div>
    </div>
  );
}

export default function StripeSuccessPage() {
  return (
    <Suspense fallback={<StripeSuccessFallback />}>
      <StripeSuccessClient />
    </Suspense>
  );
}
