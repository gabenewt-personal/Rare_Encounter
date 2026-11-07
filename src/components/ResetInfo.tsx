"use client";
import { useEffect, useState } from "react";
import { RESET_TIMEZONE_LABEL } from "@/config/game";
import { formatCountdown, msUntilReset, nextResetAt } from "@/lib/dates";

/** "NEXT CHALLENGE IN 05:12:09 · RESETS 00:00 UTC (7:00 PM YOUR TIME)" */
export function ResetInfo({ isDev }: { isDev: boolean }) {
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    const t = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(t);
  }, []);
  const local = nextResetAt(now).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });
  return (
    <p className="reset-info label">
      {isDev ? (
        <>DEV MODE · DAYS CHANGE VIA THE DEV PANEL</>
      ) : (
        <>
          NEXT CHALLENGE IN <span className="num reset-info__count">{formatCountdown(msUntilReset(now))}</span>
        </>
      )}
      <br />
      RESETS 00:00 {RESET_TIMEZONE_LABEL} <span className="reset-info__local">({local} YOUR TIME)</span>
    </p>
  );
}
