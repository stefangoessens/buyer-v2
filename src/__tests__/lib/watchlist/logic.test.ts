import { describe, it, expect } from "vitest";
import {
  addToWatchlist,
  countEntries,
  findByPropertyId,
  isFull,
  projectBuyerView,
  projectBuyerWatchlist,
  removeFromWatchlist,
  reorderWatchlist,
  setEntryNote,
  validateEntry,
  validateWatchlist,
} from "@/lib/watchlist/logic";
import {
  MAX_NOTE_LENGTH,
  MAX_WATCHLIST_SIZE,
  type WatchlistEntry,
} from "@/lib/watchlist/types";

// MARK: - Fixtures

function makeEntry(overrides: Partial<WatchlistEntry> = {}): WatchlistEntry {
  return {
    id: "entry_1",
    buyerId: "u_1",
    propertyId: "p_1",
    position: 0,
    addedAt: "2026-04-12T00:00:00Z",
    updatedAt: "2026-04-12T00:00:00Z",
    ...overrides,
  };
}

function makeList(count: number): WatchlistEntry[] {
  return Array.from({ length: count }, (_, i) =>
    makeEntry({
      id: `entry_${i}`,
      propertyId: `p_${i}`,
      position: i,
    })
  );
}

// MARK: - validateEntry

describe("validateEntry", () => {
  it("passes for a well-formed entry", () => {
    expect(validateEntry(makeEntry()).ok).toBe(true);
  });

  it("rejects empty id", () => {
    const result = validateEntry(makeEntry({ id: "" }));
    expect(result.ok).toBe(false);
  });

  it("rejects empty buyerId", () => {
    const result = validateEntry(makeEntry({ buyerId: "" }));
    expect(result.ok).toBe(false);
  });

  it("rejects empty propertyId", () => {
    const result = validateEntry(makeEntry({ propertyId: "" }));
    expect(result.ok).toBe(false);
  });

  it("rejects negative position", () => {
    const result = validateEntry(makeEntry({ position: -1 }));
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.errors.some((e) => e.kind === "invalidPosition")).toBe(
        true
      );
    }
  });

  it("rejects note longer than MAX_NOTE_LENGTH", () => {
    const result = validateEntry(
      makeEntry({ note: "x".repeat(MAX_NOTE_LENGTH + 1) })
    );
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.errors.some((e) => e.kind === "noteTooLong")).toBe(true);
    }
  });

  it("allows note exactly at MAX_NOTE_LENGTH", () => {
    const result = validateEntry(
      makeEntry({ note: "x".repeat(MAX_NOTE_LENGTH) })
    );
    expect(result.ok).toBe(true);
  });

  it("allows undefined note", () => {
    expect(validateEntry(makeEntry({ note: undefined })).ok).toBe(true);
  });
});

// MARK: - validateWatchlist

describe("validateWatchlist", () => {
  it("passes for a well-formed list", () => {
    expect(validateWatchlist(makeList(5)).ok).toBe(true);
  });

  it("detects capacity overflow", () => {
    const oversized = makeList(MAX_WATCHLIST_SIZE + 1);
    const result = validateWatchlist(oversized);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.errors.some((e) => e.kind === "watchlistFull")).toBe(
        true
      );
    }
  });

  it("detects duplicate propertyIds", () => {
    const list: WatchlistEntry[] = [
      makeEntry({ id: "a", propertyId: "p_1", position: 0 }),
      makeEntry({ id: "b", propertyId: "p_1", position: 1 }),
    ];
    const result = validateWatchlist(list);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(
        result.errors.some((e) => e.kind === "duplicatePropertyId")
      ).toBe(true);
    }
  });
});

// MARK: - addToWatchlist

