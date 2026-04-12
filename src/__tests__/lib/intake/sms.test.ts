import { describe, it, expect } from "vitest";
import {
  classifyInboundSms,
  extractUrl,
  normalizePhone,
  hashPhone,
  buildSignedLink,
  verifySignedLink,
  STOP_KEYWORDS,
  START_KEYWORDS,
  HELP_KEYWORDS,
} from "@/lib/intake/sms";

// ───────────────────────────────────────────────────────────────────────────
// classifyInboundSms — STOP / START / HELP
// ───────────────────────────────────────────────────────────────────────────

describe("classifyInboundSms — keyword detection", () => {
  it("recognises 'STOP' as stop intent", () => {
    expect(classifyInboundSms("STOP")).toEqual({ kind: "stop" });
  });

  it("is case-insensitive for 'stop'", () => {
    expect(classifyInboundSms("stop")).toEqual({ kind: "stop" });
  });

  it("recognises 'Stop' with mixed case", () => {
    expect(classifyInboundSms("Stop")).toEqual({ kind: "stop" });
  });

  it("trims whitespace around 'STOP'", () => {
    expect(classifyInboundSms("  STOP  ")).toEqual({ kind: "stop" });
  });

  it("recognises all documented STOP keywords", () => {
    for (const keyword of STOP_KEYWORDS) {
      expect(classifyInboundSms(keyword).kind).toBe("stop");
    }
  });

  it("recognises CANCEL as stop", () => {
    expect(classifyInboundSms("CANCEL")).toEqual({ kind: "stop" });
  });

  it("recognises QUIT as stop", () => {
    expect(classifyInboundSms("QUIT")).toEqual({ kind: "stop" });
  });

  it("recognises OPT-OUT as stop", () => {
    expect(classifyInboundSms("OPT-OUT")).toEqual({ kind: "stop" });
  });

  it("recognises UNSUBSCRIBE as stop", () => {
    expect(classifyInboundSms("UNSUBSCRIBE")).toEqual({ kind: "stop" });
  });

  it("does NOT treat 'stop' inside a sentence as opt-out", () => {
    // This is the CTIA-recommended behavior — we don't want to
    // accidentally opt users out when they type normal sentences.
    const result = classifyInboundSms("I want to stop by the open house");
    expect(result.kind).toBe("text_only");
  });

  it("recognises START as start intent", () => {
    expect(classifyInboundSms("START")).toEqual({ kind: "start" });
  });

  it("recognises 'start' lowercase", () => {
    expect(classifyInboundSms("start")).toEqual({ kind: "start" });
  });

  it("recognises all START keywords", () => {
    for (const keyword of START_KEYWORDS) {
      expect(classifyInboundSms(keyword).kind).toBe("start");
    }
  });

  it("recognises HELP as help intent", () => {
    expect(classifyInboundSms("HELP")).toEqual({ kind: "help" });
  });

  it("recognises INFO as help intent", () => {
    expect(classifyInboundSms("INFO")).toEqual({ kind: "help" });
  });

  it("recognises all HELP keywords", () => {
    for (const keyword of HELP_KEYWORDS) {
      expect(classifyInboundSms(keyword).kind).toBe("help");
    }
  });
});

// ───────────────────────────────────────────────────────────────────────────
// classifyInboundSms — URLs, empty, text
// ───────────────────────────────────────────────────────────────────────────

describe("classifyInboundSms — URLs and fallbacks", () => {
  it("classifies an empty body as empty", () => {
    expect(classifyInboundSms("")).toEqual({ kind: "empty" });
  });

  it("classifies whitespace-only body as empty", () => {
    expect(classifyInboundSms("   \n  ")).toEqual({ kind: "empty" });
  });

  it("classifies a Zillow URL as url intent", () => {
    const result = classifyInboundSms(
      "https://www.zillow.com/homedetails/Test/12345_zpid/",
    );
    expect(result.kind).toBe("url");
    if (result.kind === "url") {
      expect(result.url).toContain("zillow.com");
    }
  });

  it("classifies a Redfin URL as url intent", () => {
    const result = classifyInboundSms(
      "https://www.redfin.com/FL/Miami/home/99999",
    );
    expect(result.kind).toBe("url");
  });

  it("classifies URL surrounded by text as url intent", () => {
    const result = classifyInboundSms(
      "check out this place https://zillow.com/homedetails/Test/12345_zpid/ super nice",
    );
    expect(result.kind).toBe("url");
    if (result.kind === "url") {
      expect(result.url).toBe(
        "https://zillow.com/homedetails/Test/12345_zpid/",
      );
    }
  });

  it("classifies random text as text_only", () => {
    const result = classifyInboundSms("hi there");
    expect(result.kind).toBe("text_only");
    if (result.kind === "text_only") {
      expect(result.text).toBe("hi there");
    }
  });

  it("strips trailing whitespace in text_only text", () => {
    const result = classifyInboundSms("  hello world  ");
    if (result.kind === "text_only") {
      expect(result.text).toBe("hello world");
    }
  });
});

