import { beforeEach, describe, expect, it, vi } from "vitest";

const buyerEventMocks = vi.hoisted(() => ({
  applyBuyerEventDeliveryUpdate: vi.fn(),
}));

vi.mock("../../../convex/buyerUpdateEvents", () => ({
  applyBuyerEventDeliveryUpdate: buyerEventMocks.applyBuyerEventDeliveryUpdate,
}));

import * as webhookModule from "../../../convex/notifications/webhooks";

type TableName =
  | "notificationWebhookReceipts"
  | "notificationDeliveryAttempts"
  | "notificationSuppressionList"
  | "disclosureRequests";

type Row = Record<string, unknown>;
type Tables = Record<TableName, Row[]>;

type QueryBuilder = {
  withIndex: (
    indexName: string,
    builder: (q: {
      eq: (field: string, value: unknown) => {
        eq: (field: string, value: unknown) => unknown;
      };
    }) => unknown,
  ) => {
    collect: () => Promise<Row[]>;
    unique: () => Promise<Row | null>;
  };
};

type TestContext = {
  db: {
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
  return Promise.resolve(
    (
      mutation as {
        _handler: (context: TestContext, input: Row) => TResult | Promise<TResult>;
      }
    )._handler(ctx, args),
  );
}

function createContext(initial: Partial<Tables> = {}) {
  const tables: Tables = {
    notificationWebhookReceipts: [
      ...(initial.notificationWebhookReceipts ?? []),
    ],
    notificationDeliveryAttempts: [
      ...(initial.notificationDeliveryAttempts ?? []),
    ],
    notificationSuppressionList: [
      ...(initial.notificationSuppressionList ?? []),
    ],
    disclosureRequests: [...(initial.disclosureRequests ?? [])],
  };

  const byId = new Map<string, { table: TableName; row: Row }>();
  for (const [table, rows] of Object.entries(tables) as Array<[TableName, Row[]]>) {
    for (const row of rows) {
      byId.set(String(row._id), { table, row });
    }
  }

  let nextId = 1;

  const db: TestContext["db"] = {
    async insert(table, value) {
      const id = String(value._id ?? `${table}_${nextId++}`);
      const row = {
        ...value,
        _id: id,
      };
      tables[table].push(row);
      byId.set(id, { table, row });
      return id;
    },
    async patch(id, value) {
      const target = byId.get(id);
      if (!target) {
        throw new Error(`Missing row ${id}`);
      }
      Object.assign(target.row, value);
    },
    query(table) {
      return {
        withIndex(_indexName, builder) {
          const conditions: Array<{ field: string; value: unknown }> = [];
          const range = {
            eq(field: string, value: unknown) {
              conditions.push({ field, value });
              return range;
            },
          };
          builder(range);

          const collect = async () =>
            tables[table]
              .filter((row) =>
                conditions.every(({ field, value }) => row[field] === value),
              )
              .map((row) => ({ ...row }));

          return {
            collect,
            async unique() {
              const rows = await collect();
              if (rows.length > 1) {
                throw new Error(`Expected unique row for ${table}`);
              }
              return rows[0] ?? null;
            },
          };
        },
      };
    },
  };

  return { ctx: { db } satisfies TestContext, tables };
}

describe("processResendWebhookEvent", () => {
  beforeEach(() => {
    buyerEventMocks.applyBuyerEventDeliveryUpdate.mockReset();
    buyerEventMocks.applyBuyerEventDeliveryUpdate.mockResolvedValue(true);
  });

  it("reuses the attempt recipient key for buyer-event suppressions", async () => {
    const { ctx, tables } = createContext({
      notificationDeliveryAttempts: [
        {
          _id: "attempt_1",
          eventId: "buyer_event_1",
          recipientKey: "user:buyer_1",
          channel: "email",
          providerMessageId: "email_123",
        },
      ],
    });

    const result = await invokeRegisteredMutation<{
      status: "processed" | "duplicate";
      eventId?: string;
      suppressionApplied: boolean;
    }>(webhookModule.processResendWebhookEvent, ctx, {
      providerEventId: "svix_1",
      providerMessageId: "email_123",
      transition: "bounced",
      occurredAt: "2026-04-15T15:00:00.000Z",
      recipientKeys: ["alex@example.com"],
      failureReason: "mailbox unavailable",
      rawPayload: "{\"type\":\"email.bounced\"}",
      signatureVerified: true,
    });

    expect(result.status).toBe("processed");
    expect(result.eventId).toBe("buyer_event_1");
    expect(result.suppressionApplied).toBe(true);
    expect(buyerEventMocks.applyBuyerEventDeliveryUpdate).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        eventId: "buyer_event_1",
        transition: "bounced",
        failedReason: "mailbox unavailable",
      }),
    );
    expect(tables.notificationSuppressionList).toHaveLength(1);
    expect(tables.notificationSuppressionList[0]).toMatchObject({
      recipientKey: "user:buyer_1",
      channel: "email",
      reason: "hard_bounce",
      source: "webhook",
      active: true,
    });
    expect(tables.notificationWebhookReceipts[0]).toMatchObject({
      provider: "resend",
      providerEventId: "svix_1",
      status: "processed",
      eventId: "buyer_event_1",
      attemptId: "attempt_1",
    });
  });

  it("marks duplicate provider events without reprocessing", async () => {
    const { ctx, tables } = createContext({
      notificationWebhookReceipts: [
        {
          _id: "receipt_1",
          provider: "resend",
          providerEventId: "svix_dup",
          status: "received",
          eventId: "buyer_event_1",
        },
      ],
    });

    const result = await invokeRegisteredMutation<{
      status: "processed" | "duplicate";
      eventId?: string;
      suppressionApplied: boolean;
    }>(webhookModule.processResendWebhookEvent, ctx, {
      providerEventId: "svix_dup",
      providerMessageId: "email_123",
      transition: "delivered",
      occurredAt: "2026-04-15T15:00:00.000Z",
      recipientKeys: ["alex@example.com"],
      rawPayload: "{\"type\":\"email.delivered\"}",
      signatureVerified: true,
    });

    expect(result.status).toBe("duplicate");
    expect(result.eventId).toBeUndefined();
    expect(result.suppressionApplied).toBe(false);
    expect(buyerEventMocks.applyBuyerEventDeliveryUpdate).not.toHaveBeenCalled();
    expect(tables.notificationWebhookReceipts[0]).toMatchObject({
      status: "duplicate",
    });
  });

  it("reactivates an inactive suppression row instead of inserting a duplicate", async () => {
    const { ctx, tables } = createContext({
      notificationDeliveryAttempts: [
        {
          _id: "attempt_1",
          eventId: "buyer_event_1",
          recipientKey: "user:buyer_1",
          channel: "email",
          providerMessageId: "email_123",
        },
      ],
      notificationSuppressionList: [
        {
          _id: "suppression_1",
          recipientKey: "user:buyer_1",
          channel: "email",
          reason: "manual_block",
          source: "manual",
          active: false,
          notes: "Old note",
          suppressedAt: "2026-04-01T10:00:00.000Z",
          liftedAt: "2026-04-02T10:00:00.000Z",
          createdAt: "2026-04-01T10:00:00.000Z",
          updatedAt: "2026-04-02T10:00:00.000Z",
        },
      ],
    });

    const result = await invokeRegisteredMutation<{
      status: "processed" | "duplicate";
      eventId?: string;
      suppressionApplied: boolean;
    }>(webhookModule.processResendWebhookEvent, ctx, {
      providerEventId: "svix_2",
      providerMessageId: "email_123",
      transition: "bounced",
      occurredAt: "2026-04-15T16:00:00.000Z",
      recipientKeys: ["alex@example.com"],
      failureReason: "mailbox unavailable",
      rawPayload: "{\"type\":\"email.bounced\"}",
      signatureVerified: true,
    });

    expect(result.status).toBe("processed");
    expect(result.suppressionApplied).toBe(true);
    expect(tables.notificationSuppressionList).toHaveLength(1);
    expect(tables.notificationSuppressionList[0]).toMatchObject({
      _id: "suppression_1",
      recipientKey: "user:buyer_1",
      channel: "email",
      reason: "hard_bounce",
      source: "webhook",
      active: true,
      liftedAt: undefined,
    });
  });
});
