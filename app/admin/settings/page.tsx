"use client";
import { useCallback, useEffect, useState } from "react";
import { Banner, Button, input, panel, when } from "../admin-ui";

const NAMES = [
  "usdToKesRate", "minDepositUsd", "vipThresholdUsd", "vvipThresholdUsd",
  "winRateNormal", "winRateVip", "winRateVvip",
] as const;
type Name = (typeof NAMES)[number];

interface Meta {
  value: number;
  isDefault: boolean;
  default: number;
  min: number;
  max: number;
  label: string;
  percent: boolean;
  updatedBy: string | null;
  updatedAt: string | null;
}

/** Which fields each panel owns; a panel saves exactly its own fields. */
const PANELS: { id: string; title: string; blurb: string; fields: Name[] }[] = [
  {
    id: "rate",
    title: "Exchange rate",
    blurb: "Used to convert between the dollar balances shown in the app and the shillings charged over M-Pesa. Each deposit stores the rate in force when it was created, so a change here never re-prices a payment already in flight.",
    fields: ["usdToKesRate"],
  },
  {
    id: "minDeposit",
    title: "Minimum deposit",
    blurb: "The smallest deposit the platform accepts, in dollars. It gates both the deposit screen and the server, so raising it does not affect a payment already in flight.",
    fields: ["minDepositUsd"],
  },
  {
    id: "tiers",
    title: "Account tiers",
    blurb: "A user's tier is set by their largest single deposit. Promotion only — raising a threshold never demotes someone who already qualified. VVIP must sit at or above VIP.",
    fields: ["vipThresholdUsd", "vvipThresholdUsd"],
  },
  {
    id: "winRates",
    title: "Win rates",
    blurb: "The chance a session settles as a win, per tier. Applied when a session settles, so a change does not alter a session already running. These are shown to users on the home page and in their profile.",
    fields: ["winRateNormal", "winRateVip", "winRateVvip"],
  },
];

const FIELD_LABELS: Record<Name, string> = {
  usdToKesRate: "1 USD equals",
  minDepositUsd: "Deposits must be at least",
  vipThresholdUsd: "VIP from a single deposit of",
  vvipThresholdUsd: "VVIP from a single deposit of",
  winRateNormal: "Normal accounts win",
  winRateVip: "VIP accounts win",
  winRateVvip: "VVIP accounts win",
};

