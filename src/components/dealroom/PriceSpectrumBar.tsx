"use client";

import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";

interface PriceSpectrumBarProps {
  lowestPossible?: number;
  fairPrice: number;
  zestimate?: number;
  listingPrice: number;
  walkAway: number;
  strongOpener?: number;
  confidence?: number;
}

const currency = new Intl.NumberFormat("en-US", {
  style: "currency",
  currency: "USD",
  maximumFractionDigits: 0,
});

interface Anchor {
  key: string;
  label: string;
  value: number;
  tooltip: string;
}

export function PriceSpectrumBar({
  lowestPossible,
  fairPrice,
  zestimate,
  listingPrice,
  walkAway,
  strongOpener,
}: PriceSpectrumBarProps) {
  const effectiveLowest =
    lowestPossible !== undefined && lowestPossible <= fairPrice
      ? lowestPossible
      : undefined;

  const anchors: Anchor[] = [];
  if (effectiveLowest !== undefined) {
    anchors.push({
      key: "lowest",
      label: "Lowest",
      value: effectiveLowest,
      tooltip:
        "Lowest possible — comp set minimum minus a 5% safety margin.",
    });
  }
  anchors.push({
    key: "fair",
    label: "Fair",
    value: fairPrice,
    tooltip: "Fair price — our AI's estimate based on comparable sales.",
  });
  if (zestimate !== undefined) {
    anchors.push({
      key: "zestimate",
      label: "Zestimate",
      value: zestimate,
      tooltip: "Zestimate — Zillow's automated valuation model.",
    });
  }
  anchors.push({
    key: "listing",
    label: "Listing",
    value: listingPrice,
    tooltip: "Listing price — what the seller is asking.",
  });
  anchors.push({
    key: "walkAway",
    label: "Walk away",
    value: walkAway,
    tooltip: "Walk-away — the maximum you've decided you'll pay.",
  });

  const rangeValues = anchors.map((a) => a.value);
  if (strongOpener !== undefined) rangeValues.push(strongOpener);
  const min = Math.min(...rangeValues);
  const max = Math.max(...rangeValues);

  function pct(value: number) {
    if (max === min) return 50;
    return ((value - min) / (max - min)) * 100;
  }

  return (
    <TooltipProvider>
      <div
        role="img"
        aria-label={`Price spectrum from ${currency.format(min)} to ${currency.format(max)}`}
        className="w-full"
      >
        {/* Labels above the bar */}
        <div className="relative h-5 mb-1">
          {anchors.map((anchor) => (
            <span
              key={`label-${anchor.key}`}
              style={{ left: `${pct(anchor.value)}%` }}
              className="absolute -translate-x-1/2 text-xs text-neutral-500"
            >
              {anchor.label}
            </span>
          ))}
        </div>

        {/* The gradient bar with anchor dots */}
        <div className="relative h-2 rounded-full bg-gradient-to-r from-success-500 via-warning-500 to-error-500">
          {anchors.map((anchor) => (
            <Tooltip key={`anchor-${anchor.key}`}>
              <TooltipTrigger asChild>
                <button
                  type="button"
                  style={{ left: `${pct(anchor.value)}%` }}
                  className="absolute top-1/2 -translate-x-1/2 -translate-y-1/2 h-3 w-3 rounded-full border-2 border-neutral-700 bg-white focus:outline-none focus:ring-2 focus:ring-primary-500"
                  aria-label={`${anchor.label} ${currency.format(anchor.value)}`}
                />
              </TooltipTrigger>
              <TooltipContent>{anchor.tooltip}</TooltipContent>
            </Tooltip>
          ))}
        </div>

        {/* Values below the bar */}
        <div className="relative h-5 mt-2">
          {anchors.map((anchor) => (
            <span
              key={`value-${anchor.key}`}
              style={{ left: `${pct(anchor.value)}%` }}
              className="absolute -translate-x-1/2 text-xs font-semibold text-neutral-700"
            >
              {currency.format(anchor.value)}
            </span>
          ))}
        </div>

        {/* Strong opener pin */}
        {strongOpener !== undefined ? (
          <div className="relative h-8 mt-2">
            <div
              style={{ left: `${pct(strongOpener)}%` }}
              className="absolute -translate-x-1/2 flex flex-col items-center text-xs"
            >
              <span className="text-primary-700">▲</span>
              <span className="font-semibold text-primary-700">
                {currency.format(strongOpener)}
              </span>
              <span className="text-neutral-500">Strong opener</span>
            </div>
          </div>
        ) : null}
      </div>
    </TooltipProvider>
  );
}
