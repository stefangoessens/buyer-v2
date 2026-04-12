import type { ListingPortal, SearchRecord } from "@/lib/onboarding/types";

const PORTAL_PATTERNS: Array<{
  portal: ListingPortal;
  domains: string[];
  listingId: RegExp;
}> = [
  {
    portal: "zillow",
    domains: ["zillow.com", "www.zillow.com"],
    listingId: /(\d+)_zpid/,
  },
  {
    portal: "redfin",
    domains: ["redfin.com", "www.redfin.com"],
    listingId: /\/home\/(\d+)/,
  },
  {
    portal: "realtor",
    domains: ["realtor.com", "www.realtor.com"],
    listingId: /\/realestateandhomes-detail\/([^/]+)/,
  },
] as const;

const SEARCH_TEMPLATES = [
  {
    address: "1823 Bayshore Drive",
    city: "Miami Beach, FL",
    price: 1385000,
    score: 9.2,
    lastActivity: "Updated 3 minutes ago",
    imageUrl:
      "https://images.unsplash.com/photo-1512917774080-9991f1c4c750?auto=format&fit=crop&w=1200&q=80",
    status: "analysis_ready",
    summary: "Strong waterfront value with high walkability and low flood risk.",
  },
  {
    address: "74 Winter Park Lane",
    city: "Orlando, FL",
    price: 824000,
    score: 8.4,
    lastActivity: "AI leverage refreshed today",
    imageUrl:
      "https://images.unsplash.com/photo-1600607687939-ce8a6c25118c?auto=format&fit=crop&w=1200&q=80",
    status: "watching",
    summary: "Healthy pricing window with room to negotiate against longer DOM.",
  },
  {
    address: "118 Harbor Palm Court",
    city: "Tampa, FL",
    price: 965000,
    score: 7.8,
    lastActivity: "New comp set added",
    imageUrl:
      "https://images.unsplash.com/photo-1600585154526-990dced4db0d?auto=format&fit=crop&w=1200&q=80",
    status: "needs_review",
    summary: "Comp set widened after a price cut. Good upside with inspection leverage.",
  },
  {
    address: "903 Coral Ridge Avenue",
    city: "Fort Lauderdale, FL",
    price: 1175000,
    score: 8.9,
    lastActivity: "Broker note added this afternoon",
    imageUrl:
      "https://images.unsplash.com/photo-1600573472550-8090b5e0745e?auto=format&fit=crop&w=1200&q=80",
    status: "analysis_ready",
    summary: "Premium renovation quality and clean disclosures keep risk low.",
  },
] as const satisfies ReadonlyArray<
  Omit<SearchRecord, "id" | "propertyId" | "listingUrl" | "portal">
>;

function hashString(input: string) {
  let hash = 0;
  for (const character of input) {
    hash = (hash * 31 + character.charCodeAt(0)) % 2147483647;
  }
  return Math.abs(hash);
}

function parseSupportedUrl(rawUrl: string): {
  url: URL;
  portal: ListingPortal;
  listingToken: string;
} | null {
  try {
    const normalized = rawUrl.trim().startsWith("http")
      ? rawUrl.trim()
      : `https://${rawUrl.trim()}`;
    const url = new URL(normalized);
    const hostname = url.hostname.toLowerCase();

    for (const portalPattern of PORTAL_PATTERNS) {
      if (!portalPattern.domains.includes(hostname)) continue;

      const listingMatch = url.pathname.match(portalPattern.listingId);
      if (!listingMatch) return null;

      return {
        url,
        portal: portalPattern.portal,
        listingToken: listingMatch[1]?.toLowerCase() ?? "listing",
      };
    }
  } catch {
    return null;
  }

  return null;
}

export function isSupportedListingUrl(rawUrl: string) {
  return parseSupportedUrl(rawUrl) !== null;
}

export function createSearchPreviewFromUrl(rawUrl: string): SearchRecord | null {
  const parsed = parseSupportedUrl(rawUrl);
  if (!parsed) return null;

  const template = SEARCH_TEMPLATES[hashString(parsed.url.href) % SEARCH_TEMPLATES.length];
  const propertyId = `${parsed.portal}-${parsed.listingToken}`.replace(/[^a-z0-9-]/g, "-");

  return {
    id: `search-${propertyId}`,
    propertyId,
    listingUrl: parsed.url.href,
    portal: parsed.portal,
    ...template,
  };
}

