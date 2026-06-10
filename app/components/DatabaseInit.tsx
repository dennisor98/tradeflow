"use client";
import { useEffect } from "react";

export default function DatabaseInit() {
  useEffect(() => {
    fetch('/api/init-db').catch(console.error);
  }, []);

  return null;
}
