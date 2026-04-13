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

const matchConfidenceValidator = v.union(
  v.literal("exact"),
  v.literal("high"),
  v.literal("medium"),
  v.literal("low"),
  v.literal("none"),
);

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

const matchCandidateSnapshotValidator = v.object({
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

const storedMatchValidator = v.object({
  confidence: matchConfidenceValidator,
  score: v.number(),
  bestMatchId: v.union(v.id("properties"), v.null()),
  ambiguous: v.boolean(),
});

const createAddressIntakeReturn = v.union(
  v.object({
    status: v.literal("matched"),
    propertyId: v.id("properties"),
    confidence: v.union(
      v.literal("exact"),
      v.literal("high"),
    ),
    score: v.number(),
    intakeId: v.id("sourceListings"),
    canonical: canonicalAddressValidator,
  }),
  v.object({
    status: v.literal("ambiguous"),
    confidence: matchConfidenceValidator,
    score: v.number(),
    candidates: v.array(matchCandidateSnapshotValidator),
    intakeId: v.id("sourceListings"),
    canonical: canonicalAddressValidator,
  }),
  v.object({
    status: v.literal("no_match"),
    confidence: matchConfidenceValidator,
    score: v.number(),
    bestMatchId: v.union(v.id("properties"), v.null()),
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

const SNAPSHOT_CANDIDATE_LIMIT = 5;

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

    // Query ALL candidate properties in this zip — do not truncate with
    // .take(N) because index order is not similarity order, and a dense
    // zip could exclude the true match from consideration entirely.
    // Zip-scoped collections are bounded enough to scan in full.
    const candidateDocs = await ctx.db
      .query("properties")
      .withIndex("by_zip", (q) => q.eq("zip", canonical.zip.slice(0, 5)))
      .collect();

    const candidates: AddressMatchCandidate[] = candidateDocs.map((doc) => ({
      id: doc._id,
      canonical: propertyToCanonical(doc),
    }));

    const matchResult = matchAddress(canonical, candidates);
    const snapshotCandidates = matchResult.candidates
      .slice(0, SNAPSHOT_CANDIDATE_LIMIT)
      .map((candidate) => ({
        propertyId: candidate.id as Id<"properties">,
        canonical: {
          ...candidate.canonical,
          formatted: candidate.canonical.formatted,
        },
        score: candidate.score,
      }));
    const snapshot = {
      canonical,
      match: {
        confidence: matchResult.confidence,
        score: matchResult.score,
        bestMatchId: (matchResult.bestMatch?.id as Id<"properties"> | undefined) ?? null,
        ambiguous: matchResult.ambiguous,
      },
      candidates: snapshotCandidates,
    };

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
        rawData: JSON.stringify(snapshot),
        status: resolveStatus(matchResult.confidence, matchResult.ambiguous),
        propertyId: shouldAutoMerge(matchResult)
          ? (matchResult.bestMatch!.id as Id<"properties">)
          : undefined,
      });
    } else {
      intakeId = await ctx.db.insert("sourceListings", {
        sourcePlatform: "manual",
        sourceUrl,
        rawData: JSON.stringify(snapshot),
        extractedAt: now,
        status: resolveStatus(matchResult.confidence, matchResult.ambiguous),
        propertyId: shouldAutoMerge(matchResult)
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
        score: matchResult.score,
        intakeId,
        canonical,
      };
    }

    if (matchResult.ambiguous || matchResult.confidence === "medium") {
      return {
        status: "ambiguous" as const,
        confidence: matchResult.confidence,
        score: matchResult.score,
        candidates: snapshotCandidates,
        intakeId,
        canonical,
      };
    }

    return {
      status: "no_match" as const,
      confidence: matchResult.confidence,
      score: matchResult.score,
      bestMatchId: (matchResult.bestMatch?.id as Id<"properties"> | undefined) ?? null,
      intakeId,
      canonical,
    };
  },
});

/** Whether a match result is eligible for auto-merge to an existing property. */
function shouldAutoMerge(result: {
  confidence: MatchConfidence;
  ambiguous: boolean;
  bestMatch: { id: string } | null;
}): boolean {
  if (!result.bestMatch) return false;
  if (result.ambiguous) return false; // never auto-merge ambiguous results
  return result.confidence === "exact" || result.confidence === "high";
}

/**
 * Map a match confidence into the sourceListing.status literal.
 * Ambiguous results never transition to "merged" even at high confidence
 * — they stay "pending" until the buyer or ops disambiguates.
 */
function resolveStatus(
  confidence: MatchConfidence,
  ambiguous: boolean,
): "pending" | "extracted" | "failed" | "merged" {
  if (ambiguous) return "pending";
  if (confidence === "exact" || confidence === "high") return "merged";
  if (confidence === "none") return "failed";
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
      match: v.optional(storedMatchValidator),
      candidates: v.optional(v.array(matchCandidateSnapshotValidator)),
    }),
  ),
  handler: async (ctx, args) => {
    const row = await ctx.db.get(args.intakeId);
    if (!row) return null;

    let canonical: CanonicalAddress | undefined;
    let match:
      | {
          confidence: MatchConfidence;
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
            confidence: MatchConfidence;
            score: number;
            bestMatchId: Id<"properties"> | null;
            ambiguous: boolean;
          };
          candidates?: Array<{
            propertyId: Id<"properties">;
            canonical: CanonicalAddress;
            score: number;
          }>;
        };
        canonical = parsed.canonical;
        match = parsed.match;
        const candidates = parsed.candidates;
        return {
          intakeId: row._id,
          sourcePlatform: row.sourcePlatform,
          status: row.status,
          propertyId: row.propertyId,
          extractedAt: row.extractedAt,
          canonical,
          match,
          candidates,
        };
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
      candidates: undefined,
    };
  },
});
