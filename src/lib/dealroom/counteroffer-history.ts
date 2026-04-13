/**
 * Counteroffer version history (KIN-792).
 *
 * Pure TS composer — used by Convex backend and the offer cockpit /
 * counteroffer history UI. Takes raw `counterOffers` rows for an offer
 * and projects them into a typed, ordered chain with:
 *
 *   - one "current" node (the outstanding proposal awaiting response)
 *   - zero or more "superseded" predecessors (already countered or withdrawn)
 *   - optional "final" marker when the chain has been accepted/rejected
 *
 * The chain alternates parties: seller → buyer → seller → buyer. Each
 * append is a new row with a higher `version`, which supersedes the prior
 * current node. This module owns the rules for turn-taking, state
 * transitions, and the buyer-safe vs internal projection split.
 *
 * Buyer view strips internal-only fields (broker notes, responder user
 * id), internal view preserves everything. Both views share the same
 * chain structure so callers can render identical timelines with a
 * different level of detail.
 */

export type CounterOfferParty = "seller" | "buyer";

export type CounterOfferStatus =
  | "pending"
  | "accepted"
  | "rejected"
  | "expired"
  | "withdrawn"
  | "superseded";

/** Raw row from the `counterOffers` table. */
export interface RawCounterOffer {
  _id: string;
  offerId: string;
  version: number;
  fromParty: CounterOfferParty;
  price: number;
  terms?: string;
  createdAt: string;
  status: CounterOfferStatus;
  supersededAt?: string;
  respondedAt?: string;
  responderUserId?: string;
  brokerNotes?: string;
  expiresAt?: string;
}

/** Buyer-safe node in a counteroffer chain. */
export interface BuyerChainNode {
  counterOfferId: string;
  version: number;
  fromParty: CounterOfferParty;
  price: number;
  terms: string | null;
  createdAt: string;
  status: CounterOfferStatus;
  isCurrent: boolean;
  /** Difference vs the previous node's price. Null for the first node. */
  priceDelta: number | null;
  respondedAt: string | null;
  expiresAt: string | null;
  supersededAt: string | null;
}

/** Internal node adds broker-only fields. */
export interface InternalChainNode extends BuyerChainNode {
  brokerNotes: string | null;
  responderUserId: string | null;
}

export interface BuyerChainSummary {
  offerId: string;
  totalRounds: number;
  /** Party whose turn it is to respond. Null when the chain is terminal. */
  awaitingResponseFrom: CounterOfferParty | null;
  currentPrice: number | null;
  firstPrice: number | null;
  /** Total price change across the whole chain (current - first). */
  netPriceDelta: number | null;
  isTerminal: boolean;
  terminalStatus: Extract<
    CounterOfferStatus,
    "accepted" | "rejected" | "expired" | "withdrawn"
  > | null;
  chain: BuyerChainNode[];
}

export interface InternalChainSummary
  extends Omit<BuyerChainSummary, "chain"> {
  chain: InternalChainNode[];
}

// ───────────────────────────────────────────────────────────────────────────
// Chain construction
// ───────────────────────────────────────────────────────────────────────────

/**
 * Order raw counteroffer rows by version and mark supersession. Does not
 * mutate the input. Returns a new array ordered ascending by version.
 *
 * Any row with a version <= the current highest is marked superseded;
 * the highest version row is "current" unless it has a terminal status
 * (accepted / rejected / expired / withdrawn), in which case there is
 * no current node — the chain is terminal.
 */
function orderAndFlag(rows: RawCounterOffer[]): RawCounterOffer[] {
  return rows.slice().sort((a, b) => a.version - b.version);
}

function isTerminalStatus(
  status: CounterOfferStatus,
): status is Extract<
  CounterOfferStatus,
  "accepted" | "rejected" | "expired" | "withdrawn"
> {
  return (
    status === "accepted" ||
    status === "rejected" ||
    status === "expired" ||
    status === "withdrawn"
  );
}

function baseNode(
  row: RawCounterOffer,
  isCurrent: boolean,
  priceDelta: number | null,
): BuyerChainNode {
  return {
    counterOfferId: row._id,
    version: row.version,
    fromParty: row.fromParty,
    price: row.price,
    terms: row.terms ?? null,
    createdAt: row.createdAt,
    status: row.status,
    isCurrent,
    priceDelta,
    respondedAt: row.respondedAt ?? null,
    expiresAt: row.expiresAt ?? null,
    supersededAt: row.supersededAt ?? null,
  };
}

/**
 * Build a buyer-safe chain + summary for an offer. Rows with mismatched
 * `offerId` are ignored — callers should pre-filter, but we guard here
 * to avoid accidentally mixing chains.
 */
