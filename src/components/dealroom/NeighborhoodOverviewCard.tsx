"use client";

import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";

interface NeighborhoodOverviewCardProps {
  neighborhood?: string;
  city: string;
  state: string;
  walkScore?: number;
  bikeScore?: number;
  transitScore?: number;
}

interface ScoreCircleProps {
  label: string;
  score?: number;
}

function ScoreCircle({ label, score }: ScoreCircleProps) {
  const hasScore = typeof score === "number";

  return (
    <div className="flex flex-col items-center gap-2">
      <div className="relative flex h-20 w-20 items-center justify-center rounded-full bg-primary-50 text-primary-700">
        <span className="font-heading text-2xl font-semibold tabular-nums">
          {hasScore ? score : "—"}
        </span>
      </div>
      <div className="flex flex-col items-center gap-1">
        <span className="text-xs font-medium text-neutral-600">{label}</span>
        {!hasScore && (
          <span className="rounded-full bg-neutral-100 px-2 py-0.5 text-[10px] font-medium uppercase tracking-wide text-neutral-500">
            Soon
          </span>
        )}
      </div>
    </div>
  );
}

export function NeighborhoodOverviewCard({
  neighborhood,
  city,
  state,
  walkScore,
  bikeScore,
  transitScore,
}: NeighborhoodOverviewCardProps) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>Neighborhood overview</CardTitle>
      </CardHeader>
      <CardContent className="flex flex-col gap-6">
        <div className="grid grid-cols-3 gap-4">
          <ScoreCircle label="Walk" score={walkScore} />
          <ScoreCircle label="Bike" score={bikeScore} />
          <ScoreCircle label="Transit" score={transitScore} />
        </div>
        <div className="flex flex-col gap-1">
          <p className="font-heading text-xl font-semibold text-foreground">
            {neighborhood ?? `${city}, ${state}`}
          </p>
          <p className="text-sm text-neutral-500">
            Located in {city}, {state}
          </p>
        </div>
        <p className="text-xs text-neutral-500">
          Crime + school ratings coming soon
        </p>
      </CardContent>
    </Card>
  );
}
