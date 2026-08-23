"use client";
import { AppProvider, useApp } from "./context/AppContext";
import Onboarding from "./components/Onboarding";
import Dashboard from "./components/Dashboard";
import TradingScreen from "./components/TradingScreen";
import Deposit from "./components/Deposit";
import Withdraw from "./components/Withdraw";
import History from "./components/History";
import Profile from "./components/Profile";

function Router() {
  const { screen, loading } = useApp();
  
  console.log("Current screen:", screen);

  if (loading) {
    return (
      <div style={{ minHeight: "100vh", background: "var(--bg)", display: "flex", alignItems: "center", justifyContent: "center" }}>
        <div style={{ textAlign: "center" }}>
          <div style={{ width: 50, height: 50, border: "4px solid var(--border)", borderTop: "4px solid var(--accent)", borderRadius: "50%", animation: "spin 1s linear infinite", margin: "0 auto 16px" }} />
          <style>{`@keyframes spin { 0% { transform: rotate(0deg); } 100% { transform: rotate(360deg); } }`}</style>
          <p style={{ color: "var(--text-secondary)", fontSize: 14 }}>Loading trading screen...</p>
        </div>
      </div>
    );
  }

  switch (screen) {
    case "onboarding": return <Onboarding />;
    case "verify": return <Onboarding />;
    case "dashboard": return <Dashboard />;
    case "trade": return <TradingScreen />;
    case "deposit": return <Deposit />;
    case "withdraw": return <Withdraw />;
    case "history": return <History />;
    case "profile": return <Profile />;
    default: return <Onboarding />;
  }
}

export default function Home() {
  return (
    <AppProvider>
      <Router />
    </AppProvider>
  );
}
