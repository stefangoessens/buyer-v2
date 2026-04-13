import { describe, expect, it } from "vitest";

import type { Id } from "../../../convex/_generated/dataModel";
import * as ledger from "../../../convex/ledger";
import * as reconciliation from "../../../convex/reconciliation";

type TableName =
  | "users"
  | "properties"
  | "dealRooms"
  | "buyerProfiles"
  | "feeLedgerEntries"
  | "compensationStatus"
  | "reconciliationReports"
  | "auditLog";

type AnyDoc = Record<string, unknown> & {
  _id: string;
  _creationTime: number;
};

type QueryFilter = {
  eq: (field: string, value: unknown) => QueryFilter;
  gte: (field: string, value: unknown) => QueryFilter;
  lt: (field: string, value: unknown) => QueryFilter;
};

type ConvexHandler<TArgs, TResult> = {
  _handler: (ctx: TestCtx, args: TArgs) => Promise<TResult> | TResult;
};

type TestCtx = {
  db: {
    get: (id: string) => Promise<AnyDoc | null>;
    insert: (table: TableName, value: Record<string, unknown>) => Promise<string>;
    patch: (id: string, value: Record<string, unknown>) => Promise<void>;
    query: (table: TableName) => {
      withIndex: (
        _name: string,
        cb: (q: QueryFilter) => QueryFilter,
      ) => QueryChain;
      order: (direction: "asc" | "desc") => QueryChain;
      collect: () => Promise<Array<AnyDoc>>;
      first: () => Promise<AnyDoc | null>;
      unique: () => Promise<AnyDoc | null>;
      take: (n: number) => Promise<Array<AnyDoc>>;
    };
  };
  auth: {
    getUserIdentity: () => Promise<{
      tokenIdentifier: string;
      issuer: string;
      subject: string;
    } | null>;
  };
  runMutation: (fn: unknown, args: Record<string, unknown>) => Promise<unknown>;
};

type QueryChain = {
  order: (direction: "asc" | "desc") => QueryChain;
  collect: () => Promise<Array<AnyDoc>>;
  first: () => Promise<AnyDoc | null>;
  unique: () => Promise<AnyDoc | null>;
  take: (n: number) => Promise<Array<AnyDoc>>;
};

function asId<
  Table extends
    | "users"
    | "properties"
    | "dealRooms"
    | "buyerProfiles"
    | "feeLedgerEntries"
    | "compensationStatus"
    | "reconciliationReports"
    | "auditLog"
    | "offers"
    | "contracts",
>(value: string): Id<Table> {
  return value as Id<Table>;
}

function runHandler<TArgs, TResult>(
  fn: unknown,
  ctx: TestCtx,
  args: TArgs,
): Promise<TResult> {
  return Promise.resolve((fn as ConvexHandler<TArgs, TResult>)._handler(ctx, args));
}

function sortValue(row: AnyDoc): string | number {
  return (
    (row.createdAt as string | undefined) ??
    (row.generatedAt as string | undefined) ??
    (row.updatedAt as string | undefined) ??
    (row.lastTransitionAt as string | undefined) ??
    row._creationTime
  );
}

class FilterBuilder {
  constructor(public rows: Array<AnyDoc>) {}

  readonly chain: QueryFilter = {
    eq: (field, value) => {
      this.rows = this.rows.filter((row) => row[field] === value);
      return this.chain;
    },
    gte: (field, value) => {
      const compareValue = value as string | number;
      this.rows = this.rows.filter((row) => {
        const rowValue = row[field] as string | number | undefined;
        return rowValue !== undefined && rowValue >= compareValue;
      });
      return this.chain;
    },
    lt: (field, value) => {
      const compareValue = value as string | number;
      this.rows = this.rows.filter((row) => {
        const rowValue = row[field] as string | number | undefined;
        return rowValue !== undefined && rowValue < compareValue;
      });
      return this.chain;
    },
  };
}