// ───────────────────────────────────────────────────────────────────────────
// extractUrl
// ───────────────────────────────────────────────────────────────────────────

describe("extractUrl", () => {
  it("returns null for empty input", () => {
    expect(extractUrl("")).toBeNull();
  });

  it("returns null when no URL present", () => {
    expect(extractUrl("hello there")).toBeNull();
  });

  it("extracts an https URL", () => {
    expect(extractUrl("see https://example.com/foo")).toBe(
      "https://example.com/foo",
    );
  });

  it("extracts an http URL", () => {
    expect(extractUrl("see http://example.com/foo")).toBe(
      "http://example.com/foo",
    );
  });

  it("strips a trailing period", () => {
    expect(extractUrl("visit https://example.com/foo.")).toBe(
      "https://example.com/foo",
    );
  });

  it("strips a trailing comma", () => {
    expect(extractUrl("see https://example.com/foo, it's great")).toBe(
      "https://example.com/foo",
    );
  });

  it("strips multiple trailing punctuation chars", () => {
    expect(extractUrl("what about https://example.com/foo?!")).toBe(
      "https://example.com/foo",
    );
  });

  it("extracts bare zillow.com link without protocol", () => {
    const url = extractUrl(
      "zillow.com/homedetails/Test/12345_zpid/ check it out",
    );
    expect(url).toBe("zillow.com/homedetails/Test/12345_zpid/");
  });

  it("extracts bare www.redfin.com link without protocol", () => {
    const url = extractUrl("www.redfin.com/FL/Miami/home/99999");
    expect(url).toBe("www.redfin.com/FL/Miami/home/99999");
  });

  it("does NOT extract bare example.com as a URL", () => {
    // Only the supported real-estate portals get the protocol-less
    // treatment — random domains are not URLs for our purposes.
    expect(extractUrl("example.com foo")).toBeNull();
  });

  it("prefers protocol URL over bare portal when both present", () => {
    const url = extractUrl(
      "first https://zillow.com/a then also redfin.com/b",
    );
    expect(url).toBe("https://zillow.com/a");
  });
});

// ───────────────────────────────────────────────────────────────────────────
// normalizePhone
// ───────────────────────────────────────────────────────────────────────────

describe("normalizePhone", () => {
  it("normalizes a 10-digit US number", () => {
    expect(normalizePhone("3055551234")).toBe("+13055551234");
  });

  it("normalizes a hyphenated US number", () => {
    expect(normalizePhone("305-555-1234")).toBe("+13055551234");
  });

  it("normalizes a parenthesized US number", () => {
    expect(normalizePhone("(305) 555-1234")).toBe("+13055551234");
  });

  it("normalizes a dotted US number", () => {
    expect(normalizePhone("305.555.1234")).toBe("+13055551234");
  });

  it("normalizes a spaced US number", () => {
    expect(normalizePhone("305 555 1234")).toBe("+13055551234");
  });

  it("normalizes 11-digit US with leading 1", () => {
    expect(normalizePhone("13055551234")).toBe("+13055551234");
  });

  it("normalizes +1 prefix", () => {
    expect(normalizePhone("+1 305 555 1234")).toBe("+13055551234");
  });

  it("keeps an international E.164 number", () => {
    expect(normalizePhone("+442071234567")).toBe("+442071234567");
  });

  it("returns null for empty input", () => {
    expect(normalizePhone("")).toBeNull();
  });

  it("returns null for pure whitespace", () => {
    expect(normalizePhone("   ")).toBeNull();
  });

  it("returns null for obvious non-phone text", () => {
    expect(normalizePhone("hello")).toBeNull();
  });

  it("returns null for 7-digit short numbers", () => {
    expect(normalizePhone("555-1234")).toBeNull();
  });

  it("returns null for a +-prefixed number that's too short", () => {
    // E.164 minimum is 8 digits — reject anything shorter.
    expect(normalizePhone("+1234")).toBeNull();
  });

  it("returns null for absurdly long digit strings", () => {
    expect(normalizePhone("+12345678901234567890")).toBeNull();
  });
});

