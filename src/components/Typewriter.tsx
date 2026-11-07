"use client";
import { useEffect, useState } from "react";

/** Dialog-box style text reveal. Tap to finish instantly. Full text is always exposed to screen readers. */
export function Typewriter({ text, speed = 22, className }: { text: string; speed?: number; className?: string }) {
  const [state, setState] = useState({ text, shown: 0 });
  // Reset when the text changes (derived during render, no effect needed).
  if (state.text !== text) setState({ text, shown: 0 });
  const shown = state.text === text ? state.shown : 0;

  useEffect(() => {
    if (shown >= text.length) return;
    const reduce = window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
    const t = setTimeout(() => setState((s) => ({ ...s, shown: reduce ? text.length : s.shown + 1 })), speed);
    return () => clearTimeout(t);
  }, [shown, text, speed]);

  const done = shown >= text.length;
  return (
    <p className={className} aria-label={text} onClick={() => setState({ text, shown: text.length })}>
      <span aria-hidden>{text.slice(0, shown)}</span>
      <span aria-hidden className="tw-ghost">
        {text.slice(shown)}
      </span>
      {done && (
        <span className="blink-cursor" aria-hidden>
          ▼
        </span>
      )}
    </p>
  );
}
