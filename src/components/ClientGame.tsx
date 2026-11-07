"use client";
import dynamic from "next/dynamic";

/**
 * Pages depend on the player's clock and localStorage, so they render only in
 * the browser (no hydration mismatch); the server sends a boot screen.
 */
const Boot = () => (
  <div className="boot" role="status">
    <span className="blink-slow">LOADING…</span>
  </div>
);

export const ClientHome = dynamic(() => import("@/components/Home"), { ssr: false, loading: Boot });
export const ClientDaily = dynamic(() => import("@/components/DailyGame"), { ssr: false, loading: Boot });