// ───────────────────────────────────────────────────────────────────────────
// hashPhone
// ───────────────────────────────────────────────────────────────────────────

describe("hashPhone", () => {
  it("returns the same hash for the same input", async () => {
    const a = await hashPhone("+13055551234");
    const b = await hashPhone("+13055551234");
    expect(a).toBe(b);
  });

  it("returns different hashes for different inputs", async () => {
    const a = await hashPhone("+13055551234");
    const b = await hashPhone("+13055559999");
    expect(a).not.toBe(b);
  });

  it("returns a 64-character lowercase hex string (SHA-256)", async () => {
    const hash = await hashPhone("+13055551234");
    expect(hash).toMatch(/^[0-9a-f]{64}$/);
  });

  it("does not expose the raw phone number", async () => {
    const phone = "+13055551234";
    const hash = await hashPhone(phone);
    expect(hash).not.toContain("3055551234");
    expect(hash).not.toContain(phone);
  });
});

// ───────────────────────────────────────────────────────────────────────────
// buildSignedLink + verifySignedLink
// ───────────────────────────────────────────────────────────────────────────

const TEST_BASE_URL = "https://app.example.com";
const TEST_SECRET = "shhh-this-is-a-test-secret";

describe("buildSignedLink", () => {
  it("includes the deal room id in the path", async () => {
    const link = await buildSignedLink(
      TEST_BASE_URL,
      "dr_123",
      TEST_SECRET,
      1_700_000_000_000,
    );
    expect(link).toContain("/deal-room/dr_123");
  });

  it("includes the timestamp query param", async () => {
    const link = await buildSignedLink(
      TEST_BASE_URL,
      "dr_123",
      TEST_SECRET,
      1_700_000_000_000,
    );
    expect(link).toContain("t=1700000000000");
  });

  it("includes a hex signature query param", async () => {
    const link = await buildSignedLink(
      TEST_BASE_URL,
      "dr_123",
      TEST_SECRET,
      1_700_000_000_000,
    );
    const match = link.match(/sig=([0-9a-f]+)/);
    expect(match).not.toBeNull();
    expect(match?.[1].length).toBe(64);
  });

  it("produces stable output for same inputs", async () => {
    const ts = 1_700_000_000_000;
    const a = await buildSignedLink(TEST_BASE_URL, "dr_123", TEST_SECRET, ts);
    const b = await buildSignedLink(TEST_BASE_URL, "dr_123", TEST_SECRET, ts);
    expect(a).toBe(b);
  });

  it("normalizes trailing slashes on baseUrl", async () => {
    const a = await buildSignedLink(
      "https://app.example.com/",
      "dr_123",
      TEST_SECRET,
      1_700_000_000_000,
    );
    const b = await buildSignedLink(
      "https://app.example.com",
      "dr_123",
      TEST_SECRET,
      1_700_000_000_000,
    );
    expect(a).toBe(b);
  });

  it("uses current time when timestamp is omitted", async () => {
    const before = Date.now();
    const link = await buildSignedLink(TEST_BASE_URL, "dr_x", TEST_SECRET);
    const after = Date.now();
    const match = link.match(/t=(\d+)/);
    expect(match).not.toBeNull();
    if (match) {
      const ts = Number(match[1]);
      expect(ts).toBeGreaterThanOrEqual(before);
      expect(ts).toBeLessThanOrEqual(after);
    }
  });
});

