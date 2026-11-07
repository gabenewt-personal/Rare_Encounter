"use client";
import { useEffect, useRef, useState } from "react";
import { prefersReducedMotion } from "@/lib/client";

/**
 * Dialog-box style text reveal. Tap to finish instantly. The full text is
 * always exposed to screen readers, and invisible "ghost" text reserves the
 * final size so nothing below shifts while it types.
 */
export function Typewriter({
  text,
  speed = 22,
  className,
  instant = false,
  onDone,
}: {
  text: string;
  speed?: number;
  className?: string;
  /** Show the whole text immediately (e.g. resuming a running timer). */
  instant?: boolean;
  onDone?: () => void;
}) {
  const [state, setState] = useState({ text, shown: instant ? text.length : 0 });
  // Reset when the text changes (derived during render, no effect needed).
  if (state.text !== text) setState({ text, shown: instant ? text.length : 0 });
  const shown = state.text === text ? state.shown : 0;
  const done = shown >= text.length;
  const onDoneRef = useRef(onDone);
  useEffect(() => {
    onDoneRef.current = onDone;
  });

  useEffect(() => {
    if (done) {
      onDoneRef.current?.();
      return;
    }
    const all = prefersReducedMotion();
    const t = setTimeout(() => setState((s) => ({ ...s, shown: all ? text.length : s.shown + 1 })), speed);
    return () => clearTimeout(t);
  }, [shown, text, speed, done]);

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
