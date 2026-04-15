import { beforeEach, describe, expect, it, vi } from "vitest";

// ─── Notes ─────────────────────────────────────────────────────────────
// `convex-test` is not wired up in this repo, so these are mutation-body
// unit tests against a handcrafted ctx stub — the same pattern used by
// `src/__tests__/lib/agreements-offer-eligibility-sync.test.ts`. We pull
// out each mutation's `_handler` via `invokeRegisteredMutation` and drive
// it against in-memory tables. The goal is to pin the KIN-1079 Request
// Disclosures rail behaviors that matter for audit + feature-flag locking.

const sessionMocks = vi.hoisted(() => ({
  requireAuth: vi.fn(),
}));
const mailRailMocks = vi.hoisted(() => ({
  selectDriver: vi.fn(),
}));

vi.mock("../../../convex/lib/session", () => ({
  requireAuth: sessionMocks.requireAuth,
}));
vi.mock("../../../convex/mailRail", () => ({
  selectDriver: mailRailMocks.selectDriver,
}));

import * as disclosuresModule from "../../../convex/disclosures";

// ─── Test harness ──────────────────────────────────────────────────────

type TableName =
  | "users"
  | "dealRooms"
  | "properties"
  | "propertyAgentLinks"
  | "listingAgents"
  | "disclosureRequests"
  | "auditLog";

type Row = Record<string, unknown>;
type Tables = Record<TableName, Row[]>;

type TestContext = {
  db: {
    get: (id: string) => Promise<Row | null>;
    insert: (table: TableName, value: Row) => Promise<string>;
    patch: (id: string, value: Row) => Promise<void>;
    query: (table: TableName) => QueryBuilder;
  };
};

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
    users: [...(initial.users ?? [])],
    dealRooms: [...(initial.dealRooms ?? [])],
    properties: [...(initial.properties ?? [])],
    propertyAgentLinks: [...(initial.propertyAgentLinks ?? [])],
    listingAgents: [...(initial.listingAgents ?? [])],
    disclosureRequests: [...(initial.disclosureRequests ?? [])],
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
  let nextCreationTime = 1000;

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
                conditions.every(
                  ({ field, value }) => row[field] === value,
                ),
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

// ─── Fixtures ──────────────────────────────────────────────────────────

const BUYER_USER = {
  _id: "user_buyer",
  _creationTime: 1,
  email: "buyer@example.com",
  name: "Buyer One",
  role: "buyer" as const,
};

function makeDealRoom(overrides: Row = {}): Row {
  return {
    _id: "deal_room_1",
    _creationTime: 10,
    buyerId: BUYER_USER._id,
    propertyId: "property_1",
    ...overrides,
  };
}

function makeProperty(overrides: Row = {}): Row {
  return {
    _id: "property_1",
    _creationTime: 5,
    address: "123 Ocean Dr, Miami, FL",
    ...overrides,
  };
}

function makeListingAgent(overrides: Row = {}): Row {
  return {
    _id: "listing_agent_1",
    _creationTime: 3,
    name: "Agent Smith",
    email: "agent.smith@brokerage.com",
    ...overrides,
  };
}

function makeAgentLink(overrides: Row = {}): Row {
  return {
    _id: "agent_link_1",
    _creationTime: 4,
    propertyId: "property_1",
    agentId: "listing_agent_1",
    role: "listing",
    ...overrides,
  };
}

function makeDisclosureRequest(overrides: Row = {}): Row {
  return {
    _id: "disclosure_request_1",
    _creationTime: 50,
    dealRoomId: "deal_room_1",
    buyerId: BUYER_USER._id,
    propertyId: "property_1",
    listingAgentEmail: "agent.smith@brokerage.com",
    listingAgentName: "Agent Smith",
    subject: "Disclosure request — 123 Ocean Dr, Miami, FL",
    bodyText: "Hi Agent Smith, ...",
    personalNote: undefined,
    status: "sent" as const,
    providerMessageId: "noop-abc",
    provider: "noop" as const,
    sentAt: "2026-04-10T12:00:00.000Z",
    followUpCount: 0,
    nextFollowUpDueAt: "2026-04-12T12:00:00.000Z",
    createdAt: "2026-04-10T12:00:00.000Z",
    updatedAt: "2026-04-10T12:00:00.000Z",
    ...overrides,
  };
}

// ─── Tests ─────────────────────────────────────────────────────────────

