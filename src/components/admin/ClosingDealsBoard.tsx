"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { useQueries } from "convex/react";
import { api } from "../../../convex/_generated/api";
import type { Id } from "../../../convex/_generated/dataModel";
import {
  matchesFilter,
  sortRows,
  type BrokerBoardFilter,
  type BrokerBoardRow,
  type BrokerBoardSortKey,
  type BrokerBoardStatus,
} from "@/lib/closing/brokerBoardHelpers";
import { trackClosingEvent } from "@/lib/analytics/closing-events";
import { AdminEmptyState } from "@/components/admin/AdminEmptyState";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { cn } from "@/lib/utils";

/**
 * Backend row returned by `api.closingCommandCenter.getBrokerBoardData`.
 * Property address and buyer name are joined in the client via
 * `api.properties.get` / `api.users.get` because the backend query
 * intentionally stays thin.
 */
export interface BrokerBoardSeed {
  dealRoomId: Id<"dealRooms">;
  propertyId: Id<"properties">;
  buyerId: Id<"users">;
  status: BrokerBoardStatus;
  counts: {
    total: number;
    completed: number;
    blocked: number;
    overdue: number;
  };
  stuckSignals: readonly string[];
  isStuck: boolean;
  percentComplete: number;
  closingDate: number | null;
  nextDueDate: number | null;
  waitingOnRole: string | null;
}

interface ClosingDealsBoardProps {
  seeds: readonly BrokerBoardSeed[];
}

const STATUS_OPTIONS: readonly { value: BrokerBoardStatus; label: string }[] = [
  { value: "under_contract", label: "Under contract" },
  { value: "closing", label: "Closing" },
];

const SORT_OPTIONS: readonly {
  value: BrokerBoardSortKey;
  label: string;
}[] = [
  { value: "closingDate", label: "Close date" },
  { value: "percentComplete", label: "Progress" },
  { value: "blockedCount", label: "Blocked" },
];

/**
 * Internal broker-facing closing deals board. Feeds the backend seed
 * list through `matchesFilter` + `sortRows` and renders a data table
 * with stuck-deal signals highlighted. Buyer names and property
 * addresses are hydrated via per-id Convex queries; the board stays
 * responsive because every row resolves in parallel.
 */