class InMemoryDb {
  private creationCounter = 1;
  private idCounter = 1;
  private readonly tables: Record<TableName, Array<AnyDoc>> = {
    users: [],
    properties: [],
    dealRooms: [],
    buyerProfiles: [],
    feeLedgerEntries: [],
    compensationStatus: [],
    reconciliationReports: [],
    auditLog: [],
  };
  private readonly tableById = new Map<string, TableName>();

  seed(table: TableName, value: Record<string, unknown>): AnyDoc {
    const row: AnyDoc = {
      _id: (value._id as string | undefined) ?? `${table}_${this.idCounter++}`,
      _creationTime:
        (value._creationTime as number | undefined) ?? this.creationCounter++,
      ...value,
    } as AnyDoc;
    this.tables[table].push(row);
    this.tableById.set(row._id, table);
    return row;
  }

  getRows(table: TableName) {
    return this.tables[table];
  }

  async get(id: string) {
    const table = this.tableById.get(id);
    if (!table) return null;
    return this.tables[table].find((row) => row._id === id) ?? null;
  }

  async insert(table: TableName, value: Record<string, unknown>) {
    return this.seed(table, value)._id;
  }

  async patch(id: string, value: Record<string, unknown>) {
    const existing = await this.get(id);
    if (!existing) {
      throw new Error(`Document not found: ${id}`);
    }
    Object.assign(existing, value);
  }

  query(table: TableName) {
    const makeChain = (rows: Array<AnyDoc>): QueryChain => ({
      order: (direction) => {
        const sorted = [...rows].sort((a, b) => {
          const left = sortValue(a);
          const right = sortValue(b);
          if (left === right) return 0;
          const cmp = left > right ? 1 : -1;
          return direction === "desc" ? -cmp : cmp;
        });
        return makeChain(sorted);
      },
      collect: async () => [...rows],
      first: async () => rows[0] ?? null,
      unique: async () => {
        if (rows.length > 1) {
          throw new Error("Expected query.unique() to yield at most one row");
        }
        return rows[0] ?? null;
      },
      take: async (n) => rows.slice(0, n),
    });

    return {
      withIndex: (_name: string, cb: (q: QueryFilter) => QueryFilter) => {
        const filter = new FilterBuilder([...this.tables[table]]);
        cb(filter.chain);
        return makeChain(filter.rows);
      },
      ...makeChain([...this.tables[table]]),
    };
  }
}

class Harness {
  readonly db = new InMemoryDb();

  seedUser(input: {
    id: string;
    role: "buyer" | "broker" | "admin";
    name?: string;
    email?: string;
  }) {
    return this.db.seed("users", {
      _id: input.id,
      email: input.email ?? `${input.id}@example.com`,
      name: input.name ?? input.id,
      role: input.role,
      authTokenIdentifier: `token:${input.id}`,
      authIssuer: "test-issuer",
      authSubject: `subject:${input.id}`,
    });
  }

  seedProperty(input: { id: string; listPrice?: number }) {
    return this.db.seed("properties", {
      _id: input.id,
      canonicalId: input.id,
      address: {
        street: "123 Ledger Ave",
        city: "Miami",
        state: "FL",
        zip: "33101",
        formatted: "123 Ledger Ave, Miami, FL 33101",
      },
      sourcePlatform: "manual",
      status: "active",
      listPrice: input.listPrice ?? 500_000,
      extractedAt: "2026-04-13T09:00:00.000Z",
      updatedAt: "2026-04-13T09:00:00.000Z",
    });
  }

  seedDealRoom(input: {
    id: string;
    buyerId: string;
    propertyId: string;
    status?: string;
  }) {
    return this.db.seed("dealRooms", {
      _id: input.id,
      buyerId: input.buyerId,
      propertyId: input.propertyId,
      status: input.status ?? "offer_prep",
      accessLevel: "full",
      createdAt: "2026-04-13T09:00:00.000Z",
      updatedAt: "2026-04-13T09:00:00.000Z",
    });
  }

