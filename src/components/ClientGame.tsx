"use client";
import dynamic from "next/dynamic";

/**
 * The game depends on the player's clock and localStorage, so it renders only
 * in the browser (no hydration mismatch); the server sends a boot screen.
 */
const Game = dynamic(() => import("@/components/Game"), {
  ssr: false,
  loading: () => (
    <div className="boot" role="status">
      <span className="blink-slow">LOADING…</span>
    </div>
  ),
});

export default function ClientGame() {
  return <Game />;
}
