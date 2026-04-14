"use client";

import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { cn } from "@/lib/utils";

interface ClimateRiskPanelProps {
  level: number;
  flood?: string[];
  heat?: string[];
  storms?: string[];
  other?: string[];
}

type Section = {
  key: "flood" | "heat" | "storms" | "other";
  label: string;
  bullets?: string[];
};

function clampLevel(value: number): number {
  if (Number.isNaN(value)) return 0;
  return Math.max(0, Math.min(100, Math.round(value)));
}

function toneClasses(level: number): {
  bg: string;
  text: string;
  ring: string;
} {
  if (level <= 33) {
    return {
      bg: "bg-success-50",
      text: "text-success-700",
      ring: "ring-success-500/30",
    };
  }
  if (level <= 66) {
    return {
      bg: "bg-warning-50",
      text: "text-warning-700",
      ring: "ring-warning-500/30",
    };
  }
  return {
    bg: "bg-error-50",
    text: "text-error-700",
    ring: "ring-error-500/30",
  };
}

export function ClimateRiskPanel({
  level,
  flood,
  heat,
  storms,
  other,
}: ClimateRiskPanelProps) {
  const safeLevel = clampLevel(level);
  const tone = toneClasses(safeLevel);

  const sections: Section[] = [
    { key: "flood", label: "Flood", bullets: flood },
    { key: "heat", label: "Heat", bullets: heat },
    { key: "storms", label: "Storms", bullets: storms },
    { key: "other", label: "Other", bullets: other },
  ];

  const visibleSections = sections.filter(
    (section) => section.bullets && section.bullets.length > 0,
  );

  const isEmpty = visibleSections.length === 0;

  return (
    <Card>
      <CardHeader>
        <div className="flex items-start justify-between gap-4">
          <div>
            <p className="inline-flex items-center rounded-full bg-primary-50 px-2.5 py-1 text-[11px] font-semibold uppercase tracking-widest text-primary-700">
              Climate risk
            </p>
            <CardTitle className="mt-2 text-xl">
              Florida-specific exposure
            </CardTitle>
            <CardDescription className="mt-1.5">
              Composite score blending flood, heat, storm, and environmental
              signals.
            </CardDescription>
          </div>
          <div
            className={cn(
              "flex shrink-0 flex-col items-center justify-center rounded-2xl px-4 py-3 ring-1",
              tone.bg,
              tone.ring,
            )}
            aria-label={`Climate risk level ${safeLevel} out of 100`}
          >
            <span
              className={cn(
                "font-heading text-3xl font-semibold tabular-nums",
                tone.text,
              )}
            >
              {safeLevel}
            </span>
            <span
              className={cn(
                "mt-0.5 text-[10px] font-semibold uppercase tracking-widest",
                tone.text,
              )}
            >
              / 100
            </span>
          </div>
        </div>
      </CardHeader>
      <CardContent>
        {isEmpty ? (
          <div className="rounded-2xl border border-dashed border-neutral-200 bg-neutral-50/60 p-6 text-center">
            <p className="text-sm text-muted-foreground">
              Coming soon — flood/heat/storms data lands with the climate
              crawler.
            </p>
          </div>
        ) : (
          <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-4">
            {visibleSections.map((section) => (
              <div key={section.key}>
                <h3 className="text-[11px] font-semibold uppercase tracking-widest text-neutral-500">
                  {section.label}
                </h3>
                <ul className="mt-2 list-disc list-inside text-sm text-neutral-700 marker:text-neutral-300">
                  {section.bullets!.map((bullet, idx) => (
                    <li key={idx} className="leading-snug">
                      {bullet}
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
