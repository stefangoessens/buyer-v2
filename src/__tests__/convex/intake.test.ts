import { describe, expect, it } from "vitest";
import {
  processUrlInternal,
  submitUrlInternal,
} from "../../../convex/intake";

type TableName = "sourceListings";
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

function createTestCtx(
  seed?: Partial<Record<TableName, Array<Record<string, unknown>>>>,
) {
  let creationTime = 1;
  let counter = 1;

  const tables: Record<TableName, Array<Row>> = {
    sourceListings: [],
  };

  for (const row of seed?.sourceListings ?? []) {
    tables.sourceListings.push({
      _id: (row._id as string | undefined) ?? `sourceListings-${counter++}`,
      _creationTime: creationTime++,
      ...row,
    });
  }

  const ctx = {
    db: {
      query(_table: TableName) {
        return {
          withIndex(_indexName: string, build: (q: QueryRecorder) => unknown) {
            const recorder = new QueryRecorder();
            build(recorder);
            const rows = tables.sourceListings.filter((row) =>
              recorder.field ? row[recorder.field] === recorder.value : true,
            );
            return {
              first: async () => rows[0] ?? null,
            };
          },
        };
      },
      async insert(table: TableName, value: Record<string, unknown>) {
        const row: Row = {
          _id: `${table}-${counter++}`,
          _creationTime: creationTime++,
          ...value,
        };
        tables[table].push(row);
        return row._id;
      },
    },
  };

  return { ctx, tables };
}

describe("convex/intake", () => {
  it("reuses an existing canonical listing for submitUrl", async () => {
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

    const result = await submitUrlInternal(ctx as any, {
      url: "https://www.zillow.com/homedetails/Test-Home/12345_zpid/?utm_source=sms",
    });

    expect(result).toEqual({
      success: true,
      sourceListingId: "sourceListings-existing",
      platform: "zillow",
    });
    expect(tables.sourceListings).toHaveLength(1);
  });

  it("reuses a legacy raw-url listing for submitUrl", async () => {
    const { ctx, tables } = createTestCtx({
      sourceListings: [
        {
          _id: "sourceListings-legacy",
          sourcePlatform: "zillow",
          sourceUrl:
            "https://www.zillow.com/homedetails/Test-Home/12345_zpid/?utm_source=sms",
          rawData: JSON.stringify({ source: "homepage" }),
          extractedAt: "2026-04-01T00:00:00.000Z",
          status: "pending",
        },
      ],
    });

    const result = await submitUrlInternal(ctx as any, {
      url: "https://www.zillow.com/homedetails/Test-Home/12345_zpid/?utm_source=sms",
    });

    expect(result).toEqual({
      success: true,
      sourceListingId: "sourceListings-legacy",
      platform: "zillow",
    });
    expect(tables.sourceListings).toHaveLength(1);
  });

  it("reuses a legacy raw-url listing for processUrl", async () => {
    const { ctx, tables } = createTestCtx({
      sourceListings: [
        {
          _id: "sourceListings-legacy",
          sourcePlatform: "zillow",
          sourceUrl:
            "https://www.zillow.com/homedetails/Test-Home/12345_zpid/?utm_source=sms",
          rawData: JSON.stringify({ source: "homepage" }),
          extractedAt: "2026-04-01T00:00:00.000Z",
          status: "pending",
        },
      ],
    });

    const result = await processUrlInternal(ctx as any, {
      url: "https://www.zillow.com/homedetails/Test-Home/12345_zpid/?utm_source=sms",
      source: "sms",
    });

    expect(result).toBe("sourceListings-legacy");
    expect(tables.sourceListings).toHaveLength(1);
  });
});
