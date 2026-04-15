import { beforeEach, describe, expect, it, vi } from "vitest";

const mailRailMocks = vi.hoisted(() => ({
  selectDriver: vi.fn(),
}));

vi.mock("../../../convex/mailRail", () => ({
  selectDriver: mailRailMocks.selectDriver,
}));

import * as waitlistSignupsModule from "../../../convex/waitlistSignups";

type TableName =
  | "settingsEntries"
  | "waitlistSignups"
  | "rateLimitBuckets"
  | "abuseEvents"
  | "auditLog";

type Row = Record<string, unknown>;
type Tables = Record<TableName, Row[]>;

type QueryBuilder = {
  withIndex: (
    indexName: string,
    builder: (q: IndexRangeBuilder) => IndexRangeBuilder,
  ) => OrderedQuery;
};

type IndexRangeBuilder = {
  eq: (field: string, value: unknown) => IndexRangeBuilder;
};

type OrderedQuery = {
  order: (dir: "asc" | "desc") => OrderedQuery;
  collect: () => Promise<Row[]>;
  first: () => Promise<Row | null>;
  unique: () => Promise<Row | null>;
};

type TestContext = {
  db: {
    get: (id: string) => Promise<Row | null>;
    insert: (table: TableName, value: Row) => Promise<string>;
    patch: (id: string, value: Row) => Promise<void>;
    query: (table: TableName) => QueryBuilder;
  };
};

function invokeRegisteredMutation<TResult>(
  mutation: unknown,
  ctx: TestContext,
  args: Row,
): Promise<TResult> {
  const handler = (
    mutation as {
      _handler: (ctx: TestContext, args: Row) => Promise<TResult> | TResult;
    }
  )._handler;
  return Promise.resolve(handler(ctx, args));
}

function cloneRow<T extends Row | null>(row: T): T {
  if (!row) return row;
  return { ...row } as T;
}

function createTables(initial: Partial<Tables>): {
  tables: Tables;
  byId: Map<string, { table: TableName; row: Row }>;
} {
  const tables: Tables = {
    settingsEntries: [...(initial.settingsEntries ?? [])],
    waitlistSignups: [...(initial.waitlistSignups ?? [])],
    rateLimitBuckets: [...(initial.rateLimitBuckets ?? [])],
    abuseEvents: [...(initial.abuseEvents ?? [])],
    auditLog: [...(initial.auditLog ?? [])],
  };
  const byId = new Map<string, { table: TableName; row: Row }>();
  for (const [tableName, rows] of Object.entries(tables) as Array<
    [TableName, Row[]]
  >) {
    for (const row of rows) {
      byId.set(String(row._id), { table: tableName, row });
    }
  }
  return { tables, byId };
}

function createContext(initial: Partial<Tables> = {}) {
  const { tables, byId } = createTables(initial);
  let nextId = 1;
  let nextCreationTime = 1_000;

  const db: TestContext["db"] = {
    async get(id: string) {
      return cloneRow(byId.get(id)?.row ?? null);
    },
    async insert(table: TableName, value: Row) {
      const id = String(value._id ?? `${table}_${nextId++}`);
      const row: Row = {
        ...value,
        _id: id,
        _creationTime:
          typeof value._creationTime === "number"
            ? value._creationTime
            : nextCreationTime++,
      };
      tables[table].push(row);
      byId.set(id, { table, row });
      return id;
    },
    async patch(id: string, value: Row) {
      const target = byId.get(id);
      if (!target) throw new Error(`Missing row for ${id}`);
      Object.assign(target.row, value);
    },
    query(table: TableName) {
      return {
        withIndex(
          _indexName: string,
          builder: (q: IndexRangeBuilder) => IndexRangeBuilder,
        ): OrderedQuery {
          const conditions: Array<{ field: string; value: unknown }> = [];
          const rangeBuilder: IndexRangeBuilder = {
            eq(field, value) {
              conditions.push({ field, value });
              return rangeBuilder;
            },
          };
          builder(rangeBuilder);
          let orderDir: "asc" | "desc" = "asc";
          const orderedQuery: OrderedQuery = {
            order(dir) {
              orderDir = dir;
              return orderedQuery;
            },
            async collect() {
              const matched = tables[table].filter((row) =>
                conditions.every(({ field, value }) => row[field] === value),
              );
              const sorted = [...matched].sort((a, b) => {
                const at =
                  typeof a._creationTime === "number" ? a._creationTime : 0;
                const bt =
                  typeof b._creationTime === "number" ? b._creationTime : 0;
                return orderDir === "desc" ? bt - at : at - bt;
              });
              return sorted.map((row) => cloneRow(row));
            },
            async first() {
              const rows = await orderedQuery.collect();
              return rows[0] ?? null;
            },
            async unique() {
              const rows = await orderedQuery.collect();
              if (rows.length > 1) {
                throw new Error(
                  `Expected unique row in ${table}, found ${rows.length}`,
                );
              }
              return rows[0] ?? null;
            },
          };
          return orderedQuery;
        },
      };
    },
  };

  return { ctx: { db } satisfies TestContext, tables };
}

