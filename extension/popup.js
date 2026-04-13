// ═══════════════════════════════════════════════════════════════════════════
// buyer-v2 Chrome Extension — Popup Controller (KIN-816)
//
// Reads the current tab's URL, runs the same detection rules as the
// background worker, and renders one of five UI states in popup.html:
//
//   1. supported_listing              → green CTA enabled
//   2. supported_portal_no_listing    → CTA disabled, guidance message
//   3. unsupported_portal             → CTA disabled, list supported portals
//   4. empty / invalid / internal     → CTA disabled, neutral message
//
// The popup forwards the click to the background worker via
// `chrome.runtime.sendMessage`, which opens the intake URL in a new tab.
// ═══════════════════════════════════════════════════════════════════════════

/**
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
 * @param {URL} url
 * @param {"zillow" | "redfin" | "realtor"} portal
 */
function looksLikeListing(url, portal) {
  const path = url.pathname;
  switch (portal) {
    case "zillow":
      // Accept both /homedetails/<slug>/<zpid>_zpid/ and the shorter
      // /homes/<zpid>_zpid/ URLs. The canonical parser in
      // src/lib/intake/parser.ts treats both as valid listings, so the
      // extension badge and popup must match — otherwise a user can't
      // save a link the backend would otherwise accept.
      return /_zpid/.test(path) && /\/(homedetails|homes)\//.test(path);
    case "redfin":
      return /\/home\/\d+/.test(path);
    case "realtor":
      return /\/realestateandhomes-detail\//.test(path);
  }
}

/**
 * @param {string | undefined} url
 * @returns {{ status: "supported" | "no_listing" | "unsupported" | "empty"; portal?: "zillow" | "redfin" | "realtor"; message: string }}
 */
function detect(url) {
  if (!url) return { status: "empty", message: "No URL on the current tab." };
  if (
    url.startsWith("chrome://") ||
    url.startsWith("about:") ||
    url.startsWith("chrome-extension://") ||
    url.startsWith("edge://")
  ) {
    return { status: "empty", message: "Browser internal page." };
  }
  try {
    const parsed = new URL(url);
    const portal = matchPortalHost(parsed.hostname);
    if (!portal) {
      return {
        status: "unsupported",
        message: "Not a supported listing portal. buyer-v2 supports Zillow, Redfin, and Realtor.com.",
      };
    }
    if (looksLikeListing(parsed, portal)) {
      const label =
        portal === "zillow" ? "Zillow" : portal === "redfin" ? "Redfin" : "Realtor.com";
      return {
        status: "supported",
        portal,
        message: `${label} listing detected. Click to save to buyer-v2.`,
      };
    }
    return {
      status: "no_listing",
      portal,
      message: "Open a specific listing page first, then click Save.",
    };
  } catch {
    return { status: "empty", message: "Invalid URL on the current tab." };
  }
}

async function main() {
  const statusEl = document.getElementById("status");
  const saveBtn = /** @type {HTMLButtonElement} */ (document.getElementById("save"));

  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  const result = detect(tab?.url);
  statusEl.textContent = result.message;
  if (result.status === "supported" && tab?.url) {
    saveBtn.disabled = false;
    saveBtn.addEventListener("click", async () => {
      saveBtn.disabled = true;
      saveBtn.textContent = "Opening…";
      const response = await chrome.runtime.sendMessage({
        type: "forward_to_intake",
        url: tab.url,
        // In a real deploy, this is set via extension options. For v1 we
        // hardcode the production base — devs can swap at load time.
        buyerV2BaseUrl: "https://buyer-v2.app",
      });
      if (response?.ok) {
        if (response.result === "duplicate") {
          statusEl.textContent =
            response.authState === "signed_in"
              ? "Already saved. Opening your buyer-v2 dashboard."
              : "Already saved. Opening buyer-v2 so you can continue.";
        } else if (response.authState === "signed_out") {
          statusEl.textContent =
            "Saved to buyer-v2. Opening the site so you can continue.";
        } else {
          statusEl.textContent = "Saved to buyer-v2. Opening your dashboard.";
        }
      } else {
        if (response?.code === "unsupported_url") {
          statusEl.textContent =
            "This page is not a supported Zillow, Redfin, or Realtor.com listing.";
        } else {
          statusEl.textContent = "Failed to open buyer-v2. Try again.";
        }
        saveBtn.disabled = false;
        saveBtn.textContent = "Save to buyer-v2";
      }
    });
  }
}

main().catch((err) => {
  const statusEl = document.getElementById("status");
  if (statusEl) statusEl.textContent = "Extension error: " + String(err);
});
