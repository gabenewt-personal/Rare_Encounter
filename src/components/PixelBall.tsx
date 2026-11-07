import type { BallTier } from "@/config/game";

/**
 * Original 12×12 pixel-art capture balls, drawn as SVG rects so they scale
 * crisply at any size. Each tier is the base ball + an overlay.
 */
const BASE = [
  "....kkkk....",
  "..kkTTTTkk..",
  ".kTTTTTTHHk.",
  ".kTTTTTTTHk.",
  "kTTTkkkkTTTk",
  "kkkkkwwkkkkk",
  "kkkkkwwkkkkk",
  "kBBBkkkkBBBk",
  ".kBBBBBBBBk.",
  ".kBBBBBBSSk.",
  "..kkBBSSkk..",
  "....kkkk....",
];

const OVERLAY: Partial<Record<BallTier | "miss", string[]>> = {
  great: ["", "", ".kRR...RR...", ".kRR...RR...", ".", "", "", "", "", "", "", ""],
  ultra: ["", "", "...Y....Y...", "...Y....Y...", "...Y....Y...", "", "", "", "", "", "", ""],
  master: ["", "", "..PP.MM..PP.", "..PP.MM..PP.", "", "", "", "", "", "", "", ""],
};

type Palette = Record<string, string>;
const COMMON: Palette = { k: "#1d1f1c", w: "#fff8e6", B: "#efe6c8", S: "#cbbd93", H: "#ffffff" };
const PALETTES: Record<BallTier | "miss" | "empty", Palette> = {
  poke: { ...COMMON, T: "#c8483f" },
  great: { ...COMMON, T: "#3f6db0", R: "#c8483f" },
  ultra: { ...COMMON, T: "#2c2d2a", Y: "#d4b04a" },
  master: { ...COMMON, T: "#7a4fa6", P: "#e589bf", M: "#fff8e6" },
  miss: { k: "#5b5f57", w: "#9a9d92", B: "#b9b6a2", S: "#a29f8b", H: "#c9c6b4", T: "#7d8077" },
  empty: { k: "#1d1f1c33", w: "transparent", B: "transparent", S: "transparent", H: "transparent", T: "transparent" },
};

export type BallKind = BallTier | "miss" | "empty";

export function PixelBall({ tier, size = 24, className, title }: { tier: BallKind; size?: number; className?: string; title?: string }) {
  const pal = PALETTES[tier];
  const overlay = tier === "empty" || tier === "miss" ? undefined : OVERLAY[tier];
  const rects: React.ReactNode[] = [];
  BASE.forEach((row, y) => {
    for (let x = 0; x < row.length; x++) {
      const o = overlay?.[y]?.[x];
      const ch = o && o !== "." ? o : row[x];
      if (ch === "." || !pal[ch]) continue;
      rects.push(
        <rect key={`${x}-${y}`} x={x} y={y} width={1.02} height={1.02} fill={pal[ch]} fillOpacity={ch === "H" ? 0.55 : 1} />,
      );
    }
  });
  return (
    <svg
      viewBox="0 0 12 12"
      width={size}
      height={size}
      className={className}
      shapeRendering="crispEdges"
      role={title ? "img" : undefined}
      aria-label={title}
      aria-hidden={title ? undefined : true}
    >
      {rects}
    </svg>
  );
}
