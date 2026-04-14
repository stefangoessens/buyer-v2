"use client";

import { useQuery } from "convex/react";
import { api } from "../../../convex/_generated/api";
import { formatConsoleTimestamp } from "@/lib/admin/format";
import { OVERRIDE_REASON_LABELS, type OverrideReasonCode } from "@/lib/admin/overrideCatalog";
import type { Id } from "../../../convex/_generated/dataModel";

export interface OverrideRecord {
  _id: Id<"manualOverrideRecords">;
  _creationTime: number;
  targetType: string;
  targetId: string;
  field: string;
  beforeValue?: unknown;
  afterValue?: unknown;
  reasonCode: OverrideReasonCode;
  reasonDetail: string;
  performedBy: Id<"users">;
  performedAt: string;
  reversedAt?: string;
  reversedBy?: Id<"users">;
}

/**
 * Audit table for recent overrides. Shows before/after values next to
 * the reason and an indicator for reversed rows.
 */
export function OverrideHistoryTable() {
  const rows = useQuery(api.manualOverrides.listRecent, { limit: 100 }) as
    | OverrideRecord[]
    | undefined;

  if (rows === undefined) {
    return (
      <div className="rounded-xl border border-dashed border-neutral-300 bg-white px-6 py-10 text-center text-sm text-muted-foreground">
        Loading override history…
      </div>
    );
  }

  if (rows.length === 0) {
    return (
      <div className="rounded-xl border border-dashed border-neutral-300 bg-white px-6 py-10 text-center">
        <div className="text-sm font-medium text-foreground">No overrides yet</div>
        <p className="mt-1 text-xs text-muted-foreground">
          The audit table is empty. It fills as ops executes overrides.
        </p>
      </div>
    );
  }

  return (
    <div className="overflow-hidden rounded-xl border border-border bg-white">
      <table className="w-full">
        <thead className="border-b border-border bg-muted">
          <tr className="text-left text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
            <th className="px-4 py-3">Field</th>
            <th className="px-4 py-3">Target</th>
            <th className="px-4 py-3">Before → After</th>
            <th className="px-4 py-3">Reason</th>
            <th className="px-4 py-3">Performed</th>
            <th className="px-4 py-3">State</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr
              key={row._id}
              className="border-t border-neutral-100 text-sm last:border-b-0"
            >
              <td className="px-4 py-3 font-medium text-foreground">{row.field}</td>
              <td className="px-4 py-3 text-xs text-muted-foreground">
                {row.targetType}
                <div className="font-mono text-[10px] text-neutral-400">
                  {row.targetId.slice(0, 14)}
                  {row.targetId.length > 14 ? "…" : ""}
                </div>
              </td>
              <td className="px-4 py-3 text-xs text-muted-foreground">
                <span className="rounded bg-muted px-1.5 py-0.5 font-mono">
                  {formatOverrideValue(row.beforeValue)}
                </span>{" "}
                →{" "}
                <span className="rounded bg-primary-50 px-1.5 py-0.5 font-mono text-primary-700">
                  {formatOverrideValue(row.afterValue)}
                </span>
              </td>
              <td className="px-4 py-3 text-xs">
                <div className="font-medium text-neutral-700">
                  {OVERRIDE_REASON_LABELS[row.reasonCode]}
                </div>
                <div className="mt-0.5 text-muted-foreground line-clamp-2">
                  {row.reasonDetail}
                </div>
              </td>
              <td className="px-4 py-3 text-xs text-muted-foreground whitespace-nowrap">
                {formatConsoleTimestamp(row.performedAt)}
              </td>
              <td className="px-4 py-3">
                {row.reversedAt ? (
                  <span className="inline-flex items-center rounded-full bg-muted px-2 py-0.5 text-[11px] font-medium text-muted-foreground">
                    Reversed
                  </span>
                ) : (
                  <span className="inline-flex items-center rounded-full bg-success-100 px-2 py-0.5 text-[11px] font-medium text-success-700">
                    Active
                  </span>
                )}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function formatOverrideValue(value: unknown): string {
  if (value === undefined || value === null) return "—";
  if (typeof value === "boolean") return value ? "true" : "false";
  if (typeof value === "number") return value.toLocaleString("en-US");
  if (typeof value === "string") {
    if (value.length === 0) return "(empty)";
    return value.length > 40 ? `${value.slice(0, 40)}…` : value;
  }
  return JSON.stringify(value);
}