export function buildBuyerChain(
  offerId: string,
  rows: RawCounterOffer[],
): BuyerChainSummary {
  const filtered = rows.filter((r) => r.offerId === offerId);
  const ordered = orderAndFlag(filtered);
  const chain: BuyerChainNode[] = [];
  let prevPrice: number | null = null;
  for (let i = 0; i < ordered.length; i++) {
    const row = ordered[i];
    const isLast = i === ordered.length - 1;
    const isCurrent = isLast && !isTerminalStatus(row.status);
    const priceDelta = prevPrice === null ? null : row.price - prevPrice;
    chain.push(baseNode(row, isCurrent, priceDelta));
    prevPrice = row.price;
  }
  return summarize(offerId, chain);
}

/** Internal variant — same chain structure, internal-only fields included. */
export function buildInternalChain(
  offerId: string,
  rows: RawCounterOffer[],
): InternalChainSummary {
  const base = buildBuyerChain(offerId, rows);
  const filtered = rows.filter((r) => r.offerId === offerId);
  const byId = new Map(filtered.map((r) => [r._id, r]));
  const internalChain: InternalChainNode[] = base.chain.map((node) => {
    const raw = byId.get(node.counterOfferId);
    return {
      ...node,
      brokerNotes: raw?.brokerNotes ?? null,
      responderUserId: raw?.responderUserId ?? null,
    };
  });
  return { ...base, chain: internalChain };
}

function summarize(
  offerId: string,
  chain: BuyerChainNode[],
): BuyerChainSummary {
  if (chain.length === 0) {
    return {
      offerId,
      totalRounds: 0,
      awaitingResponseFrom: null,
      currentPrice: null,
      firstPrice: null,
      netPriceDelta: null,
      isTerminal: false,
      terminalStatus: null,
      chain,
    };
  }
  const last = chain[chain.length - 1];
  const first = chain[0];
  const terminal = isTerminalStatus(last.status);
  // If the last node is a pending counter from the seller, the buyer owes
  // the next move; and vice versa. On a terminal chain nobody owes a move.
  const awaitingResponseFrom: CounterOfferParty | null = terminal
    ? null
    : last.fromParty === "seller"
      ? "buyer"
      : "seller";
  return {
    offerId,
    totalRounds: chain.length,
    awaitingResponseFrom,
    currentPrice: last.price,
    firstPrice: first.price,
    netPriceDelta: last.price - first.price,
    isTerminal: terminal,
    terminalStatus: terminal
      ? (last.status as BuyerChainSummary["terminalStatus"])
      : null,
    chain,
  };
}

// ───────────────────────────────────────────────────────────────────────────
// Validation — turn-taking + state transitions
// ───────────────────────────────────────────────────────────────────────────

/**
 * Can a new counter from `nextFromParty` be appended to this chain?
 * Returns `{ ok: true }` or `{ ok: false, reason }`. Callers should
 * surface the reason text verbatim in error messages.
 */
export function canAppendCounter(
  summary: BuyerChainSummary,
  nextFromParty: CounterOfferParty,
): { ok: true } | { ok: false, reason: string } {
  if (summary.isTerminal) {
    return {
      ok: false,
      reason: `Cannot append: counteroffer chain is ${summary.terminalStatus}.`,
    };
  }
  // First counter — either party can open. (In practice the seller opens
  // a counter against the buyer's initial offer, but we don't hard-code
  // that here to keep the library reusable.)
  if (summary.chain.length === 0) {
    return { ok: true };
  }
  const last = summary.chain[summary.chain.length - 1];
  if (last.status !== "pending") {
    return {
      ok: false,
      reason: `Cannot append: current counter is ${last.status}, not pending.`,
    };
  }
  if (last.fromParty === nextFromParty) {
    return {
      ok: false,
      reason: `Cannot append: it is ${last.fromParty === "seller" ? "buyer" : "seller"}'s turn to respond.`,
    };
  }
  return { ok: true };
}

/**
 * Can the given counter node transition from its current status to the
 * requested next status? Only pending nodes can accept/reject/expire/
 * withdraw; anything else is a no-op or an error.
 */
export function canTransition(
  currentStatus: CounterOfferStatus,
  nextStatus: CounterOfferStatus,
): { ok: true } | { ok: false, reason: string } {
  if (currentStatus !== "pending") {
    return {
      ok: false,
      reason: `Counter is already ${currentStatus}; only pending counters can transition.`,
    };
  }
  if (
    nextStatus !== "accepted" &&
    nextStatus !== "rejected" &&
    nextStatus !== "expired" &&
    nextStatus !== "withdrawn" &&
    nextStatus !== "superseded"
  ) {
    return {
      ok: false,
      reason: `Invalid next status "${nextStatus}" — must be terminal or superseded.`,
    };
  }
  return { ok: true };
}
