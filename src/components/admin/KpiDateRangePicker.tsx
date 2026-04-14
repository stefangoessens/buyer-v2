"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  DATE_RANGE_PRESETS,
  DATE_RANGE_PRESET_LABELS,
  formatRangeLabel,
  rangeToSearchParams,
  type DateRange,
  type DateRangePreset,
} from "@/lib/admin/dateRange";
import { cn } from "@/lib/utils";

interface KpiDateRangePickerProps {
  range: DateRange;
}

/**
 * URL-driven date-range selector. Each preset is a shareable `<Link>`.
 * We exclude "custom" from the preset row — custom ranges are driven
 * by explicit `from` / `to` params that this component does not render
 * a form for (keeps scope small; KIN-800 acceptance criteria only
 * require date-range *filtering*, not a fully-custom picker).
 */
export function KpiDateRangePicker({ range }: KpiDateRangePickerProps) {
  const pathname = usePathname() ?? "/metrics";
  const selectablePresets = DATE_RANGE_PRESETS.filter((p) => p !== "custom");

  const hrefFor = (preset: DateRangePreset): string => {
    const params = rangeToSearchParams({ ...range, preset });
    const qs = new URLSearchParams(params).toString();
    return qs ? `${pathname}?${qs}` : pathname;
  };

  return (
    <div className="mb-6 flex flex-col gap-3 rounded-xl border border-border bg-white p-5 md:flex-row md:items-center md:justify-between">
      <div>
        <div className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
          Range
        </div>
        <div className="text-sm font-medium text-foreground">
          {formatRangeLabel(range)}
        </div>
      </div>
      <div className="flex flex-wrap gap-1.5">
        {selectablePresets.map((preset) => (
          <Link
            key={preset}
            href={hrefFor(preset)}
            aria-pressed={range.preset === preset}
            className={cn(
              "inline-flex items-center rounded-full border px-3 py-1 text-xs font-medium transition-colors",
              range.preset === preset
                ? "border-primary-500 bg-primary-50 text-primary-700"
                : "border-border bg-white text-muted-foreground hover:border-neutral-300 hover:text-foreground",
            )}
          >
            {DATE_RANGE_PRESET_LABELS[preset]}
          </Link>
        ))}
      </div>
    </div>
  );
}
