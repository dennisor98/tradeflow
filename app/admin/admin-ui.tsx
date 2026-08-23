"use client";
import { ReactNode } from "react";

export const money = (v: unknown) =>
  `$${Number(v ?? 0).toLocaleString("en", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

export const when = (v: unknown) => (v ? new Date(v as string).toLocaleString("en-GB") : "—");

export const panel: React.CSSProperties = {
  background: "var(--surface)",
  border: "1px solid var(--border)",
  borderRadius: "var(--radius)",
  boxShadow: "var(--shadow)",
};

export const th: React.CSSProperties = {
  textAlign: "left",
  padding: "10px 14px",
  fontSize: 11,
  letterSpacing: "0.08em",
  textTransform: "uppercase",
  color: "var(--text-muted)",
  fontWeight: 600,
  borderBottom: "1px solid var(--border)",
  whiteSpace: "nowrap",
};

export const td: React.CSSProperties = {
  padding: "12px 14px",
  fontSize: 13,
  borderBottom: "1px solid var(--border)",
  verticalAlign: "middle",
};

export const input: React.CSSProperties = {
  padding: "9px 12px",
  border: "1px solid var(--border)",
  borderRadius: "var(--radius-sm)",
  fontSize: 14,
  outline: "none",
  background: "var(--bg)",
  color: "var(--text-primary)",
  fontFamily: "inherit",
};

export function Button({
  children,
  onClick,
  tone = "default",
  disabled,
  type = "button",
}: {
  children: ReactNode;
  onClick?: () => void;
  tone?: "default" | "primary" | "danger";
  disabled?: boolean;
  type?: "button" | "submit";
}) {
  const tones = {
    default: { background: "var(--surface)", color: "var(--text-primary)", border: "1px solid var(--border-strong)" },
    primary: { background: "var(--accent)", color: "var(--on-accent)", border: "1px solid var(--accent)" },
    danger: { background: "var(--danger)", color: "var(--on-accent)", border: "1px solid var(--danger)" },
  }[tone];
  return (
    <button
      type={type}
      onClick={onClick}
      disabled={disabled}
      style={{
        ...tones,
        padding: "9px 14px",
        borderRadius: "var(--radius-sm)",
        fontSize: 13,
        fontWeight: 600,
        cursor: disabled ? "not-allowed" : "pointer",
        opacity: disabled ? 0.55 : 1,
        fontFamily: "inherit",
        whiteSpace: "nowrap",
      }}
    >
      {children}
    </button>
  );
}

const TAG_TONES: Record<string, { bg: string; fg: string }> = {
  admin: { bg: "#241a3d", fg: "#c4b5fd" },
  marketer: { bg: "#332612", fg: "#e6b455" },
  user: { bg: "var(--surface-2)", fg: "var(--text-secondary)" },
  vvip: { bg: "#332612", fg: "var(--gold)" },
  vip: { bg: "var(--surface-2)", fg: "var(--text-secondary)" },
  normal: { bg: "var(--surface-2)", fg: "var(--text-muted)" },
  completed: { bg: "var(--up-bg)", fg: "var(--up)" },
  pending: { bg: "var(--warning-light)", fg: "var(--warning)" },
  failed: { bg: "var(--down-bg)", fg: "var(--down)" },
  active: { bg: "var(--up-bg)", fg: "var(--up)" },
  inactive: { bg: "var(--down-bg)", fg: "var(--down)" },
};

export function Tag({ value }: { value: string }) {
  const tone = TAG_TONES[value] ?? TAG_TONES.user;
  return (
    <span
      style={{
        background: tone.bg,
        color: tone.fg,
        padding: "3px 8px",
        borderRadius: 5,
        fontSize: 11,
        fontWeight: 600,
        letterSpacing: "0.02em",
        whiteSpace: "nowrap",
      }}
    >
      {value}
    </span>
  );
}

export function Banner({ message }: { message: { type: "error" | "success"; text: string } | null }) {
  if (!message) return null;
  const err = message.type === "error";
  return (
    <div
      role="status"
      style={{
        padding: "11px 14px",
        borderRadius: "var(--radius-sm)",
        marginBottom: 16,
        fontSize: 13,
        fontWeight: 500,
        background: err ? "var(--down-bg)" : "var(--up-bg)",
        color: err ? "var(--down)" : "var(--up)",
        border: `1px solid ${err ? "var(--down)" : "var(--up)"}`,
      }}
    >
      {message.text}
    </div>
  );
}
