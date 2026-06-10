"use client";
import { useApp } from "../context/AppContext";

export default function Profile() {
  const { user, userId, balance, accountType, navigate, setUser, setUserId } = useApp();

  const handleLogout = () => {
    setUser(null);
    setUserId("");
    localStorage.removeItem("user");
    localStorage.removeItem("userId");
    navigate("onboarding");
  };

  return (
    <div style={{ minHeight: "100vh", background: "var(--bg)" }}>
      <div style={{ background: "var(--surface)", borderBottom: "1px solid var(--border)", padding: "14px 16px", display: "flex", alignItems: "center", gap: 12 }}>
        <button onClick={() => navigate("dashboard")} style={{ background: "none", border: "none", color: "var(--text-secondary)", fontSize: 22, cursor: "pointer" }}>←</button>
        <h1 style={{ fontWeight: 700, fontSize: 18 }}>Profile</h1>
      </div>

      <div style={{ maxWidth: 480, margin: "0 auto", padding: "16px" }}>
        {/* User Info Card */}
        <div style={{ background: "var(--surface)", borderRadius: "var(--radius-lg)", border: "1px solid var(--border)", padding: "24px", marginBottom: 16, textAlign: "center" }}>
          <div style={{ width: 80, height: 80, borderRadius: "50%", background: "var(--accent)", display: "flex", alignItems: "center", justifyContent: "center", margin: "0 auto 16px", fontSize: 32 }}>
            👤
          </div>
          <h2 style={{ fontSize: 24, fontWeight: 700, marginBottom: 4 }}>{user?.name || "User"}</h2>
          <p style={{ fontSize: 14, color: "var(--text-muted)", marginBottom: 8 }}>{user?.email || "No email"}</p>
          <p style={{ fontSize: 14, color: "var(--text-muted)" }}>{user?.phone || "No phone"}</p>
        </div>

        {/* Account Info */}
        <div style={{ background: "var(--surface)", borderRadius: "var(--radius-lg)", border: "1px solid var(--border)", padding: "20px", marginBottom: 16 }}>
          <h3 style={{ fontWeight: 600, fontSize: 16, marginBottom: 16 }}>Account Information</h3>
          
          <div style={{ display: "flex", justifyContent: "space-between", padding: "12px 0", borderBottom: "1px solid var(--border)" }}>
            <span style={{ fontSize: 14, color: "var(--text-secondary)" }}>Balance</span>
            <span style={{ fontSize: 14, fontWeight: 600, color: "var(--accent)", fontFamily: "'DM Mono', monospace" }}>${balance.toFixed(2)}</span>
          </div>
          
          <div style={{ display: "flex", justifyContent: "space-between", padding: "12px 0" }}>
            <span style={{ fontSize: 14, color: "var(--text-secondary)" }}>Account Type</span>
            <span style={{ fontSize: 14, fontWeight: 600, color: accountType === "vvip" ? "#FFD700" : accountType === "vip" ? "#C0C0C0" : "var(--text-primary)" }}>
              {accountType === "vvip" ? "💎 VVIP" : accountType === "vip" ? "👑 VIP" : "Normal"}
            </span>
          </div>
        </div>

        {/* Account Type Benefits */}
        <div style={{ background: "var(--surface)", borderRadius: "var(--radius-lg)", border: "1px solid var(--border)", padding: "20px", marginBottom: 16 }}>
          <h3 style={{ fontWeight: 600, fontSize: 16, marginBottom: 16 }}>Your Benefits</h3>
          
          <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 12 }}>
            <span style={{ fontSize: 20 }}>📊</span>
            <div>
              <p style={{ fontSize: 14, fontWeight: 500 }}>Win Rate</p>
              <p style={{ fontSize: 13, color: "var(--text-muted)" }}>
                {accountType === "vvip" ? "70%" : accountType === "vip" ? "50%" : "30%"}
              </p>
            </div>
          </div>
          
          <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
            <span style={{ fontSize: 20 }}>⚡</span>
            <div>
              <p style={{ fontSize: 14, fontWeight: 500 }}>Priority Support</p>
              <p style={{ fontSize: 13, color: "var(--text-muted)" }}>
                {accountType === "vvip" || accountType === "vip" ? "Yes" : "No"}
              </p>
            </div>
          </div>
        </div>

        {/* Logout Button */}
        <button
          onClick={handleLogout}
          style={{
            width: "100%",
            padding: "16px",
            background: "var(--down-bg)",
            color: "var(--down)",
            border: "1px solid var(--down)",
            borderRadius: "var(--radius)",
            fontSize: 15,
            fontWeight: 600,
            cursor: "pointer",
            fontFamily: "inherit",
          }}
        >
          Log Out
        </button>
      </div>
    </div>
  );
}