export function ClosingDealsBoard({ seeds }: ClosingDealsBoardProps) {
  const router = useRouter();
  const [searchQuery, setSearchQuery] = useState("");
  const [stuckOnly, setStuckOnly] = useState(false);
  const [dueThisWeek, setDueThisWeek] = useState(false);
  const [statuses, setStatuses] = useState<Set<BrokerBoardStatus>>(
    () => new Set(),
  );
  const [sortKey, setSortKey] = useState<BrokerBoardSortKey>("closingDate");

  useEffect(() => {
    trackClosingEvent("BROKER_BOARD_VIEWED", { rowCount: seeds.length });
  }, [seeds.length]);

  const propertyQueries = useMemo(() => {
    const entries: Record<string, { query: typeof api.properties.get; args: { propertyId: Id<"properties"> } }> = {};
    for (const seed of seeds) {
      entries[`property:${seed.propertyId}`] = {
        query: api.properties.get,
        args: { propertyId: seed.propertyId },
      };
    }
    return entries;
  }, [seeds]);

  const buyerQueries = useMemo(() => {
    const entries: Record<string, { query: typeof api.users.get; args: { userId: Id<"users"> } }> = {};
    for (const seed of seeds) {
      entries[`buyer:${seed.buyerId}`] = {
        query: api.users.get,
        args: { userId: seed.buyerId },
      };
    }
    return entries;
  }, [seeds]);

  const propertyResults = useQueries(propertyQueries) as Record<
    string,
    PropertyRecord | null | undefined
  >;
  const buyerResults = useQueries(buyerQueries) as Record<
    string,
    UserRecord | null | undefined
  >;

  const rows: BrokerBoardRow[] = useMemo(() => {
    return seeds.map((seed) => {
      const property = propertyResults[`property:${seed.propertyId}`] ?? null;
      const buyer = buyerResults[`buyer:${seed.buyerId}`] ?? null;
      return {
        dealRoomId: seed.dealRoomId,
        propertyId: seed.propertyId,
        propertyAddress: formatPropertyAddress(property),
        buyerName: formatBuyerName(buyer),
        status: seed.status,
        closingDate: seed.closingDate,
        totalTasks: seed.counts.total,
        completedTasks: seed.counts.completed,
        blockedCount: seed.counts.blocked,
        overdueCount: seed.counts.overdue,
        nextDueDate: seed.nextDueDate,
        currentWaitingOn: seed.waitingOnRole,
        percentComplete: seed.percentComplete,
        isStuck: seed.isStuck,
        stuckSignals: seed.stuckSignals,
      };
    });
  }, [seeds, propertyResults, buyerResults]);

  const filter: BrokerBoardFilter = useMemo(
    () => ({ stuckOnly, dueThisWeek, statuses, searchQuery }),
    [stuckOnly, dueThisWeek, statuses, searchQuery],
  );

  const visibleRows = useMemo(() => {
    const now = Date.now();
    const filtered = rows.filter((row) => matchesFilter(row, filter, now));
    return sortRows(filtered, sortKey);
  }, [rows, filter, sortKey]);

  function toggleStatus(status: BrokerBoardStatus) {
    setStatuses((prev) => {
      const next = new Set(prev);
      if (next.has(status)) next.delete(status);
      else next.add(status);
      return next;
    });
  }

  const stuckTotal = rows.filter((r) => r.isStuck).length;

  return (
    <div className="flex flex-col gap-6">
      <div className="rounded-4xl border border-border bg-card p-6 shadow-sm">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
          <div className="flex min-w-0 flex-1 flex-col gap-3 sm:flex-row sm:items-center">
            <div className="relative w-full sm:max-w-sm">
              <Input
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Search address or buyer name"
                aria-label="Search closing deals"
              />
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <FilterChip
                active={stuckOnly}
                onToggle={() => setStuckOnly((v) => !v)}
                label={stuckTotal > 0 ? `Stuck (${stuckTotal})` : "Stuck"}
              />
              <FilterChip
                active={dueThisWeek}
                onToggle={() => setDueThisWeek((v) => !v)}
                label="Due this week"
              />
              {STATUS_OPTIONS.map((opt) => (
                <FilterChip
                  key={opt.value}
                  active={statuses.has(opt.value)}
                  onToggle={() => toggleStatus(opt.value)}
                  label={opt.label}
                />
              ))}
            </div>
          </div>
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <span>Sort</span>
            <div className="flex items-center gap-1">
              {SORT_OPTIONS.map((opt) => (
                <Button
                  key={opt.value}
                  type="button"
                  variant={sortKey === opt.value ? "default" : "ghost"}
                  size="xs"
                  onClick={() => setSortKey(opt.value)}
                >
                  {opt.label}
                </Button>
              ))}
            </div>
          </div>
        </div>
      </div>

      <div className="rounded-4xl border border-border bg-card shadow-sm">
        {visibleRows.length === 0 ? (
          <div className="p-6">
            <AdminEmptyState
              title={
                rows.length === 0
                  ? "No active closing deals"
                  : "No deals match these filters"
              }
              description={
                rows.length === 0
                  ? "Nothing is under contract or in closing right now."
                  : "Clear the search or filter chips to see the full board."
              }
            />
          </div>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-[28%]">Property</TableHead>
                <TableHead>Buyer</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Progress</TableHead>
                <TableHead className="text-right">Blocked</TableHead>
                <TableHead className="text-right">Overdue</TableHead>
                <TableHead>Signals</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {visibleRows.map((row) => (
                <TableRow
                  key={row.dealRoomId}
                  className="cursor-pointer"
                  onClick={() =>
                    router.push(`/property/${row.propertyId}/closing`)
                  }
                >
                  <TableCell className="max-w-[360px] whitespace-normal">
                    <div className="font-medium text-foreground">
                      {row.propertyAddress}
                    </div>
                  </TableCell>
                  <TableCell className="whitespace-normal text-foreground">
                    {row.buyerName}
                  </TableCell>
                  <TableCell>
                    <Badge
                      variant={row.status === "closing" ? "default" : "secondary"}
                    >
                      {row.status === "closing" ? "Closing" : "Under contract"}
                    </Badge>
                  </TableCell>
                  <TableCell className="w-[200px]">
                    <ProgressCell
                      percent={row.percentComplete}
                      completed={row.completedTasks}
                      total={row.totalTasks}
                    />
                  </TableCell>
                  <TableCell className="text-right">
                    <CountBadge
                      count={row.blockedCount}
                      tone={row.blockedCount > 0 ? "destructive" : "muted"}
                    />
                  </TableCell>
                  <TableCell className="text-right">
                    <CountBadge
                      count={row.overdueCount}
                      tone={row.overdueCount > 0 ? "destructive" : "muted"}
                    />
                  </TableCell>
                  <TableCell>
                    {row.isStuck ? (
                      <div className="flex flex-wrap items-center gap-1">
                        {row.stuckSignals.map((signal) => (
                          <Badge
                            key={signal}
                            variant="destructive"
                            className="capitalize"
                          >
                            {formatStuckSignal(signal)}
                          </Badge>
                        ))}
                      </div>
                    ) : (
                      <span className="text-xs text-muted-foreground">On track</span>
                    )}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </div>
    </div>
  );
}

// ─── Presentational helpers (kept local, not exported) ──────────────────

interface PropertyRecord {
  addressLine1?: string | null;
  addressLine2?: string | null;
  city?: string | null;
  state?: string | null;
  postalCode?: string | null;
}

interface UserRecord {
  name?: string | null;
  email?: string | null;
}

function formatPropertyAddress(property: PropertyRecord | null): string {
  if (!property) return "Address unavailable";
  const line1 = property.addressLine1?.trim();
  const city = property.city?.trim();
  const state = property.state?.trim();
  if (line1 && city) {
    return state ? `${line1}, ${city}, ${state}` : `${line1}, ${city}`;
  }
  if (line1) return line1;
  if (city && state) return `${city}, ${state}`;
  return "Address unavailable";
}

function formatBuyerName(user: UserRecord | null): string {
  if (!user) return "Unknown buyer";
  const name = user.name?.trim();
  if (name) return name;
  const email = user.email?.trim();
  if (email) return email;
  return "Unknown buyer";
}

function formatStuckSignal(signal: string): string {
  const [count, ...rest] = signal.split("_");
  const label = rest.join(" ");
  if (!count || !label) return signal.replace(/_/g, " ");
  return `${count} ${label}`;
}

function FilterChip({
  active,
  onToggle,
  label,
}: {
  active: boolean;
  onToggle: () => void;
  label: string;
}) {
  return (
    <Button
      type="button"
      size="xs"
      variant={active ? "default" : "outline"}
      onClick={onToggle}
      aria-pressed={active}
    >
      {label}
    </Button>
  );
}

function ProgressCell({
  percent,
  completed,
  total,
}: {
  percent: number;
  completed: number;
  total: number;
}) {
  const clamped = Math.max(0, Math.min(100, percent));
  return (
    <div className="flex flex-col gap-1.5">
      <div
        className="h-1.5 w-full overflow-hidden rounded-full bg-muted"
        role="progressbar"
        aria-valuenow={clamped}
        aria-valuemin={0}
        aria-valuemax={100}
      >
        <div
          className="h-full rounded-full bg-primary transition-[width]"
          style={{ width: `${clamped}%` }}
        />
      </div>
      <div className="flex items-center justify-between text-xs text-muted-foreground">
        <span>{clamped}%</span>
        <span className="tabular-nums">
          {completed}/{total}
        </span>
      </div>
    </div>
  );
}

function CountBadge({
  count,
  tone,
}: {
  count: number;
  tone: "destructive" | "muted";
}) {
  if (count === 0) {
    return <span className="text-sm text-muted-foreground tabular-nums">0</span>;
  }
  return (
    <span
      className={cn(
        "inline-flex min-w-8 items-center justify-center rounded-full px-2 py-0.5 text-xs font-semibold tabular-nums",
        tone === "destructive"
          ? "bg-destructive/10 text-destructive"
          : "bg-muted text-muted-foreground",
      )}
    >
      {count}
    </span>
  );
}