beforeEach(() => {
  mailRailMocks.selectDriver.mockReset();
});

describe("waitlistSignups.upsert", () => {
  it("creates the row once and queues the confirmation email once", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-04-15T17:00:00.000Z"));

    try {
      const send = vi
        .fn()
        .mockResolvedValue({ providerMessageId: "waitlist-1" });
      mailRailMocks.selectDriver.mockReturnValue({
        name: "noop",
        send,
      });
      const { ctx, tables } = createContext({
        settingsEntries: [
          {
            _id: "settings_support_email",
            key: "ops.support_email",
            kind: "string",
            stringValue: "concierge@buyer-v2.com",
          },
        ],
      });

      const result = await invokeRegisteredMutation<{ ok: boolean }>(
        waitlistSignupsModule.upsert,
        ctx,
        {
          email: "  BUYER@EXAMPLE.COM ",
          stateCode: " tx ",
          zip: "78701",
          sourcePath: "/pricing",
          userAgent: "VitestBrowser/1.0",
        },
      );

      expect(result).toEqual({ ok: true });
      expect(tables.waitlistSignups).toHaveLength(1);
      expect(tables.waitlistSignups[0]).toMatchObject({
        email: "buyer@example.com",
        stateCode: "TX",
        zip: "78701",
        sourcePath: "/pricing",
        confirmationEmailProvider: "noop",
        confirmationEmailProviderMessageId: "waitlist-1",
        confirmationEmailTemplateKey: "waitlist_confirmation",
      });
      expect(tables.waitlistSignups[0]?.confirmationEmailQueuedAt).toEqual(
        expect.any(String),
      );
      expect(send).toHaveBeenCalledTimes(1);
      expect(send.mock.calls[0]?.[0]).toMatchObject({
        to: "buyer@example.com",
        replyTo: "concierge@buyer-v2.com",
        metadata: {
          templateKey: "waitlist_confirmation",
          sourcePath: "/pricing",
        },
      });
    } finally {
      vi.useRealTimers();
    }
  });

  it("rate-limits immediate re-submits, then patches the existing row without re-sending", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-04-15T17:30:00.000Z"));

    try {
      const send = vi
        .fn()
        .mockResolvedValue({ providerMessageId: "waitlist-1" });
      mailRailMocks.selectDriver.mockReturnValue({
        name: "noop",
        send,
      });
      const { ctx, tables } = createContext();

      const first = await invokeRegisteredMutation<{ ok: boolean }>(
        waitlistSignupsModule.upsert,
        ctx,
        {
          email: "buyer@example.com",
          stateCode: "TX",
          zip: "78701",
          sourcePath: "/pricing",
        },
      );
      const second = await invokeRegisteredMutation<{
        ok: boolean;
        reason?: string;
      }>(waitlistSignupsModule.upsert, ctx, {
        email: "buyer@example.com",
        stateCode: "TX",
        zip: "78701",
        sourcePath: "/pricing",
      });

      vi.advanceTimersByTime(61_000);

      const third = await invokeRegisteredMutation<{ ok: boolean }>(
        waitlistSignupsModule.upsert,
        ctx,
        {
          email: "buyer@example.com",
          stateCode: "TX",
          zip: "73301",
          sourcePath: "/faq",
        },
      );

      expect(first).toEqual({ ok: true });
      expect(second).toEqual({ ok: false, reason: "rate_limited" });
      expect(third).toEqual({ ok: true });
      expect(tables.waitlistSignups).toHaveLength(1);
      expect(tables.waitlistSignups[0]).toMatchObject({
        email: "buyer@example.com",
        stateCode: "TX",
        zip: "73301",
        sourcePath: "/faq",
        confirmationEmailProviderMessageId: "waitlist-1",
      });
      expect(send).toHaveBeenCalledTimes(1);
    } finally {
      vi.useRealTimers();
    }
  });
});
