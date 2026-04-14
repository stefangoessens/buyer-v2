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

export interface LeverageSignal {
  label: string;
  delta: number;
  source: "mls" | "crawl" | "ai" | "market";
  sourceRef?: string;
  confidence: number;
}

interface LeverageScoreCardProps {
  status: "available" | "pending" | "unavailable";
  data: LeverageData;
  reason?: string;
  signals?: LeverageSignal[];
}

function positionLabel(score: number): "strong" | "moderate" | "limited" {
  if (score >= 70) return "strong";
  if (score >= 40) return "moderate";
  return "limited";
}

function deltaDirection(
  delta: number,
): "bullish" | "bearish" | "neutral" {
  if (delta > 0) return "bullish";
  if (delta < 0) return "bearish";
  return "neutral";
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
  signals,
}: LeverageScoreCardProps) {
  const hasExtendedSignals = signals !== undefined && signals.length > 0;
  const narrative =
    hasExtendedSignals && data
      ? buildNarrative(data.score, signals)
      : null;

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

          {narrative ? (
            <p className="mt-5 text-sm leading-relaxed text-neutral-600">
              {narrative}
            </p>
          ) : null}

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

          {hasExtendedSignals ? (
            <ul className="mt-5 space-y-4 border-t border-neutral-100 pt-5">
              {signals.map((signal, index) => {
                const direction = deltaDirection(signal.delta);
                const isAi =
                  signal.source === "ai" ||
                  (signal.sourceRef !== undefined &&
                    signal.sourceRef.toLowerCase().endsWith("ai"));
                return (
                  <li
                    key={`${signal.label}-${index}`}
                    className="flex flex-col gap-1"
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div className="flex flex-1 flex-wrap items-center gap-2">
                        <span className="text-sm font-medium text-neutral-700">
                          {signal.label}
                        </span>
                        <span className="rounded-full bg-neutral-100 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-neutral-600">
                          {signal.source}
                        </span>
                        {isAi ? (
                          <span className="rounded-full bg-primary-50 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-primary-700">
                            AI-reasoned
                          </span>
                        ) : null}
                      </div>
                      <span
                        className={cn(
                          "text-sm font-semibold",
                          directionTone(direction),
                        )}
                      >
                        {directionIcon(direction)}{" "}
                        {signal.delta > 0 ? "+" : ""}
                        {(signal.delta * 100).toFixed(0)}%
                      </span>
                    </div>
                    <div className="flex items-center justify-between gap-3">
                      {signal.sourceRef ? (
                        <span className="text-xs text-neutral-500">
                          {signal.sourceRef}
                        </span>
                      ) : (
                        <span />
                      )}
                      <span className="text-xs text-neutral-400">
                        {Math.round(signal.confidence * 100)}% conf
                      </span>
                    </div>
                  </li>
                );
              })}
            </ul>
          ) : null}

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

function buildNarrative(
  score: number,
  signals: LeverageSignal[],
): string {
  const position = positionLabel(score);
  const top = [...signals]
    .sort((a, b) => Math.abs(b.delta) - Math.abs(a.delta))
    .slice(0, 3)
    .map((s) => s.label.toLowerCase())
    .join(", ");
  return `You're in a ${position} bargaining position because ${top}.`;
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
