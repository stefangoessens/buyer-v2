import { v } from "convex/values";

// User roles
export const userRole = v.union(
  v.literal("buyer"),
  v.literal("broker"),
  v.literal("admin")
);

// Deal lifecycle
export const dealStatus = v.union(
  v.literal("intake"),
  v.literal("analysis"),
  v.literal("tour_scheduled"),
  v.literal("offer_prep"),
  v.literal("offer_sent"),
  v.literal("under_contract"),
  v.literal("closing"),
  v.literal("closed"),
  v.literal("withdrawn")
);

// Agreement types and statuses
export const agreementType = v.union(
  v.literal("tour_pass"),
  v.literal("full_representation")
);

export const agreementStatus = v.union(
  v.literal("draft"),
  v.literal("sent"),
  v.literal("signed"),
  v.literal("canceled"),
  v.literal("replaced")
);

// Offer statuses
export const offerStatus = v.union(
  v.literal("draft"),
  v.literal("pending_review"),
  v.literal("approved"),
  v.literal("submitted"),
  v.literal("countered"),
  v.literal("accepted"),
  v.literal("rejected"),
  v.literal("withdrawn"),
  v.literal("expired")
);

// Tour statuses
export const tourStatus = v.union(
  v.literal("requested"),
  v.literal("confirmed"),
  v.literal("completed"),
  v.literal("canceled"),
  v.literal("no_show")
);

// Property listing status
export const propertyStatus = v.union(
  v.literal("active"),
  v.literal("pending"),
  v.literal("contingent"),
  v.literal("sold"),
  v.literal("withdrawn")
);

// Source platforms
export const sourcePlatform = v.union(
  v.literal("zillow"),
  v.literal("redfin"),
  v.literal("realtor"),
  v.literal("manual")
);

// AI review state
export const aiReviewState = v.union(
  v.literal("pending"),
  v.literal("approved"),
  v.literal("rejected")
);
