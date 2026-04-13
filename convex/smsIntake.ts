// ═══════════════════════════════════════════════════════════════════════════
// SMS Intake — Twilio Webhook Handler (KIN-776)
//
// This module owns the backend side of the text-a-link intake flow. The
// Twilio webhook (which lives outside Convex) calls `processInboundSms`
// with a parsed SMS payload — this file does NOT do Twilio signature
// validation or format Twilio's TwiML response; it's the pure backend
// handler that decides what happens to the message and what reply, if
// any, should be returned.
//
// Responsibilities:
//   1. Dedupe by Twilio Message SID so webhook retries don't double-post
//   2. Normalize + hash sender phone — NO raw phones in the DB
//   3. Check consent / suppression state before doing anything else
//   4. Classify the message body via the shared classifier
//   5. Handle each intent (STOP, START, HELP, URL, text, empty)
//   6. For URL intents: reuse the listing URL parser logic from KIN-774
//      (mirrored at convex/intake.ts PORTAL_PATTERNS) to extract portal
//      + listing id, then create or reuse a sourceListings row
//   7. Build a signed reply link for the happy path
//   8. Persist one smsIntakeMessages row per processed message
//
// What lives elsewhere:
//   - Twilio signature validation → convex/http.ts (outside this task's scope)
//   - Actual outbound SMS send → Twilio REST client in a Convex action
//   - URL parser mirror → inlined below (Convex can't import from src/)
// ═══════════════════════════════════════════════════════════════════════════

import { internalMutation, query } from "./_generated/server";
import type { MutationCtx } from "./_generated/server";
import { v } from "convex/values";
import { Doc, Id } from "./_generated/dataModel";
import { requireRole } from "./lib/session";
import { smsConsentStatus, smsIntakeOutcome } from "./lib/validators";
import {
  checkAndPersistRateLimit,
  recordRateLimitOutcome,
} from "./lib/rateLimitBuckets";
import {
  buildSignedLink,
  classifyInboundSms,
  hashPhone,
  normalizePhone,
} from "./lib/smsIntakeCompute";

// ───────────────────────────────────────────────────────────────────────────
// URL parser — inlined mirror of src/lib/intake/parser.ts (KIN-774)
//
// Convex can't import from src/, so the parse logic is duplicated here in
// the same shape the src module uses: discriminated-union result, typed
// platform name, listing id, address hint. This matches the semantics of
// `parseListingUrl` from src/lib/intake/index.ts byte-for-byte.
// ───────────────────────────────────────────────────────────────────────────

type SmsSourcePlatform = "zillow" | "redfin" | "realtor";

interface SmsPortalMetadata {
  platform: SmsSourcePlatform;
  listingId: string;
  normalizedUrl: string;
  addressHint: string | null;
  rawUrl: string;
}

type SmsParseResult =
  | { success: true; data: SmsPortalMetadata }
  | { success: false; error: { code: string; message: string } };

interface PortalPatternMatch {
  listingId: string;
  addressHint: string | null;
}

interface PortalDef {
  platform: SmsSourcePlatform;
  domains: string[];
  match: (url: URL) => PortalPatternMatch | null;
}

