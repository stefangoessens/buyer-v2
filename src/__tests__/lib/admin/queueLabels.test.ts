import { describe, expect, it } from "vitest";
import {
  QUEUE_KEYS,
  QUEUE_STATUSES,
  QUEUE_PRIORITIES,
  QUEUE_KEY_LABELS,
  QUEUE_STATUS_LABELS,
  QUEUE_PRIORITY_LABELS,
  QUEUE_PRIORITY_WEIGHT,
  QUEUE_PRIORITY_TONE,
  QUEUE_STATUS_TONE,
  isQueueKey,
  isQueuePriority,
  isQueueStatus,
} from "@/lib/admin/queueLabels";

describe("admin/queueLabels", () => {
  it("every queue key has a label, description, and tone mapping", () => {
    for (const key of QUEUE_KEYS) {
      expect(QUEUE_KEY_LABELS[key]).toBeTruthy();
    }
  });

  it("every status has a label and tone", () => {
    for (const status of QUEUE_STATUSES) {
      expect(QUEUE_STATUS_LABELS[status]).toBeTruthy();
      expect(QUEUE_STATUS_TONE[status]).toBeTruthy();
    }
  });

  it("every priority has a label, weight, and tone", () => {
    for (const priority of QUEUE_PRIORITIES) {
      expect(QUEUE_PRIORITY_LABELS[priority]).toBeTruthy();
      expect(QUEUE_PRIORITY_WEIGHT[priority]).toBeDefined();
      expect(QUEUE_PRIORITY_TONE[priority]).toBeTruthy();
    }
  });

  it("priority weights order urgent → low", () => {
    expect(QUEUE_PRIORITY_WEIGHT.urgent).toBeLessThan(QUEUE_PRIORITY_WEIGHT.high);
    expect(QUEUE_PRIORITY_WEIGHT.high).toBeLessThan(QUEUE_PRIORITY_WEIGHT.normal);
    expect(QUEUE_PRIORITY_WEIGHT.normal).toBeLessThan(QUEUE_PRIORITY_WEIGHT.low);
  });

  describe("type guards", () => {
    it("isQueueKey", () => {
      expect(isQueueKey("intake_review")).toBe(true);
      expect(isQueueKey("not_a_queue")).toBe(false);
    });

    it("isQueueStatus", () => {
      expect(isQueueStatus("open")).toBe(true);
      expect(isQueueStatus("in_progress")).toBe(false);
    });

    it("isQueuePriority", () => {
      expect(isQueuePriority("urgent")).toBe(true);
      expect(isQueuePriority("critical")).toBe(false);
    });
  });
});