describe("verifySignedLink", () => {
  it("verifies a freshly built link", async () => {
    const link = await buildSignedLink(TEST_BASE_URL, "dr_abc", TEST_SECRET);
    const result = await verifySignedLink(link, TEST_SECRET);
    expect(result.valid).toBe(true);
    if (result.valid) {
      expect(result.dealRoomId).toBe("dr_abc");
    }
  });

  it("rejects a link with a tampered deal room id", async () => {
    const link = await buildSignedLink(TEST_BASE_URL, "dr_abc", TEST_SECRET);
    const tampered = link.replace("/deal-room/dr_abc", "/deal-room/dr_evil");
    const result = await verifySignedLink(tampered, TEST_SECRET);
    expect(result.valid).toBe(false);
    if (!result.valid) {
      expect(result.reason).toBe("bad_signature");
    }
  });

  it("rejects a link with a tampered timestamp", async () => {
    // Use a recent timestamp so the expiry check does NOT fire before
    // the signature check — we're specifically testing that flipping a
    // digit in the timestamp invalidates the HMAC.
    const ts = Date.now() - 1000;
    const link = await buildSignedLink(
      TEST_BASE_URL,
      "dr_abc",
      TEST_SECRET,
      ts,
    );
    const tampered = link.replace(`t=${ts}`, `t=${ts + 1}`);
    const result = await verifySignedLink(tampered, TEST_SECRET);
    expect(result.valid).toBe(false);
    if (!result.valid) {
      expect(result.reason).toBe("bad_signature");
    }
  });

  it("rejects a link signed with a different secret", async () => {
    const link = await buildSignedLink(TEST_BASE_URL, "dr_abc", "secret-a");
    const result = await verifySignedLink(link, "secret-b");
    expect(result.valid).toBe(false);
    if (!result.valid) {
      expect(result.reason).toBe("bad_signature");
    }
  });

  it("rejects an expired link", async () => {
    const expiredTs = Date.now() - 8 * 24 * 60 * 60 * 1000; // 8 days ago
    const link = await buildSignedLink(
      TEST_BASE_URL,
      "dr_abc",
      TEST_SECRET,
      expiredTs,
    );
    const result = await verifySignedLink(link, TEST_SECRET);
    expect(result.valid).toBe(false);
    if (!result.valid) {
      expect(result.reason).toBe("expired");
    }
  });

  it("accepts a link within custom max age window", async () => {
    const recentTs = Date.now() - 1000;
    const link = await buildSignedLink(
      TEST_BASE_URL,
      "dr_abc",
      TEST_SECRET,
      recentTs,
    );
    const result = await verifySignedLink(link, TEST_SECRET, 60_000);
    expect(result.valid).toBe(true);
  });

  it("rejects a link that exceeds a custom shorter max age", async () => {
    // 5 seconds ago, with a 1-second max age
    const ts = Date.now() - 5000;
    const link = await buildSignedLink(
      TEST_BASE_URL,
      "dr_abc",
      TEST_SECRET,
      ts,
    );
    const result = await verifySignedLink(link, TEST_SECRET, 1000);
    expect(result.valid).toBe(false);
    if (!result.valid) {
      expect(result.reason).toBe("expired");
    }
  });

  it("rejects a malformed URL", async () => {
    const result = await verifySignedLink("not-a-url", TEST_SECRET);
    expect(result.valid).toBe(false);
    if (!result.valid) {
      expect(result.reason).toBe("malformed_url");
    }
  });

  it("rejects a URL with no sig param", async () => {
    const result = await verifySignedLink(
      "https://app.example.com/deal-room/dr_abc?t=1700000000000",
      TEST_SECRET,
    );
    expect(result.valid).toBe(false);
    if (!result.valid) {
      expect(result.reason).toBe("missing_params");
    }
  });

  it("rejects a URL with no timestamp param", async () => {
    const result = await verifySignedLink(
      "https://app.example.com/deal-room/dr_abc?sig=abc",
      TEST_SECRET,
    );
    expect(result.valid).toBe(false);
    if (!result.valid) {
      expect(result.reason).toBe("missing_params");
    }
  });

  it("rejects a URL with a future timestamp (tampering)", async () => {
    const futureTs = Date.now() + 10 * 60_000; // 10 minutes in the future
    const link = await buildSignedLink(
      TEST_BASE_URL,
      "dr_abc",
      TEST_SECRET,
      futureTs,
    );
    const result = await verifySignedLink(link, TEST_SECRET);
    expect(result.valid).toBe(false);
    if (!result.valid) {
      expect(result.reason).toBe("future");
    }
  });

  it("rejects a URL without a deal-room segment in the path", async () => {
    const result = await verifySignedLink(
      "https://app.example.com/other/path?t=1&sig=abc",
      TEST_SECRET,
    );
    expect(result.valid).toBe(false);
    if (!result.valid) {
      expect(result.reason).toBe("missing_deal_room");
    }
  });

  it("rejects a URL with non-numeric timestamp", async () => {
    const result = await verifySignedLink(
      "https://app.example.com/deal-room/dr_abc?t=nope&sig=abc",
      TEST_SECRET,
    );
    expect(result.valid).toBe(false);
    if (!result.valid) {
      expect(result.reason).toBe("missing_params");
    }
  });
});
