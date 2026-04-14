"use client";

import { useEffect, useState } from "react";
import { HugeiconsIcon } from "@hugeicons/react";
import { Search01Icon } from "@hugeicons/core-free-icons";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { cn } from "@/lib/utils";
import {
  JOURNEY_STATUS_LABELS,
  type DealRoomLifecycleStatus,
} from "@/lib/dealroom/journey-status-labels";

import type { JourneySortMode, JourneyViewKind } from "./JourneysPage";

interface JourneysToolbarProps {
  view: JourneyViewKind;
  statusValues: string[];
  priorityValues: string[];
  sort: JourneySortMode;
  search: string;
  showSearch: boolean;
  onViewChange: (view: JourneyViewKind) => void;
  onStatusChange: (next: string[]) => void;
  onPriorityChange: (next: string[]) => void;
  onSortChange: (next: JourneySortMode) => void;
  onSearchChange: (next: string) => void;
  activeStatuses: DealRoomLifecycleStatus[];
}

const PRIORITIES: Array<{ value: "high" | "normal" | "low"; label: string }> = [
  { value: "high", label: "High" },
  { value: "normal", label: "Normal" },
  { value: "low", label: "Low" },
];

function toggleMember(list: string[], value: string): string[] {
  if (list.includes(value)) return list.filter((v) => v !== value);
  return [...list, value];
}

export function JourneysToolbar({
  view,
  statusValues,
  priorityValues,
  sort,
  search,
  showSearch,
  onViewChange,
  onStatusChange,
  onPriorityChange,
  onSortChange,
  onSearchChange,
  activeStatuses,
}: JourneysToolbarProps) {
  const [localSearch, setLocalSearch] = useState(search);

  useEffect(() => {
    setLocalSearch(search);
  }, [search]);

  useEffect(() => {
    if (!showSearch) return;
    const id = window.setTimeout(() => {
      if (localSearch !== search) {
        onSearchChange(localSearch);
      }
    }, 300);
    return () => window.clearTimeout(id);
  }, [localSearch, search, showSearch, onSearchChange]);

  return (
    <div className="flex flex-col gap-3 rounded-4xl border border-border bg-card/60 p-3 shadow-sm backdrop-blur">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-1 rounded-full bg-muted p-1">
          <ToggleChip
            selected={view === "active"}
            onClick={() => onViewChange("active")}
          >
            Active
          </ToggleChip>
          <ToggleChip
            selected={view === "archived"}
            onClick={() => onViewChange("archived")}
          >
            Archived
          </ToggleChip>
        </div>
        <div className="flex items-center gap-2">
          <Select
            value={sort}
            onValueChange={(next) => onSortChange(next as JourneySortMode)}
          >
            <SelectTrigger className="h-9 w-[12rem] rounded-full">
              <SelectValue placeholder="Sort" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="recent">Most recent</SelectItem>
              <SelectItem value="priority">Highest priority</SelectItem>
              <SelectItem value="address">Address A–Z</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <span className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
          Status
        </span>
        {activeStatuses.map((status) => {
          const selected = statusValues.includes(status);
          return (
            <ToggleChip
              key={status}
              selected={selected}
              onClick={() => onStatusChange(toggleMember(statusValues, status))}
            >
              {JOURNEY_STATUS_LABELS[status]}
            </ToggleChip>
          );
        })}
        {statusValues.length > 0 ? (
          <Button
            size="sm"
            variant="ghost"
            className="h-7 rounded-full text-xs"
            onClick={() => onStatusChange([])}
          >
            Clear
          </Button>
        ) : null}
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <span className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
          Priority
        </span>
        {PRIORITIES.map((p) => {
          const selected = priorityValues.includes(p.value);
          return (
            <ToggleChip
              key={p.value}
              selected={selected}
              onClick={() =>
                onPriorityChange(toggleMember(priorityValues, p.value))
              }
            >
              {p.label}
            </ToggleChip>
          );
        })}
      </div>

      {showSearch ? (
        <div className="relative">
          <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground">
            <HugeiconsIcon icon={Search01Icon} className="size-4" />
          </span>
          <Input
            type="search"
            value={localSearch}
            onChange={(event) => setLocalSearch(event.target.value)}
            placeholder="Search address, label, or status"
            className="pl-9"
            aria-label="Search journeys"
          />
        </div>
      ) : null}
    </div>
  );
}

function ToggleChip({
  selected,
  children,
  onClick,
}: {
  selected: boolean;
  children: React.ReactNode;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={selected}
      className={cn(
        "h-7 rounded-full px-3 text-xs font-medium transition-colors",
        selected
          ? "bg-primary text-primary-foreground shadow-sm"
          : "bg-muted text-muted-foreground hover:bg-muted/70",
      )}
    >
      {children}
    </button>
  );
}
