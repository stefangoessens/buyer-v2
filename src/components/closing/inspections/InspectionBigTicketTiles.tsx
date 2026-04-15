"use client";

import { HugeiconsIcon } from "@hugeicons/react";
import {
  Building01Icon,
  DropletIcon,
  ElectricPlugsIcon,
  FlashIcon,
  Home01Icon,
} from "@hugeicons/core-free-icons";
import type { Doc } from "../../../../convex/_generated/dataModel";
import { Card, CardContent } from "@/components/ui/card";
import { cn } from "@/lib/utils";

type FileFactDoc = Doc<"fileFacts">;
type StatusColor = "green" | "amber" | "red" | "neutral";

interface InspectionBigTicketTilesProps {
  facts: FileFactDoc[];
}

interface TileSpec {
  key: string;
  icon: typeof Building01Icon;
  label: string;
  headline: string;
  subtext: string;
  status: StatusColor;
  redChip?: string;
}

function findFact(facts: FileFactDoc[], slug: string): FileFactDoc | undefined {
  return facts.find((f) => f.factSlug === slug);
}

function roofTile(facts: FileFactDoc[]): TileSpec {
  const fact = findFact(facts, "inspection.roof_age_years");
  const years = fact?.valueNumeric;
  let status: StatusColor = "neutral";
  let headline = "Roof: not in report";
  let subtext = "Most FL insurers want a roof under 15 years.";
  if (typeof years === "number") {
    headline = `Roof: ${years} year${years === 1 ? "" : "s"}`;
    if (years > 20) {
      status = "red";
      subtext = "Insurers usually decline coverage above 20 years.";
    } else if (years >= 15) {
      status = "amber";
      subtext = "Insurers usually push back above 15 years.";
    } else {
      status = "green";
      subtext = "Most FL insurers will write coverage at this age.";
    }
  }
  return {
    key: "roof",
    icon: Home01Icon,
    label: "Roof",
    headline,
    subtext,
    status,
  };
}

function hvacTile(facts: FileFactDoc[]): TileSpec {
  const fact = findFact(facts, "inspection.hvac_age_years");
  const years = fact?.valueNumeric;
  let status: StatusColor = "neutral";
  let headline = "HVAC: not in report";
  let subtext = "FL HVAC systems typically last 10 to 15 years.";
  if (typeof years === "number") {
    headline = `HVAC: ${years} year${years === 1 ? "" : "s"}`;
    if (years > 15) {
      status = "red";
      subtext = "Plan to budget for HVAC replacement soon.";
    } else if (years >= 10) {
      status = "amber";
      subtext = "Approaching the end of typical FL life expectancy.";
    } else {
      status = "green";
      subtext = "Plenty of life left for a typical FL HVAC system.";
    }
  }
  return {
    key: "hvac",
    icon: Building01Icon,
    label: "HVAC",
    headline,
    subtext,
    status,
  };
}

function electricalTile(facts: FileFactDoc[]): TileSpec {
  const fact = findFact(facts, "inspection.electrical_panel_type");
  const panel = fact?.valueEnum;
  let status: StatusColor = "neutral";
  let headline = "Panel: not in report";
  let subtext = "FPE and Zinsco panels are common insurance dealbreakers.";
  let redChip: string | undefined;
  if (panel) {
    headline = `Panel: ${panel}`;
    if (panel === "FPE" || panel === "Zinsco") {
      status = "red";
      subtext = "Insurers and lenders almost always require replacement.";
      redChip = panel;
    } else if (panel === "other") {
      status = "amber";
      subtext = "Inspector flagged a non-standard panel — confirm details.";
    } else {
      status = "green";
      subtext = "Modern panel — no insurance red flag here.";
    }
  }
  return {
    key: "electrical",
    icon: FlashIcon,
    label: "Electrical",
    headline,
    subtext,
    status,
    redChip,
  };
}

function plumbingTile(facts: FileFactDoc[]): TileSpec {
  const fact = findFact(facts, "inspection.plumbing_material");
  const material = fact?.valueEnum;
  let status: StatusColor = "neutral";
  let headline = "Plumbing: not in report";
  let subtext = "Polybutylene is a common FL insurance dealbreaker.";
  let redChip: string | undefined;
  if (material) {
    headline = `Plumbing: ${material}`;
    if (material === "polybutylene") {
      status = "red";
      subtext = "Insurers usually require full repipe before binding coverage.";
      redChip = "polybutylene";
    } else if (material === "galvanized") {
      status = "amber";
      subtext = "Galvanized pipes typically need replacement within 10 years.";
    } else if (material === "other") {
      status = "amber";
      subtext = "Non-standard plumbing material — confirm with inspector.";
    } else {
      status = "green";
      subtext = "Modern plumbing — no insurance red flag here.";
    }
  }
  return {
    key: "plumbing",
    icon: DropletIcon,
    label: "Plumbing",
    headline,
    subtext,
    status,
    redChip,
  };
}

