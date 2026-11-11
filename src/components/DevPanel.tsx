"use client";
import { useState } from "react";
import { addDays, dateKeyFor } from "@/lib/dates";
import type { Question } from "@/data/types";
import { getSpecies } from "@/lib/pokedex";

/** Developer tools (open with ?dev=1). Uses an isolated save namespace. */
export function DevPanel({
  date,
  question,
  onReset,
}: {
  date: string;
  question?: Question;
  onReset: () => void;
}) {
  const [open, setOpen] = useState(false);
  const go = (d: string) => {
    const url = new URL(window.location.href);
    url.searchParams.set("dev", "1");
    url.searchParams.set("date", d);
    window.location.href = url.toString();
  };
  const sample = question ? question.answers.slice(0, 6).map((id) => getSpecies(id)?.name).join(", ") : "";

  return (
    <aside className="devpanel" aria-label="Developer tools">
      <button className="devpanel__toggle" onClick={() => setOpen(!open)}>
        DEV {open ? "▼" : "▲"}
      </button>
      {open && (
        <div className="devpanel__body">
          <div className="devpanel__row">
            <button className="btn btn--small" onClick={() => go(addDays(date, -1))}>◀ DAY</button>
            <input
              type="date"
              value={date}
              onChange={(e) => e.target.value && go(e.target.value)}
              aria-label="Simulated challenge date"
            />
            <button className="btn btn--small" onClick={() => go(addDays(date, 1))}>DAY ▶</button>
          </div>
          <div className="devpanel__row">
            <button className="btn btn--small" onClick={() => go(dateKeyFor())}>TODAY</button>
            <button className="btn btn--small" onClick={onReset}>RESET DEV SAVE</button>
            <button
              className="btn btn--small"
              onClick={() => {
                const url = new URL(window.location.href);
                if (url.searchParams.get("wildcards") === "preview") url.searchParams.delete("wildcards");
                else url.searchParams.set("wildcards", "preview");
                window.location.href = url.toString();
              }}
            >
              {typeof window !== "undefined" && new URLSearchParams(window.location.search).get("wildcards") === "preview" ? "HIDE PENDING WILDCARDS" : "PREVIEW PENDING WILDCARDS"}
            </button>
            <button className="btn btn--small" onClick={() => window.location.assign(window.location.origin + "/")}>EXIT DEV</button>
          </div>
          {question && (
            <div className="devpanel__hint">
              {question.id} · {question.answers.length} answers · e.g. {sample}
            </div>
          )}
        </div>
      )}
    </aside>
  );
}