export default function AdminSettingsPage() {
  const [meta, setMeta] = useState<Record<Name, Meta> | null>(null);
  const [draft, setDraft] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState<string | null>("load");
  const [message, setMessage] = useState<{ type: "error" | "success"; text: string } | null>(null);

  const load = useCallback(async () => {
    try {
      const res = await fetch("/api/admin/settings");
      const payload = res.ok ? await res.json() : null;
      if (payload?.settings) {
        setMeta(payload.settings);
        setDraft(Object.fromEntries(NAMES.map(n => [n, String(payload.settings[n].value)])));
      } else {
        setMessage({ type: "error", text: "Could not load settings" });
      }
    } finally {
      setBusy(null);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const save = async (panelId: string, fields: Name[]) => {
    setBusy(panelId);
    setMessage(null);
    try {
      const res = await fetch("/api/admin/settings", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(Object.fromEntries(fields.map(f => [f, draft[f]]))),
      });
      const payload = await res.json();
      if (!res.ok) throw new Error(payload.error);
      const changed: Name[] = payload.changed ?? [];
      setMessage({
        type: "success",
        text: changed.length
          ? `Saved ${changed.map(c => meta?.[c].label ?? c).join(", ")}.`
          : "No changes to save.",
      });
      load();
    } catch (error) {
      setMessage({ type: "error", text: (error as Error).message });
      setBusy(null);
    }
  };

  const valid = (name: Name) => {
    const n = parseFloat(draft[name]);
    const m = meta?.[name];
    return Boolean(m) && Number.isFinite(n) && n >= m!.min && n <= m!.max;
  };

  const rate = parseFloat(draft.usdToKesRate);
  const rateValid = Number.isFinite(rate) && rate > 0;

  return (
    <>
      <h1 style={{ fontSize: 21, fontWeight: 700, marginBottom: 4 }}>Settings</h1>
      <p style={{ fontSize: 13, color: "var(--text-secondary)", marginBottom: 22 }}>
        Platform-wide values. Changes apply to new transactions only.
      </p>

      <Banner message={message} />

      {/*
        auto-fit rather than a fixed column count, so the cards reflow from one
        row on a wide screen down to a single column on a narrow one without a
        media query — inline styles would beat a class-based one anyway.
      */}
      <div style={{
        display: "grid",
        gridTemplateColumns: "repeat(auto-fit, minmax(320px, 1fr))",
        gap: 16,
        alignItems: "start",
      }}>
      {PANELS.map(p => {
        const allValid = p.fields.every(valid);
        return (
          <div key={p.id} style={{ ...panel, padding: 22 }}>
            <h2 style={{ fontSize: 15, fontWeight: 700, marginBottom: 6 }}>{p.title}</h2>
            <p style={{ fontSize: 13, color: "var(--text-secondary)", lineHeight: 1.55, marginBottom: 16 }}>
              {p.blurb}
            </p>

            {p.fields.map(name => {
              const m = meta?.[name];
              return (
                <div key={name} style={{ marginBottom: 14 }}>
                  <label
                    htmlFor={name}
                    style={{ fontSize: 12, fontWeight: 600, color: "var(--text-secondary)", display: "block", marginBottom: 5 }}
                  >
                    {FIELD_LABELS[name]}
                  </label>
                  <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
                    {!m?.percent && name !== "usdToKesRate" && (
                      <span style={{ fontSize: 14, color: "var(--text-secondary)" }}>$</span>
                    )}
                    <input
                      id={name}
                      type="number"
                      step={name === "usdToKesRate" ? "0.0001" : m?.percent ? "0.1" : "0.01"}
                      min={m?.min}
                      max={m?.max}
                      value={draft[name] ?? ""}
                      onChange={e => setDraft(d => ({ ...d, [name]: e.target.value }))}
                      style={{ ...input, width: 180, fontFamily: "'DM Mono', monospace", fontSize: 16 }}
                    />
                    <span style={{ fontSize: 14, color: "var(--text-secondary)" }}>
                      {name === "usdToKesRate" ? "KES" : m?.percent ? "%" : "USD"}
                    </span>
                  </div>
                  {m && !valid(name) && (
                    <p style={{ fontSize: 12, color: "var(--down, #c0392b)", marginTop: 5 }}>
                      Must be between {m.min}{m.percent ? "%" : ""} and {m.max}{m.percent ? "%" : ""}.
                    </p>
                  )}
                </div>
              );
            })}

            {p.id === "rate" && rateValid && (
              <p style={{ fontSize: 13, color: "var(--text-muted)", marginBottom: 16, fontFamily: "'DM Mono', monospace" }}>
                $10 → KES {(10 * rate).toFixed(0)} &nbsp;·&nbsp; $100 → KES {(100 * rate).toFixed(0)}
              </p>
            )}

            <Button tone="primary" onClick={() => save(p.id, p.fields)} disabled={busy !== null || !allValid}>
              {busy === p.id ? "Saving…" : "Save"}
            </Button>

            {meta && (
              <div style={{ fontSize: 12, color: "var(--text-muted)", marginTop: 16, lineHeight: 1.6 }}>
                {p.fields.map(name => {
                  const m = meta[name];
                  return (
                    <p key={name} style={{ margin: 0 }}>
                      <strong style={{ fontWeight: 600 }}>{m.label}:</strong>{" "}
                      {m.isDefault
                        ? `using the built-in default of ${m.default}${m.percent ? "%" : ""}.`
                        : `changed by ${m.updatedBy ?? "unknown"} on ${when(m.updatedAt)}.`}
                    </p>
                  );
                })}
                <p style={{ margin: "6px 0 0" }}>Takes up to 10 seconds to reach every server process.</p>
              </div>
            )}
          </div>
        );
      })}
      </div>
    </>
  );
}
