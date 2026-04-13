"use client";

import { cn } from "@/lib/utils";

type LeverageData = {
  score: number;
  topSignals: Array<{
    name: string;
    direction: "bullish" | "bearish" | "neutral";
    delta: number;
  }>;
  overallConfidence: number;
} | null;

interface LeverageScoreCardProps {
  status: "available" | "pending" | "unavailable";
  data: LeverageData;
  reason?: string;
}

function scoreTone(score: number) {
  if (score >= 70) {
    return {
      ring: "ring-emerald-200",
      bg: "bg-emerald-50",
      text: "text-emerald-700",
      label: "Strong leverage",
    };
  }
  if (score >= 40) {
    return {
      ring: "ring-amber-200",
      bg: "bg-amber-50",
      text: "text-amber-700",
      label: "Balanced",
    };
  }
  return {
    ring: "ring-rose-200",
    bg: "bg-rose-50",
    text: "text-rose-700",
    label: "Seller's market",
  };
}

function directionIcon(direction: "bullish" | "bearish" | "neutral"): string {
  if (direction === "bullish") return "↑";
  if (direction === "bearish") return "↓";
  return "→";
}

function directionTone(direction: "bullish" | "bearish" | "neutral"): string {
  if (direction === "bullish") return "text-emerald-600";
  if (direction === "bearish") return "text-rose-600";
  return "text-neutral-500";
}

export function LeverageScoreCard({
  status,
  data,
  reason,
}: LeverageScoreCardProps) {
  return (
    <section className="rounded-[24px] border border-neutral-200 bg-white p-6 transition-shadow hover:shadow-md sm:p-8">
      <header className="mb-5">
        <p className="text-xs font-semibold uppercase tracking-widest text-primary-400">
          Leverage score
        </p>
        <h2 className="mt-1 text-lg font-semibold text-neutral-800">
          How much room you have
        </h2>
      </header>

      {status === "available" && data ? (
        <>
          <div className="flex items-center gap-5">
            <ScoreDial score={data.score} />
            <div className="flex flex-col gap-1">
              <span
                className={cn(
                  "inline-flex w-fit rounded-full px-3 py-1 text-xs font-semibold",
                  scoreTone(data.score).bg,
                  scoreTone(data.score).text,
                )}
              >
                {scoreTone(data.score).label}
              </span>
              <p className="text-xs text-neutral-500">
                Confidence {Math.round(data.overallConfidence * 100)}%
              </p>
            </div>
          </div>

          <ul className="mt-6 space-y-3 border-t border-neutral-100 pt-5">
            {data.topSignals.length === 0 ? (
              <li className="text-sm text-neutral-500">
                No dominant signals yet — more data needed.
              </li>
            ) : (
              data.topSignals.map((signal) => (
                <li
                  key={signal.name}
                  className="flex items-start justify-between gap-3 text-sm"
                >
                  <span className="font-medium text-neutral-700">
                    {signal.name}
                  </span>
                  <span
                    className={cn(
                      "font-semibold",
                      directionTone(signal.direction),
                    )}
                  >
                    {directionIcon(signal.direction)}{" "}
                    {signal.delta > 0 ? "+" : ""}
                    {(signal.delta * 100).toFixed(0)}%
                  </span>
                </li>
              ))
            )}
          </ul>

          <button
            type="button"
            className="mt-5 text-xs font-semibold text-primary-600 hover:text-primary-700"
          >
            More signals →
          </button>
        </>
      ) : (
        <LeverageEmptyState status={status} reason={reason} />
      )}
    </section>
  );
}

function ScoreDial({ score }: { score: number }) {
  const tone = scoreTone(score);
  const clamped = Math.max(0, Math.min(100, score));
  return (
    <div
      className={cn(
        "flex h-24 w-24 items-center justify-center rounded-full ring-4",
        tone.ring,
        tone.bg,
      )}
    >
      <span className={cn("text-3xl font-bold", tone.text)}>
        {Math.round(clamped)}
      </span>
    </div>
  );
}

function LeverageEmptyState({
  status,
  reason,
}: {
  status: "pending" | "unavailable" | "available";
  reason?: string;
}) {
  const label =
    status === "pending" ? "Under review" : "Insufficient data";
  return (
    <div className="flex flex-col gap-2 rounded-2xl border border-dashed border-neutral-200 bg-neutral-50 p-6 text-center">
      <p className="text-sm font-semibold text-neutral-700">{label}</p>
      <p className="text-xs text-neutral-500">
        {reason ?? "We'll score leverage signals once the engine completes."}
      </p>
    </div>
  );
}