  seedCompensationStatus(
    input: Partial<AnyDoc> & {
      id: string;
      dealRoomId: string;
      status:
        | "unknown"
        | "seller_disclosed_off_mls"
        | "negotiated_in_offer"
        | "buyer_paid";
    },
  ) {
    return this.db.seed("compensationStatus", {
      _id: input.id,
      dealRoomId: input.dealRoomId,
      status: input.status,
      previousStatus: input.previousStatus,
      transitionReason: input.transitionReason,
      transitionActorId: input.transitionActorId,
      lastLifecycleEvent: input.lastLifecycleEvent ?? "deal_room_created",
      buyerPromptKey: input.buyerPromptKey ?? "compensation_unknown",
      offerId: input.offerId,
      contractId: input.contractId,
      internalReviewState: input.internalReviewState ?? "not_required",
      sourceDocument: input.sourceDocument,
      lastTransitionAt:
        (input.lastTransitionAt as string | undefined) ??
        "2026-04-13T09:00:00.000Z",
      sellerDisclosedAmount: input.sellerDisclosedAmount,
      negotiatedAmount: input.negotiatedAmount,
      buyerPaidAmount: input.buyerPaidAmount,
      createdAt: (input.createdAt as string | undefined) ?? "2026-04-13T09:00:00.000Z",
      updatedAt: (input.updatedAt as string | undefined) ?? "2026-04-13T09:00:00.000Z",
    });
  }

  seedLedgerEntry(
    input: Partial<AnyDoc> & {
      id: string;
      dealRoomId: string;
      entryType: string;
      amount: number;
      createdAt: string;
    },
  ) {
    return this.db.seed("feeLedgerEntries", {
      _id: input.id,
      dealRoomId: input.dealRoomId,
      entryType: input.entryType,
      amount: input.amount,
      description: input.description ?? "seed",
      source: input.source ?? "manual",
      lifecycleEvent: input.lifecycleEvent,
      provenance: input.provenance ?? {
        timestamp: input.createdAt,
      },
      offerId: input.offerId,
      contractId: input.contractId,
      dealStatusAtChange: input.dealStatusAtChange,
      offerStatusAtChange: input.offerStatusAtChange,
      compensationStatusAtChange: input.compensationStatusAtChange,
      internalReviewState: input.internalReviewState,
      visibility: input.visibility ?? "buyer_visible",
      financingType: input.financingType,
      ipcLimitPercent: input.ipcLimitPercent,
      adjustmentTarget: input.adjustmentTarget,
      createdAt: input.createdAt,
    });
  }

  ctxFor(userId: string | null): TestCtx {
    const db = this.db;
    return {
      db: {
        get: (id) => db.get(id),
        insert: (table, value) => db.insert(table, value),
        patch: (id, value) => db.patch(id, value),
        query: (table) => db.query(table),
      },
      auth: {
        getUserIdentity: async () => {
          if (!userId) return null;
          const user = await db.get(userId);
          if (!user) return null;
          return {
            tokenIdentifier: user.authTokenIdentifier as string,
            issuer: user.authIssuer as string,
            subject: user.authSubject as string,
          };
        },
      },
      runMutation: async (_fn, args) => {
        return await runHandler(
          ledger.recordLifecycleEventInternal,
          this.ctxFor(userId),
          args,
        );
      },
    };
  }
}

