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
      // Accept both long-form /homedetails/<slug>/<zpid>_zpid/ and
      // short-form /homes/<zpid>_zpid/ URLs. The canonical parser in
      // src/lib/intake/parser.ts treats both as valid listings, so the
      // badge must match — otherwise valid Zillow links would never
      // trigger the ✓ badge and users couldn't save them.
      return /_zpid/.test(path) && /\/(homedetails|homes)\//.test(path);
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

async function submitExtensionIntake(rawUrl, buyerV2BaseUrl, accessToken) {
  const baseUrl = buyerV2BaseUrl.replace(/\/$/, "");
  const response = await fetch(`${baseUrl}/api/extension/intake`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      ...(accessToken ? { Authorization: `Bearer ${accessToken}` } : {}),
    },
    credentials: "include",
    body: JSON.stringify({ url: rawUrl }),
  });

  return await response.json();
}

/**
 * Popup (or internal test harness) sends a "forward" message with the
 * current tab URL. The background worker submits that raw URL to the
 * shared buyer-v2 intake API, which canonicalizes it, resolves duplicate
 * vs new intake state, and returns the landing URL to open.
 */
chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  if (message?.type === "forward_to_intake" && typeof message.url === "string") {
    const baseUrl = message.buyerV2BaseUrl || "https://buyer-v2.app";
    submitExtensionIntake(message.url, baseUrl, message.accessToken).then(
      (result) => {
        if (!result?.ok || typeof result.redirectUrl !== "string") {
          sendResponse({
            ok: false,
            code: result?.code || "backend_unavailable",
            error: result?.error || "Extension intake failed.",
          });
          return;
        }

        chrome.tabs.create({ url: result.redirectUrl }).then(
          (tab) =>
            sendResponse({
              ok: true,
              tabId: tab.id,
              result: result.kind,
              authState: result.authState,
            }),
          (err) =>
            sendResponse({
              ok: false,
              code: "backend_unavailable",
              error: String(err),
            }),
        );
      },
      (err) =>
        sendResponse({
          ok: false,
          code: "backend_unavailable",
          error: String(err),
        }),
    );
    // Return true to indicate an async response.
    return true;
  }
  return false;
});
