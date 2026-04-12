/**
 * Manual address intake (KIN-775).
 *
 * Mutations that accept a user-typed address, normalize it server-side,
 * create a sourceListing row, and return a confidence-aware match result
 * against the existing properties table.
 *
 * This module is deliberately independent of convex/intake.ts so the URL
 * and address intake surfaces can evolve separately.
 */

import { mutation, query } from "./_generated/server";
import { v } from "convex/values";
import type { Doc, Id } from "./_generated/dataModel";
import {
  normalizeAddress,
  matchAddress,
  type AddressMatchCandidate,
  type CanonicalAddress,
  type MatchConfidence,
} from "./lib/addressMatch";

const canonicalAddressValidator = v.object({
  street: v.string(),
  unit: v.optional(v.string()),
  city: v.string(),
  state: v.string(),
  zip: v.string(),
  county: v.optional(v.string()),
  formatted: v.optional(v.string()),
});

const createAddressIntakeArgs = v.object({
  address: v.union(
    canonicalAddressValidator,
    v.object({ raw: v.string() }),
  ),
  userId: v.optional(v.id("users")),
});

const matchCandidateReturn = v.object({
  propertyId: v.id("properties"),
  canonical: v.object({
    street: v.string(),
    unit: v.optional(v.string()),
    city: v.string(),
    state: v.string(),
    zip: v.string(),
    county: v.optional(v.string()),
    formatted: v.string(),
  }),
  score: v.number(),
});

const createAddressIntakeReturn = v.union(
  v.object({
    status: v.literal("matched"),
    propertyId: v.id("properties"),
    confidence: v.union(
      v.literal("exact"),
      v.literal("high"),
    ),
    intakeId: v.id("sourceListings"),
    canonical: canonicalAddressValidator,
  }),
  v.object({
    status: v.literal("ambiguous"),
    candidates: v.array(matchCandidateReturn),
    intakeId: v.id("sourceListings"),
    canonical: canonicalAddressValidator,
  }),
  v.object({
    status: v.literal("no_match"),
    intakeId: v.id("sourceListings"),
    canonical: canonicalAddressValidator,
  }),
  v.object({
    status: v.literal("validation_error"),
    errors: v.array(
      v.object({
        code: v.string(),
        message: v.string(),
      }),
    ),
  }),
);

/**
 * Build a CanonicalAddress from a stored property document. Properties
 * that were ingested via URL may not have a `formatted` field, so we
 * derive one on the fly.
 */
function propertyToCanonical(property: Doc<"properties">): CanonicalAddress {
  const { address } = property;
  const formatted = address.formatted ?? buildFormatted(address);
  return {
    street: address.street,
    unit: address.unit,
    city: address.city,
    state: address.state,
    zip: address.zip,
    county: address.county,
    formatted,
  };
}

function buildFormatted(address: Doc<"properties">["address"]): string {
  const parts: string[] = [address.street];
  if (address.unit) parts.push(`Unit ${address.unit}`);
  parts.push(address.city);
  parts.push(`${address.state} ${address.zip}`);
  return parts.join(", ");
}

/** Build the sourceUrl placeholder used for manual address intakes. */
function manualSourceUrl(canonical: CanonicalAddress): string {
  return `manual://address/${encodeURIComponent(canonical.formatted)}`;
}

/**
 * Submit a manual address for intake. Runs server-side normalization,
 * creates a sourceListing row, searches for candidate properties, and
 * returns a confidence-aware result.
 *
 * Public — runs before auth. If a `userId` is provided it's linked to
 * the audit log entry.
 */
