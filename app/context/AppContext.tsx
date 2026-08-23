"use client";
import { createContext, useContext, useState, ReactNode, useEffect } from "react";

export type Screen = "onboarding" | "verify" | "dashboard" | "trade" | "deposit" | "withdraw" | "history" | "profile";

export interface Trade {
  id: string;
  asset: string;
  direction: "over" | "under";
  amount: number | string;
  entryPrice: number | string;
  targetPrice: number | string;
  duration: number;
  startTime: number;
  result?: "win" | "loss" | "pending";
  payout?: number | string;
  initialBalance?: number | string;
  finalBalance?: number | string;
}

export interface Transaction {
  id: string;
  type: "deposit" | "withdrawal" | "trade_win" | "trade_loss";
  amount: number | string;
  time: number;
  status: "completed" | "pending" | "failed";
  label: string;
}

/** Admin-configured platform values, served by /api/settings. */
export interface PlatformSettings {
  usdToKesRate: number;
  minDepositUsd: number;
  vipThresholdUsd: number;
  vvipThresholdUsd: number;
  winRateNormal: number;
  winRateVip: number;
  winRateVvip: number;
}

/** The win rate, as a percentage, that a given tier trades at. */
export function winRateFor(tier: string, settings: PlatformSettings) {
  return tier === "vvip" ? settings.winRateVvip
    : tier === "vip" ? settings.winRateVip
    : settings.winRateNormal;
}

interface AppState {
  screen: Screen;
  userId: string | null;
  user: { name: string; phone: string; email: string } | null;
  balance: number;
  accountType: "normal" | "vip" | "vvip";
  maxSingleDeposit: number;
  trades: Trade[];
  transactions: Transaction[];
  loading: boolean;
  /** Null until the first fetch lands; screens must handle that. */
  settings: PlatformSettings | null;
  navigate: (s: Screen) => void;
  setUser: (u: AppState["user"]) => void;
  setUserId: (id: string) => void;
  addBalance: (n: number) => void;
  deductBalance: (n: number) => void;
  addTrade: (t: Trade) => void;
  addTransaction: (t: Transaction) => void;
  refreshData: () => Promise<void>;
}

const Ctx = createContext<AppState | null>(null);

export function AppProvider({ children }: { children: ReactNode }) {
  const [screen, setScreen] = useState<Screen>("onboarding");
  const [userId, setUserId] = useState<string | null>(null);
  const [user, setUser] = useState<AppState["user"]>(null);
  const [balance, setBalance] = useState(0);
  const [accountType, setAccountType] = useState<"normal" | "vip" | "vvip">("normal");
  const [maxSingleDeposit, setMaxSingleDeposit] = useState(0);
  const [trades, setTrades] = useState<Trade[]>([]);
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [loading, setLoading] = useState(false);
  const [settings, setSettings] = useState<PlatformSettings | null>(null);

  // Fetched once for the whole app — the deposit, trading, profile, dashboard
  // and home screens all read the same snapshot rather than each polling.
  useEffect(() => {
    fetch('/api/settings')
      .then(r => (r.ok ? r.json() : null))
      .then(d => { if (d) setSettings(d); })
      .catch(error => console.error('Failed to load platform settings:', error));
  }, []);

  // Restore session on mount
  useEffect(() => {
    const savedUserId = localStorage.getItem('userId');
    const savedUser = localStorage.getItem('user');
    if (savedUserId && savedUser) {
      setUserId(savedUserId);
      setUser(JSON.parse(savedUser));
      setScreen('dashboard');
    }
  }, []);

  const refreshData = async () => {
    if (!userId) return;
    try {
      const [balanceRes, tradesRes, transactionsRes] = await Promise.all([
        fetch(`/api/users/balance?userId=${userId}`),
        fetch(`/api/trades?userId=${userId}`),
        fetch(`/api/transactions?userId=${userId}`),
      ]);

      const balanceData = await balanceRes.json();
      const tradesData = await tradesRes.json();
      const transactionsData = await transactionsRes.json();

      if (balanceData.balance) setBalance(parseFloat(balanceData.balance));
      if (balanceData.accountType) setAccountType(balanceData.accountType);
      if (balanceData.maxSingleDeposit) setMaxSingleDeposit(parseFloat(balanceData.maxSingleDeposit));
      if (tradesData.trades) setTrades(tradesData.trades);
      if (transactionsData.transactions) setTransactions(transactionsData.transactions);
    } catch (error) {
      console.error('Failed to refresh data:', error);
    }
  };

  useEffect(() => {
    if (userId) {
      refreshData();
    }
  }, [userId]);

  const navigate = (s: Screen) => {
    console.log("Navigating to:", s);
    if (s === "trade") {
      setLoading(true);
      setTimeout(() => {
        setScreen(s);
        setLoading(false);
      }, 800);
    } else {
      setScreen(s);
    }
  };

  const handleSetUserId = (id: string) => {
    setUserId(id);
    localStorage.setItem('userId', id);
  };

  const handleSetUser = (u: AppState["user"] | null) => {
    setUser(u);
    if (u) {
      localStorage.setItem('user', JSON.stringify(u));
    } else {
      localStorage.removeItem('user');
      localStorage.removeItem('userId');
    }
  };

  return (
    <Ctx.Provider value={{
      screen, userId, user, balance, accountType, maxSingleDeposit, trades, transactions, loading, settings,
      navigate,
      setUser: handleSetUser,
      setUserId: handleSetUserId,
      addBalance: async (n) => {
        if (!userId) return;
        await fetch('/api/users/balance', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ userId, amount: n, isDeposit: n > 0 }),
        });
        await refreshData();
      },
      deductBalance: async (n) => {
        if (!userId) return;
        await fetch('/api/users/balance', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ userId, amount: -n }),
        });
        await refreshData();
      },
      addTrade: async (t) => {
        if (!userId) return;
        await fetch('/api/trades', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ userId, ...t }),
        });
        await refreshData();
      },
      addTransaction: async (t) => {
        if (!userId) return;
        await fetch('/api/transactions', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ userId, ...t }),
        });
        await refreshData();
      },
      refreshData,
    }}>
      {children}
    </Ctx.Provider>
  );
}

export const useApp = () => {
  const ctx = useContext(Ctx);
  if (!ctx) throw new Error("useApp must be used within AppProvider");
  return ctx;
};