describe("ledger role filtering", () => {
  it("returns buyer-safe entries only for the owning buyer", async () => {
    const harness = new Harness();
    const owner = harness.seedUser({ id: "user_buyer_owner", role: "buyer" });
    const stranger = harness.seedUser({ id: "user_buyer_other", role: "buyer" });
    const property = harness.seedProperty({ id: "property_1" });
    const dealRoom = harness.seedDealRoom({
      id: "deal_1",
      buyerId: owner._id,
      propertyId: property._id,
    });

    harness.seedCompensationStatus({
      id: "comp_status_1",
      dealRoomId: dealRoom._id,
      status: "unknown",
      lastLifecycleEvent: "showing_coordination_started",
      buyerPromptKey: "listing_agent_confirmation_needed",
    });
    harness.seedLedgerEntry({
      id: "entry_visible",
      dealRoomId: dealRoom._id,
      entryType: "seller_paid_amount",
      amount: 4_500,
      description: "Seller-paid amount",
      createdAt: "2026-04-13T09:00:00.000Z",
    });
    harness.seedLedgerEntry({
      id: "entry_internal",
      dealRoomId: dealRoom._id,
      entryType: "adjustment",
      amount: -250,
      description: "Internal adjustment",
      adjustmentTarget: "expected_buyer_fee",
      visibility: "internal_only",
      createdAt: "2026-04-13T09:30:00.000Z",
    });

    const ownerView = await runHandler<
      { dealRoomId: Id<"dealRooms"> },
      {
        prompt: { key: string };
        entries: Array<{ _id: Id<"feeLedgerEntries"> }>;
      } | null
    >(ledger.getBuyerView, harness.ctxFor(owner._id), {
      dealRoomId: dealRoom._id as Id<"dealRooms">,
    });

    expect(ownerView?.prompt.key).toBe("listing_agent_confirmation_needed");
    expect(ownerView?.entries.map((entry) => entry._id)).toEqual([
      asId<"feeLedgerEntries">("entry_visible"),
    ]);

    const strangerView = await runHandler<
      { dealRoomId: Id<"dealRooms"> },
      unknown
    >(ledger.getBuyerView, harness.ctxFor(stranger._id), {
      dealRoomId: dealRoom._id as Id<"dealRooms">,
    });

    expect(strangerView).toBeNull();
  });

  it("denies buyers the internal ledger view and returns null for missing deal rooms", async () => {
    const harness = new Harness();
    const buyer = harness.seedUser({ id: "user_buyer", role: "buyer" });
    const broker = harness.seedUser({ id: "user_broker", role: "broker" });
    const property = harness.seedProperty({ id: "property_2" });
    const dealRoom = harness.seedDealRoom({
      id: "deal_2",
      buyerId: buyer._id,
      propertyId: property._id,
    });

    const buyerInternalView = await runHandler<
      { dealRoomId: Id<"dealRooms"> },
      unknown
    >(ledger.getInternalView, harness.ctxFor(buyer._id), {
      dealRoomId: dealRoom._id as Id<"dealRooms">,
    });
    expect(buyerInternalView).toBeNull();

    const missingInternalView = await runHandler<
      { dealRoomId: Id<"dealRooms"> },
      unknown
    >(ledger.getInternalView, harness.ctxFor(broker._id), {
      dealRoomId: asId<"dealRooms">("deal_missing"),
    });
    expect(missingInternalView).toBeNull();
  });
});

describe("ledger transitions", () => {
  it("rejects broker-only writes from buyers", async () => {
    const harness = new Harness();
    const buyer = harness.seedUser({ id: "user_buyer_write", role: "buyer" });
    const property = harness.seedProperty({ id: "property_3" });
    const dealRoom = harness.seedDealRoom({
      id: "deal_3",
      buyerId: buyer._id,
      propertyId: property._id,
    });

    await expect(
      runHandler(ledger.transitionCompensationStatus, harness.ctxFor(buyer._id), {
        dealRoomId: dealRoom._id as Id<"dealRooms">,
        newStatus: "seller_disclosed_off_mls" as const,
        sellerDisclosedAmount: 3_000,
      }),
    ).rejects.toThrow("Role 'broker' required");
  });

  it("rejects backward lifecycle transitions", async () => {
    const harness = new Harness();
    const buyer = harness.seedUser({ id: "user_buyer_transition", role: "buyer" });
    const broker = harness.seedUser({ id: "user_broker_transition", role: "broker" });
    const property = harness.seedProperty({ id: "property_4" });
    const dealRoom = harness.seedDealRoom({
      id: "deal_4",
      buyerId: buyer._id,
      propertyId: property._id,
    });

    harness.seedCompensationStatus({
      id: "comp_status_4",
      dealRoomId: dealRoom._id,
      status: "negotiated_in_offer",
      previousStatus: "seller_disclosed_off_mls",
      lastLifecycleEvent: "offer_terms_submitted",
      negotiatedAmount: 6_000,
      buyerPromptKey: "offer_terms_recorded",
    });

    await expect(
      runHandler(ledger.transitionCompensationStatus, harness.ctxFor(broker._id), {
        dealRoomId: dealRoom._id as Id<"dealRooms">,
        newStatus: "seller_disclosed_off_mls" as const,
        sellerDisclosedAmount: 4_000,
      }),
    ).rejects.toThrow("Invalid transition: negotiated_in_offer -> seller_disclosed_off_mls");
  });
});

