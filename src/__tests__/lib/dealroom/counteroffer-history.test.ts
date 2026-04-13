import { describe, it, expect } from "vitest";
import {
  buildBuyerChain,
  buildInternalChain,
  canAppendCounter,
  canTransition,
  type RawCounterOffer,
} from "@/lib/dealroom/counteroffer-history";

const offerId = "offer_1";

const mk = (overrides: Partial<RawCounterOffer> = {}): RawCounterOffer => ({
  _id: overrides._id ?? `co_${overrides.version ?? 1}`,
  offerId,
  version: 1,
  fromParty: "seller",
  price: 500_000,
  terms: "Standard terms",
  createdAt: "2026-04-10T00:00:00.000Z",
  status: "pending",
  ...overrides,
});

describe("buildBuyerChain — construction + flagging", () => {
  it("returns an empty summary for no rows", () => {
    const summary = buildBuyerChain(offerId, []);
    expect(summary.totalRounds).toBe(0);
    expect(summary.chain).toEqual([]);
    expect(summary.awaitingResponseFrom).toBe(null);
    expect(summary.currentPrice).toBe(null);
    expect(summary.firstPrice).toBe(null);
    expect(summary.netPriceDelta).toBe(null);
    expect(summary.isTerminal).toBe(false);
    expect(summary.terminalStatus).toBe(null);
  });

  it("orders out-of-order rows by version ascending", () => {
    const summary = buildBuyerChain(offerId, [
      mk({ version: 3, _id: "co3", fromParty: "seller", price: 515_000 }),
      mk({ version: 1, _id: "co1", fromParty: "seller", price: 510_000, status: "superseded" }),
      mk({ version: 2, _id: "co2", fromParty: "buyer", price: 505_000, status: "superseded" }),
    ]);
    expect(summary.chain.map((n) => n.counterOfferId)).toEqual(["co1", "co2", "co3"]);
  });

  it("flags the last row as current when the status is pending", () => {
    const summary = buildBuyerChain(offerId, [
      mk({ version: 1, status: "superseded", fromParty: "seller", price: 510_000 }),
      mk({ version: 2, fromParty: "buyer", price: 505_000, status: "pending" }),
    ]);
    expect(summary.chain[0].isCurrent).toBe(false);
    expect(summary.chain[1].isCurrent).toBe(true);
  });

  it("does not flag any node as current when the last node is terminal", () => {
    const summary = buildBuyerChain(offerId, [
      mk({ version: 1, fromParty: "seller", price: 510_000, status: "superseded" }),
      mk({ version: 2, fromParty: "buyer", price: 505_000, status: "accepted" }),
    ]);
    expect(summary.chain[0].isCurrent).toBe(false);
    expect(summary.chain[1].isCurrent).toBe(false);
    expect(summary.isTerminal).toBe(true);
    expect(summary.terminalStatus).toBe("accepted");
  });

  it("computes priceDelta against the previous node (null for first)", () => {
    const summary = buildBuyerChain(offerId, [
      mk({ version: 1, price: 510_000, status: "superseded" }),
      mk({ version: 2, price: 505_000, status: "superseded", fromParty: "buyer" }),
      mk({ version: 3, price: 508_000, fromParty: "seller" }),
    ]);
    expect(summary.chain[0].priceDelta).toBe(null);
    expect(summary.chain[1].priceDelta).toBe(-5000);
    expect(summary.chain[2].priceDelta).toBe(3000);
  });

  it("computes netPriceDelta from first to last", () => {
    const summary = buildBuyerChain(offerId, [
      mk({ version: 1, price: 510_000, status: "superseded" }),
      mk({ version: 2, price: 505_000, fromParty: "buyer", status: "superseded" }),
      mk({ version: 3, price: 508_000, fromParty: "seller" }),
    ]);
    expect(summary.currentPrice).toBe(508_000);
    expect(summary.firstPrice).toBe(510_000);
    expect(summary.netPriceDelta).toBe(-2000);
  });

  it("ignores rows from other offers", () => {
    const rows: RawCounterOffer[] = [
      mk({ version: 1 }),
      mk({ _id: "other", offerId: "offer_2", version: 1, price: 999_999 }),
    ];
    const summary = buildBuyerChain(offerId, rows);
    expect(summary.totalRounds).toBe(1);
    expect(summary.chain[0].price).toBe(500_000);
  });

  it("does not mutate the input array", () => {
    const rows = [
      mk({ version: 2, _id: "co2" }),
      mk({ version: 1, _id: "co1" }),
    ];
    const copy = [...rows];
    buildBuyerChain(offerId, rows);
    expect(rows).toEqual(copy);
  });
});

describe("buildBuyerChain — awaiting response logic", () => {
  it("says buyer owes next when last pending is from seller", () => {
    const summary = buildBuyerChain(offerId, [
      mk({ version: 1, fromParty: "seller", status: "pending" }),
    ]);
    expect(summary.awaitingResponseFrom).toBe("buyer");
  });

  it("says seller owes next when last pending is from buyer", () => {
    const summary = buildBuyerChain(offerId, [
      mk({ version: 1, fromParty: "seller", status: "superseded" }),
      mk({ version: 2, fromParty: "buyer", status: "pending" }),
    ]);
    expect(summary.awaitingResponseFrom).toBe("seller");
  });

  it("returns null when the chain is terminal", () => {
    const summary = buildBuyerChain(offerId, [
      mk({ version: 1, fromParty: "seller", status: "rejected" }),
    ]);
    expect(summary.awaitingResponseFrom).toBe(null);
  });
});