beforeEach(() => {
  sessionMocks.requireAuth.mockReset();
  sessionMocks.requireAuth.mockResolvedValue(BUYER_USER);
  mailRailMocks.selectDriver.mockReset();
  mailRailMocks.selectDriver.mockReturnValue({
    name: "noop",
    send: vi.fn().mockResolvedValue({ providerMessageId: "noop-test-id" }),
  });
  // Default: feature flag OFF. Each test that needs it on must stub.
  vi.stubEnv("KIN_1079_REQUEST_DISCLOSURES_ENABLED", "");
});

describe("requestFromListingAgent — feature flag lock", () => {
  // LOCKING TEST: pins the default-off behavior so the rail cannot
  // ship to buyers until the env var is explicitly flipped.
  it("throws when KIN_1079_REQUEST_DISCLOSURES_ENABLED !== 'true'", async () => {
    vi.stubEnv("KIN_1079_REQUEST_DISCLOSURES_ENABLED", "");
    const { ctx } = createContext({
      users: [BUYER_USER],
      dealRooms: [makeDealRoom()],
      properties: [makeProperty()],
      propertyAgentLinks: [makeAgentLink()],
      listingAgents: [makeListingAgent()],
    });

    await expect(
      invokeRegisteredMutation(
        disclosuresModule.requestFromListingAgent,
        ctx,
        { dealRoomId: "deal_room_1" },
      ),
    ).rejects.toThrow("Request Disclosures rail disabled");
  });

  it("also throws when flag is set to a non-'true' value like '1'", async () => {
    vi.stubEnv("KIN_1079_REQUEST_DISCLOSURES_ENABLED", "1");
    const { ctx } = createContext({
      users: [BUYER_USER],
      dealRooms: [makeDealRoom()],
      properties: [makeProperty()],
      propertyAgentLinks: [makeAgentLink()],
      listingAgents: [makeListingAgent()],
    });

    await expect(
      invokeRegisteredMutation(
        disclosuresModule.requestFromListingAgent,
        ctx,
        { dealRoomId: "deal_room_1" },
      ),
    ).rejects.toThrow("Request Disclosures rail disabled");
  });
});

describe("requestFromListingAgent — happy path", () => {
  beforeEach(() => {
    vi.stubEnv("KIN_1079_REQUEST_DISCLOSURES_ENABLED", "true");
  });

  it("inserts a disclosureRequests row with status='sent' and a 48h follow-up window", async () => {
    const fixedNow = Date.parse("2026-04-14T12:00:00.000Z");
    vi.useFakeTimers();
    vi.setSystemTime(new Date(fixedNow));

    try {
      const { ctx, tables } = createContext({
        users: [BUYER_USER],
        dealRooms: [makeDealRoom()],
        properties: [makeProperty()],
        propertyAgentLinks: [makeAgentLink()],
        listingAgents: [makeListingAgent()],
      });

      const result = await invokeRegisteredMutation<{ requestId: string }>(
        disclosuresModule.requestFromListingAgent,
        ctx,
        { dealRoomId: "deal_room_1", personalNote: "Appreciate it!" },
      );

      expect(result.requestId).toBeDefined();
      expect(tables.disclosureRequests).toHaveLength(1);

      const row = tables.disclosureRequests[0]!;
      expect(row.status).toBe("sent");
      expect(row.provider).toBe("noop");
      expect(row.providerMessageId).toBe("noop-test-id");
      expect(row.listingAgentEmail).toBe("agent.smith@brokerage.com");
      expect(row.personalNote).toBe("Appreciate it!");
      expect(row.sentAt).toBe(new Date(fixedNow).toISOString());

      // 48h follow-up window is load-bearing for the sweep — pin it.
      const expectedFollowUp = new Date(
        fixedNow + 48 * 60 * 60 * 1000,
      ).toISOString();
      expect(row.nextFollowUpDueAt).toBe(expectedFollowUp);

      // Audit row is written so the rail has a paper trail even under
      // the no-op driver.
      expect(tables.auditLog).toHaveLength(1);
      expect(tables.auditLog[0]).toMatchObject({
        action: "disclosure_request_sent",
        entityType: "disclosureRequests",
        userId: BUYER_USER._id,
      });
    } finally {
      vi.useRealTimers();
    }
  });

  it("throws when no listing agent is linked to the property", async () => {
    const { ctx } = createContext({
      users: [BUYER_USER],
      dealRooms: [makeDealRoom()],
      properties: [makeProperty()],
      // No propertyAgentLinks or listingAgents wired.
    });

    await expect(
      invokeRegisteredMutation(
        disclosuresModule.requestFromListingAgent,
        ctx,
        { dealRoomId: "deal_room_1" },
      ),
    ).rejects.toThrow("No listing agent on file for this property");
  });
});