describe("closing-statement reconciliation", () => {
  it("records actual closing, updates lifecycle prompt, and flags discrepancies for review", async () => {
    const harness = new Harness();
    const buyer = harness.seedUser({ id: "user_buyer_close", role: "buyer" });
    const broker = harness.seedUser({ id: "user_broker_close", role: "broker" });
    const property = harness.seedProperty({ id: "property_5" });
    const dealRoom = harness.seedDealRoom({
      id: "deal_5",
      buyerId: buyer._id,
      propertyId: property._id,
      status: "closing",
    });

    harness.seedCompensationStatus({
      id: "comp_status_5",
      dealRoomId: dealRoom._id,
      status: "negotiated_in_offer",
      lastLifecycleEvent: "offer_terms_submitted",
      buyerPromptKey: "offer_terms_recorded",
      offerId: "offer_5",
      contractId: "contract_5",
      negotiatedAmount: 4_000,
      internalReviewState: "pending",
    });
    harness.seedLedgerEntry({
      id: "entry_projected_close",
      dealRoomId: dealRoom._id,
      entryType: "projected_closing_credit",
      amount: 4_000,
      description: "Projected buyer closing credit",
      source: "offer_term",
      lifecycleEvent: "offer_terms_submitted",
      createdAt: "2026-04-13T09:00:00.000Z",
      compensationStatusAtChange: "negotiated_in_offer",
      internalReviewState: "pending",
      offerId: "offer_5",
      contractId: "contract_5",
    });

    const reportId = await runHandler<
      {
        dealRoomId: Id<"dealRooms">;
        actualAmount: number;
        sourceDocument: string;
      },
      Id<"reconciliationReports">
    >(reconciliation.recordActualClosing, harness.ctxFor(broker._id), {
      dealRoomId: dealRoom._id as Id<"dealRooms">,
      actualAmount: 3_900,
      sourceDocument: "closing-disclosure.pdf",
    });

    const buyerView = await runHandler<
      { dealRoomId: Id<"dealRooms"> },
      {
        prompt: { key: string; body: string };
        summary: { actualClosingCredit: number | null };
      } | null
    >(ledger.getBuyerView, harness.ctxFor(buyer._id), {
      dealRoomId: dealRoom._id as Id<"dealRooms">,
    });

    expect(buyerView?.prompt.key).toBe("closing_credit_recorded");
    expect(buyerView?.prompt.body).toContain("$3900.00");
    expect(buyerView?.summary.actualClosingCredit).toBe(3_900);

    const statusRow = harness.db.getRows("compensationStatus")[0];
    expect(statusRow.lastLifecycleEvent).toBe("closing_statement_recorded");
    expect(statusRow.internalReviewState).toBe("pending");

    const report = harness.db
      .getRows("reconciliationReports")
      .find((row) => row._id === reportId);
    expect(report).toMatchObject({
      discrepancyFlag: true,
      reviewStatus: "pending",
      expectedTotal: 4_000,
      actualTotal: 3_900,
    });
  });
});
