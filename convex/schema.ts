import { defineSchema, defineTable } from "convex/server";
import { v } from "convex/values";

// ─── buyer-v2 Convex Schema ─────────────────────────────────────────────────
// System of record for the AI-native Florida buyer brokerage platform.
// Every query, mutation, and AI engine reads from this schema.
//
// Conventions:
//   - _id and _creationTime are automatic system fields (never defined here)
//   - Index names include all field names: "by_fieldA_and_fieldB"
//   - v.optional() for any field that may not be present on every document
//   - No v.map() / v.set() — use v.record() for dynamic keys
//   - v.int64() instead of deprecated v.bigint()
// ─────────────────────────────────────────────────────────────────────────────

export default defineSchema({
  // ═══════════════════════════════════════════════════════════════════════════
  // USERS & PROFILES
  // ═══════════════════════════════════════════════════════════════════════════

  users: defineTable({
    email: v.string(),
    name: v.string(),
    role: v.union(v.literal("buyer"), v.literal("broker"), v.literal("admin")),
    phone: v.optional(v.string()),
    avatarUrl: v.optional(v.string()),
    authSubject: v.optional(v.string()),
  })
    .index("by_email", ["email"])
    .index("by_role", ["role"])
    .index("by_authSubject", ["authSubject"]),

  buyerProfiles: defineTable({
    userId: v.id("users"),
    preferredAreas: v.optional(v.array(v.string())),
    budgetMin: v.optional(v.number()),
    budgetMax: v.optional(v.number()),
    preApproved: v.optional(v.boolean()),
    preApprovalAmount: v.optional(v.number()),
    propertyTypes: v.optional(v.array(v.string())),
    mustHaves: v.optional(v.array(v.string())),
    dealbreakers: v.optional(v.array(v.string())),
    timeline: v.optional(v.string()),
  }).index("by_userId", ["userId"]),

  // ═══════════════════════════════════════════════════════════════════════════
  // PROPERTIES & SOURCE LISTINGS
  // ═══════════════════════════════════════════════════════════════════════════

  properties: defineTable({
    // -- Identification --
    canonicalId: v.string(),
    mlsNumber: v.optional(v.string()),
    folioNumber: v.optional(v.string()),
    address: v.object({
      street: v.string(),
      unit: v.optional(v.string()),
      city: v.string(),
      state: v.string(),
      zip: v.string(),
      county: v.optional(v.string()),
      formatted: v.optional(v.string()),
    }),
    coordinates: v.optional(
      v.object({
        lat: v.number(),
        lng: v.number(),
      })
    ),

    // Top-level zip for indexing (Convex indexes require top-level fields)
    zip: v.optional(v.string()),

    // -- Portal IDs --
    zillowId: v.optional(v.string()),
    redfinId: v.optional(v.string()),
    realtorId: v.optional(v.string()),

    // -- Listing state --
    status: v.union(
      v.literal("active"),
      v.literal("pending"),
      v.literal("contingent"),
      v.literal("sold"),
      v.literal("withdrawn")
    ),
    listPrice: v.optional(v.number()),
    listDate: v.optional(v.string()),
    daysOnMarket: v.optional(v.number()),
    cumulativeDom: v.optional(v.number()),

    // -- Characteristics --
    propertyType: v.optional(v.string()),
    beds: v.optional(v.number()),
    bathsFull: v.optional(v.number()),
    bathsHalf: v.optional(v.number()),
    sqftLiving: v.optional(v.number()),
    sqftTotal: v.optional(v.number()),
    lotSize: v.optional(v.number()),
    yearBuilt: v.optional(v.number()),
    stories: v.optional(v.number()),
    garageSpaces: v.optional(v.number()),
    pool: v.optional(v.boolean()),
    waterfrontType: v.optional(v.string()),
    view: v.optional(v.string()),

    // -- Florida-specific --
    constructionType: v.optional(v.string()),
    roofYear: v.optional(v.number()),
    roofMaterial: v.optional(v.string()),
    impactWindows: v.optional(v.boolean()),
    stormShutters: v.optional(v.boolean()),
    floodZone: v.optional(v.string()),
    hurricaneZone: v.optional(v.string()),
    seniorCommunity: v.optional(v.boolean()),
    shortTermRentalAllowed: v.optional(v.boolean()),
    gatedCommunity: v.optional(v.boolean()),

    // -- Costs --
    hoaFee: v.optional(v.number()),
    hoaFrequency: v.optional(v.string()),
    taxAnnual: v.optional(v.number()),
    taxAssessedValue: v.optional(v.number()),

    // -- Listing party --
    listingAgentName: v.optional(v.string()),
    listingBrokerage: v.optional(v.string()),
    listingAgentPhone: v.optional(v.string()),

    // -- Media --
    description: v.optional(v.string()),
    photoUrls: v.optional(v.array(v.string())),
    photoCount: v.optional(v.number()),
    virtualTourUrl: v.optional(v.string()),

    // -- Schools --
    elementarySchool: v.optional(v.string()),
    middleSchool: v.optional(v.string()),
    highSchool: v.optional(v.string()),
    schoolDistrict: v.optional(v.string()),
    subdivision: v.optional(v.string()),

    // -- Portal estimates (stored separately, never merged) --
    zestimate: v.optional(v.number()),
    redfinEstimate: v.optional(v.number()),
    realtorEstimate: v.optional(v.number()),

    // -- Metadata --
    sourcePlatform: v.union(
      v.literal("zillow"),
      v.literal("redfin"),
      v.literal("realtor"),
      v.literal("manual")
    ),
    extractedAt: v.string(),
    updatedAt: v.string(),
  })
    .index("by_canonicalId", ["canonicalId"])
    .index("by_status", ["status"])
    .index("by_mlsNumber", ["mlsNumber"])
    .index("by_sourcePlatform", ["sourcePlatform"])
    .index("by_zip", ["zip"]),

  sourceListings: defineTable({
    propertyId: v.optional(v.id("properties")),
    sourcePlatform: v.union(
      v.literal("zillow"),
      v.literal("redfin"),
      v.literal("realtor"),
      v.literal("manual")
    ),
    sourceUrl: v.string(),
    rawData: v.optional(v.string()),
    extractedAt: v.string(),
    status: v.union(
      v.literal("pending"),
      v.literal("extracted"),
      v.literal("failed"),
      v.literal("merged")
    ),
  })
    .index("by_sourceUrl", ["sourceUrl"])
    .index("by_propertyId", ["propertyId"])
    .index("by_status", ["status"]),

  // ═══════════════════════════════════════════════════════════════════════════
  // DEAL ROOMS & AGREEMENTS
  // ═══════════════════════════════════════════════════════════════════════════

  dealRooms: defineTable({
    propertyId: v.id("properties"),
    buyerId: v.id("users"),
    status: v.union(
      v.literal("intake"),
      v.literal("analysis"),
      v.literal("tour_scheduled"),
      v.literal("offer_prep"),
      v.literal("offer_sent"),
      v.literal("under_contract"),
      v.literal("closing"),
      v.literal("closed"),
      v.literal("withdrawn")
    ),
    accessLevel: v.union(
      v.literal("anonymous"),
      v.literal("registered"),
      v.literal("full")
    ),
    createdAt: v.string(),
    updatedAt: v.string(),
  })
    .index("by_propertyId", ["propertyId"])
    .index("by_buyerId", ["buyerId"])
    .index("by_buyerId_and_status", ["buyerId", "status"]),

  agreements: defineTable({
    dealRoomId: v.id("dealRooms"),
    buyerId: v.id("users"),
    type: v.union(
      v.literal("tour_pass"),
      v.literal("full_representation")
    ),
    status: v.union(
      v.literal("draft"),
      v.literal("sent"),
      v.literal("signed"),
      v.literal("canceled"),
      v.literal("replaced")
    ),
    documentStorageId: v.optional(v.id("_storage")),
    signedAt: v.optional(v.string()),
    canceledAt: v.optional(v.string()),
    replacedById: v.optional(v.id("agreements")),
  })
    .index("by_dealRoomId", ["dealRoomId"])
    .index("by_buyerId", ["buyerId"])
    .index("by_buyerId_and_type", ["buyerId", "type"]),

  // ═══════════════════════════════════════════════════════════════════════════
  // TOURS
  // ═══════════════════════════════════════════════════════════════════════════

  tours: defineTable({
    dealRoomId: v.id("dealRooms"),
    propertyId: v.id("properties"),
    buyerId: v.id("users"),
    agentId: v.optional(v.id("users")),
    status: v.union(
      v.literal("requested"),
      v.literal("confirmed"),
      v.literal("completed"),
      v.literal("canceled"),
      v.literal("no_show")
    ),
    scheduledAt: v.optional(v.string()),
    completedAt: v.optional(v.string()),
    notes: v.optional(v.string()),
  })
    .index("by_dealRoomId", ["dealRoomId"])
    .index("by_agentId_and_status", ["agentId", "status"])
    .index("by_buyerId", ["buyerId"]),

  // ═══════════════════════════════════════════════════════════════════════════
  // OFFERS & COUNTER-OFFERS
  // ═══════════════════════════════════════════════════════════════════════════

  offers: defineTable({
    dealRoomId: v.id("dealRooms"),
    propertyId: v.id("properties"),
    buyerId: v.id("users"),
    status: v.union(
      v.literal("draft"),
      v.literal("pending_review"),
      v.literal("approved"),
      v.literal("submitted"),
      v.literal("countered"),
      v.literal("accepted"),
      v.literal("rejected"),
      v.literal("withdrawn"),
      v.literal("expired")
    ),
    offerPrice: v.number(),
    earnestMoney: v.optional(v.number()),
    closingDate: v.optional(v.string()),
    contingencies: v.optional(v.array(v.string())),
    buyerCredits: v.optional(v.number()),
    sellerCredits: v.optional(v.number()),
    brokerApproved: v.optional(v.boolean()),
    brokerApprovedAt: v.optional(v.string()),
    submittedAt: v.optional(v.string()),
    version: v.number(),
  })
    .index("by_dealRoomId", ["dealRoomId"])
    .index("by_buyerId_and_status", ["buyerId", "status"])
    .index("by_propertyId", ["propertyId"]),

  counterOffers: defineTable({
    offerId: v.id("offers"),
    version: v.number(),
    fromParty: v.union(v.literal("buyer"), v.literal("seller")),
    price: v.number(),
    terms: v.optional(v.string()),
    createdAt: v.string(),
    status: v.union(
      v.literal("pending"),
      v.literal("accepted"),
      v.literal("rejected"),
      v.literal("expired")
    ),
  }).index("by_offerId", ["offerId"]),

  // ═══════════════════════════════════════════════════════════════════════════
  // CONTRACTS
  // ═══════════════════════════════════════════════════════════════════════════

  contracts: defineTable({
    dealRoomId: v.id("dealRooms"),
    offerId: v.id("offers"),
    documentStorageId: v.optional(v.id("_storage")),
    status: v.union(
      v.literal("pending_signatures"),
      v.literal("fully_executed"),
      v.literal("amended"),
      v.literal("terminated")
    ),
    milestones: v.optional(
      v.array(
        v.object({
          name: v.string(),
          dueDate: v.string(),
          completedAt: v.optional(v.string()),
        })
      )
    ),
    createdAt: v.string(),
  })
    .index("by_dealRoomId", ["dealRoomId"])
    .index("by_offerId", ["offerId"]),

  // ═══════════════════════════════════════════════════════════════════════════
  // AUDIT LOG
  // ═══════════════════════════════════════════════════════════════════════════

  auditLog: defineTable({
    userId: v.optional(v.id("users")),
    action: v.string(),
    entityType: v.string(),
    entityId: v.string(),
    details: v.optional(v.string()),
    timestamp: v.string(),
  })
    .index("by_entityType_and_entityId", ["entityType", "entityId"])
    .index("by_userId", ["userId"])
    .index("by_timestamp", ["timestamp"]),

  // ═══════════════════════════════════════════════════════════════════════════
  // AI ENGINE OUTPUTS
  // ═══════════════════════════════════════════════════════════════════════════

  aiEngineOutputs: defineTable({
    propertyId: v.id("properties"),
    engineType: v.string(),
    confidence: v.number(),
    citations: v.array(v.string()),
    reviewState: v.union(
      v.literal("pending"),
      v.literal("approved"),
      v.literal("rejected")
    ),
    output: v.string(),
    modelId: v.string(),
    generatedAt: v.string(),
    reviewedBy: v.optional(v.id("users")),
    reviewedAt: v.optional(v.string()),
  })
    .index("by_propertyId_and_engineType", ["propertyId", "engineType"])
    .index("by_reviewState", ["reviewState"]),

  // ═══════════════════════════════════════════════════════════════════════════
  // AI PROMPT REGISTRY
  // ═══════════════════════════════════════════════════════════════════════════

  promptRegistry: defineTable({
    engineType: v.string(),
    version: v.string(),
    prompt: v.string(),
    systemPrompt: v.optional(v.string()),
    model: v.string(),
    isActive: v.boolean(),
    createdAt: v.string(),
    author: v.string(),
    changeNotes: v.optional(v.string()),
  })
    .index("by_engineType", ["engineType"])
    .index("by_engineType_and_version", ["engineType", "version"])
    .index("by_engineType_and_isActive", ["engineType", "isActive"]),
});
