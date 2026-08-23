"use client";
import { useEffect, useState } from "react";
import { useApp } from "../context/AppContext";

const METHODS = [
  { id: "mpesa", label: "M-Pesa", icon: "📱", min: 10, time: "Instant" },
  // { id: "bank", label: "Bank Transfer", icon: "🏦", min: 50, time: "1-3 business days" },
  { id: "crypto", label: "USDT (TRC20)", icon: "🔐", min: 20, time: "~30 min" },
];


export default function Withdraw() {
  const { balance, navigate, deductBalance, addTransaction } = useApp();
  const [method, setMethod] = useState(METHODS[0]);
  const [amount, setAmount] = useState("");
  const [details, setDetails] = useState({ phone: "", account: "", wallet: "", bank: "", name: "" });
  const [step, setStep] = useState<"form"|"confirm"|"success">("form");
  const [loading, setLoading] = useState(false);
  // Quoted by the server so the screen and the payout always agree.
  const [usdToKesRate, setUsdToKesRate] = useState<number | null>(null);

  useEffect(() => {
    fetch("/api/settings")
      .then(r => (r.ok ? r.json() : null))
      .then(d => { if (d?.usdToKesRate) setUsdToKesRate(d.usdToKesRate); })
      .catch(err => console.error("Failed to load exchange rate:", err));
  }, []);

  const numAmount = parseFloat(amount) || 0;
  const canSubmit = numAmount >= method.min && numAmount <= balance;

  const handleWithdraw = async () => {
    setLoading(true);
    try {
      await deductBalance(numAmount);
      await addTransaction({ id: crypto.randomUUID(), type: "withdrawal", amount: numAmount, time: Date.now(), status: "completed", label: `Withdrawal via ${method.label}` });
      setStep("success");
    } catch (error) {
      console.error('Withdraw error:', error);
    } finally {
      setLoading(false);
    }
  };

  if (step === "success") return (
    <div style={{ minHeight: "100vh", background: "var(--bg)", display: "flex", alignItems: "center", justifyContent: "center", padding: 24 }}>
      <div style={{ maxWidth: 400, width: "100%", textAlign: "center" }}>
        <div style={{ width: 80, height: 80, borderRadius: "50%", background: "var(--up-bg)", display: "flex", alignItems: "center", justifyContent: "center", margin: "0 auto 24px", fontSize: 36 }}>✓</div>
        <h2 style={{ fontSize: 26, fontWeight: 700, marginBottom: 8 }}>Withdrawal Initiated!</h2>
        <p style={{ color: "var(--text-secondary)", marginBottom: 24 }}>Your request is being processed</p>
        <div style={{ background: "var(--surface)", borderRadius: "var(--radius-lg)", border: "1px solid var(--border)", padding: "24px", marginBottom: 24 }}>
          <p style={{ fontSize: 13, color: "var(--text-muted)" }}>Amount Requested</p>
          <p style={{ fontSize: 36, fontWeight: 700, fontFamily: "'DM Mono', monospace" }}>${numAmount.toFixed(2)}</p>
          <p style={{ fontSize: 13, color: "var(--text-muted)", marginTop: 8 }}>via {method.label} · {method.time}</p>
        </div>
        <button onClick={() => navigate("dashboard")} style={{ width: "100%", padding: "15px", background: "var(--accent)", color: "var(--on-accent)", border: "none", borderRadius: "var(--radius)", fontSize: 15, fontWeight: 600, cursor: "pointer", fontFamily: "inherit" }}>
          Back to Dashboard
        </button>
      </div>
    </div>
  );

  return (
    <div style={{ minHeight: "100vh", background: "var(--bg)" }}>
      <div className="app-bar" style={{ background: "var(--surface)", borderBottom: "1px solid var(--border)", paddingTop: 14, paddingBottom: 14, display: "flex", alignItems: "center", gap: 12 }}>
        <button onClick={() => step === "confirm" ? setStep("form") : navigate("dashboard")} style={{ background: "none", border: "none", color: "var(--text-secondary)", fontSize: 22, cursor: "pointer" }}>←</button>
        <h1 style={{ fontWeight: 700, fontSize: 18 }}>Withdraw Funds</h1>
      </div>

      <div className="app-shell" style={{ padding: "16px" }}>
        {/* Balance display */}
        <div style={{ background: "var(--surface)", borderRadius: "var(--radius)", border: "1px solid var(--border)", padding: "16px", marginBottom: 16, display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <div>
            <p style={{ fontSize: 12, color: "var(--text-muted)" }}>Available Balance</p>
            <p style={{ fontSize: 22, fontWeight: 700, fontFamily: "'DM Mono', monospace", color: "var(--accent)" }}>${balance.toFixed(2)}</p>
          </div>
          <button onClick={() => setAmount(String(balance.toFixed(2)))} style={{ padding: "8px 14px", background: "var(--accent-light)", color: "var(--accent)", border: "1px solid rgba(26,107,60,0.2)", borderRadius: 8, fontSize: 13, fontWeight: 600, cursor: "pointer", fontFamily: "inherit" }}>
            Max
          </button>
        </div>

        {step === "form" ? (
          <>
            {/* Method */}
            <div style={{ background: "var(--surface)", borderRadius: "var(--radius-lg)", border: "1px solid var(--border)", overflow: "hidden", marginBottom: 14 }}>
              <div style={{ padding: "14px 16px", borderBottom: "1px solid var(--border)" }}>
                <p style={{ fontWeight: 600, fontSize: 15 }}>Withdrawal Method</p>
              </div>
              {METHODS.map((m, i) => (
                <div key={m.id} onClick={() => setMethod(m)} style={{ padding: "14px 16px", borderBottom: i < METHODS.length-1 ? "1px solid var(--border)" : "none", display: "flex", alignItems: "center", gap: 12, cursor: "pointer", background: method.id === m.id ? "var(--accent-light)" : "transparent" }}>
                  <span style={{ fontSize: 24 }}>{m.icon}</span>
                  <div style={{ flex: 1 }}>
                    <div style={{ fontWeight: 500, fontSize: 14 }}>{m.label}</div>
                    <div style={{ fontSize: 12, color: "var(--text-muted)" }}>Min ${m.min} · {m.time}</div>
                  </div>
                  <div style={{ width: 20, height: 20, borderRadius: "50%", border: `2px solid ${method.id === m.id ? "var(--accent)" : "var(--border)"}`, background: method.id === m.id ? "var(--accent)" : "transparent", position: "relative" }}>
                    {method.id === m.id && <div style={{ position: "absolute", inset: 3, borderRadius: "50%", background: "var(--on-accent)" }} />}
                  </div>
                </div>
              ))}
            </div>

            {/* Amount */}
            <div style={{ background: "var(--surface)", borderRadius: "var(--radius)", border: "1px solid var(--border)", padding: "16px", marginBottom: 14 }}>
              <p style={{ fontWeight: 600, fontSize: 15, marginBottom: 12 }}>Amount to Withdraw</p>
              <div style={{ position: "relative" }}>
                <span style={{ position: "absolute", left: 14, top: "50%", transform: "translateY(-50%)", fontSize: 20, fontWeight: 600, color: "var(--text-muted)" }}>$</span>
                <input type="number" placeholder="0.00" value={amount} onChange={e => setAmount(e.target.value)}
                  style={{ width: "100%", padding: "14px 14px 14px 36px", border: "1px solid var(--border)", borderRadius: 8, fontSize: 22, fontWeight: 600, outline: "none", fontFamily: "'DM Mono', monospace", background: "var(--bg)", color: "var(--text-primary)" }}
                  onFocus={e => e.target.style.borderColor = "var(--accent)"}
                  onBlur={e => e.target.style.borderColor = "var(--border)"}
                />
              </div>
              {numAmount > balance && <p style={{ fontSize: 12, color: "var(--danger)", marginTop: 6 }}>Amount exceeds available balance</p>}
              {numAmount > 0 && numAmount < method.min && <p style={{ fontSize: 12, color: "var(--warning)", marginTop: 6 }}>Minimum withdrawal is ${method.min}</p>}
            </div>

            {/* KES Amount Display for M-Pesa */}
            {method.id === "mpesa" && numAmount > 0 && (
              <div style={{ background: "var(--accent-light)", borderRadius: "var(--radius)", border: "1px solid var(--accent)", padding: "14px", marginBottom: 14 }}>
                <p style={{ fontSize: 12, color: "var(--text-muted)", marginBottom: 4 }}>You will receive</p>
                <p style={{ fontSize: 24, fontWeight: 700, color: "var(--accent)", fontFamily: "'DM Mono', monospace" }}>KES {usdToKesRate ? (numAmount * usdToKesRate).toFixed(0) : "…"}</p>
                <p style={{ fontSize: 11, color: "var(--text-muted)", marginTop: 4 }}>Exchange rate: 1 USD = {usdToKesRate ?? "…"} KES</p>
              </div>
            )}

            {/* Details */}
            <div style={{ background: "var(--surface)", borderRadius: "var(--radius)", border: "1px solid var(--border)", padding: "16px", marginBottom: 16 }}>
              <p style={{ fontWeight: 600, fontSize: 15, marginBottom: 12 }}>
                {method.id === "mpesa" ? "M-Pesa Details" : method.id === "bank" ? "Bank Details" : "Wallet Address"}
              </p>
              {method.id === "mpesa" && (
                <>
                  <label style={{ fontSize: 12, color: "var(--text-muted)", display: "block", marginBottom: 4 }}>Phone Number</label>
                  <input value={details.phone} onChange={e => setDetails(d => ({...d, phone: e.target.value}))} placeholder="+254 712 345 678"
                    style={{ width: "100%", padding: "12px", border: "1px solid var(--border)", borderRadius: 8, fontSize: 14, outline: "none", fontFamily: "inherit", background: "var(--bg)", color: "var(--text-primary)" }} />
                </>
              )}
              {method.id === "bank" && (
                <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                  {[["Account Name", "name", "John Mwangi"], ["Account Number", "account", "1234567890"], ["Bank Name", "bank", "Equity Bank"]].map(([label, key, ph]) => (
                    <div key={key}>
                      <label style={{ fontSize: 12, color: "var(--text-muted)", display: "block", marginBottom: 4 }}>{label}</label>
                      <input value={details[key as keyof typeof details]} onChange={e => setDetails(d => ({...d, [key]: e.target.value}))} placeholder={ph}
                        style={{ width: "100%", padding: "12px", border: "1px solid var(--border)", borderRadius: 8, fontSize: 14, outline: "none", fontFamily: "inherit", background: "var(--bg)", color: "var(--text-primary)" }} />
                    </div>
                  ))}
                </div>
              )}
              {method.id === "crypto" && (
                <>
                  <label style={{ fontSize: 12, color: "var(--text-muted)", display: "block", marginBottom: 4 }}>USDT Wallet Address (TRC20)</label>
                  <input value={details.wallet} onChange={e => setDetails(d => ({...d, wallet: e.target.value}))} placeholder="TRX1234..."
                    style={{ width: "100%", padding: "12px", border: "1px solid var(--border)", borderRadius: 8, fontSize: 13, outline: "none", fontFamily: "'DM Mono', monospace", background: "var(--bg)", color: "var(--text-primary)" }} />
                </>
              )}
            </div>

            <button onClick={() => canSubmit && setStep("confirm")} disabled={!canSubmit}
              style={{ width: "100%", padding: "16px", background: canSubmit ? "var(--accent)" : "var(--border)", color: canSubmit ? "var(--on-accent)" : "var(--text-muted)", border: "none", borderRadius: "var(--radius)", fontSize: 15, fontWeight: 600, cursor: canSubmit ? "pointer" : "not-allowed", fontFamily: "inherit" }}>
              Continue
            </button>
          </>
        ) : (
          <div>
            <div style={{ background: "var(--surface)", borderRadius: "var(--radius-lg)", border: "1px solid var(--border)", padding: "24px", marginBottom: 16, textAlign: "center" }}>
              <div style={{ fontSize: 48, marginBottom: 12 }}>{method.icon}</div>
              <p style={{ color: "var(--text-muted)", fontSize: 14, marginBottom: 4 }}>Withdrawing via {method.label}</p>
              <p style={{ fontSize: 44, fontWeight: 700, fontFamily: "'DM Mono', monospace" }}>${numAmount.toFixed(2)}</p>
            </div>
            <div style={{ background: "var(--surface)", borderRadius: "var(--radius)", border: "1px solid var(--border)", overflow: "hidden", marginBottom: 20 }}>
              {[["Method", method.label], ["Estimated time", method.time], ["New balance", `$${(balance - numAmount).toFixed(2)}`]].map(([k,v]) => (
                <div key={k} style={{ display: "flex", justifyContent: "space-between", padding: "12px 16px", borderBottom: "1px solid var(--border)" }}>
                  <span style={{ fontSize: 14, color: "var(--text-secondary)" }}>{k}</span>
                  <span style={{ fontSize: 14, fontWeight: 500 }}>{v}</span>
                </div>
              ))}
            </div>
            <button onClick={handleWithdraw} disabled={loading}
              style={{ width: "100%", padding: "16px", background: loading ? "var(--border)" : "var(--danger)", color: loading ? "var(--text-muted)" : "var(--on-accent)", border: "none", borderRadius: "var(--radius)", fontSize: 15, fontWeight: 600, cursor: loading ? "not-allowed" : "pointer", fontFamily: "inherit", marginBottom: 10 }}>
              {loading ? "Processing..." : `Confirm Withdrawal $${numAmount.toFixed(2)}`}
            </button>
            <p style={{ textAlign: "center", fontSize: 12, color: "var(--text-muted)" }}>🔒 Verified accounts only. Withdrawals are reviewed for security.</p>
          </div>
        )}
      </div>
    </div>
  );
}