describe("buildBuyerChain — buyer-safe projection", () => {
  it("strips broker-only fields", () => {
    const summary = buildBuyerChain(offerId, [
      mk({
        version: 1,
        brokerNotes: "SECRET — seller is motivated, push them",
        responderUserId: "user_broker_1",
      }),
    ]);
    const node = summary.chain[0];
    // @ts-expect-error — shape check, buyer node should not have brokerNotes
    expect(node.brokerNotes).toBeUndefined();
    // @ts-expect-error
    expect(node.responderUserId).toBeUndefined();
  });

  it("preserves public timestamps and terms", () => {
    const summary = buildBuyerChain(offerId, [
      mk({
        version: 1,
        terms: "As-is",
        respondedAt: "2026-04-12T00:00:00.000Z",
        expiresAt: "2026-04-15T00:00:00.000Z",
        supersededAt: "2026-04-12T00:00:00.000Z",
      }),
    ]);
    const node = summary.chain[0];
    expect(node.terms).toBe("As-is");
    expect(node.respondedAt).toBe("2026-04-12T00:00:00.000Z");
    expect(node.expiresAt).toBe("2026-04-15T00:00:00.000Z");
    expect(node.supersededAt).toBe("2026-04-12T00:00:00.000Z");
  });

  it("passes null through for missing optional fields", () => {
    const summary = buildBuyerChain(offerId, [
      mk({ version: 1, terms: undefined, respondedAt: undefined, expiresAt: undefined, supersededAt: undefined }),
    ]);
    const node = summary.chain[0];
    expect(node.terms).toBe(null);
    expect(node.respondedAt).toBe(null);
    expect(node.expiresAt).toBe(null);
    expect(node.supersededAt).toBe(null);
  });
});

describe("buildInternalChain", () => {
  it("preserves broker-only fields alongside public ones", () => {
    const summary = buildInternalChain(offerId, [
      mk({
        version: 1,
        brokerNotes: "Seller relocating — motivated",
        responderUserId: "user_broker_1",
      }),
    ]);
    expect(summary.chain[0].brokerNotes).toBe("Seller relocating — motivated");
    expect(summary.chain[0].responderUserId).toBe("user_broker_1");
  });

  it("passes null through for missing internal fields", () => {
    const summary = buildInternalChain(offerId, [
      mk({ version: 1, brokerNotes: undefined, responderUserId: undefined }),
    ]);
    expect(summary.chain[0].brokerNotes).toBe(null);
    expect(summary.chain[0].responderUserId).toBe(null);
  });

  it("still computes summary fields the same way as the buyer variant", () => {
    const rows: RawCounterOffer[] = [
      mk({ version: 1, price: 510_000, status: "superseded", brokerNotes: "n1" }),
      mk({ version: 2, price: 505_000, fromParty: "buyer" }),
    ];
    const buyer = buildBuyerChain(offerId, rows);
    const internal = buildInternalChain(offerId, rows);
    expect(internal.totalRounds).toBe(buyer.totalRounds);
    expect(internal.currentPrice).toBe(buyer.currentPrice);
    expect(internal.netPriceDelta).toBe(buyer.netPriceDelta);
    expect(internal.awaitingResponseFrom).toBe(buyer.awaitingResponseFrom);
  });
});

describe("canAppendCounter", () => {
  const empty = buildBuyerChain(offerId, []);

  it("allows the first counter from either party", () => {
    expect(canAppendCounter(empty, "seller").ok).toBe(true);
    expect(canAppendCounter(empty, "buyer").ok).toBe(true);
  });

  it("requires turn-taking — seller cannot append twice in a row", () => {
    const summary = buildBuyerChain(offerId, [
      mk({ version: 1, fromParty: "seller", status: "pending" }),
    ]);
    const result = canAppendCounter(summary, "seller");
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.reason).toContain("buyer");
    }
  });

  it("allows the buyer to append after a pending seller counter", () => {
    const summary = buildBuyerChain(offerId, [
      mk({ version: 1, fromParty: "seller", status: "pending" }),
    ]);
    expect(canAppendCounter(summary, "buyer").ok).toBe(true);
  });

  it("refuses when current is not pending", () => {
    const summary = buildBuyerChain(offerId, [
      mk({ version: 1, fromParty: "seller", status: "superseded" }),
      mk({ version: 2, fromParty: "buyer", status: "rejected" }),
    ]);
    const result = canAppendCounter(summary, "seller");
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.reason).toContain("rejected");
  });

  it("refuses on a terminal chain", () => {
    const summary = buildBuyerChain(offerId, [
      mk({ version: 1, fromParty: "seller", status: "accepted" }),
    ]);
    const result = canAppendCounter(summary, "buyer");
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.reason).toContain("accepted");
  });
});

describe("canTransition", () => {
  it("allows pending → accepted", () => {
    expect(canTransition("pending", "accepted").ok).toBe(true);
  });

  it("allows pending → rejected", () => {
    expect(canTransition("pending", "rejected").ok).toBe(true);
  });

  it("allows pending → superseded (implicit when a new counter is appended)", () => {
    expect(canTransition("pending", "superseded").ok).toBe(true);
  });

  it("allows pending → expired and pending → withdrawn", () => {
    expect(canTransition("pending", "expired").ok).toBe(true);
    expect(canTransition("pending", "withdrawn").ok).toBe(true);
  });

  it("refuses any transition from a non-pending status", () => {
    const r1 = canTransition("accepted", "rejected");
    const r2 = canTransition("rejected", "accepted");
    const r3 = canTransition("superseded", "accepted");
    expect(r1.ok).toBe(false);
    expect(r2.ok).toBe(false);
    expect(r3.ok).toBe(false);
  });

  it("refuses pending → pending (no-op masked as an invalid target)", () => {
    expect(canTransition("pending", "pending").ok).toBe(false);
  });
});