describe("getLatestDisclosureRequest", () => {
  beforeEach(() => {
    vi.stubEnv("KIN_1079_REQUEST_DISCLOSURES_ENABLED", "true");
  });

  it("returns null when no requests exist", async () => {
    const { ctx } = createContext({
      users: [BUYER_USER],
      dealRooms: [makeDealRoom()],
    });

    const result = await invokeRegisteredMutation<Row | null>(
      disclosuresModule.getLatestDisclosureRequest,
      ctx,
      { dealRoomId: "deal_room_1" },
    );

    expect(result).toBeNull();
  });

  it("excludes cancelled rows and returns the newest non-cancelled request", async () => {
    const { ctx } = createContext({
      users: [BUYER_USER],
      dealRooms: [makeDealRoom()],
      disclosureRequests: [
        makeDisclosureRequest({
          _id: "req_old_sent",
          _creationTime: 100,
          status: "sent",
        }),
        makeDisclosureRequest({
          _id: "req_newest_cancelled",
          _creationTime: 300,
          status: "cancelled",
        }),
        makeDisclosureRequest({
          _id: "req_middle_replied",
          _creationTime: 200,
          status: "replied",
        }),
      ],
    });

    const result = await invokeRegisteredMutation<Row | null>(
      disclosuresModule.getLatestDisclosureRequest,
      ctx,
      { dealRoomId: "deal_room_1" },
    );

    // Newest is cancelled, so we fall through to the next non-cancelled
    // row — the middle replied request.
    expect(result).not.toBeNull();
    expect(result?._id).toBe("req_middle_replied");
  });
});

describe("ingestDisclosureRequestReply", () => {
  it("flips status to 'replied', nulls the follow-up clock, and writes the reply snippet", async () => {
    const { ctx, tables } = createContext({
      disclosureRequests: [
        makeDisclosureRequest({
          _id: "req_sent",
          status: "sent",
          nextFollowUpDueAt: "2026-04-12T12:00:00.000Z",
        }),
      ],
    });

    await invokeRegisteredMutation(
      disclosuresModule.ingestDisclosureRequestReply,
      ctx,
      {
        requestId: "req_sent",
        fromAddress: "agent.smith@brokerage.com",
        subject: "Re: Disclosure request",
        bodyTextSnippet:
          "Thanks for reaching out — attaching the seller's disclosures below.",
      },
    );

    const updated = tables.disclosureRequests[0]!;
    expect(updated.status).toBe("replied");
    expect(updated.nextFollowUpDueAt).toBeUndefined();
    expect(updated.replyBodySnippetText).toBe(
      "Thanks for reaching out — attaching the seller's disclosures below.",
    );
    expect(updated.repliedAt).toEqual(expect.any(String));
  });
});

describe("runDisclosureRequestFollowUpSweep", () => {
  it("flips overdue 'sent' requests to 'follow_up_needed' and increments followUpCount", async () => {
    const fixedNow = Date.parse("2026-04-14T12:00:00.000Z");
    vi.useFakeTimers();
    vi.setSystemTime(new Date(fixedNow));

    try {
      const { ctx, tables } = createContext({
        disclosureRequests: [
          // Overdue: due 2 days ago → should flip.
          makeDisclosureRequest({
            _id: "req_overdue",
            status: "sent",
            followUpCount: 0,
            nextFollowUpDueAt: "2026-04-12T12:00:00.000Z",
          }),
          // Future: still pending → should NOT flip.
          makeDisclosureRequest({
            _id: "req_future",
            status: "sent",
            followUpCount: 0,
            nextFollowUpDueAt: "2026-04-20T12:00:00.000Z",
          }),
          // Already replied: out of scope for the sweep.
          makeDisclosureRequest({
            _id: "req_replied",
            status: "replied",
            followUpCount: 0,
            nextFollowUpDueAt: undefined,
          }),
        ],
      });

      await invokeRegisteredMutation(
        disclosuresModule.runDisclosureRequestFollowUpSweep,
        ctx,
        {},
      );

      const overdue = tables.disclosureRequests.find(
        (r) => r._id === "req_overdue",
      )!;
      expect(overdue.status).toBe("follow_up_needed");
      expect(overdue.followUpCount).toBe(1);
      expect(overdue.nextFollowUpDueAt).toBeUndefined();
      expect(overdue.lastFollowUpAt).toEqual(expect.any(String));

      const future = tables.disclosureRequests.find(
        (r) => r._id === "req_future",
      )!;
      expect(future.status).toBe("sent");
      expect(future.followUpCount).toBe(0);

      const replied = tables.disclosureRequests.find(
        (r) => r._id === "req_replied",
      )!;
      expect(replied.status).toBe("replied");
      expect(replied.followUpCount).toBe(0);
    } finally {
      vi.useRealTimers();
    }
  });
});