describe("addToWatchlist", () => {
  it("adds a new property at the end of the list", () => {
    const entries = makeList(2);
    const result = addToWatchlist(
      entries,
      "p_new",
      "u_1",
      "entry_new",
      "2026-04-12T12:00:00Z",
      "my note"
    );
    expect(result.kind).toBe("added");
    if (result.kind === "added") {
      expect(result.entry.propertyId).toBe("p_new");
      expect(result.entry.position).toBe(2);
      expect(result.entry.note).toBe("my note");
    }
  });

  it("is idempotent for existing properties", () => {
    const entries = makeList(2);
    const result = addToWatchlist(
      entries,
      "p_0",
      "u_1",
      "entry_dup",
      "2026-04-12T12:00:00Z"
    );
    expect(result.kind).toBe("alreadyInList");
    if (result.kind === "alreadyInList") {
      expect(result.entry.id).toBe("entry_0");
    }
  });

  it("rejects when the watchlist is full", () => {
    const full = makeList(MAX_WATCHLIST_SIZE);
    const result = addToWatchlist(
      full,
      "p_new",
      "u_1",
      "entry_new",
      "2026-04-12T12:00:00Z"
    );
    expect(result.kind).toBe("full");
    if (result.kind === "full") {
      expect(result.max).toBe(MAX_WATCHLIST_SIZE);
    }
  });

  it("trims whitespace from notes", () => {
    const result = addToWatchlist(
      [],
      "p_new",
      "u_1",
      "entry_new",
      "2026-04-12T12:00:00Z",
      "  trimmed  "
    );
    if (result.kind === "added") {
      expect(result.entry.note).toBe("trimmed");
    }
  });

  it("treats whitespace-only notes as undefined", () => {
    const result = addToWatchlist(
      [],
      "p_new",
      "u_1",
      "entry_new",
      "2026-04-12T12:00:00Z",
      "   "
    );
    if (result.kind === "added") {
      expect(result.entry.note).toBeUndefined();
    }
  });
});

// MARK: - removeFromWatchlist

describe("removeFromWatchlist", () => {
  it("removes the target and recomputes positions", () => {
    const entries = makeList(4);
    const result = removeFromWatchlist(
      entries,
      "p_1",
      "2026-04-12T12:00:00Z"
    );
    expect(result.kind).toBe("removed");
    if (result.kind === "removed") {
      expect(result.removedId).toBe("entry_1");
      const positions = result.reorderedEntries.map((e) => e.position);
      expect(positions).toEqual([0, 1, 2]);
      const ids = result.reorderedEntries.map((e) => e.id);
      expect(ids).toEqual(["entry_0", "entry_2", "entry_3"]);
    }
  });

  it("returns notFound for a property not in the list", () => {
    const entries = makeList(2);
    const result = removeFromWatchlist(
      entries,
      "p_nope",
      "2026-04-12T12:00:00Z"
    );
    expect(result.kind).toBe("notFound");
  });

  it("handles empty list", () => {
    const result = removeFromWatchlist([], "p_1", "2026-04-12T12:00:00Z");
    expect(result.kind).toBe("notFound");
  });

  it("removes the only entry", () => {
    const result = removeFromWatchlist(
      [makeEntry({ id: "only", propertyId: "p_1" })],
      "p_1",
      "2026-04-12T12:00:00Z"
    );
    expect(result.kind).toBe("removed");
    if (result.kind === "removed") {
      expect(result.reorderedEntries).toHaveLength(0);
    }
  });
});

// MARK: - reorderWatchlist

describe("reorderWatchlist", () => {
  it("reorders entries to match the new order", () => {
    const entries = makeList(3);
    const result = reorderWatchlist(
      entries,
      ["entry_2", "entry_0", "entry_1"],
      "2026-04-12T12:00:00Z"
    );
    expect(result.kind).toBe("reordered");
    if (result.kind === "reordered") {
      const ids = result.entries.map((e) => e.id);
      expect(ids).toEqual(["entry_2", "entry_0", "entry_1"]);
      const positions = result.entries.map((e) => e.position);
      expect(positions).toEqual([0, 1, 2]);
    }
  });

  it("detects missing ids", () => {
    const entries = makeList(3);
    const result = reorderWatchlist(
      entries,
      ["entry_0", "entry_1"], // missing entry_2
      "2026-04-12T12:00:00Z"
    );
    expect(result.kind).toBe("invalidOrder");
    if (result.kind === "invalidOrder") {
      expect(result.reason).toBe("missingIds");
    }
  });

  it("detects extra ids", () => {
    const entries = makeList(2);
    const result = reorderWatchlist(
      entries,
      ["entry_0", "entry_1", "entry_ghost"],
      "2026-04-12T12:00:00Z"
    );
    expect(result.kind).toBe("invalidOrder");
    if (result.kind === "invalidOrder") {
      expect(result.reason).toBe("extraIds");
    }
  });

  it("detects duplicate ids in the new order", () => {
    const entries = makeList(2);
    const result = reorderWatchlist(
      entries,
      ["entry_0", "entry_0"],
      "2026-04-12T12:00:00Z"
    );
    expect(result.kind).toBe("invalidOrder");
    if (result.kind === "invalidOrder") {
      expect(result.reason).toBe("duplicateIds");
    }
  });

  it("only bumps updatedAt on entries that moved", () => {
    const entries = makeList(3);
    const result = reorderWatchlist(
      entries,
      ["entry_0", "entry_1", "entry_2"],
      "2026-04-12T12:00:00Z"
    );
    if (result.kind === "reordered") {
      // No moves — none of the entries should have been rebuilt.
      for (const e of result.entries) {
        expect(e.updatedAt).toBe("2026-04-12T00:00:00Z");
      }
    }
  });

  it("handles empty list reorder", () => {
    const result = reorderWatchlist([], [], "2026-04-12T12:00:00Z");
    expect(result.kind).toBe("reordered");
    if (result.kind === "reordered") {
      expect(result.entries).toHaveLength(0);
    }
  });
});

