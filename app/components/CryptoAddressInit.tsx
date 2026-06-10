"use client";

import { useEffect } from "react";
import { TronWeb } from "tronweb";

export default function CryptoAddressInit() {
  useEffect(() => {
    // Initialize crypto deposit address on app start
    const initCryptoAddress = async () => {
      try {
        // For now, use a hardcoded TRON address to test the display
        // In production, this should be generated from a wallet
        const depositAddress = "T9yD14Nj9j7xAB4dbGeiX9p8tqd6i5PbKk";
        console.log("Using deposit address:", depositAddress, "Type:", typeof depositAddress);

        // Store in Redis via API
        const response = await fetch("/api/crypto/address", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ address: depositAddress }),
        });

        const result = await response.json();
        console.log("API response:", result);
      } catch (error) {
        console.error("Failed to initialize crypto address:", error);
      }
    };

    initCryptoAddress();
  }, []);

  return null;
}
