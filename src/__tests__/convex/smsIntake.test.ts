import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { processInboundSmsInternal } from "../../../convex/smsIntake";
import {
  hashPhone,
  normalizePhone,
  verifySignedLink,
} from "@/lib/intake/sms";

type TableName = "smsConsent" | "smsIntakeMessages" | "sourceListings";
type Row = Record<string, unknown> & { _id: string; _creationTime: number };

class QueryRecorder {
  public field: string | null = null;

  public value: unknown;

  eq(field: string, value: unknown) {
    this.field = field;
    this.value = value;
    return this;
  }
}

function createTestCtx(seed?: Partial<Record<TableName, Array<Record<string, unknown>>>>) {
  let creationTime = 1;
  const counters: Record<TableName, number> = {
    smsConsent: 1,
    smsIntakeMessages: 1,
    sourceListings: 1,
  };

  const tables: Record<TableName, Array<Row>> = {
    smsConsent: [],
    smsIntakeMessages: [],
    sourceListings: [],
  };

  for (const table of Object.keys(tables) as Array<TableName>) {
    for (const row of seed?.[table] ?? []) {
      tables[table].push({
        _id: (row._id as string | undefined) ?? `${table}-${counters[table]++}`,
        _creationTime: creationTime++,
        ...row,
      });
    }
  }

  function matchRows(table: TableName, field: string | null, value: unknown) {
    return tables[table].filter((row) => (field ? row[field] === value : true));
  }

  const ctx = {
    db: {
      query(table: TableName) {
        return {
          withIndex(_indexName: string, build: (q: QueryRecorder) => unknown) {
            const recorder = new QueryRecorder();
            build(recorder);
            const rows = matchRows(table, recorder.field, recorder.value);
            return {
              unique: async () => rows[0] ?? null,
              first: async () => rows[0] ?? null,
              collect: async () => rows,
            };
          },
          order(direction: "asc" | "desc") {
            const rows = [...tables[table]].sort((a, b) =>
              direction === "desc"
                ? b._creationTime - a._creationTime
                : a._creationTime - b._creationTime,
            );
            return {
              collect: async () => rows,
              take: async (count: number) => rows.slice(0, count),
            };
          },
        };
      },
      async insert(table: TableName, value: Record<string, unknown>) {
        const row: Row = {
          _id: `${table}-${counters[table]++}`,
          _creationTime: creationTime++,
          ...value,
        };
        tables[table].push(row);
        return row._id;
      },
      async patch(id: string, patch: Record<string, unknown>) {
        for (const table of Object.keys(tables) as Array<TableName>) {
          const row = tables[table].find((entry) => entry._id === id);
          if (row) {
            Object.assign(row, patch);
            return;
          }
        }
        throw new Error(`Unknown row id: ${id}`);
      },
    },
  };

  return { ctx, tables };
}

