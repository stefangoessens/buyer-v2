"use client";

import {
  Suspense,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { useMutation, useQuery } from "convex/react";
import { toast } from "sonner";

import { api } from "../../../../convex/_generated/api";
import type { Id } from "../../../../convex/_generated/dataModel";
import { Card, CardContent } from "@/components/ui/card";
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";

import { JourneyCard } from "./JourneyCard";
import { JourneysToolbar } from "./JourneysToolbar";
import { JourneysEmptyState } from "./JourneysEmptyState";
import { trackJourneyEvent } from "@/lib/analytics/journey-events";
import type { DealRoomLifecycleStatus } from "@/lib/dealroom/journey-status-labels";

export type JourneyViewKind = "active" | "archived";

const ACTIVE_CARDS_FIRST_PAGE = 8;
const SEARCH_VISIBILITY_THRESHOLD = 10;
const UNDO_WINDOW_MS = 8000;

export type JourneyRow = {
  dealRoomId: string;
  propertyId: string;
  address: string;
  cityState: string;
  photoUrl: string | null;
  photoCount: number;
  status: DealRoomLifecycleStatus;
  buyerFacingStatusLabel: string;
  currentStep: number;
  stepLabel: string;
  percentComplete: number;
  lastActivityAt: string;
  nextActionLabel: string;
  nextActionHref: string;
  nextActionSeverity: "info" | "warning" | "error";
  journeyPriority: "high" | "normal" | "low";
  journeyLabel: string | null;
  attentionCount: number;
  attentionLabel: string | null;
  topAttentionReason: string | null;
  archivedAt: string | null;
};

export type JourneySortMode = "recent" | "priority" | "address";

const DEFAULT_SORT: JourneySortMode = "recent";

const ACTIVE_STATUSES: DealRoomLifecycleStatus[] = [
  "intake",
  "analysis",
  "tour_scheduled",
  "offer_prep",
  "offer_sent",
  "under_contract",
  "closing",
];

function parseCsv(value: string | null): string[] {
  if (!value) return [];
  return value
    .split(",")
    .map((s) => s.trim())
    .filter((s) => s.length > 0);
}

function isJourneyPriority(value: string): value is "high" | "normal" | "low" {
  return value === "high" || value === "normal" || value === "low";
}

function isSortMode(value: string | null): value is JourneySortMode {
  return value === "recent" || value === "priority" || value === "address";
}

function priorityRank(priority: "high" | "normal" | "low"): number {
  if (priority === "high") return 0;
  if (priority === "normal") return 1;
  return 2;
}

function tieBreakByRecent(a: JourneyRow, b: JourneyRow): number {
  return (
    new Date(b.lastActivityAt).getTime() -
    new Date(a.lastActivityAt).getTime()
  );
}

function sortRows(rows: JourneyRow[], mode: JourneySortMode): JourneyRow[] {
  const copy = [...rows];
  if (mode === "address") {
    copy.sort((a, b) => a.address.localeCompare(b.address));
    return copy;
  }
  if (mode === "priority") {
    copy.sort((a, b) => {
      const rank =
        priorityRank(a.journeyPriority) - priorityRank(b.journeyPriority);
      if (rank !== 0) return rank;
      return tieBreakByRecent(a, b);
    });
    return copy;
  }
  copy.sort(tieBreakByRecent);
  return copy;
}

function filterRows(
  rows: JourneyRow[],
  {
    statuses,
    priorities,
    search,
  }: {
    statuses: Set<string>;
    priorities: Set<string>;
    search: string;
  },
): JourneyRow[] {
  const query = search.trim().toLowerCase();
  return rows.filter((row) => {
    if (statuses.size > 0 && !statuses.has(row.status)) return false;
    if (priorities.size > 0 && !priorities.has(row.journeyPriority))
      return false;
    if (query.length > 0) {
      const haystack = [
        row.address,
        row.journeyLabel ?? "",
        row.buyerFacingStatusLabel,
      ]
        .join(" ")
        .toLowerCase();
      if (!haystack.includes(query)) return false;
    }
    return true;
  });
}

export function JourneysPage() {
  return (
    <Suspense fallback={<JourneysLoading />}>
      <JourneysPageInner />
    </Suspense>
  );
}

function JourneysLoading() {
  return (
    <Card>
      <CardContent className="py-16 text-center text-sm text-muted-foreground">
        Loading your journeys…
      </CardContent>
    </Card>
  );
}

function JourneysPageInner() {
  const router = useRouter();
  const searchParams = useSearchParams();

  const view: JourneyViewKind =
    searchParams.get("view") === "archived" ? "archived" : "active";
  const statusParam = parseCsv(searchParams.get("status"));
  const priorityParam = parseCsv(searchParams.get("priority")).filter(
    isJourneyPriority,
  );
  const sortRaw = searchParams.get("sort");
  const sort: JourneySortMode = isSortMode(sortRaw) ? sortRaw : DEFAULT_SORT;
  const search = searchParams.get("q") ?? "";

  const rows = useQuery(api.dashboard.getJourneys, { view });
  // Second query to distinguish "never started" from "all archived". Only
  // fired when the active view is empty, so it doesn't cost anything on
  // the happy path. `skip` keeps convex from subscribing until we need it.
  const archivedRowsCount = useQuery(
    api.dashboard.getJourneys,
    view === "active" && rows !== undefined && rows.length === 0
      ? { view: "archived" }
      : "skip",
  );
  const archiveJourneyMutation = useMutation(api.dealRooms.archiveJourney);

  const mountedRef = useRef(false);
  useEffect(() => {
    if (mountedRef.current) return;
    if (rows === undefined) return;
    mountedRef.current = true;
    trackJourneyEvent("INDEX_VIEWED", { view, count: rows.length });
    const hasFilters =
      statusParam.length > 0 ||
      priorityParam.length > 0 ||
      search.length > 0 ||
      sort !== DEFAULT_SORT;
    if (hasFilters) {
      const summary = [
        statusParam.length > 0 ? `status=${statusParam.join("|")}` : null,
        priorityParam.length > 0 ? `priority=${priorityParam.join("|")}` : null,
        sort !== DEFAULT_SORT ? `sort=${sort}` : null,
        search.length > 0 ? "q=1" : null,
      ]
        .filter(Boolean)
        .join("&");
      trackJourneyEvent("DEEP_LINK_OPENED_WITH_FILTERS", { filters: summary });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rows]);

  const updateParams = useCallback(
    (updater: (next: URLSearchParams) => void) => {
      const next = new URLSearchParams(searchParams.toString());
      updater(next);
      const qs = next.toString();
      router.replace(qs.length > 0 ? `?${qs}` : "?", { scroll: false });
    },
    [router, searchParams],
  );

  const setView = useCallback(
    (nextView: JourneyViewKind) => {
      updateParams((params) => {
        if (nextView === "active") params.delete("view");
        else params.set("view", nextView);
      });
    },
    [updateParams],
  );

  const setStatusFilter = useCallback(
    (nextStatuses: string[]) => {
      updateParams((params) => {
        if (nextStatuses.length === 0) params.delete("status");
        else params.set("status", nextStatuses.join(","));
      });
      trackJourneyEvent("FILTER_CHANGED", {
        filter: `status:${nextStatuses.join("|") || "none"}`,
      });
    },
    [updateParams],
  );

  const setPriorityFilter = useCallback(
    (nextPriorities: string[]) => {
      updateParams((params) => {
        if (nextPriorities.length === 0) params.delete("priority");
        else params.set("priority", nextPriorities.join(","));
      });
      trackJourneyEvent("FILTER_CHANGED", {
        filter: `priority:${nextPriorities.join("|") || "none"}`,
      });
    },
    [updateParams],
  );

  const setSort = useCallback(
    (nextSort: JourneySortMode) => {
      updateParams((params) => {
        if (nextSort === DEFAULT_SORT) params.delete("sort");
        else params.set("sort", nextSort);
      });
      trackJourneyEvent("SORT_CHANGED", { sort: nextSort });
    },
    [updateParams],
  );

  const setSearch = useCallback(
    (nextSearch: string) => {
      const trimmed = nextSearch.trim();
      updateParams((params) => {
        if (trimmed.length === 0) params.delete("q");
        else params.set("q", trimmed);
      });
      if (trimmed.length > 0) {
        trackJourneyEvent("SEARCH_USED", { queryLength: trimmed.length });
      }
    },
    [updateParams],
  );

  const [focusedIndex, setFocusedIndex] = useState(0);
  const gridRef = useRef<HTMLDivElement | null>(null);

  const statusSet = useMemo(() => new Set(statusParam), [statusParam]);
  const prioritySet = useMemo(() => new Set(priorityParam), [priorityParam]);

  const visibleRows = useMemo(() => {
    if (!rows) return [];
    const filtered = filterRows(rows, {
      statuses: statusSet,
      priorities: prioritySet,
      search,
    });
    return sortRows(filtered, sort);
  }, [rows, statusSet, prioritySet, search, sort]);

  useEffect(() => {
    if (focusedIndex >= visibleRows.length) {
      setFocusedIndex(Math.max(0, visibleRows.length - 1));
    }
  }, [visibleRows.length, focusedIndex]);

  const focusCard = useCallback((index: number) => {
    const grid = gridRef.current;
    if (!grid) return;
    const card = grid.querySelectorAll<HTMLElement>("[data-journey-card]")[
      index
    ];
    card?.focus();
  }, []);

  const [archivedIds, setArchivedIds] = useState<Set<string>>(
    () => new Set(),
  );
  const requestArchive = useCallback((row: JourneyRow) => {
    setArchivedIds((prev) => {
      const next = new Set(prev);
      next.add(row.dealRoomId);
      return next;
    });
  }, []);
  const restoreLocal = useCallback((dealRoomId: string) => {
    setArchivedIds((prev) => {
      if (!prev.has(dealRoomId)) return prev;
      const next = new Set(prev);
      next.delete(dealRoomId);
      return next;
    });
  }, []);

  // Keyboard A shortcut: run the full archive flow inline (optimistic hide
  // + sonner undo toast + commit after 8s). JourneyCard's archive button
  // owns its own identical flow — we duplicate the 20 lines here instead
  // of threading an imperative handle, which keeps JourneyCard self-contained.
  const handleKeyboardArchive = useCallback(
    (row: JourneyRow) => {
      trackJourneyEvent("ARCHIVE_CLICKED", { dealRoomId: row.dealRoomId });
      requestArchive(row);
      const dealRoomIdTyped = row.dealRoomId as unknown as Id<"dealRooms">;

      let committed = false;
      const commit = async () => {
        if (committed) return;
        committed = true;
        try {
          await archiveJourneyMutation({ dealRoomId: dealRoomIdTyped });
          trackJourneyEvent("ARCHIVE_COMMITTED", {
            dealRoomId: row.dealRoomId,
          });
        } catch {
          restoreLocal(row.dealRoomId);
          toast.error("Could not archive journey");
        }
      };

      const timeoutId = window.setTimeout(commit, UNDO_WINDOW_MS);

      toast("Journey archived", {
        description: row.address,
        duration: UNDO_WINDOW_MS,
        action: {
          label: "Undo",
          onClick: () => {
            window.clearTimeout(timeoutId);
            committed = true;
            trackJourneyEvent("ARCHIVE_UNDO_CLICKED", {
              dealRoomId: row.dealRoomId,
            });
            restoreLocal(row.dealRoomId);
          },
        },
      });
    },
    [archiveJourneyMutation, requestArchive, restoreLocal],
  );

  const handleKeyDown = useCallback(
    (event: React.KeyboardEvent<HTMLDivElement>) => {
      if (visibleRows.length === 0) return;
      const target = event.target as HTMLElement | null;
      if (target) {
        const tag = target.tagName;
        if (tag === "INPUT" || tag === "TEXTAREA" || target.isContentEditable) {
          return;
        }
      }
      const total = visibleRows.length;
      if (event.key === "ArrowRight" || event.key === "ArrowDown") {
        event.preventDefault();
        const next = Math.min(total - 1, focusedIndex + 1);
        setFocusedIndex(next);
        focusCard(next);
      } else if (event.key === "ArrowLeft" || event.key === "ArrowUp") {
        event.preventDefault();
        const next = Math.max(0, focusedIndex - 1);
        setFocusedIndex(next);
        focusCard(next);
      } else if (event.key === "Enter") {
        const row = visibleRows[focusedIndex];
        if (!row) return;
        event.preventDefault();
        trackJourneyEvent("CONTINUE_CLICKED", {
          dealRoomId: row.dealRoomId,
          propertyId: row.propertyId,
          nextActionLabel: row.nextActionLabel,
        });
        window.location.href = row.nextActionHref;
      } else if (event.key === "a" || event.key === "A") {
        const row = visibleRows[focusedIndex];
        if (!row) return;
        if (view !== "active") return;
        event.preventDefault();
        handleKeyboardArchive(row);
      } else if (event.key === ";") {
        const row = visibleRows[focusedIndex];
        if (!row) return;
        event.preventDefault();
        const el = gridRef.current?.querySelectorAll<HTMLElement>(
          "[data-journey-card]",
        )[focusedIndex];
        const priorityBtn = el?.querySelector<HTMLElement>(
          '[data-journey-priority-trigger="true"]',
        );
        priorityBtn?.click();
      }
    },
    [visibleRows, focusedIndex, focusCard, view, handleKeyboardArchive],
  );

  const displayRows = useMemo(
    () => {
      // Only filter out optimistically archived rows when showing the
      // active view. In the archived view, newly-archived items
      // legitimately belong and should appear alongside server-archived
      // rows — otherwise an optimistic archive hides the row from BOTH
      // views until a page reload.
      if (view !== "active") return visibleRows;
      return visibleRows.filter((r) => !archivedIds.has(r.dealRoomId));
    },
    [visibleRows, archivedIds, view],
  );

  if (rows === undefined) {
    return <JourneysLoading />;
  }

  const hasAnyRows = rows.length > 0;
  const hasSearchableCount = rows.length >= SEARCH_VISIBILITY_THRESHOLD;

  // Distinguish "never started" from "all archived":
  //   * active view with zero rows AND archived view has rows → allArchived
  //   * active view with zero rows AND archived view also empty → never
  //   * archived view with zero rows → never (buyer has simply not touched anything yet)
  // The archived query only subscribes when we actually need it (see useQuery above).
  if (!hasAnyRows && view === "active") {
    if (archivedRowsCount === undefined) {
      return <JourneysLoading />;
    }
    if (archivedRowsCount.length > 0) {
      return (
        <JourneysEmptyState
          variant="allArchived"
          onShowArchived={() => setView("archived")}
        />
      );
    }
    return <JourneysEmptyState variant="never" />;
  }

  if (!hasAnyRows && view === "archived") {
    return <JourneysEmptyState variant="never" />;
  }

  const isPaged = displayRows.length > ACTIVE_CARDS_FIRST_PAGE;
  const firstPage = isPaged
    ? displayRows.slice(0, ACTIVE_CARDS_FIRST_PAGE)
    : displayRows;
  const restPage = isPaged
    ? displayRows.slice(ACTIVE_CARDS_FIRST_PAGE)
    : [];

  return (
    <div className="flex flex-col gap-5">
      <JourneysToolbar
        view={view}
        statusValues={statusParam}
        priorityValues={priorityParam}
        sort={sort}
        search={search}
        showSearch={hasSearchableCount}
        onViewChange={setView}
        onStatusChange={setStatusFilter}
        onPriorityChange={setPriorityFilter}
        onSortChange={setSort}
        onSearchChange={setSearch}
        activeStatuses={ACTIVE_STATUSES}
      />

      {displayRows.length === 0 ? (
        <Card>
          <CardContent className="py-14 text-center text-sm text-muted-foreground">
            No journeys match these filters.
          </CardContent>
        </Card>
      ) : (
        <div
          ref={gridRef}
          role="grid"
          aria-label="Your journeys"
          onKeyDown={handleKeyDown}
          className="flex flex-col gap-5"
        >
          <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
            {firstPage.map((row) => (
              <JourneyCard
                key={row.dealRoomId}
                row={row}
                onRequestArchive={requestArchive}
                onRestoreLocal={restoreLocal}
                view={view}
              />
            ))}
          </div>
          {isPaged ? (
            <Accordion type="single" collapsible>
              <AccordionItem value="more">
                <AccordionTrigger className="text-sm font-semibold">
                  Show {restPage.length} more{" "}
                  {restPage.length === 1 ? "journey" : "journeys"}
                </AccordionTrigger>
                <AccordionContent>
                  <div className="grid grid-cols-1 gap-4 pt-4 md:grid-cols-2">
                    {restPage.map((row) => (
                      <JourneyCard
                        key={row.dealRoomId}
                        row={row}
                        onRequestArchive={requestArchive}
                        onRestoreLocal={restoreLocal}
                        view={view}
                      />
                    ))}
                  </div>
                </AccordionContent>
              </AccordionItem>
            </Accordion>
          ) : null}
        </div>
      )}
    </div>
  );
}

