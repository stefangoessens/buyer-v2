import type { Touch } from "@/lib/marketing/attribution";

export type LeadAttributionStatus = "anonymous" | "registered" | "converted";

export interface LeadAttributionRecord {
  sessionId: string;
  userId?: string;
  firstTouch: Touch;
  lastTouch: Touch;
  touchCount: number;
  status: LeadAttributionStatus;
  registeredAt?: string;
  convertedAt?: string;
  createdAt: string;
  updatedAt: string;
}

export interface AttributionTouchContext {
  source: string;
  medium: string;
  campaign?: string;
  content?: string;
  term?: string;
  landingPage: string;
  referrer?: string;
  occurredAt: string;
}

export interface LeadAttributionReadModel {
  sessionId: string;
  userId?: string;
  status: LeadAttributionStatus;
  touchCount: number;
  source: string;
  medium: string;
  campaign?: string;
  landingPage: string;
  firstTouchOccurredAt: string;
  firstTouchContext: AttributionTouchContext;
  lastTouchContext: AttributionTouchContext;
  registeredAt?: string;
  convertedAt?: string;
  createdAt: string;
  updatedAt: string;
}
