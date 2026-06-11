"use client";
import { useState } from "react";
import { useApp } from "../context/AppContext";

export default function Onboarding() {
  const { navigate, setUser, setUserId } = useApp();
  const [step, setStep] = useState<"welcome" | "register" | "signin" | "verify">("welcome");
  const [verificationPurpose, setVerificationPurpose] = useState<"register" | "login" | null>(null);
  const [form, setForm] = useState({ name: "", phone: "", email: "" });
  const [otp, setOtp] = useState(["", "", "", "", "", ""]);
  const [statusMessage, setStatusMessage] = useState("");
  const [errors, setErrors] = useState<Record<string,string>>({});
  const [loading, setLoading] = useState(false);
  const [showVerificationOtpButton, setShowVerificationOtpButton] = useState(false);

  const validate = () => {
    const e: Record<string,string> = {};
    if (step === "register") {
      if (!form.name.trim()) e.name = "Full name required";
      if (!/^\+?[\d\s\-]{10,}$/.test(form.phone)) e.phone = "Valid phone number required";
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(form.email)) e.email = "Valid email required";
    } else if (step === "signin") {
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(form.email)) e.email = "Valid email required";
    }
    setErrors(e);
    return Object.keys(e).length === 0;
  };

  const handleSubmit = async () => {
    if (!validate()) return;
    setErrors({});
    setStatusMessage("");
    setShowVerificationOtpButton(false);
    setLoading(true);
    try {
      if (step === "register") {
        const res = await fetch('/api/users/register', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ name: form.name, phone: form.phone, email: form.email }),
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error || 'Registration failed');
        setVerificationPurpose("register");
        setOtp(["", "", "", "", "", ""]);
        setStatusMessage(data.message || "OTP sent to your email");
        setStep("verify");
      } else {
        const res = await fetch('/api/users/login', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ email: form.email }),
        });
        const data = await res.json();
        if (!res.ok) {
          setShowVerificationOtpButton(res.status === 403 && data.needsVerification === true);
          throw new Error(data.error || 'Login failed');
        }
        setVerificationPurpose("login");
        setOtp(["", "", "", "", "", ""]);
        setStatusMessage(data.message || "OTP sent to your email");
        setStep("verify");
      }
    } catch (error) {
      console.error('Auth error:', error);
      setErrors({ email: (error as Error).message });
    } finally {
      setLoading(false);
    }
  };

  const handleSendVerificationOtp = async () => {
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(form.email)) {
      setErrors({ email: "Valid email required" });
      return;
    }

    setLoading(true);
    setErrors({});
    setStatusMessage("");
    try {
      const res = await fetch('/api/users/resend-verification', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: form.email }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to send verification OTP');

      setVerificationPurpose("register");
      setOtp(["", "", "", "", "", ""]);
      setShowVerificationOtpButton(false);
      setStatusMessage(data.message || "Verification OTP sent to your email");
      setStep("verify");
    } catch (error) {
      console.error('Send verification OTP error:', error);
      setErrors({ email: (error as Error).message });
    } finally {
      setLoading(false);
    }
  };

  const handleOtp = (i: number, val: string) => {
    if (!/^\d?$/.test(val)) return;
    const next = [...otp];
    next[i] = val;
    setOtp(next);
    if (val && i < 5) {
      const el = document.getElementById(`otp-${i+1}`);
      el?.focus();
    }
  };

  const handleVerify = async () => {
    const code = otp.join("");
    if (!verificationPurpose) {
      setErrors({ otp: "No active verification request" });
      return;
    }

    if (!/^\d{6}$/.test(code)) {
      setErrors({ otp: "Enter the 6-digit OTP code" });
      return;
    }

    setLoading(true);
    setErrors({});
    setStatusMessage("");
    try {
      const res = await fetch('/api/users/verify', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          email: form.email,
          otp: code,
          purpose: verificationPurpose,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'OTP verification failed');

      setUserId(data.user.id);
      setUser({
        name: data.user.name,
        phone: data.user.phone,
        email: data.user.email,
      });
      navigate("dashboard");
    } catch (error) {
      console.error('Verification error:', error);
      setErrors({ otp: (error as Error).message });
    } finally {
      setLoading(false);
    }
  };

  const handleResendOtp = async () => {
    if (!verificationPurpose) return;

    setLoading(true);
    setErrors({});
    try {
      const endpoint = verificationPurpose === "register"
        ? "/api/users/resend-verification"
        : "/api/users/login";
      const payload = { email: form.email };

      const res = await fetch(endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to resend OTP');

      setOtp(["", "", "", "", "", ""]);
      setStatusMessage(data.message || "A new OTP has been sent to your email");
    } catch (error) {
      console.error('Resend OTP error:', error);
      setErrors({ otp: (error as Error).message });
    } finally {
      setLoading(false);
    }
  };

  if (step === "welcome") return (
    <div style={{ minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center", background: "var(--bg)", padding: "24px", position: "relative", overflow: "hidden" }}>
      <div style={{ position: "absolute", inset: 0, backgroundImage: "url('/crypto-platform-bg.svg')", backgroundSize: "cover", backgroundPosition: "center", opacity: 0.3, pointerEvents: "none" }} />
      <div style={{ position: "absolute", inset: 0, background: "linear-gradient(180deg, rgba(248,247,244,0.86) 0%, rgba(248,247,244,0.94) 40%, rgba(248,247,244,0.98) 100%)", pointerEvents: "none" }} />

      <div style={{ maxWidth: 440, width: "100%", textAlign: "center", position: "relative", zIndex: 1 }}>
        <div style={{ width: 72, height: 72, borderRadius: 20, background: "var(--accent)", display: "flex", alignItems: "center", justifyContent: "center", margin: "0 auto 28px", boxShadow: "0 8px 24px rgba(26,107,60,0.25)" }}>
          <svg width="36" height="36" fill="none" viewBox="0 0 36 36">
            <path d="M18 4L32 12V24L18 32L4 24V12L18 4Z" stroke="white" strokeWidth="2" fill="rgba(255,255,255,0.15)" />
            <path d="M12 20L16 24L24 14" stroke="white" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"/>
          </svg>
        </div>
        <h1 style={{ fontSize: 36, fontWeight: 700, color: "var(--text-primary)", letterSpacing: "-0.5px", marginBottom: 12 }}>TradeFlow</h1>
        <p style={{ fontSize: 16, color: "var(--text-secondary)", lineHeight: 1.6, marginBottom: 48 }}>Professional Crypto trading. High profits rate. Real-time signals.</p>
        
        <div style={{ display: "flex", flexDirection: "column", gap: 12, marginBottom: 32 }}>
          {[
            { icon: "📈", label: "Short Time Trading Slots with High Winning Rate", desc: "Simple, powerful directional trades" },
            { icon: "₿", label: "Crypto-focused market intelligence", desc: "Spot opportunities across top digital assets" },
            { icon: "🔒", label: "Secure & regulated", desc: "Bank-grade security standards" },
          ].map((f) => (
            <div key={f.label} style={{ display: "flex", alignItems: "center", gap: 14, background: "var(--surface)", borderRadius: "var(--radius)", border: "1px solid var(--border)", padding: "14px 18px", textAlign: "left", boxShadow: "0 2px 8px rgba(0,0,0,0.04)" }}>
              <span style={{ fontSize: 24 }}>{f.icon}</span>
              <div>
                <div style={{ fontSize: 14, fontWeight: 600, color: "var(--text-primary)" }}>{f.label}</div>
                <div style={{ fontSize: 13, color: "var(--text-secondary)" }}>{f.desc}</div>
              </div>
            </div>
          ))}
        </div>

        <button onClick={() => setStep("register")} style={{ width: "100%", padding: "16px", background: "var(--accent)", color: "white", border: "none", borderRadius: "var(--radius)", fontSize: 16, fontWeight: 600, cursor: "pointer", boxShadow: "0 4px 14px rgba(26,107,60,0.3)" }}>
          Get Started
        </button>
        <p style={{ marginTop: 16, fontSize: 13, color: "var(--text-muted)" }}>Already have an account? <span style={{ color: "var(--accent)", cursor: "pointer", fontWeight: 500 }} onClick={() => setStep("signin")}>Sign In</span></p>
      </div>
    </div>
  );

  if (step === "register") return (
    <div style={{ minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center", background: "var(--bg)", padding: "24px" }}>
      <div style={{ maxWidth: 440, width: "100%" }}>
        <button onClick={() => setStep("welcome")} style={{ background: "none", border: "none", color: "var(--text-secondary)", fontSize: 14, cursor: "pointer", marginBottom: 24, display: "flex", alignItems: "center", gap: 6, fontFamily: "inherit" }}>
          ← Back
        </button>
        <h2 style={{ fontSize: 28, fontWeight: 700, marginBottom: 8, letterSpacing: "-0.3px" }}>Create Account</h2>
        <p style={{ color: "var(--text-secondary)", marginBottom: 32, fontSize: 15 }}>Join thousands of traders on TradeFlow</p>

        <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
          {[
            { key: "name", label: "Full Name", type: "text", placeholder: "John Mwangi" },
            { key: "phone", label: "Phone Number", type: "tel", placeholder: "+254 712 345 678" },
            { key: "email", label: "Email Address", type: "email", placeholder: "john@example.com" },
          ].map(f => (
            <div key={f.key}>
              <label style={{ fontSize: 13, fontWeight: 500, color: "var(--text-secondary)", display: "block", marginBottom: 6 }}>{f.label}</label>
              <input
                type={f.type}
                placeholder={f.placeholder}
                value={form[f.key as keyof typeof form]}
                onChange={e => setForm(p => ({ ...p, [f.key]: e.target.value }))}
                style={{ width: "100%", padding: "13px 16px", border: `1px solid ${errors[f.key] ? "var(--danger)" : "var(--border)"}`, borderRadius: "var(--radius-sm)", fontSize: 15, outline: "none", background: "var(--surface)", color: "var(--text-primary)", fontFamily: "inherit", transition: "border-color 0.15s" }}
                onFocus={e => e.target.style.borderColor = "var(--accent)"}
                onBlur={e => e.target.style.borderColor = errors[f.key] ? "var(--danger)" : "var(--border)"}
              />
              {errors[f.key] && <p style={{ fontSize: 12, color: "var(--danger)", marginTop: 4 }}>{errors[f.key]}</p>}
            </div>
          ))}

          <div style={{ background: "var(--warning-light)", borderRadius: "var(--radius-sm)", padding: "12px 14px", border: "1px solid #f0d080" }}>
            <p style={{ fontSize: 12, color: "var(--warning)", lineHeight: 1.5 }}>⚠️ Trading involves significant risk. Only trade with money you can afford to lose. You must be 18+ to trade.</p>
          </div>

          <button
            onClick={handleSubmit}
            disabled={loading}
            style={{ padding: "15px", background: "var(--accent)", color: "white", border: "none", borderRadius: "var(--radius)", fontSize: 15, fontWeight: 600, cursor: loading ? "wait" : "pointer", marginTop: 4, opacity: loading ? 0.8 : 1 }}
          >
            {loading ? "Sending OTP..." : "Continue"}
          </button>
          <p style={{ marginTop: 16, fontSize: 13, color: "var(--text-muted)", textAlign: "center" }}>Already have an account? <span style={{ color: "var(--accent)", cursor: "pointer", fontWeight: 500 }} onClick={() => setStep("signin")}>Sign In</span></p>
        </div>
      </div>
    </div>
  );

  if (step === "signin") return (
    <div style={{ minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center", background: "var(--bg)", padding: "24px" }}>
      <div style={{ maxWidth: 440, width: "100%" }}>
        <button onClick={() => setStep("welcome")} style={{ background: "none", border: "none", color: "var(--text-secondary)", fontSize: 14, cursor: "pointer", marginBottom: 24, display: "flex", alignItems: "center", gap: 6, fontFamily: "inherit" }}>
          ← Back
        </button>
        <h2 style={{ fontSize: 28, fontWeight: 700, marginBottom: 8, letterSpacing: "-0.3px" }}>Welcome Back</h2>
        <p style={{ color: "var(--text-secondary)", marginBottom: 32, fontSize: 15 }}>Sign in to your TradeFlow account</p>

        <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
          <div>
            <label style={{ fontSize: 13, fontWeight: 500, color: "var(--text-secondary)", display: "block", marginBottom: 6 }}>Email Address</label>
            <input
              type="email"
              placeholder="john@example.com"
              value={form.email}
              onChange={e => setForm(p => ({ ...p, email: e.target.value }))}
              style={{ width: "100%", padding: "13px 16px", border: `1px solid ${errors.email ? "var(--danger)" : "var(--border)"}`, borderRadius: "var(--radius-sm)", fontSize: 15, outline: "none", background: "var(--surface)", color: "var(--text-primary)", fontFamily: "inherit", transition: "border-color 0.15s" }}
              onFocus={e => e.target.style.borderColor = "var(--accent)"}
              onBlur={e => e.target.style.borderColor = errors.email ? "var(--danger)" : "var(--border)"}
            />
            {errors.email && <p style={{ fontSize: 12, color: "var(--danger)", marginTop: 4 }}>{errors.email}</p>}
          </div>
          <button
            onClick={handleSubmit}
            disabled={loading}
            style={{ padding: "15px", background: "var(--accent)", color: "white", border: "none", borderRadius: "var(--radius)", fontSize: 15, fontWeight: 600, cursor: loading ? "wait" : "pointer", marginTop: 4, opacity: loading ? 0.8 : 1 }}
          >
            {loading ? "Sending OTP..." : "Sign In"}
          </button>
          {showVerificationOtpButton && (
            <button
              onClick={handleSendVerificationOtp}
              disabled={loading}
              style={{ padding: "14px", background: "transparent", color: "var(--accent)", border: "1px solid var(--accent)", borderRadius: "var(--radius)", fontSize: 14, fontWeight: 600, cursor: loading ? "wait" : "pointer", marginTop: -4, opacity: loading ? 0.8 : 1 }}
            >
              {loading ? "Sending verification OTP..." : "Send verification OTP"}
            </button>
          )}
          <p style={{ marginTop: 16, fontSize: 13, color: "var(--text-muted)", textAlign: "center" }}>Don&apos;t have an account? <span style={{ color: "var(--accent)", cursor: "pointer", fontWeight: 500 }} onClick={() => setStep("register")}>Create Account</span></p>
        </div>
      </div>
    </div>
  );

  return (
    <div style={{ minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center", background: "var(--bg)", padding: "24px" }}>
      <div style={{ maxWidth: 400, width: "100%", textAlign: "center" }}>
        <div style={{ width: 64, height: 64, borderRadius: "50%", background: "var(--accent-light)", display: "flex", alignItems: "center", justifyContent: "center", margin: "0 auto 24px" }}>
          <span style={{ fontSize: 28 }}>📱</span>
        </div>
        <h2 style={{ fontSize: 26, fontWeight: 700, marginBottom: 8 }}>
          {verificationPurpose === "login" ? "Verify Login" : "Verify Your Email"}
        </h2>
        <p style={{ color: "var(--text-secondary)", marginBottom: 8, fontSize: 15 }}>Enter the 6-digit code sent to</p>
        <p style={{ fontWeight: 600, color: "var(--accent)", marginBottom: 20, fontSize: 15 }}>{form.email}</p>
        {statusMessage && <p style={{ fontSize: 13, color: "var(--accent)", marginBottom: 14 }}>{statusMessage}</p>}
        {errors.otp && <p style={{ fontSize: 13, color: "var(--danger)", marginBottom: 14 }}>{errors.otp}</p>}

        <div style={{ display: "flex", gap: 10, justifyContent: "center", marginBottom: 32 }}>
          {otp.map((digit, i) => (
            <input
              key={i}
              id={`otp-${i}`}
              type="number"
              maxLength={1}
              value={digit}
              onChange={e => handleOtp(i, e.target.value)}
              style={{ width: 48, height: 56, textAlign: "center", fontSize: 22, fontWeight: 600, border: "1px solid var(--border)", borderRadius: "var(--radius-sm)", background: digit ? "var(--accent-light)" : "var(--surface)", color: "var(--text-primary)", outline: "none", fontFamily: "'DM Mono', monospace", borderColor: digit ? "var(--accent)" : "var(--border)" }}
            />
          ))}
        </div>

        <button
          onClick={handleVerify}
          disabled={loading || otp.some(d => !d)}
          style={{ width: "100%", padding: "15px", background: otp.every(d => d) ? "var(--accent)" : "var(--border)", color: otp.every(d => d) ? "white" : "var(--text-muted)", border: "none", borderRadius: "var(--radius)", fontSize: 15, fontWeight: 600, cursor: loading ? "wait" : otp.every(d => d) ? "pointer" : "not-allowed", transition: "all 0.2s" }}
        >
          {loading ? "Verifying..." : "Verify & Enter Platform"}
        </button>
        <p style={{ marginTop: 16, fontSize: 13, color: "var(--text-muted)" }}>
          Didn&apos;t receive code? <span style={{ color: "var(--accent)", cursor: "pointer", fontWeight: 500 }} onClick={handleResendOtp}>Resend code</span>
        </p>
        <p style={{ marginTop: 8, fontSize: 12, color: "var(--text-muted)" }}>Code expires in 10 minutes.</p>
      </div>
    </div>
  );
}
