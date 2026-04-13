/**
 * Agreement supersession chain resolver (KIN-851).
 *
 * Pure functions for walking a chain of superseding agreements and
 * deterministically resolving the current governing agreement for a
 * buyer. The Convex schema stores the forward link (`replacedById`)
 * on each agreement; this module builds the chain view from a flat
 * list of agreements.
 *
 * Supersession terminology:
 *   - Predecessor: the earlier agreement being replaced
 *   - Successor:   the newer agreement taking its place
 *   - Chain head:  the oldest agreement in a supersession lineage
 *   - Chain tail:  the currently-active (terminal) agreement
 *   - Governing:   the tail of the most recent chain the buyer signed
 *
 * Key invariant: every supersession chain is a LINKED LIST, not a graph.
 * A given agreement can have at most one successor (replacedById). If an
 * earlier agreement points to a successor that itself has a successor,
 * we walk the chain to the terminal node.
 */

// ───────────────────────────────────────────────────────────────────────────
// Types
// ───────────────────────────────────────────────────────────────────────────

/** Minimal agreement shape the resolver needs. Decoupled from Convex Doc. */
export interface AgreementRecord {
  _id: string;
  buyerId: string;
  type: "tour_pass" | "full_representation";
  status: "draft" | "sent" | "signed" | "canceled" | "replaced";
  signedAt?: string;
  canceledAt?: string;
  supersededAt?: string;
  supersessionReason?:
    | "upgrade_to_full_representation"
    | "correction"
    | "amendment"
    | "renewal"
    | "replace_expired"
    | "broker_decision";
  replacedById?: string;
  _creationTime?: number;
}

/** A resolved supersession chain for a buyer. */
export interface SupersessionChain {
  /** The chain head (oldest agreement). */
  head: AgreementRecord;
  /** Ordered sequence of agreements from head to tail, oldest first. */
  lineage: AgreementRecord[];
  /** The currently-active (terminal) agreement. */
  tail: AgreementRecord;
  /** Depth — 1 means no supersession has occurred. */
  depth: number;
}

/** Reasons a supersession might occur. Stable enum for audit display. */
export const SUPERSESSION_REASONS = [
  "upgrade_to_full_representation",
  "correction",
  "amendment",
  "renewal",
  "replace_expired",
  "broker_decision",
] as const;

export type SupersessionReason = (typeof SUPERSESSION_REASONS)[number];

// ───────────────────────────────────────────────────────────────────────────
// Chain walking
// ───────────────────────────────────────────────────────────────────────────

/**
 * Walk a single supersession chain starting from a head agreement.
 * Returns the lineage in order (head → tail) and the terminal agreement.
 *
 * Detects cycles defensively: if a chain contains a cycle (which should
 * be impossible given the schema but protects against corrupted data),
 * the walker breaks and returns the lineage up to the cycle point.
 */
export function walkChain(
  head: AgreementRecord,
  allAgreements: AgreementRecord[],
): SupersessionChain {
  const byId = new Map(allAgreements.map((a) => [a._id, a]));
  const lineage: AgreementRecord[] = [];
  const seen = new Set<string>();

  let current: AgreementRecord | undefined = head;
  while (current) {
    if (seen.has(current._id)) {
      // Cycle detected — break defensively
      break;
    }
    seen.add(current._id);
    lineage.push(current);

    if (!current.replacedById) break;
    const next = byId.get(current.replacedById);
    if (!next) break; // Dangling pointer — break
    current = next;
  }

  const tail = lineage[lineage.length - 1];
  return {
    head,
    lineage,
    tail,
    depth: lineage.length,
  };
}

/**
 * Given a flat list of a buyer's agreements, group them into supersession
 * chains. Chain heads are agreements that no other agreement's
 * `replacedById` points to. Every non-head is a successor.
 *
 * Returns one chain per head. Agreements that don't participate in any
 * chain (standalone) are returned as single-node chains.
 */
export function buildChains(
  agreements: AgreementRecord[],
): SupersessionChain[] {
  // An agreement is a chain head iff no other agreement points to it
  // via replacedById.
  const successorIds = new Set<string>();
  for (const a of agreements) {
    if (a.replacedById) successorIds.add(a.replacedById);
  }

  // A head is any agreement that ISN'T in successorIds — nothing replaces it
  // from the "above" direction. But wait, that's backward: replacedById points
  // FROM the old TO the new. So an agreement with replacedById is a
  // predecessor; the successor is the one being pointed AT.
  //
  // A HEAD is therefore: an agreement that is NOT itself a successor of
  // any other agreement. An agreement X is a "successor of Y" iff some Y
  // has Y.replacedById === X._id.
  //
  // So head agreements are those whose _id is NOT in the set of
  // replacedById values.
  const heads = agreements.filter((a) => !successorIds.has(a._id));

  return heads.map((head) => walkChain(head, agreements));
}

// ───────────────────────────────────────────────────────────────────────────
// Governing resolution
// ───────────────────────────────────────────────────────────────────────────

/**
 * Resolve the currently-governing agreement for a buyer from a flat list.
 *
 * Algorithm (deterministic):
 *   1. Build all supersession chains from the buyer's agreements.
 *   2. For each chain, take the TAIL (terminal node).
 *   3. Filter to tails with status = "signed".
 *   4. Among signed tails, prefer full_representation over tour_pass.
 *   5. Within a type, prefer the most recently signed (signedAt desc).
 *
 * Returns null if no signed agreement exists in any chain.
 */
export function resolveCurrentGoverning(
  agreements: AgreementRecord[],
): AgreementRecord | null {
  const chains = buildChains(agreements);
  const signedTails = chains
    .map((c) => c.tail)
    .filter((a) => a.status === "signed");

  if (signedTails.length === 0) return null;

  // Prefer full_representation over tour_pass (broader access scope).
  const fullRep = signedTails
    .filter((a) => a.type === "full_representation")
    .sort((a, b) => (b.signedAt ?? "").localeCompare(a.signedAt ?? ""));
  if (fullRep.length > 0) return fullRep[0];

  const tourPass = signedTails
    .filter((a) => a.type === "tour_pass")
    .sort((a, b) => (b.signedAt ?? "").localeCompare(a.signedAt ?? ""));
  return tourPass[0] ?? null;
}

/**
 * Find the chain that a specific agreement belongs to. Useful for audit
 * surfaces that need to show the full supersession history of a single
 * row.
 */
export function findChainContaining(
  agreementId: string,
  agreements: AgreementRecord[],
): SupersessionChain | null {
  const chains = buildChains(agreements);
  return (
    chains.find((c) => c.lineage.some((a) => a._id === agreementId)) ?? null
  );
}

/**
 * Check whether an agreement has been superseded. An agreement is
 * superseded iff ITS OWN replacedById field is set — in the schema,
 * replacedById points from the predecessor (the one being replaced)
 * TO the successor, so the predecessor itself carries the forward
 * pointer.
 */
export function isSuperseded(
  agreementId: string,
  agreements: AgreementRecord[],
): boolean {
  const agreement = agreements.find((a) => a._id === agreementId);
  return agreement?.replacedById !== undefined;
}

/**
 * Get the direct successor of an agreement (one hop forward in the
 * supersession chain). Returns null if the agreement has no successor
 * or is itself the chain tail.
 */
export function getDirectSuccessor(
  agreementId: string,
  agreements: AgreementRecord[],
): AgreementRecord | null {
  const agreement = agreements.find((a) => a._id === agreementId);
  if (!agreement?.replacedById) return null;
  return agreements.find((a) => a._id === agreement.replacedById) ?? null;
}
