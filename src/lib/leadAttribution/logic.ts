import { isDistinctTouch, type Touch } from "@/lib/marketing/attribution";
import type {
  AttributionTouchContext,
  LeadAttributionReadModel,
  LeadAttributionRecord,
} from "./types";

export function projectTouchContext(touch: Touch): AttributionTouchContext {
  return {
    source: touch.source,
    medium: touch.medium,
    campaign: touch.campaign,
    content: touch.content,
    term: touch.term,
    landingPage: touch.landingPage,
    referrer: touch.referrer,
    occurredAt: touch.timestamp,
  };
}

export function buildLeadAttributionReadModel(
  record: LeadAttributionRecord
): LeadAttributionReadModel {
  const firstTouchContext = projectTouchContext(record.firstTouch);
  const lastTouchContext = projectTouchContext(record.lastTouch);

  return {
    sessionId: record.sessionId,
    userId: record.userId,
    status: record.status,
    touchCount: record.touchCount,
    source: firstTouchContext.source,
    medium: firstTouchContext.medium,
    campaign: firstTouchContext.campaign,
    landingPage: firstTouchContext.landingPage,
    firstTouchOccurredAt: firstTouchContext.occurredAt,
    firstTouchContext,
    lastTouchContext,
    registeredAt: record.registeredAt,
    convertedAt: record.convertedAt,
    createdAt: record.createdAt,
    updatedAt: record.updatedAt,
  };
}

export function createAnonymousLeadAttribution(
  sessionId: string,
  touch: Touch,
  now: string
): LeadAttributionRecord {
  return {
    sessionId,
    firstTouch: touch,
    lastTouch: touch,
    touchCount: 1,
    status: "anonymous",
    createdAt: now,
    updatedAt: now,
  };
}

export function appendLeadAttributionTouch(
  record: LeadAttributionRecord,
  touch: Touch,
  now: string
): LeadAttributionRecord {
  if (!isDistinctTouch(record.lastTouch, touch)) {
    return { ...record, updatedAt: now };
  }

  return {
    ...record,
    lastTouch: touch,
    touchCount: record.touchCount + 1,
    updatedAt: now,
  };
}

export function handoffLeadAttribution(
  record: LeadAttributionRecord,
  userId: string,
  now: string
): LeadAttributionRecord {
  if (record.userId && record.userId !== userId) {
    throw new Error("Attribution row already handed off to a different user");
  }

  if (record.userId === userId && record.status !== "anonymous") {
    return record;
  }

  return {
    ...record,
    userId,
    status: record.status === "converted" ? "converted" : "registered",
    registeredAt: record.registeredAt ?? now,
    updatedAt: now,
  };
}

export function createSyntheticRegisteredLeadAttribution(
  sessionId: string,
  userId: string,
  now: string
): LeadAttributionRecord {
  const syntheticTouch: Touch = {
    source: "direct",
    medium: "none",
    landingPage: "/",
    timestamp: now,
  };

  return {
    sessionId,
    userId,
    firstTouch: syntheticTouch,
    lastTouch: syntheticTouch,
    touchCount: 1,
    status: "registered",
    registeredAt: now,
    createdAt: now,
    updatedAt: now,
  };
}

export function convertLeadAttribution(
  record: LeadAttributionRecord,
  now: string
): LeadAttributionRecord | null {
  if (record.status === "anonymous") {
    return null;
  }

  if (record.status === "converted") {
    return {
      ...record,
      convertedAt: record.convertedAt ?? now,
      updatedAt: now,
    };
  }

  return {
    ...record,
    status: "converted",
    convertedAt: record.convertedAt ?? now,
    updatedAt: now,
  };
}