// MARK: - setEntryNote

describe("setEntryNote", () => {
  it("updates the note on an existing entry", () => {
    const entries = makeList(2);
    const updated = setEntryNote(
      entries,
      "p_1",
      "visited",
      "2026-04-12T12:00:00Z"
    );
    expect(updated?.note).toBe("visited");
  });

  it("clears the note when passed empty string", () => {
    const withNote = makeList(2).map((e, i) =>
      i === 0 ? { ...e, note: "old" } : e
    );
    const updated = setEntryNote(
      withNote,
      "p_0",
      "",
      "2026-04-12T12:00:00Z"
    );
    expect(updated?.note).toBeUndefined();
  });

  it("clears the note when passed undefined", () => {
    const withNote = [
      makeEntry({ id: "a", propertyId: "p_0", note: "old" }),
    ];
    const updated = setEntryNote(
      withNote,
      "p_0",
      undefined,
      "2026-04-12T12:00:00Z"
    );
    expect(updated?.note).toBeUndefined();
  });

  it("returns undefined for a property not in the list", () => {
    const entries = makeList(2);
    expect(
      setEntryNote(entries, "p_missing", "note", "2026-04-12T12:00:00Z")
    ).toBeUndefined();
  });

  it("throws when note exceeds MAX_NOTE_LENGTH", () => {
    const entries = makeList(1);
    expect(() =>
      setEntryNote(
        entries,
        "p_0",
        "x".repeat(MAX_NOTE_LENGTH + 1),
        "2026-04-12T12:00:00Z"
      )
    ).toThrow(/exceeds/);
  });
});

// MARK: - projectBuyerView / projectBuyerWatchlist

describe("projectBuyerView", () => {
  it("drops the buyerId from the view", () => {
    const view = projectBuyerView(makeEntry());
    expect((view as unknown as { buyerId?: string }).buyerId).toBeUndefined();
  });

  it("keeps propertyId, position, note, timestamps", () => {
    const entry = makeEntry({ note: "my note", position: 5 });
    const view = projectBuyerView(entry);
    expect(view.propertyId).toBe(entry.propertyId);
    expect(view.position).toBe(5);
    expect(view.note).toBe("my note");
    expect(view.addedAt).toBe(entry.addedAt);
  });
});

describe("projectBuyerWatchlist", () => {
  it("sorts by position ascending", () => {
    const entries: WatchlistEntry[] = [
      makeEntry({ id: "b", propertyId: "p_b", position: 2 }),
      makeEntry({ id: "a", propertyId: "p_a", position: 0 }),
      makeEntry({ id: "c", propertyId: "p_c", position: 1 }),
    ];
    const views = projectBuyerWatchlist(entries);
    expect(views.map((v) => v.id)).toEqual(["a", "c", "b"]);
  });

  it("handles empty list", () => {
    expect(projectBuyerWatchlist([])).toEqual([]);
  });
});

// MARK: - Selectors

describe("countEntries / isFull / findByPropertyId", () => {
  it("counts entries", () => {
    expect(countEntries(makeList(7))).toBe(7);
    expect(countEntries([])).toBe(0);
  });

  it("isFull returns true at MAX_WATCHLIST_SIZE", () => {
    expect(isFull(makeList(MAX_WATCHLIST_SIZE))).toBe(true);
    expect(isFull(makeList(MAX_WATCHLIST_SIZE - 1))).toBe(false);
  });

  it("findByPropertyId returns the entry or undefined", () => {
    const entries = makeList(3);
    expect(findByPropertyId(entries, "p_1")?.id).toBe("entry_1");
    expect(findByPropertyId(entries, "p_missing")).toBeUndefined();
  });
});