function structuralTile(facts: FileFactDoc[]): TileSpec {
  const fact = findFact(facts, "inspection.structural_concern_flag");
  const flag = fact?.valueBoolean;
  let status: StatusColor = "neutral";
  let headline = "Structural: not in report";
  let subtext = "Inspector did not weigh in on structural concerns.";
  if (typeof flag === "boolean") {
    if (flag) {
      status = "red";
      headline = "Structural: concerns found";
      subtext = "Inspector flagged structural concerns. Get an engineer.";
    } else {
      status = "green";
      headline = "Structural: no concerns noted";
      subtext = "Inspector did not flag structural concerns.";
    }
  }
  return {
    key: "structural",
    icon: ElectricPlugsIcon,
    label: "Structural",
    headline,
    subtext,
    status,
  };
}

const STATUS_BAR: Record<StatusColor, string> = {
  green: "bg-emerald-500",
  amber: "bg-amber-400",
  red: "bg-destructive",
  neutral: "bg-muted-foreground/30",
};

const STATUS_CHIP: Record<StatusColor, string> = {
  green: "bg-emerald-50 text-emerald-700 border-emerald-200",
  amber: "bg-amber-50 text-amber-800 border-amber-200",
  red: "bg-destructive/10 text-destructive border-destructive/30",
  neutral: "bg-muted text-muted-foreground border-border",
};

const STATUS_LABEL: Record<StatusColor, string> = {
  green: "Looks good",
  amber: "Watch",
  red: "Red flag",
  neutral: "No data",
};

function Tile({ spec, className }: { spec: TileSpec; className?: string }) {
  return (
    <Card
      className={cn(
        "overflow-hidden rounded-3xl border-border bg-card",
        className,
      )}
      data-testid={`inspection-tile-${spec.key}`}
    >
      <div className={cn("h-1 w-full", STATUS_BAR[spec.status])} />
      <CardContent className="flex h-full flex-col gap-3 p-5">
        <div className="flex items-center justify-between gap-2">
          <span className="flex size-9 items-center justify-center rounded-2xl bg-primary/10 text-primary">
            <HugeiconsIcon icon={spec.icon} size={18} strokeWidth={2} />
          </span>
          <span
            className={cn(
              "rounded-full border px-2.5 py-0.5 text-[11px] font-semibold uppercase tracking-wide",
              STATUS_CHIP[spec.status],
            )}
          >
            {STATUS_LABEL[spec.status]}
          </span>
        </div>
        <div className="flex flex-col gap-1">
          <p className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
            {spec.label}
          </p>
          <p className="font-heading text-lg font-semibold text-foreground">
            {spec.headline}
          </p>
          {spec.redChip && (
            <span
              className={cn(
                "mt-1 inline-flex w-fit items-center rounded-full border border-destructive/30 bg-destructive/10 px-2 py-0.5 text-[11px] font-semibold uppercase tracking-wide text-destructive",
              )}
            >
              {spec.redChip}
            </span>
          )}
          <p className="mt-1 text-xs leading-relaxed text-muted-foreground">
            {spec.subtext}
          </p>
        </div>
      </CardContent>
    </Card>
  );
}

export function InspectionBigTicketTiles({
  facts,
}: InspectionBigTicketTilesProps) {
  const tiles: TileSpec[] = [
    roofTile(facts),
    hvacTile(facts),
    electricalTile(facts),
    plumbingTile(facts),
    structuralTile(facts),
  ];

  return (
    <section
      aria-label="Inspection big-ticket items"
      data-testid="inspection-big-ticket-tiles"
      className="flex flex-col gap-3"
    >
      <div className="flex flex-col gap-1">
        <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
          Big-ticket snapshot
        </p>
        <h3 className="font-heading text-xl font-semibold tracking-tight text-foreground">
          The five things every FL buyer asks about
        </h3>
      </div>

      {/* Mobile: horizontal scroll-snap rail */}
      <div
        className="-mx-4 flex snap-x snap-mandatory gap-3 overflow-x-auto px-4 pb-2 md:hidden"
        data-testid="inspection-big-ticket-rail"
      >
        {tiles.map((tile) => (
          <Tile
            key={tile.key}
            spec={tile}
            className="w-[260px] shrink-0 snap-center"
          />
        ))}
      </div>

      {/* Desktop: 5-column grid */}
      <div className="hidden gap-4 md:grid md:grid-cols-5">
        {tiles.map((tile) => (
          <Tile key={tile.key} spec={tile} />
        ))}
      </div>
    </section>
  );
}
