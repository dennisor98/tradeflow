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
      <div className="app-bar" style={{ background: "var(--surface)", borderBottom: "1px solid var(--border)", paddingTop: 14, paddingBottom: 14, display: "flex", alignItems: "center", gap: 12 }}>
        <button onClick={() => navigate("dashboard")} style={{ background: "none", border: "none", color: "var(--text-secondary)", fontSize: 22, cursor: "pointer" }}>←</button>
        <h1 style={{ fontWeight: 700, fontSize: 18 }}>Profile</h1>
      </div>

      <div className="app-shell" style={{ padding: "16px" }}>
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
            <span style={{ fontSize: 14, fontWeight: 600, color: accountType === "vvip" ? "var(--gold)" : accountType === "vip" ? "var(--text-secondary)" : "var(--text-primary)" }}>
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
              <p style={{ fontSize: 14, fontWeight: 500 }}>Session earnings</p>
              <p style={{ fontSize: 13, color: "var(--text-muted)" }}>
                {accountType === "vvip"
                  ? "Our highest — you earn the most we offer on a winning session."
                  : accountType === "vip"
                  ? "Boosted above a Normal account. Upgrade to VVIP to earn more still."
                  : "Standard. Upgrade to VIP or VVIP to earn more on every win."}
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
