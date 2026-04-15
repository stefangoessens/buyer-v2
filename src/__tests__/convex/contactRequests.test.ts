import { beforeEach, describe, expect, it, vi } from "vitest";

const mailRailMocks = vi.hoisted(() => ({
  selectDriver: vi.fn(),
}));

vi.mock("../../../convex/mailRail", () => ({
  selectDriver: mailRailMocks.selectDriver,
}));

import * as contactRequestsModule from "../../../convex/contactRequests";

type TableName =
  | "settingsEntries"
  | "contactRequests"
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
    contactRequests: [...(initial.contactRequests ?? [])],
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

describe("contactRequests.submitPublic", () => {
  it("writes the inquiry durably, normalizes the payload, and queues both emails", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-04-15T15:30:00.000Z"));

    try {
      const send = vi
        .fn()
        .mockResolvedValueOnce({ providerMessageId: "broker-1" })
        .mockResolvedValueOnce({ providerMessageId: "buyer-1" });
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
        contactRequestsModule.submitPublic,
        ctx,
        {
          name: "  Jordan Buyer  ",
          email: "  JORDAN@EXAMPLE.COM ",
          message: "Looking at this home and want buyer representation.",
          listingLink: "www.zillow.com/homedetails/123",
          sourcePath: "/contact",
          userAgent: "VitestBrowser/1.0",
        },
      );

      expect(result).toEqual({ ok: true });
      expect(tables.contactRequests).toHaveLength(1);
      expect(tables.contactRequests[0]).toMatchObject({
        name: "Jordan Buyer",
        email: "jordan@example.com",
        listingLink: "https://www.zillow.com/homedetails/123",
        sourcePath: "/contact",
        triageEmail: "concierge@buyer-v2.com",
        brokerInboxProvider: "noop",
        brokerInboxProviderMessageId: "broker-1",
        brokerInboxTemplateKey: "contact_broker_inbox",
        buyerAutoReplyProvider: "noop",
        buyerAutoReplyProviderMessageId: "buyer-1",
        buyerAutoReplyTemplateKey: "contact_autoreply",
      });
      expect(tables.contactRequests[0]?.brokerInboxQueuedAt).toEqual(
        expect.any(String),
      );
      expect(tables.contactRequests[0]?.buyerAutoReplyQueuedAt).toEqual(
        expect.any(String),
      );
      expect(send).toHaveBeenCalledTimes(2);
      expect(send.mock.calls[0]?.[0]).toMatchObject({
        to: "concierge@buyer-v2.com",
        replyTo: "jordan@example.com",
        metadata: {
          templateKey: "contact_broker_inbox",
          sourcePath: "/contact",
        },
      });
      expect(send.mock.calls[1]?.[0]).toMatchObject({
        to: "jordan@example.com",
        replyTo: "concierge@buyer-v2.com",
        metadata: {
          templateKey: "contact_autoreply",
          sourcePath: "/contact",
        },
      });
    } finally {
      vi.useRealTimers();
    }
  });

  it("rejects invalid input without writing or sending", async () => {
    const send = vi.fn();
    mailRailMocks.selectDriver.mockReturnValue({
      name: "noop",
      send,
    });
    const { ctx, tables } = createContext();

    const result = await invokeRegisteredMutation<{
      ok: boolean;
      reason?: string;
    }>(contactRequestsModule.submitPublic, ctx, {
      name: "Jordan",
      email: "not-an-email",
      message: "Enough detail here.",
      sourcePath: "/contact",
    });

    expect(result).toEqual({ ok: false, reason: "invalid_email" });
    expect(tables.contactRequests).toHaveLength(0);
    expect(send).not.toHaveBeenCalled();
  });

  it("rate-limits rapid repeated submits on the same public key", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-04-15T16:00:00.000Z"));

    try {
      const send = vi
        .fn()
        .mockResolvedValueOnce({ providerMessageId: "broker-1" })
        .mockResolvedValueOnce({ providerMessageId: "buyer-1" });
      mailRailMocks.selectDriver.mockReturnValue({
        name: "noop",
        send,
      });
      const { ctx, tables } = createContext();

      const first = await invokeRegisteredMutation<{ ok: boolean }>(
        contactRequestsModule.submitPublic,
        ctx,
        {
          name: "Jordan",
          email: "buyer@example.com",
          message: "Please help me review this listing.",
          sourcePath: "/contact",
        },
      );
      const second = await invokeRegisteredMutation<{
        ok: boolean;
        reason?: string;
      }>(contactRequestsModule.submitPublic, ctx, {
        name: "Jordan",
        email: "buyer@example.com",
        message: "Please help me review this listing.",
        sourcePath: "/contact",
      });

      expect(first).toEqual({ ok: true });
      expect(second).toEqual({ ok: false, reason: "rate_limited" });
      expect(tables.contactRequests).toHaveLength(1);
      expect(send).toHaveBeenCalledTimes(2);
    } finally {
      vi.useRealTimers();
    }
  });
});
