import type { Metadata } from "next";
import "./globals.css";
import DatabaseInit from "./components/DatabaseInit";
import CryptoAddressInit from "./components/CryptoAddressInit";
import { SESSION_CLOCK } from "@/lib/trading-session";

export const metadata: Metadata = {
  title: "Wintradein — Crypto Trading",
  description: `Directional crypto trading on USDT pairs. Every session runs ${SESSION_CLOCK} and settles against your entry price.`,
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
        <link href="https://fonts.googleapis.com/css2?family=DM+Sans:opsz,wght@9..40,300;9..40,400;9..40,500;9..40,600;9..40,700&family=DM+Mono:wght@400;500&display=swap" rel="stylesheet" />
      </head>
      <body>
        <DatabaseInit />
        <CryptoAddressInit />
        {children}
      </body>
    </html>
  );
}
