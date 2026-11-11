import { GAME_TITLE, type BallTier } from "@/config/game";
import type { DailySession } from "@/lib/session";
import { outcomeOf, scoreSummary } from "@/lib/session";
import type { TrainerClassInfo } from "@/lib/progress/streak";

/** Spoiler-free emoji per result. */
export const SHARE_SYMBOL: Record<BallTier | "miss" | "timeout", string> = {
  poke: "🔴",
  great: "🔵",
  ultra: "🟡",
  master: "🟣",
  miss: "⬛",
  timeout: "⌛",
};

export function buildShareText(session: DailySession, number: number, trainer: TrainerClassInfo, url?: string): string {
  const balls = session.answers.map((a) => SHARE_SYMBOL[a.tier ?? (outcomeOf(a) === "timeout" ? "timeout" : "miss")]).join("");
  const masters = session.answers.filter((a) => a.tier === "master").length;
  const sum = scoreSummary(session);
  const lines = [
    `${GAME_TITLE} #${number}`,
    `${balls}  ${sum.final} pts`,
    ...(sum.synergy ? [`🛡️ Team ${sum.synergy.tier.label} ×${sum.multiplier.toFixed(2)}`] : []),
    `🔥 ${trainer.streak}-day streak · ${trainer.name}${masters ? ` · ${masters}× Master Ball` : ""}`,
  ];
  if (url) lines.push(url);
  return lines.join("\n");
}