export const createAddressIntake = mutation({
  args: createAddressIntakeArgs,
  returns: createAddressIntakeReturn,
  handler: async (ctx, args) => {
    // Server-side re-validation — never trust client-supplied canonical shapes.
    const normalizationResult = normalizeAddress(args.address);
    if (!normalizationResult.valid) {
      return {
        status: "validation_error" as const,
        errors: normalizationResult.errors.map((e) => ({
          code: e.code,
          message: e.message,
        })),
      };
    }

    const canonical = normalizationResult.canonical;
    const sourceUrl = manualSourceUrl(canonical);
    const now = new Date().toISOString();

    // Query candidate properties by zip index.
    const candidateDocs = await ctx.db
      .query("properties")
      .withIndex("by_zip", (q) => q.eq("zip", canonical.zip.slice(0, 5)))
      .take(50);

    const candidates: AddressMatchCandidate[] = candidateDocs.map((doc) => ({
      id: doc._id,
      canonical: propertyToCanonical(doc),
    }));

    const matchResult = matchAddress(canonical, candidates);

    // If we already have a sourceListing for this manual URL, reuse it —
    // otherwise insert a new one. This keeps re-submission idempotent.
    const existing = await ctx.db
      .query("sourceListings")
      .withIndex("by_sourceUrl", (q) => q.eq("sourceUrl", sourceUrl))
      .first();

    let intakeId: Id<"sourceListings">;
    if (existing) {
      intakeId = existing._id;
      await ctx.db.patch(existing._id, {
        extractedAt: now,
        rawData: JSON.stringify({
          canonical,
          match: {
            confidence: matchResult.confidence,
            score: matchResult.score,
            bestMatchId: matchResult.bestMatch?.id ?? null,
            ambiguous: matchResult.ambiguous,
          },
        }),
        status: resolveStatus(matchResult.confidence),
        propertyId:
          matchResult.confidence === "exact" ||
          matchResult.confidence === "high"
            ? (matchResult.bestMatch!.id as Id<"properties">)
            : undefined,
      });
    } else {
      intakeId = await ctx.db.insert("sourceListings", {
        sourcePlatform: "manual",
        sourceUrl,
        rawData: JSON.stringify({
          canonical,
          match: {
            confidence: matchResult.confidence,
            score: matchResult.score,
            bestMatchId: matchResult.bestMatch?.id ?? null,
            ambiguous: matchResult.ambiguous,
          },
        }),
        extractedAt: now,
        status: resolveStatus(matchResult.confidence),
        propertyId:
          matchResult.confidence === "exact" ||
          matchResult.confidence === "high"
            ? (matchResult.bestMatch!.id as Id<"properties">)
            : undefined,
      });
    }

    // Audit trail.
    await ctx.db.insert("auditLog", {
      userId: args.userId,
      action: "address_intake_submitted",
      entityType: "sourceListing",
      entityId: intakeId,
      details: JSON.stringify({
        canonicalFormatted: canonical.formatted,
        confidence: matchResult.confidence,
        score: matchResult.score,
        ambiguous: matchResult.ambiguous,
        candidateCount: matchResult.candidates.length,
      }),
      timestamp: now,
    });

    // Decide which response shape to return.
    if (
      matchResult.bestMatch &&
      !matchResult.ambiguous &&
      (matchResult.confidence === "exact" || matchResult.confidence === "high")
    ) {
      return {
        status: "matched" as const,
        propertyId: matchResult.bestMatch.id as Id<"properties">,
        confidence: matchResult.confidence as "exact" | "high",
        intakeId,
        canonical,
      };
    }

    if (matchResult.ambiguous || matchResult.confidence === "medium") {
      return {
        status: "ambiguous" as const,
        candidates: matchResult.candidates.map((c) => ({
          propertyId: c.id as Id<"properties">,
          canonical: {
            ...c.canonical,
            formatted: c.canonical.formatted,
          },
          score: c.score,
        })),
        intakeId,
        canonical,
      };
    }

    return {
      status: "no_match" as const,
      intakeId,
      canonical,
    };
  },
});

/** Map a match confidence into the sourceListing.status literal. */
function resolveStatus(
  confidence: MatchConfidence,
): "pending" | "extracted" | "failed" | "merged" {
  if (confidence === "exact" || confidence === "high") return "merged";
  if (confidence === "medium" || confidence === "low") return "pending";
  return "pending";
}

/**
 * Look up the current state of an address intake request by id. Returns
 * the stored canonical + match snapshot so a follow-up UI can continue
 * the disambiguation flow.
 */
export const getIntakeStatus = query({
  args: {
    intakeId: v.id("sourceListings"),
  },
  returns: v.union(
    v.null(),
    v.object({
      intakeId: v.id("sourceListings"),
      sourcePlatform: v.string(),
      status: v.string(),
      propertyId: v.optional(v.id("properties")),
      extractedAt: v.string(),
      canonical: v.optional(canonicalAddressValidator),
      match: v.optional(
        v.object({
          confidence: v.string(),
          score: v.number(),
          bestMatchId: v.union(v.id("properties"), v.null()),
          ambiguous: v.boolean(),
        }),
      ),
    }),
  ),
  handler: async (ctx, args) => {
    const row = await ctx.db.get(args.intakeId);
    if (!row) return null;

    let canonical: CanonicalAddress | undefined;
    let match:
      | {
          confidence: string;
          score: number;
          bestMatchId: Id<"properties"> | null;
          ambiguous: boolean;
        }
      | undefined;
    if (row.rawData) {
      try {
        const parsed = JSON.parse(row.rawData) as {
          canonical?: CanonicalAddress;
          match?: {
            confidence: string;
            score: number;
            bestMatchId: Id<"properties"> | null;
            ambiguous: boolean;
          };
        };
        canonical = parsed.canonical;
        match = parsed.match;
      } catch {
        // Ignore malformed rawData — intake will still return basics.
      }
    }

    return {
      intakeId: row._id,
      sourcePlatform: row.sourcePlatform,
      status: row.status,
      propertyId: row.propertyId,
      extractedAt: row.extractedAt,
      canonical,
      match,
    };
  },
});