function matchZillow(url: URL): PortalPatternMatch | null {
  const zpidMatch = url.pathname.match(/(\d+)_zpid/);
  if (!zpidMatch) return null;
  const addressMatch = url.pathname.match(/\/homedetails\/([^/]+)\//);
  let addressHint: string | null = null;
  if (addressMatch) {
    try {
      addressHint = decodeURIComponent(addressMatch[1]).replace(/-/g, " ");
    } catch {
      addressHint = addressMatch[1].replace(/-/g, " ");
    }
  }
  return { listingId: zpidMatch[1], addressHint };
}

function matchRedfin(url: URL): PortalPatternMatch | null {
  const homeMatch = url.pathname.match(/\/home\/(\d+)/);
  if (!homeMatch) return null;
  const pathParts = url.pathname
    .split("/home/")[0]
    .split("/")
    .filter(Boolean);
  const addressHint =
    pathParts.length >= 3
      ? pathParts.slice(2).join(" ").replace(/-/g, " ")
      : null;
  return { listingId: homeMatch[1], addressHint };
}

function matchRealtor(url: URL): PortalPatternMatch | null {
  const detailMatch = url.pathname.match(
    /\/realestateandhomes-detail\/([^/]+)/,
  );
  if (!detailMatch) return null;
  const slug = detailMatch[1];
  const addressHint = slug.startsWith("M") ? null : slug.replace(/_/g, " ");
  return { listingId: slug, addressHint };
}

const SMS_PORTAL_MATCHERS: PortalDef[] = [
  {
    platform: "zillow",
    domains: ["zillow.com", "www.zillow.com"],
    match: matchZillow,
  },
  {
    platform: "redfin",
    domains: ["redfin.com", "www.redfin.com"],
    match: matchRedfin,
  },
  {
    platform: "realtor",
    domains: ["realtor.com", "www.realtor.com"],
    match: matchRealtor,
  },
];

function parseListingUrlInline(input: string): SmsParseResult {
  const trimmed = input.trim();
  let url: URL;
  try {
    const withProtocol = trimmed.startsWith("http")
      ? trimmed
      : `https://${trimmed}`;
    url = new URL(withProtocol);
  } catch {
    return {
      success: false,
      error: { code: "malformed_url", message: "Input is not a valid URL" },
    };
  }

  const hostname = url.hostname.toLowerCase();
  for (const portal of SMS_PORTAL_MATCHERS) {
    if (
      !portal.domains.some((d) => hostname === d || hostname.endsWith(`.${d}`))
    ) {
      continue;
    }

    const match = portal.match(url);
    if (!match) {
      return {
        success: false,
        error: {
          code: "missing_listing_id",
          message: `URL appears to be ${portal.platform} but no listing ID could be extracted`,
        },
      };
    }

    const normalized = new URL(url.pathname, `https://${portal.domains[0]}`);
    return {
      success: true,
      data: {
        platform: portal.platform,
        listingId: match.listingId,
        normalizedUrl: normalized.toString(),
        addressHint: match.addressHint,
        rawUrl: trimmed,
      },
    };
  }

  return {
    success: false,
    error: {
      code: "unsupported_url",
      message: `URL domain "${hostname}" is not a supported real estate portal`,
    },
  };
}

// ───────────────────────────────────────────────────────────────────────────
// Environment-dependent config
// ───────────────────────────────────────────────────────────────────────────

/**
 * App URL used to build signed reply links. Falls back to the public
 * preview host in development so tests and local webhook runs still get
 * a link they can click through. The signed link format is defined in
 * convex/lib/smsIntakeCompute.ts.
 */
function getAppBaseUrl(): string {
  return (
    process.env.NEXT_PUBLIC_APP_URL ??
    process.env.APP_BASE_URL ??
    "https://buyer-v2.local"
  );
}

/**
 * HMAC secret used to sign reply links. Fails closed when unset in
 * hosted environments — a hardcoded fallback would make signed links
 * forgeable because the HMAC key would be predictable. The only
 * context where a placeholder is acceptable is local dev or Vitest,
 * which we detect via NODE_ENV / CONVEX_ENVIRONMENT.
 */
function getSignedLinkSecret(): string {
  const fromEnv =
    process.env.SMS_SIGNED_LINK_SECRET ?? process.env.SMS_REPLY_LINK_SECRET;
  if (fromEnv && fromEnv.length >= 16) return fromEnv;

  const isLocal =
    process.env.NODE_ENV === "test" ||
    process.env.NODE_ENV === "development" ||
    process.env.CONVEX_ENVIRONMENT === "dev";

  if (isLocal) {
    // Explicit dev/test placeholder. Never used in production because
    // the isLocal guard is false in any hosted runtime.
    return "buyer-v2-dev-placeholder-secret-do-not-use-in-prod";
  }

  throw new Error(
    "SMS_SIGNED_LINK_SECRET is not set. Refusing to sign reply links with a predictable key.",
  );
}

// ───────────────────────────────────────────────────────────────────────────
// Reply copy
// ───────────────────────────────────────────────────────────────────────────

const REPLY_COPY = {
  stop:
    "You've been unsubscribed from buyer-v2 SMS. Reply START to opt back in.",
  start:
    "You're opted in to buyer-v2 SMS. Send a Zillow, Redfin, or Realtor.com listing link to get started.",
  help:
    "buyer-v2 — paste a Zillow, Redfin, or Realtor.com listing link to create a deal room. Reply STOP to opt out. Msg/data rates may apply.",
  invalidUrl:
    "We couldn't find a listing link in your message. Please send a Zillow, Redfin, or Realtor.com listing link.",
  unsupportedUrl:
    "We only support Zillow, Redfin, and Realtor.com listings right now. Please send one of those.",
  rateLimited:
    "Too many messages hit this intake channel. Please wait a few minutes before trying again.",
  blocked:
    "This number is temporarily blocked from sending more listing links. Please wait and try again later.",
  // Prefix — the signed link is appended per message.
  urlProcessedPrefix: "Deal room ready — open it here: ",
} as const;

// ───────────────────────────────────────────────────────────────────────────
// Mutation: processInboundSms
// ───────────────────────────────────────────────────────────────────────────

/**
 * Internal mutation called ONLY by the Twilio webhook httpAction after
 * signature validation. Exposed as `internalMutation` (not `mutation`)
 * so untrusted callers cannot spoof `fromPhone`/`messageSid` via the
 * public Convex API and trigger consent-state changes or intake rows.
 *
 * The Twilio webhook handler in convex/http.ts invokes this via
 * `ctx.runMutation(internal.smsIntake.processInboundSms, {...})`.
 *
 * Returns a structured outcome so the webhook can build the appropriate
 * TwiML response, and so tests can assert against a stable shape.
 */
export const processInboundSms = internalMutation({
  args: {
    messageSid: v.string(),
    fromPhone: v.string(),
    toPhone: v.string(),
    body: v.string(),
  },
  returns: v.object({
    outcome: smsIntakeOutcome,
    intakeId: v.id("smsIntakeMessages"),
    replyBody: v.string(),
    replySent: v.boolean(),
    dealRoomId: v.optional(v.id("dealRooms")),
    sourceListingId: v.optional(v.id("sourceListings")),
    replyLink: v.optional(v.string()),
    rateLimitState: v.optional(
      v.union(v.literal("retry_later"), v.literal("blocked")),
    ),
    retryAt: v.optional(v.string()),
  }),
  handler: async (ctx, args) => {
    const now = new Date().toISOString();

    // ── Step 1: idempotency via Twilio Message SID ─────────────────────
    // On retry (Twilio webhook replay), return the SAME reply payload
    // that was computed the first time so the webhook can re-emit the
    // expected TwiML response — e.g. STOP confirmation or HELP guidance
    // that the user needs to see. `outcome` is still tagged "duplicate"
    // so caller telemetry can distinguish retries, but the reply body
    // is preserved from the persisted row.
    const existing = await ctx.db
      .query("smsIntakeMessages")
      .withIndex("by_messageSid", (q) => q.eq("messageSid", args.messageSid))
      .unique();
    if (existing) {
      return {
        outcome: "duplicate" as const,
        intakeId: existing._id,
        replyBody: existing.replyBody ?? "",
        replySent: existing.replySent,
        dealRoomId: existing.dealRoomId ?? undefined,
        sourceListingId: existing.sourceListingId ?? undefined,
        replyLink: existing.replyLink ?? undefined,
      };
    }

    // ── Step 2: normalize + hash sender / destination ──────────────────
    // Phones that fail normalization still get logged — we just hash
    // the raw trimmed input so operators can correlate support cases.
    const normalizedFrom = normalizePhone(args.fromPhone);
    const normalizedTo = normalizePhone(args.toPhone);
    const phoneHash = await hashPhone(normalizedFrom ?? args.fromPhone.trim());
    const toHash = await hashPhone(normalizedTo ?? args.toPhone.trim());

    // ── Step 3: consent / suppression lookup ───────────────────────────
    const consent = await ctx.db
      .query("smsConsent")
      .withIndex("by_phoneHash", (q) => q.eq("phoneHash", phoneHash))
      .unique();

    // ── Step 4: classify ───────────────────────────────────────────────
    const intent = classifyInboundSms(args.body);

    // ── Step 5: early suppression gate ─────────────────────────────────
    // If the user is opted_out or suppressed, the ONLY intents that still
    // get processed are HELP and START. Everything else short-circuits to
    // a suppressed outcome with an empty reply.
    if (consent && (consent.status === "opted_out" || consent.status === "suppressed")) {
      if (intent.kind !== "help" && intent.kind !== "start") {
        const intakeId = await ctx.db.insert("smsIntakeMessages", {
          messageSid: args.messageSid,
          phoneHash,
          toHash,
          body: args.body,
          outcome: "suppressed",
          errorCode: consent.status,
          replyBody: "",
          replySent: false,
          receivedAt: now,
          processedAt: now,
        });
        return {
          outcome: "suppressed" as const,
          intakeId,
          replyBody: "",
          replySent: false,
          dealRoomId: undefined,
          sourceListingId: undefined,
          replyLink: undefined,
        };
      }
    }

    // ── Step 6: handle by intent ───────────────────────────────────────
    switch (intent.kind) {
      case "empty":
        return await writeMessage(ctx, {
          messageSid: args.messageSid,
          phoneHash,
          toHash,
          body: args.body,
          outcome: "empty_body",
          replyBody: "",
          replySent: false,
          now,
        });

      case "stop": {
        await upsertConsent(ctx, {
          phoneHash,
          status: "opted_out",
          messageSid: args.messageSid,
          now,
        });
        return await writeMessage(ctx, {
          messageSid: args.messageSid,
          phoneHash,
          toHash,
          body: args.body,
          outcome: "stop_received",
          // Per CTIA guidance, the one reply allowed after STOP is the
          // confirmation itself. We mark it as sent because it's legally
          // required to return this copy in the TwiML response.
          replyBody: REPLY_COPY.stop,
          replySent: true,
          now,
        });
      }

      case "start": {
        await upsertConsent(ctx, {
          phoneHash,
          status: "opted_in",
          messageSid: args.messageSid,
          now,
        });
        return await writeMessage(ctx, {
          messageSid: args.messageSid,
          phoneHash,
          toHash,
          body: args.body,
          outcome: "start_received",
          replyBody: REPLY_COPY.start,
          replySent: true,
          now,
        });
      }

      case "help": {
        // HELP must always respond, even for opted-out users, per CTIA.
        // But we don't flip consent state back on.
        return await writeMessage(ctx, {
          messageSid: args.messageSid,
          phoneHash,
          toHash,
          body: args.body,
          outcome: "help_reply",
          replyBody: REPLY_COPY.help,
          replySent: true,
          now,
        });
      }

      case "text_only": {
        const rateLimit = await checkAndPersistRateLimit(ctx, {
          channel: "sms",
          identifier: phoneHash,
        });
        if (!rateLimit.state.allowed) {
          const callerState = rateLimit.callerState!;
          return await writeMessage(ctx, {
            messageSid: args.messageSid,
            phoneHash,
            toHash,
            body: args.body,
            outcome: "rate_limited",
            errorCode: callerState.status,
            replyBody:
              callerState.status === "blocked"
                ? REPLY_COPY.blocked
                : REPLY_COPY.rateLimited,
            replySent: true,
            now,
            rateLimitState: callerState.status,
            retryAt: callerState.retryAt,
          });
        }

        const result = await writeMessage(ctx, {
          messageSid: args.messageSid,
          phoneHash,
          toHash,
          body: args.body,
          outcome: "invalid_url",
          errorCode: "no_url_found",
          replyBody: REPLY_COPY.invalidUrl,
          replySent: true,
          now,
        });

        await recordRateLimitOutcome(ctx, {
          channel: "sms",
          identifier: phoneHash,
          outcome: "failure",
        });

        return result;
      }

      case "url": {
        const rateLimit = await checkAndPersistRateLimit(ctx, {
          channel: "sms",
          identifier: phoneHash,
        });
        if (!rateLimit.state.allowed) {
          const callerState = rateLimit.callerState!;
          return await writeMessage(ctx, {
            messageSid: args.messageSid,
            phoneHash,
            toHash,
            body: args.body,
            outcome: "rate_limited",
            errorCode: callerState.status,
            replyBody:
              callerState.status === "blocked"
                ? REPLY_COPY.blocked
                : REPLY_COPY.rateLimited,
            replySent: true,
            now,
            rateLimitState: callerState.status,
            retryAt: callerState.retryAt,
          });
        }

        // Any URL activity counts as an implicit opt-in — the user is
        // clearly engaging with the service. This matches the spec's
        // "a link or START" opts the user in.
        await upsertConsent(ctx, {
          phoneHash,
          status: "opted_in",
          messageSid: args.messageSid,
          now,
        });

        const parsed = parseListingUrlInline(intent.url);
        if (!parsed.success) {
          // "unsupported_url" is the interesting failure mode — the
          // user sent something that parses as a URL but isn't from
          // a supported portal. Everything else (malformed, missing
          // listing id) maps to the same user-facing reply.
          const outcome =
            parsed.error.code === "unsupported_url"
              ? "unsupported_url"
              : "invalid_url";
          const reply =
            outcome === "unsupported_url"
              ? REPLY_COPY.unsupportedUrl
              : REPLY_COPY.invalidUrl;
          const result = await writeMessage(ctx, {
            messageSid: args.messageSid,
            phoneHash,
            toHash,
            body: args.body,
            outcome,
            errorCode: parsed.error.code,
            replyBody: reply,
            replySent: true,
            now,
          });

          await recordRateLimitOutcome(ctx, {
            channel: "sms",
            identifier: phoneHash,
            outcome: "failure",
          });

          return result;
        }

        // Happy path — reuse an existing sourceListings row for the
        // same URL if we already have one (prevents duplicate rows
        // when the same link is texted in multiple times).
        const existingListing = await ctx.db
          .query("sourceListings")
          .withIndex("by_sourceUrl", (q) =>
            q.eq("sourceUrl", parsed.data.rawUrl),
          )
          .first();

        const sourceListingId =
          existingListing?._id ??
          (await ctx.db.insert("sourceListings", {
            sourcePlatform: parsed.data.platform,
            sourceUrl: parsed.data.rawUrl,
            rawData: JSON.stringify({
              source: "sms",
              messageSid: args.messageSid,
              normalizedUrl: parsed.data.normalizedUrl,
              addressHint: parsed.data.addressHint,
            }),
            extractedAt: now,
            status: "pending",
          }));

        // Build a signed link pointing at the sourceListing via the
        // generic intake route. We don't have a dealRoomId yet — the
        // anonymous SMS sender doesn't have a buyer record, so the
        // signed link resolves to the listing. When the user clicks
        // through and registers, the web layer creates the deal room
        // and swaps the link target.
        const replyLink = await buildSignedLink(
          getAppBaseUrl(),
          sourceListingId,
          getSignedLinkSecret(),
        );

        const replyBody = `${REPLY_COPY.urlProcessedPrefix}${replyLink}`;

        const result = await writeMessage(ctx, {
          messageSid: args.messageSid,
          phoneHash,
          toHash,
          body: args.body,
          outcome: "url_processed",
          sourceListingId,
          replyLink,
          replyBody,
          replySent: true,
          now,
        });

        await recordRateLimitOutcome(ctx, {
          channel: "sms",
          identifier: phoneHash,
          outcome: "success",
        });

        return result;
      }
    }
  },
});

// ───────────────────────────────────────────────────────────────────────────
// Internal helpers
// ───────────────────────────────────────────────────────────────────────────

/**
 * Insert one `smsIntakeMessages` row from a normalized set of fields and
 * return the result shape that `processInboundSms` exposes to callers.
 * Centralising the insert here keeps the switch arms tidy and guarantees
 * every code path writes a row.
 */
async function writeMessage(
  ctx: MutationCtx,
  args: {
    messageSid: string;
    phoneHash: string;
    toHash: string;
    body: string;
    outcome: Doc<"smsIntakeMessages">["outcome"];
    errorCode?: string;
    dealRoomId?: Id<"dealRooms">;
    sourceListingId?: Id<"sourceListings">;
    replyLink?: string;
    replyBody: string;
    replySent: boolean;
    rateLimitState?: "retry_later" | "blocked";
    retryAt?: string;
    now: string;
  },
): Promise<{
  outcome: Doc<"smsIntakeMessages">["outcome"];
  intakeId: Id<"smsIntakeMessages">;
  replyBody: string;
  replySent: boolean;
  dealRoomId: Id<"dealRooms"> | undefined;
  sourceListingId: Id<"sourceListings"> | undefined;
  replyLink: string | undefined;
  rateLimitState: "retry_later" | "blocked" | undefined;
  retryAt: string | undefined;
}> {
  const intakeId = await ctx.db.insert("smsIntakeMessages", {
    messageSid: args.messageSid,
    phoneHash: args.phoneHash,
    toHash: args.toHash,
    body: args.body,
    outcome: args.outcome,
    errorCode: args.errorCode,
    dealRoomId: args.dealRoomId,
    sourceListingId: args.sourceListingId,
    replyLink: args.replyLink,
    replyBody: args.replyBody,
    replySent: args.replySent,
    receivedAt: args.now,
    processedAt: args.now,
  });

  return {
    outcome: args.outcome,
    intakeId,
    replyBody: args.replyBody,
    replySent: args.replySent,
    dealRoomId: args.dealRoomId,
    sourceListingId: args.sourceListingId,
    replyLink: args.replyLink,
    rateLimitState: args.rateLimitState,
    retryAt: args.retryAt,
  };
}

/**
 * Upsert a consent row for a phone hash, recording the timestamp of the
 * matching transition and the Twilio message SID that triggered it.
 * Idempotent — re-running the same transition is a no-op on the status
 * field but still bumps `updatedAt` and the audit SID.
 */
async function upsertConsent(
  ctx: MutationCtx,
  args: {
    phoneHash: string;
    status: "opted_in" | "opted_out" | "suppressed";
    messageSid: string;
    now: string;
  },
) {
  const existing = await ctx.db
    .query("smsConsent")
    .withIndex("by_phoneHash", (q) => q.eq("phoneHash", args.phoneHash))
    .unique();

  // Build a patch object that only sets the timestamp for the
  // transition we're actually performing. This avoids overwriting
  // unrelated timestamps when re-opting in after a prior opt-out.
  const patch: Record<string, unknown> = {
    status: args.status,
    lastTriggeringMessageSid: args.messageSid,
    updatedAt: args.now,
  };
  if (args.status === "opted_in") patch.optedInAt = args.now;
  if (args.status === "opted_out") patch.optedOutAt = args.now;
  if (args.status === "suppressed") patch.suppressedAt = args.now;

  if (existing) {
    await ctx.db.patch(existing._id, patch);
    return existing._id;
  }

  return await ctx.db.insert("smsConsent", {
    phoneHash: args.phoneHash,
    status: args.status,
    optedInAt: args.status === "opted_in" ? args.now : undefined,
    optedOutAt: args.status === "opted_out" ? args.now : undefined,
    suppressedAt: args.status === "suppressed" ? args.now : undefined,
    lastTriggeringMessageSid: args.messageSid,
    createdAt: args.now,
    updatedAt: args.now,
  });
}

// ───────────────────────────────────────────────────────────────────────────
// Queries — broker/admin only, for ops dashboards and support debugging
// ───────────────────────────────────────────────────────────────────────────

/**
 * Return all messages ever received for a given phone hash. Used by the
 * broker console when a user emails support asking why their SMS flow
 * didn't work — the broker looks up the phone hash via a separate tool
 * and then reads the full message history here.
 */
export const getMessagesByPhoneHash = query({
  args: { phoneHash: v.string() },
  returns: v.array(
    v.object({
      _id: v.id("smsIntakeMessages"),
      _creationTime: v.number(),
      messageSid: v.string(),
      phoneHash: v.string(),
      toHash: v.string(),
      body: v.string(),
      outcome: smsIntakeOutcome,
      errorCode: v.optional(v.string()),
      dealRoomId: v.optional(v.id("dealRooms")),
      propertyId: v.optional(v.id("properties")),
      sourceListingId: v.optional(v.id("sourceListings")),
      replyLink: v.optional(v.string()),
      replyBody: v.optional(v.string()),
      replySent: v.boolean(),
      receivedAt: v.string(),
      processedAt: v.string(),
    }),
  ),
  handler: async (ctx, args) => {
    await requireRole(ctx, "broker");
    return await ctx.db
      .query("smsIntakeMessages")
      .withIndex("by_phoneHash", (q) => q.eq("phoneHash", args.phoneHash))
      .order("desc")
      .collect();
  },
});

/**
 * Return the most recent N messages across all phones. Used by ops
 * dashboards. Default limit 50, max 200 to avoid runaway queries.
 */
export const getRecentMessages = query({
  args: { limit: v.optional(v.number()) },
  returns: v.array(
    v.object({
      _id: v.id("smsIntakeMessages"),
      _creationTime: v.number(),
      messageSid: v.string(),
      phoneHash: v.string(),
      toHash: v.string(),
      body: v.string(),
      outcome: smsIntakeOutcome,
      errorCode: v.optional(v.string()),
      dealRoomId: v.optional(v.id("dealRooms")),
      propertyId: v.optional(v.id("properties")),
      sourceListingId: v.optional(v.id("sourceListings")),
      replyLink: v.optional(v.string()),
      replyBody: v.optional(v.string()),
      replySent: v.boolean(),
      receivedAt: v.string(),
      processedAt: v.string(),
    }),
  ),
  handler: async (ctx, args) => {
    await requireRole(ctx, "broker");
    const limit = Math.max(1, Math.min(args.limit ?? 50, 200));
    return await ctx.db
      .query("smsIntakeMessages")
      .order("desc")
      .take(limit);
  },
});

/**
 * Return the current consent row for a phone hash, or null. Broker/admin
 * only — consent state reveals whether a user has opted out, which is
 * PII-adjacent.
 */
export const getConsentByPhoneHash = query({
  args: { phoneHash: v.string() },
  returns: v.union(
    v.null(),
    v.object({
      _id: v.id("smsConsent"),
      _creationTime: v.number(),
      phoneHash: v.string(),
      status: smsConsentStatus,
      optedInAt: v.optional(v.string()),
      optedOutAt: v.optional(v.string()),
      suppressedAt: v.optional(v.string()),
      suppressedReason: v.optional(v.string()),
      lastTriggeringMessageSid: v.optional(v.string()),
      createdAt: v.string(),
      updatedAt: v.string(),
    }),
  ),
  handler: async (ctx, args) => {
    await requireRole(ctx, "broker");
    return await ctx.db
      .query("smsConsent")
      .withIndex("by_phoneHash", (q) => q.eq("phoneHash", args.phoneHash))
      .unique();
  },
});