describe("convex/smsIntake.processInboundSms", () => {
  const previousUrl = process.env.NEXT_PUBLIC_APP_URL;
  const previousSecret = process.env.SMS_SIGNED_LINK_SECRET;

  beforeEach(() => {
    process.env.NEXT_PUBLIC_APP_URL = "https://app.example.com";
    process.env.SMS_SIGNED_LINK_SECRET = "0123456789abcdef0123456789abcdef";
  });

  afterEach(() => {
    process.env.NEXT_PUBLIC_APP_URL = previousUrl;
    process.env.SMS_SIGNED_LINK_SECRET = previousSecret;
  });

  it("processes a supported listing URL and returns a signed intake link", async () => {
    const { ctx, tables } = createTestCtx();

    const result = await processInboundSmsInternal(ctx as any, {
      messageSid: "SM-success",
      fromPhone: "(305) 555-1234",
      toPhone: "+1 415 555 0000",
      body: "Check this out https://www.zillow.com/homedetails/Test-Home/12345_zpid/?utm_source=sms",
    });

    expect(result.outcome).toBe("url_processed");
    expect(result.replySent).toBe(true);
    expect(result.sourceListingId).toBeDefined();
    expect(tables.sourceListings).toHaveLength(1);
    expect(tables.sourceListings[0]?.sourceUrl).toBe(
      "https://zillow.com/homedetails/Test-Home/12345_zpid/",
    );

    const verified = await verifySignedLink(
      result.replyLink!,
      process.env.SMS_SIGNED_LINK_SECRET!,
    );
    expect(verified.valid).toBe(true);
    if (verified.valid) {
      expect(verified.normalizedUrl).toBe(
        "https://zillow.com/homedetails/Test-Home/12345_zpid/",
      );
    }
  });

  it("returns an explicit unsupported_url reply for unsupported listing domains", async () => {
    const { ctx, tables } = createTestCtx();

    const result = await processInboundSmsInternal(ctx as any, {
      messageSid: "SM-invalid",
      fromPhone: "+13055551234",
      toPhone: "+14155550000",
      body: "https://example.com/listings/123",
    });

    expect(result.outcome).toBe("unsupported_url");
    expect(result.replySent).toBe(true);
    expect(result.replyBody).toContain("We only support Zillow, Redfin, and Realtor.com");
    expect(tables.sourceListings).toHaveLength(0);
    expect(tables.smsIntakeMessages).toHaveLength(1);
  });

  it("returns an explicit invalid_url reply when the message has no listing URL", async () => {
    const { ctx, tables } = createTestCtx();

    const result = await processInboundSmsInternal(ctx as any, {
      messageSid: "SM-text-only",
      fromPhone: "+13055551234",
      toPhone: "+14155550000",
      body: "Can you text me the details?",
    });

    expect(result.outcome).toBe("invalid_url");
    expect(result.replySent).toBe(true);
    expect(result.replyBody).toContain("couldn't find a listing link");
    expect(tables.sourceListings).toHaveLength(0);
    expect(tables.smsIntakeMessages).toHaveLength(1);
  });

  it("suppresses outbound replies for suppressed phone hashes", async () => {
    const normalized = normalizePhone("+13055551234");
    const phoneHash = await hashPhone(normalized!);
    const { ctx, tables } = createTestCtx({
      smsConsent: [
        {
          phoneHash,
          status: "suppressed",
          suppressedAt: "2026-04-01T00:00:00.000Z",
          createdAt: "2026-04-01T00:00:00.000Z",
          updatedAt: "2026-04-01T00:00:00.000Z",
        },
      ],
    });

    const result = await processInboundSmsInternal(ctx as any, {
      messageSid: "SM-suppressed",
      fromPhone: "+13055551234",
      toPhone: "+14155550000",
      body: "https://www.zillow.com/homedetails/Test-Home/12345_zpid/",
    });

    expect(result.outcome).toBe("suppressed");
    expect(result.replySent).toBe(false);
    expect(result.replyBody).toBe("");
    expect(tables.sourceListings).toHaveLength(0);
  });

  it("reuses the existing canonical source listing for duplicate listing requests", async () => {
    const { ctx, tables } = createTestCtx({
      sourceListings: [
        {
          _id: "sourceListings-existing",
          sourcePlatform: "zillow",
          sourceUrl: "https://zillow.com/homedetails/Test-Home/12345_zpid/",
          rawData: JSON.stringify({ source: "homepage" }),
          extractedAt: "2026-04-01T00:00:00.000Z",
          status: "pending",
        },
      ],
    });

    const result = await processInboundSmsInternal(ctx as any, {
      messageSid: "SM-duplicate-request",
      fromPhone: "+13055551234",
      toPhone: "+14155550000",
      body: "https://www.zillow.com/homedetails/Test-Home/12345_zpid/?utm_campaign=text",
    });

    expect(result.outcome).toBe("url_processed");
    expect(result.sourceListingId).toBe("sourceListings-existing");
    expect(tables.sourceListings).toHaveLength(1);
  });
});
