// ═══════════════════════════════════════════════════════════════════════════
// Buyer Dashboard Portfolio (KIN-1062)
//
// Aggregates the buyer's deal rooms with a deterministic next-action and
// current-step computed server-side so the dashboard can render an
// at-a-glance command center without recomputing state on the client.
//
// Status mapping is intentionally narrowed to five UX steps used by the
// dashboard pipeline:
//   details  → property facts not yet reviewed
//   price    → pricing / analysis stage
//   disclosures → tour stage (pre-offer logistics)
//   offer    → offer prep / sent / under contract
//   close    → closing or closed
// The server emits a `nextAction` object so the UI is link/severity-driven
// without case statements scattered across components.
// ═══════════════════════════════════════════════════════════════════════════

import { v } from "convex/values";
import { query } from "./_generated/server";
import type { Doc } from "./_generated/dataModel";
import { getCurrentUser } from "./lib/session";

const portfolioDealValidator = v.object({
  dealRoomId: v.string(),
  propertyId: v.string(),
  address: v.string(),
  city: v.string(),
  listPrice: v.number(),
  photoUrl: v.union(v.string(), v.null()),
  currentStep: v.union(
    v.literal("details"),
    v.literal("price"),
    v.literal("disclosures"),
    v.literal("offer"),
    v.literal("close"),
  ),
  nextAction: v.object({
    label: v.string(),
    href: v.string(),
    severity: v.union(
      v.literal("info"),
      v.literal("warning"),
      v.literal("error"),
    ),
  }),
});

type PortfolioDeal = {
  dealRoomId: string;
  propertyId: string;
  address: string;
  city: string;
  listPrice: number;
  photoUrl: string | null;
  currentStep: "details" | "price" | "disclosures" | "offer" | "close";
  nextAction: {
    label: string;
    href: string;
    severity: "info" | "warning" | "error";
  };
};

function projectStep(
  status: Doc<"dealRooms">["status"],
  propertyId: string,
): { currentStep: PortfolioDeal["currentStep"]; nextAction: PortfolioDeal["nextAction"] } {
  switch (status) {
    case "intake":
      return {
        currentStep: "details",
        nextAction: {
          label: "Review property details",
          href: `/property/${propertyId}/details`,
          severity: "info",
        },
      };
    case "analysis":
      return {
        currentStep: "price",
        nextAction: {
          label: "Review pricing",
          href: `/property/${propertyId}/price`,
          severity: "info",
        },
      };
    case "tour_scheduled":
      return {
        currentStep: "disclosures",
        nextAction: {
          label: "Prep for tour",
          href: `/property/${propertyId}/details`,
          severity: "info",
        },
      };
    case "offer_prep":
      return {
        currentStep: "offer",
        nextAction: {
          label: "Finalize offer",
          href: `/property/${propertyId}/offer`,
          severity: "warning",
        },
      };
    case "offer_sent":
      return {
        currentStep: "offer",
        nextAction: {
          label: "Awaiting seller response",
          href: `/property/${propertyId}/offer`,
          severity: "warning",
        },
      };
    case "under_contract":
      return {
        currentStep: "offer",
        nextAction: {
          label: "Track contract milestones",
          href: `/property/${propertyId}/offer`,
          severity: "warning",
        },
      };
    case "closing":
      return {
        currentStep: "close",
        nextAction: {
          label: "Close workflow",
          href: `/property/${propertyId}/close`,
          severity: "info",
        },
      };
    case "closed":
      return {
        currentStep: "close",
        nextAction: {
          label: "View summary",
          href: `/property/${propertyId}/close`,
          severity: "info",
        },
      };
    case "withdrawn":
      return {
        currentStep: "details",
        nextAction: {
          label: "Reopen deal",
          href: `/property/${propertyId}/details`,
          severity: "info",
        },
      };
  }
}

export const getPortfolio = query({
  args: {},
  returns: v.array(portfolioDealValidator),
  handler: async (ctx): Promise<PortfolioDeal[]> => {
    const user = await getCurrentUser(ctx);
    if (!user) return [];

    const dealRooms = await ctx.db
      .query("dealRooms")
      .withIndex("by_buyerId", (q) => q.eq("buyerId", user._id))
      .collect();

    const portfolio = await Promise.all(
      dealRooms.map(async (dr): Promise<PortfolioDeal | null> => {
        const property = await ctx.db.get(dr.propertyId);
        if (!property) return null;

        const { currentStep, nextAction } = projectStep(dr.status, dr.propertyId);

        return {
          dealRoomId: dr._id,
          propertyId: dr.propertyId,
          address:
            property.address?.formatted ||
            property.address?.street ||
            "Unknown",
          city: property.address?.city || "",
          listPrice: property.listPrice ?? 0,
          photoUrl: property.photoUrls?.[0] ?? null,
          currentStep,
          nextAction,
        };
      }),
    );

    return portfolio.filter((deal): deal is PortfolioDeal => deal !== null);
  },
});
