"use client";

import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";

interface PropertyConditionCardProps {
  yearBuilt?: number;
  roofYear?: number;
  acYear?: number;
  windowsYear?: number;
  waterHeaterYear?: number;
}

type Tone = "neutral" | "ok" | "warning" | "error";

interface SystemStatus {
  age: number | null;
  tone: Tone;
  flag: string | null;
}

const CURRENT_YEAR = 2026;

function evaluateSystem(
  year: number | undefined,
  thresholds: { warning: number; error?: number },
): SystemStatus {
  if (typeof year !== "number") {
    return { age: null, tone: "neutral", flag: null };
  }

  const age = CURRENT_YEAR - year;

  if (typeof thresholds.error === "number" && age > thresholds.error) {
    return {
      age,
      tone: "error",
      flag: `${age} yrs · replace soon`,
    };
  }

  if (age > thresholds.warning) {
    return {
      age,
      tone: "warning",
      flag: `${age} yrs · aging`,
    };
  }

  return { age, tone: "ok", flag: `${age} yrs` };
}

const TONE_CLASSES: Record<Tone, { container: string; chip: string }> = {
  neutral: {
    container: "bg-muted ring-1 ring-inset ring-neutral-200",
    chip: "bg-muted text-muted-foreground",
  },
  ok: {
    container: "bg-success-50 ring-1 ring-inset ring-success-100",
    chip: "bg-success-100 text-success-700",
  },
  warning: {
    container: "bg-warning-50 ring-1 ring-inset ring-warning-100",
    chip: "bg-warning-100 text-warning-700",
  },
  error: {
    container: "bg-error-50 ring-1 ring-inset ring-error-100",
    chip: "bg-error-100 text-error-700",
  },
};

interface SystemTileProps {
  label: string;
  year?: number;
  status: SystemStatus;
}

function SystemTile({ label, year, status }: SystemTileProps) {
  const tone = TONE_CLASSES[status.tone];
  const isUnknown = typeof year !== "number";

  return (
    <div className={`flex flex-col gap-2 rounded-2xl p-4 ${tone.container}`}>
      <span className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
        {label}
      </span>
      <span className="font-heading text-lg font-semibold tabular-nums text-foreground">
        {isUnknown ? "Unknown" : year}
      </span>
      {status.flag && (
        <span
          className={`inline-flex w-fit items-center rounded-full px-2 py-0.5 text-[10px] font-medium ${tone.chip}`}
        >
          {status.flag}
        </span>
      )}
    </div>
  );
}

export function PropertyConditionCard({
  yearBuilt,
  roofYear,
  acYear,
  windowsYear,
  waterHeaterYear,
}: PropertyConditionCardProps) {
  const roof = evaluateSystem(roofYear, { warning: 15, error: 20 });
  const ac = evaluateSystem(acYear, { warning: 12, error: 15 });
  const windows = evaluateSystem(windowsYear, { warning: 25 });
  const waterHeater = evaluateSystem(waterHeaterYear, { warning: 12 });

  return (
    <Card>
      <CardHeader>
        <CardTitle>Property condition</CardTitle>
      </CardHeader>
      <CardContent className="flex flex-col gap-6">
        <div className="flex flex-col gap-1">
          <span className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
            Year built
          </span>
          <span className="font-heading text-3xl font-semibold tabular-nums text-foreground">
            {typeof yearBuilt === "number" ? yearBuilt : "Unknown"}
          </span>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <SystemTile label="Roof" year={roofYear} status={roof} />
          <SystemTile label="AC" year={acYear} status={ac} />
          <SystemTile label="Windows" year={windowsYear} status={windows} />
          <SystemTile
            label="Water heater"
            year={waterHeaterYear}
            status={waterHeater}
          />
        </div>
      </CardContent>
    </Card>
  );
}
