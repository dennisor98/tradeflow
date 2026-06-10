"use client";
import { useState, useEffect } from "react";
import { useApp } from "../context/AppContext";
import { QRCodeSVG } from "qrcode.react";

const METHODS = [
  { id: "card", label: "Card (Stripe Checkout)", icon: "💳", fee: "Standard", time: "Instant" },
  { id: "mpesa", label: "M-Pesa", icon: "📱", fee: "Free", time: "Instant" },
  { id: "crypto", label: "USDT / Crypto", icon: "🔐", fee: "Free", time: "~10 min" },
];

const PRESETS = [10, 25, 50, 100, 250, 500, 1000, 2000, 5000];

const USD_TO_KES_RATE = 130; // Conversion rate

export default function Deposit() {
  const { navigate, addBalance, addTransaction, refreshData, userId } = useApp();
  const [method, setMethod] = useState(METHODS[0]);
  const [amount, setAmount] = useState("");
  const [step, setStep] = useState<"form" | "confirm" | "crypto" | "txid" | "mpesa" | "success">("form");
  const [phone, setPhone] = useState("");
  const [loading, setLoading] = useState(false);
  const [cryptoAddress, setCryptoAddress] = useState<string>("");
  const [txId, setTxId] = useState("");
  const [verifying, setVerifying] = useState(false);
  const [depositId, setDepositId] = useState<string>("");
  const [mpesaStatus, setMpesaStatus] = useState<"pending" | "completed" | "failed">("pending");
  const [message, setMessage] = useState<{ type: "error" | "success"; text: string } | null>(null);

  const numAmount = parseFloat(amount) || 0;
  const fee = 0;
  const total = numAmount + fee;

  // Fetch crypto address when crypto method is selected
  useEffect(() => {
    if (method.id === "crypto" && !cryptoAddress) {
      fetch("/api/crypto/address")
        .then(res => res.json())
        .then(data => {
          console.log("Fetched crypto address data:", data);
          if (data.address) {
            const addressStr = String(data.address);
            console.log("Setting crypto address as string:", addressStr);
            setCryptoAddress(addressStr);
          }
        })
        .catch(err => console.error("Failed to fetch crypto address:", err));
    }
  }, [method.id, cryptoAddress]);

  // Poll M-Pesa transaction status
  useEffect(() => {
    if (step === "mpesa" && mpesaStatus === "pending" && depositId) {
      const pollInterval = setInterval(async () => {
        try {
          // Poll the database to check transaction status
          const response = await fetch(`/api/mpesa/status?transactionId=${depositId}`);
          const data = await response.json();
          
          if (data.status === "completed") {
            setMpesaStatus("completed");
            setMessage({ type: "success", text: "Payment completed successfully!" });
            await refreshData();
            clearInterval(pollInterval);
          } else if (data.status === "failed") {
            setMpesaStatus("failed");
            setMessage({ type: "error", text: data.message || "Payment failed or was cancelled." });
            clearInterval(pollInterval);
          }
        } catch (error) {
          console.error("Error polling M-Pesa status:", error);
        }
      }, 3000); // Poll every 3 seconds

      return () => clearInterval(pollInterval);
    }
  }, [step, mpesaStatus, depositId, refreshData]);

  // Auto-hide messages after 5 seconds
  useEffect(() => {
    if (message) {
      const timer = setTimeout(() => setMessage(null), 5000);
      return () => clearTimeout(timer);
    }
  }, [message]);

  const handleDeposit = async () => {
    let redirectInitiated = false;
    setLoading(true);
    try {
      if (method.id === "card") {
        if (!userId) {
          setMessage({ type: "error", text: "Please log in to make a deposit" });
          setLoading(false);
          return;
        }

        const response = await fetch("/api/stripe/create-checkout-session", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ amount: numAmount, userId }),
        });
        const data = await response.json();

        if (!response.ok || !data.url) {
          setMessage({ type: "error", text: data.error || "Unable to start Stripe checkout" });
          setLoading(false);
          return;
        }
        redirectInitiated = true;
        window.location.assign(data.url);
        return;
      } else if (method.id === "crypto") {
        // For crypto, create a pending deposit and show crypto address
        const id = crypto.randomUUID();
        setDepositId(id);
        await addTransaction({ id, type: "deposit", amount: numAmount, time: Date.now(), status: "pending", label: `Crypto Deposit via ${method.label}` });
        setStep("crypto");
      } else if (method.id === "mpesa") {
        // For M-Pesa, initiate STK push
        if (!userId) {
          setMessage({ type: "error", text: "Please log in to make a deposit" });
          setLoading(false);
          return;
        }
        const kesAmount = numAmount * USD_TO_KES_RATE;
        const response = await fetch("/api/mpesa/stkpush", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ phone, amount: kesAmount, userId }),
        });
        const data = await response.json();
        
        if (data.success) {
          setDepositId(data.transactionId);
          setStep("mpesa");
          setMessage({ type: "success", text: "STK push sent successfully. Please check your phone." });
        } else {
          setMessage({ type: "error", text: data.error || "M-Pesa STK push failed" });
        }
      } else {
        // For other methods, process immediately
        await addBalance(numAmount);
        await addTransaction({ id: crypto.randomUUID(), type: "deposit", amount: numAmount, time: Date.now(), status: "completed", label: `Deposit via ${method.label}` });
        setStep("success");
      }
    } catch (error) {
      console.error('Deposit error:', error);
    } finally {
      if (!redirectInitiated) {
        setLoading(false);
      }
    }
  };

  const handleVerifyTxId = async () => {
    if (!txId) {
      setMessage({ type: "error", text: "Transaction ID is required" });
      return;
    }
    if (!userId) {
      setMessage({ type: "error", text: "Please log in to verify your deposit" });
      return;
    }

    setVerifying(true);
    try {
      const response = await fetch("/api/crypto/verify", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ txId, amount: numAmount, userId }),
      });

      const data = await response.json();

      if (data.verified) {
        // Update balance and mark transaction as completed
        await addBalance(numAmount);
        await addTransaction({ id: depositId, type: "deposit", amount: numAmount, time: Date.now(), status: "completed", label: `Crypto Deposit via ${method.label} (TX: ${txId.slice(0, 8)}...)` });
        setStep("success");
      } else {
        setMessage({ type: "error", text: data.message || "Transaction verification failed. Please check the transaction ID and try again." });
      }
    } catch (error) {
      console.error("Verification error:", error);
      setMessage({ type: "error", text: "Failed to verify transaction. Please try again." });
    } finally {
      setVerifying(false);
    }
  };

  if (step === "crypto") return (
    <div style={{ minHeight: "100vh", background: "var(--bg)" }}>
      <div style={{ background: "var(--surface)", borderBottom: "1px solid var(--border)", padding: "14px 16px", display: "flex", alignItems: "center", gap: 12, position: "sticky", top: 0, zIndex: 50 }}>
        <button onClick={() => setStep("confirm")} style={{ background: "none", border: "none", color: "var(--text-secondary)", fontSize: 22, cursor: "pointer" }}>←</button>
        <h1 style={{ fontWeight: 700, fontSize: 18 }}>Crypto Deposit</h1>
      </div>

      <div style={{ maxWidth: 480, margin: "0 auto", padding: "16px" }}>
        <div style={{ background: "var(--surface)", borderRadius: "var(--radius-lg)", border: "1px solid var(--border)", padding: "24px", marginBottom: 16, textAlign: "center" }}>
          <div style={{ fontSize: 48, marginBottom: 12 }}>🔐</div>
          <p style={{ color: "var(--text-muted)", fontSize: 14 }}>Deposit Amount</p>
          <p style={{ fontSize: 44, fontWeight: 700, color: "var(--text-primary)", fontFamily: "'DM Mono', monospace", margin: "8px 0" }}>${numAmount.toFixed(2)}</p>
        </div>

        <div style={{ background: "var(--surface)", borderRadius: "var(--radius-lg)", border: "1px solid var(--border)", padding: "20px", marginBottom: 16 }}>
          <h3 style={{ fontWeight: 600, fontSize: 16, marginBottom: 16 }}>Send USDT to this address</h3>
          
          {/* QR Code */}
          <div style={{ display: "flex", justifyContent: "center", marginBottom: 16 }}>
            <div style={{ background: "white", padding: 12, borderRadius: 8, border: "1px solid var(--border)" }}>
              <QRCodeSVG value={cryptoAddress} size={180} level="M" />
            </div>
          </div>

          {/* Address with inline copy button */}
          <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 12 }}>
            <div style={{ flex: 1, background: "var(--bg)", borderRadius: 8, padding: "10px 12px", wordBreak: "break-all", fontFamily: "'DM Mono', monospace", fontSize: 12, color: "var(--text-primary)" }}>
              {cryptoAddress}
            </div>
            <button
              onClick={() => { navigator.clipboard.writeText(cryptoAddress); }}
              style={{ padding: "10px 12px", background: "var(--accent)", color: "white", border: "none", borderRadius: 8, fontSize: 12, fontWeight: 600, cursor: "pointer", fontFamily: "inherit", whiteSpace: "nowrap" }}
            >
              Copy
            </button>
          </div>

          <p style={{ fontSize: 12, color: "var(--text-muted)", marginTop: 12, textAlign: "center" }}>
            Send exactly ${numAmount.toFixed(2)} USDT to the address above. Transaction may take 10-30 minutes to confirm.
          </p>
        </div>

        <button onClick={() => setStep("txid")} style={{ width: "100%", padding: "16px", background: "var(--accent)", color: "white", border: "none", borderRadius: "var(--radius)", fontSize: 15, fontWeight: 600, cursor: "pointer", fontFamily: "inherit" }}>
          I&apos;ve Sent the Payment
        </button>
      </div>
    </div>
  );

  if (step === "mpesa") return (
    <div style={{ minHeight: "100vh", background: "var(--bg)" }}>
      <div style={{ background: "var(--surface)", borderBottom: "1px solid var(--border)", padding: "14px 16px", display: "flex", alignItems: "center", gap: 12, position: "sticky", top: 0, zIndex: 50 }}>
        <button onClick={() => setStep("form")} style={{ background: "none", border: "none", color: "var(--text-secondary)", fontSize: 22, cursor: "pointer" }}>←</button>
        <h1 style={{ fontWeight: 700, fontSize: 18 }}>M-Pesa Payment</h1>
      </div>

      <div style={{ maxWidth: 480, margin: "0 auto", padding: "16px" }}>
        <div style={{ background: "var(--surface)", borderRadius: "var(--radius-lg)", border: "1px solid var(--border)", padding: "24px", marginBottom: 16, textAlign: "center" }}>
          <div style={{ fontSize: 48, marginBottom: 12 }}>📱</div>
          <p style={{ color: "var(--text-muted)", fontSize: 14 }}>Deposit Amount</p>
          <p style={{ fontSize: 44, fontWeight: 700, color: "var(--text-primary)", fontFamily: "'DM Mono', monospace", margin: "8px 0" }}>${numAmount.toFixed(2)}</p>
          <p style={{ fontSize: 20, fontWeight: 600, color: "var(--accent)", fontFamily: "'DM Mono', monospace", marginTop: 8 }}>KES {(numAmount * USD_TO_KES_RATE).toFixed(0)}</p>
          <p style={{ fontSize: 12, color: "var(--text-muted)", marginTop: 4 }}>Exchange rate: 1 USD = {USD_TO_KES_RATE} KES</p>
        </div>

        <div style={{ background: "var(--surface)", borderRadius: "var(--radius-lg)", border: "1px solid var(--border)", padding: "20px", marginBottom: 16 }}>
          {mpesaStatus === "pending" ? (
            <>
              <h3 style={{ fontWeight: 600, fontSize: 16, marginBottom: 16, textAlign: "center" }}>Check your phone</h3>
              <p style={{ fontSize: 14, color: "var(--text-muted)", textAlign: "center", marginBottom: 16 }}>
                We&apos;ve sent an STK push to {phone}. Please enter your M-Pesa PIN to complete the payment.
              </p>
              <div style={{ display: "flex", justifyContent: "center" }}>
                <div style={{ width: 40, height: 40, borderRadius: "50%", border: "4px solid var(--border)", borderTopColor: "var(--accent)", animation: "spin 1s linear infinite" }} />
              </div>
              <style jsx>{`
                @keyframes spin {
                  to { transform: rotate(360deg); }
                }
              `}</style>
            </>
          ) : mpesaStatus === "completed" ? (
            <>
              <h3 style={{ fontWeight: 600, fontSize: 16, marginBottom: 16, textAlign: "center", color: "var(--up)" }}>Payment Successful!</h3>
              <p style={{ fontSize: 14, color: "var(--text-muted)", textAlign: "center" }}>
                Your payment of KES {(numAmount * USD_TO_KES_RATE).toFixed(0)} has been received and your account has been credited with ${numAmount.toFixed(2)}.
              </p>
            </>
          ) : (
            <>
              <h3 style={{ fontWeight: 600, fontSize: 16, marginBottom: 16, textAlign: "center", color: "var(--down)" }}>Payment Failed</h3>
              <p style={{ fontSize: 14, color: "var(--text-muted)", textAlign: "center" }}>
                The payment could not be completed. Please try again.
              </p>
            </>
          )}
        </div>

        {mpesaStatus === "completed" ? (
          <button onClick={() => navigate("dashboard")} style={{ width: "100%", padding: "16px", background: "var(--accent)", color: "white", border: "none", borderRadius: "var(--radius)", fontSize: 15, fontWeight: 600, cursor: "pointer", fontFamily: "inherit" }}>
            Back to Dashboard
          </button>
        ) : mpesaStatus === "failed" ? (
          <button onClick={() => setStep("form")} style={{ width: "100%", padding: "16px", background: "var(--accent)", color: "white", border: "none", borderRadius: "var(--radius)", fontSize: 15, fontWeight: 600, cursor: "pointer", fontFamily: "inherit" }}>
            Try Again
          </button>
        ) : null}
      </div>
    </div>
  );

  if (step === "txid") return (
    <div style={{ minHeight: "100vh", background: "var(--bg)" }}>
      <div style={{ background: "var(--surface)", borderBottom: "1px solid var(--border)", padding: "14px 16px", display: "flex", alignItems: "center", gap: 12, position: "sticky", top: 0, zIndex: 50 }}>
        <button onClick={() => setStep("crypto")} style={{ background: "none", border: "none", color: "var(--text-secondary)", fontSize: 22, cursor: "pointer" }}>←</button>
        <h1 style={{ fontWeight: 700, fontSize: 18 }}>Verify Transaction</h1>
      </div>

      {message && (
        <div style={{
          maxWidth: 480,
          margin: "16px auto",
          padding: "14px 16px",
          borderRadius: "var(--radius)",
          background: message.type === "error" ? "var(--down-bg)" : "var(--up-bg)",
          border: `1px solid ${message.type === "error" ? "var(--down)" : "var(--up)"}`,
          color: message.type === "error" ? "var(--down)" : "var(--up)",
          fontSize: 14,
          fontWeight: 500,
          display: "flex",
          alignItems: "center",
          gap: 8,
        }}>
          <span>{message.type === "error" ? "⚠️" : "✓"}</span>
          <span>{message.text}</span>
        </div>
      )}

      <div style={{ maxWidth: 480, margin: "0 auto", padding: "16px" }}>
        <div style={{ background: "var(--surface)", borderRadius: "var(--radius-lg)", border: "1px solid var(--border)", padding: "24px", marginBottom: 16, textAlign: "center" }}>
          <div style={{ fontSize: 48, marginBottom: 12 }}>📋</div>
          <p style={{ color: "var(--text-muted)", fontSize: 14 }}>Enter Transaction ID</p>
          <p style={{ fontSize: 32, fontWeight: 700, color: "var(--text-primary)", fontFamily: "'DM Mono', monospace", margin: "8px 0" }}>${numAmount.toFixed(2)}</p>
        </div>

        <div style={{ background: "var(--surface)", borderRadius: "var(--radius-lg)", border: "1px solid var(--border)", padding: "20px", marginBottom: 16 }}>
          <label style={{ fontSize: 14, fontWeight: 500, display: "block", marginBottom: 8 }}>Transaction Hash (txId)</label>
          <input
            type="text"
            value={txId}
            onChange={(e) => setTxId(e.target.value)}
            placeholder="0x..."
            style={{ width: "100%", padding: "12px", border: "1px solid var(--border)", borderRadius: 8, fontSize: 14, fontFamily: "'DM Mono', monospace", outline: "none", background: "var(--bg)", color: "var(--text-primary)" }}
          />
          <p style={{ fontSize: 12, color: "var(--text-muted)", marginTop: 8 }}>
            Paste the transaction hash from your wallet to verify your deposit.
          </p>
        </div>

        <button
          onClick={handleVerifyTxId}
          disabled={verifying || !txId}
          style={{ width: "100%", padding: "16px", background: verifying || !txId ? "var(--border)" : "var(--accent)", color: verifying || !txId ? "var(--text-muted)" : "white", border: "none", borderRadius: "var(--radius)", fontSize: 15, fontWeight: 600, cursor: verifying || !txId ? "not-allowed" : "pointer", fontFamily: "inherit" }}
        >
          {verifying ? "Verifying..." : "Verify Deposit"}
        </button>
      </div>
    </div>
  );

  if (step === "success") return (
    <div style={{ minHeight: "100vh", background: "var(--bg)", display: "flex", alignItems: "center", justifyContent: "center", padding: 24 }}>
      <div style={{ maxWidth: 400, width: "100%", textAlign: "center" }}>
        <div style={{ width: 80, height: 80, borderRadius: "50%", background: "var(--up-bg)", display: "flex", alignItems: "center", justifyContent: "center", margin: "0 auto 24px", fontSize: 36 }}>✓</div>
        <h2 style={{ fontSize: 26, fontWeight: 700, marginBottom: 8, color: "var(--up)" }}>Deposit Successful!</h2>
        <p style={{ color: "var(--text-secondary)", marginBottom: 8 }}>Your account has been credited</p>
        <div style={{ background: "var(--surface)", borderRadius: "var(--radius-lg)", border: "1px solid var(--border)", padding: "24px", margin: "24px 0" }}>
          <p style={{ fontSize: 13, color: "var(--text-muted)" }}>Amount Added</p>
          <p style={{ fontSize: 36, fontWeight: 700, color: "var(--up)", fontFamily: "'DM Mono', monospace" }}>${numAmount.toFixed(2)}</p>
          <p style={{ fontSize: 13, color: "var(--text-muted)", marginTop: 8 }}>via {method.label}</p>
        </div>
        <button onClick={() => navigate("trade")} style={{ width: "100%", padding: "16px", background: "var(--accent)", color: "white", border: "none", borderRadius: "var(--radius)", fontSize: 15, fontWeight: 600, cursor: "pointer", marginBottom: 12, fontFamily: "inherit" }}>
          Start Trading Now
        </button>
        <button onClick={() => navigate("dashboard")} style={{ width: "100%", padding: "16px", background: "transparent", color: "var(--text-secondary)", border: "1px solid var(--border)", borderRadius: "var(--radius)", fontSize: 15, fontWeight: 500, cursor: "pointer", fontFamily: "inherit" }}>
          Back to Dashboard
        </button>
      </div>
    </div>
  );

  return (
    <div style={{ minHeight: "100vh", background: "var(--bg)" }}>
      <div style={{ background: "var(--surface)", borderBottom: "1px solid var(--border)", padding: "14px 16px", display: "flex", alignItems: "center", gap: 12, position: "sticky", top: 0, zIndex: 50 }}>
        <button onClick={() => step === "confirm" ? setStep("form") : navigate("dashboard")} style={{ background: "none", border: "none", color: "var(--text-secondary)", fontSize: 22, cursor: "pointer" }}>←</button>
        <h1 style={{ fontWeight: 700, fontSize: 18 }}>Deposit Funds</h1>
      </div>

      {message && (
        <div style={{
          maxWidth: 480,
          margin: "16px auto",
          padding: "14px 16px",
          borderRadius: "var(--radius)",
          background: message.type === "error" ? "var(--down-bg)" : "var(--up-bg)",
          border: `1px solid ${message.type === "error" ? "var(--down)" : "var(--up)"}`,
          color: message.type === "error" ? "var(--down)" : "var(--up)",
          fontSize: 14,
          fontWeight: 500,
          display: "flex",
          alignItems: "center",
          gap: 8,
        }}>
          <span>{message.type === "error" ? "⚠️" : "✓"}</span>
          <span>{message.text}</span>
        </div>
      )}

      <div style={{ maxWidth: 480, margin: "0 auto", padding: "16px" }}>
        {step === "form" ? (
          <>
            {/* Method Selection */}
            <div style={{ background: "var(--surface)", borderRadius: "var(--radius-lg)", border: "1px solid var(--border)", overflow: "hidden", marginBottom: 16 }}>
              <div style={{ padding: "14px 16px", borderBottom: "1px solid var(--border)" }}>
                <p style={{ fontWeight: 600, fontSize: 15 }}>Payment Method</p>
              </div>
              {METHODS.map((m, i) => (
                <div key={m.id} onClick={() => setMethod(m)} style={{ padding: "14px 16px", borderBottom: i < METHODS.length-1 ? "1px solid var(--border)" : "none", display: "flex", alignItems: "center", gap: 12, cursor: "pointer", background: method.id === m.id ? "var(--accent-light)" : "transparent" }}>
                  <span style={{ fontSize: 24 }}>{m.icon}</span>
                  <div style={{ flex: 1 }}>
                    <div style={{ fontWeight: 500, fontSize: 14 }}>{m.label}</div>
                    <div style={{ fontSize: 12, color: "var(--text-muted)" }}>Fee: {m.fee} · {m.time}</div>
                  </div>
                  <div style={{ width: 20, height: 20, borderRadius: "50%", border: `2px solid ${method.id === m.id ? "var(--accent)" : "var(--border)"}`, background: method.id === m.id ? "var(--accent)" : "transparent", position: "relative" }}>
                    {method.id === m.id && <div style={{ position: "absolute", inset: 3, borderRadius: "50%", background: "white" }} />}
                  </div>
                </div>
              ))}
            </div>

            {/* Amount */}
            <div style={{ background: "var(--surface)", borderRadius: "var(--radius-lg)", border: "1px solid var(--border)", padding: "16px", marginBottom: 16 }}>
              <p style={{ fontWeight: 600, fontSize: 15, marginBottom: 14 }}>Amount</p>
              <div style={{ position: "relative", marginBottom: 12 }}>
                <span style={{ position: "absolute", left: 14, top: "50%", transform: "translateY(-50%)", fontSize: 20, fontWeight: 600, color: "var(--text-muted)" }}>$</span>
                <input type="number" placeholder="0.00" value={amount} onChange={e => setAmount(e.target.value)}
                  style={{ width: "100%", padding: "14px 14px 14px 36px", border: "1px solid var(--border)", borderRadius: "var(--radius-sm)", fontSize: 22, fontWeight: 600, outline: "none", fontFamily: "'DM Mono', monospace", color: "var(--text-primary)", background: "var(--bg)" }}
                  onFocus={e => e.target.style.borderColor = "var(--accent)"}
                  onBlur={e => e.target.style.borderColor = "var(--border)"}
                />
              </div>
              <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
                {PRESETS.map(p => (
                  <button key={p} onClick={() => setAmount(String(p))} style={{ padding: "6px 12px", borderRadius: 20, border: "1px solid var(--border)", background: amount === String(p) ? "var(--accent)" : "var(--bg)", color: amount === String(p) ? "white" : "var(--text-secondary)", fontSize: 13, fontWeight: 500, cursor: "pointer", fontFamily: "inherit" }}>
                    ${p}
                  </button>
                ))}
              </div>
            </div>

            {/* KES Amount Display for M-Pesa */}
            {method.id === "mpesa" && numAmount > 0 && (
              <div style={{ background: "var(--accent-light)", borderRadius: "var(--radius-lg)", border: "1px solid var(--accent)", padding: "14px", marginBottom: 16 }}>
                <p style={{ fontSize: 12, color: "var(--text-muted)", marginBottom: 4 }}>You will be prompted to pay</p>
                <p style={{ fontSize: 24, fontWeight: 700, color: "var(--accent)", fontFamily: "'DM Mono', monospace" }}>KES {(numAmount * USD_TO_KES_RATE).toFixed(0)}</p>
                <p style={{ fontSize: 11, color: "var(--text-muted)", marginTop: 4 }}>Exchange rate: 1 USD = {USD_TO_KES_RATE} KES</p>
              </div>
            )}

            {/* Payment Details */}
            {method.id === "card" && (
              <div style={{ background: "var(--surface)", borderRadius: "var(--radius-lg)", border: "1px solid var(--border)", padding: "16px", marginBottom: 16 }}>
                <p style={{ fontWeight: 600, fontSize: 15, marginBottom: 10 }}>Stripe Checkout</p>
                <p style={{ fontSize: 13, color: "var(--text-muted)", lineHeight: 1.5 }}>
                  You&apos;ll be redirected to Stripe&apos;s secure hosted checkout page to complete your card payment.
                </p>
              </div>
            )}

            {method.id === "mpesa" && (
              <div style={{ background: "var(--surface)", borderRadius: "var(--radius-lg)", border: "1px solid var(--border)", padding: "16px", marginBottom: 16 }}>
                <p style={{ fontWeight: 600, fontSize: 15, marginBottom: 14 }}>M-Pesa Details</p>
                <label style={{ fontSize: 12, color: "var(--text-muted)", display: "block", marginBottom: 4 }}>Phone Number</label>
                <input value={phone} onChange={e => setPhone(e.target.value)} placeholder="+254 712 345 678"
                  style={{ width: "100%", padding: "12px", border: "1px solid var(--border)", borderRadius: 8, fontSize: 15, outline: "none", fontFamily: "inherit", background: "var(--bg)", color: "var(--text-primary)" }} />
                <p style={{ fontSize: 12, color: "var(--text-muted)", marginTop: 8 }}>An STK push will be sent to this number</p>
              </div>
            )}

            {/* Summary */}
            {numAmount > 0 && (
              <div style={{ background: "var(--accent-light)", borderRadius: "var(--radius)", border: "1px solid rgba(26,107,60,0.15)", padding: "14px 16px", marginBottom: 16 }}>
                <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 6 }}>
                  <span style={{ fontSize: 13, color: "var(--text-secondary)" }}>Deposit amount</span>
                  <span style={{ fontSize: 13, fontWeight: 500 }}>${numAmount.toFixed(2)}</span>
                </div>
                {fee > 0 && <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 6 }}>
                  <span style={{ fontSize: 13, color: "var(--text-secondary)" }}>Processing fee (2.5%)</span>
                  <span style={{ fontSize: 13 }}>${fee.toFixed(2)}</span>
                </div>}
                <div style={{ borderTop: "1px solid rgba(26,107,60,0.2)", paddingTop: 6, display: "flex", justifyContent: "space-between" }}>
                  <span style={{ fontWeight: 600, fontSize: 14 }}>Total charged</span>
                  <span style={{ fontWeight: 700, fontSize: 14, color: "var(--accent)" }}>${total.toFixed(2)}</span>
                </div>
              </div>
            )}

            <button onClick={() => numAmount >= 10 && (method.id !== "mpesa" || (phone && phone.replace(/\D/g, "").length === 10)) && setStep("confirm")} disabled={numAmount < 10 || (method.id === "mpesa" && (!phone || phone.replace(/\D/g, "").length !== 10))}
              style={{ width: "100%", padding: "16px", background: numAmount >= 10 && (method.id !== "mpesa" || (phone && phone.replace(/\D/g, "").length === 10)) ? "var(--accent)" : "var(--border)", color: numAmount >= 10 && (method.id !== "mpesa" || (phone && phone.replace(/\D/g, "").length === 10)) ? "white" : "var(--text-muted)", border: "none", borderRadius: "var(--radius)", fontSize: 15, fontWeight: 600, cursor: numAmount >= 10 && (method.id !== "mpesa" || (phone && phone.replace(/\D/g, "").length === 10)) ? "pointer" : "not-allowed", fontFamily: "inherit" }}>
              Continue — Minimum $10
            </button>
          </>
        ) : (
          /* Confirm Step */
          <div>
            <div style={{ background: "var(--surface)", borderRadius: "var(--radius-lg)", border: "1px solid var(--border)", padding: "24px", marginBottom: 16, textAlign: "center" }}>
              <div style={{ fontSize: 48, marginBottom: 12 }}>{method.icon}</div>
              <p style={{ color: "var(--text-muted)", fontSize: 14 }}>Depositing via {method.label}</p>
              <p style={{ fontSize: 44, fontWeight: 700, color: "var(--text-primary)", fontFamily: "'DM Mono', monospace", margin: "8px 0" }}>${numAmount.toFixed(2)}</p>
              {fee > 0 && <p style={{ fontSize: 13, color: "var(--text-muted)" }}>+ ${fee.toFixed(2)} fee = ${total.toFixed(2)} total</p>}
            </div>
            <div style={{ background: "var(--surface)", borderRadius: "var(--radius)", border: "1px solid var(--border)", overflow: "hidden", marginBottom: 20 }}>
              {[["Method", method.label], ["Processing", method.time], ["Credit to account", `$${numAmount.toFixed(2)}`]].map(([k,v]) => (
                <div key={k} style={{ display: "flex", justifyContent: "space-between", padding: "12px 16px", borderBottom: "1px solid var(--border)" }}>
                  <span style={{ fontSize: 14, color: "var(--text-secondary)" }}>{k}</span>
                  <span style={{ fontSize: 14, fontWeight: 500 }}>{v}</span>
                </div>
              ))}
            </div>
            <button onClick={handleDeposit} disabled={loading || (method.id === "mpesa" && (!phone || phone.replace(/\D/g, "").length !== 10))}
              style={{ width: "100%", padding: "16px", background: loading || (method.id === "mpesa" && (!phone || phone.replace(/\D/g, "").length !== 10)) ? "var(--border)" : "var(--accent)", color: loading || (method.id === "mpesa" && (!phone || phone.replace(/\D/g, "").length !== 10)) ? "var(--text-muted)" : "white", border: "none", borderRadius: "var(--radius)", fontSize: 15, fontWeight: 600, cursor: loading || (method.id === "mpesa" && (!phone || phone.replace(/\D/g, "").length !== 10)) ? "not-allowed" : "pointer", fontFamily: "inherit", marginBottom: 10 }}>
              {loading ? "Processing..." : `Confirm Deposit $${numAmount.toFixed(2)}`}
            </button>
            <p style={{ textAlign: "center", fontSize: 12, color: "var(--text-muted)" }}>🔒 Your payment is encrypted and secure</p>
          </div>
        )}
      </div>
    </div>
  );
}
