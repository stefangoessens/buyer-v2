/**
 * Counteroffer version history (KIN-792).
 *
 * Convex-side mirror of `src/lib/dealroom/counteroffer-history.ts`.
 * Keep in sync.
 */

export type CounterOfferParty = "seller" | "buyer";

export type CounterOfferStatus =
  | "pending"
  | "accepted"
  | "rejected"
  | "expired"
  | "withdrawn"
  | "superseded";

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

export interface BuyerChainNode {
  counterOfferId: string;
  version: number;
  fromParty: CounterOfferParty;
  price: number;
  terms: string | null;
  createdAt: string;
  status: CounterOfferStatus;
  isCurrent: boolean;
  priceDelta: number | null;
  respondedAt: string | null;
  expiresAt: string | null;
  supersededAt: string | null;
}

export interface InternalChainNode extends BuyerChainNode {
  brokerNotes: string | null;
  responderUserId: string | null;
}

export interface BuyerChainSummary {
  offerId: string;
  totalRounds: number;
  awaitingResponseFrom: CounterOfferParty | null;
  currentPrice: number | null;
  firstPrice: number | null;
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

export function canAppendCounter(
  summary: BuyerChainSummary,
  nextFromParty: CounterOfferParty,
): { ok: true } | { ok: false; reason: string } {
  if (summary.isTerminal) {
    return {
      ok: false,
      reason: `Cannot append: counteroffer chain is ${summary.terminalStatus}.`,
    };
  }
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

export function canTransition(
  currentStatus: CounterOfferStatus,
  nextStatus: CounterOfferStatus,
): { ok: true } | { ok: false; reason: string } {
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
