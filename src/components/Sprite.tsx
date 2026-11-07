"use client";
/* eslint-disable @next/next/no-img-element -- pixel sprites must not be resampled by next/image */
import { useState } from "react";
import { spriteUrl } from "@/lib/sprites";

/** Original placeholder art (16×16) used when no licensed sprite is available. */
const PLACEHOLDER = [
  "................",
  ".....kkkkkk.....",
  "...kkGGGGGGkk...",
  "..kGGGGGGGGGGk..",
  ".kGGGkkkkkkGGGk.",
  ".kGGkk....kkGGk.",
  "kGGGGG....kkGGGk",
  "kGGGGGG..kkGGGGk",
  "kGGGGGG.kkGGGGGk",
  "kGGGGGGkkGGGGGGk",
  ".kGGGGGkkGGGGGk.",
  ".kGGGGGGGGGGGGk.",
  "..kGGGGkkGGGGk..",
  "...kkGGkkGGkk...",
  ".....kkkkkk.....",
  "................",
];

function Placeholder({ size }: { size: number }) {
  return (
    <svg viewBox="0 0 16 16" width={size} height={size} shapeRendering="crispEdges" aria-hidden>
      {PLACEHOLDER.flatMap((row, y) =>
        [...row].map((ch, x) =>
          ch === "." ? null : <rect key={`${x}-${y}`} x={x} y={y} width={1.02} height={1.02} fill={ch === "k" ? "var(--ink)" : "var(--green-light)"} />,
        ),
      )}
    </svg>
  );
}

export function Sprite({ id, name, size = 192, className }: { id: number; name: string; size?: number; className?: string }) {
  const [failedId, setFailedId] = useState<number | null>(null);
  const url = spriteUrl(id);
  if (!url || failedId === id) {
    return (
      <span className={className} role="img" aria-label={`${name} (placeholder art)`}>
        <Placeholder size={size * 0.6} />
      </span>
    );
  }
  return (
    <img
      src={url}
      alt={name}
      width={size}
      height={size}
      className={`pixelated ${className ?? ""}`}
      onError={() => setFailedId(id)}
      draggable={false}
    />
  );
}
