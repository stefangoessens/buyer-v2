// ═══════════════════════════════════════════════════════════════════════════
// buyer-v2 Chrome Extension — Background Service Worker (KIN-816)
//
// Detects supported real estate listing pages (Zillow / Redfin / Realtor.com)
// and updates the action badge so the user knows when the "Save to buyer-v2"
// CTA is available.
//
// This script is plain JavaScript because Chrome extensions load modules
// from disk without a bundler step. The pure TypeScript detection logic
// lives in `src/lib/extension/detect-listing.ts` and is duplicated here as
// JavaScript so both the extension and the test suite can share the same
// detection rules. Keep them in sync — the test file covers the logic
// that matters; this file is a thin runtime wrapper.
//
// A future iteration will introduce a proper build step (e.g. esbuild) so
// the extension loads the compiled TS directly. For v1, the duplication is
// deliberate and narrow.
// ═══════════════════════════════════════════════════════════════════════════

/** @type {readonly string[]} */
const SUPPORTED_HOSTS = ["zillow.com", "redfin.com", "realtor.com"];

/**
 * Lightweight host check — answers "should we even try to parse?" before
 * running the full URL detection. Returns the portal short name if matched.
 * @param {string} hostname
 * @returns {"zillow" | "redfin" | "realtor" | null}
 */
function matchPortalHost(hostname) {
  const lower = hostname.toLowerCase();
  if (lower === "zillow.com" || lower.endsWith(".zillow.com")) return "zillow";
  if (lower === "redfin.com" || lower.endsWith(".redfin.com")) return "redfin";
  if (lower === "realtor.com" || lower.endsWith(".realtor.com")) return "realtor";
  return null;
}

/**
 * Does this URL look like a specific listing page (not just a portal
 * homepage / search results / city index)?
 * @param {URL} url
 * @param {"zillow" | "redfin" | "realtor"} portal
 */
function looksLikeListing(url, portal) {
  const path = url.pathname;
  switch (portal) {
    case "zillow":
      // Zillow listings: /homedetails/<slug>/<zpid>_zpid/
      return /\/homedetails\//.test(path) && /_zpid/.test(path);
    case "redfin":
      // Redfin listings: /<state>/<city>/<slug>/home/<id>
      return /\/home\/\d+/.test(path);
    case "realtor":
      // Realtor.com listings: /realestateandhomes-detail/<slug>_M<id>-<id>
      return /\/realestateandhomes-detail\//.test(path);
  }
}

/**
 * Update the extension action badge based on the current tab's URL.
 * Green check = supported listing ready to save. Gray = not a listing.
 * @param {number} tabId
 * @param {string | undefined} url
 */
async function updateBadgeForTab(tabId, url) {
  if (!url) {
    await chrome.action.setBadgeText({ tabId, text: "" });
    return;
  }

  try {
    const parsed = new URL(url);
    const portal = matchPortalHost(parsed.hostname);
    if (portal && looksLikeListing(parsed, portal)) {
      await chrome.action.setBadgeText({ tabId, text: "✓" });
      await chrome.action.setBadgeBackgroundColor({
        tabId,
        color: "#10b981", // tailwind emerald-500
      });
    } else {
      await chrome.action.setBadgeText({ tabId, text: "" });
    }
  } catch {
    // Non-URL (e.g. chrome://newtab) — clear the badge.
    await chrome.action.setBadgeText({ tabId, text: "" });
  }
}

// Update badge when the active tab changes.
chrome.tabs.onActivated.addListener(async ({ tabId }) => {
  const tab = await chrome.tabs.get(tabId);
  await updateBadgeForTab(tabId, tab.url);
});

// Update badge when the tab finishes loading or URL changes.
chrome.tabs.onUpdated.addListener((tabId, changeInfo, tab) => {
  if (changeInfo.status === "complete" || changeInfo.url) {
    updateBadgeForTab(tabId, tab.url);
  }
});

/**
 * Popup (or internal test harness) sends a "forward" message with the
 * current tab URL. The background worker builds the intake forward URL
 * and opens it in a new tab. This keeps the forward logic out of the
 * popup so content security policies don't block `window.open` calls.
 */
chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  if (message?.type === "forward_to_intake" && typeof message.url === "string") {
    const baseUrl = message.buyerV2BaseUrl || "https://buyer-v2.app";
    const encoded = encodeURIComponent(message.url);
    const target = `${baseUrl.replace(/\/$/, "")}/intake?url=${encoded}&source=extension`;
    chrome.tabs.create({ url: target }).then(
      (tab) => sendResponse({ ok: true, tabId: tab.id }),
      (err) => sendResponse({ ok: false, error: String(err) }),
    );
    // Return true to indicate an async response.
    return true;
  }
  return false;
});
