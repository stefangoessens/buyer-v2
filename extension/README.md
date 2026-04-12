# buyer-v2 Chrome Extension (KIN-816)

Chrome extension v1 for forwarding supported real estate listing pages into the buyer-v2 intake flow.

## What it does

- Detects Zillow, Redfin, and Realtor.com listing pages in the active tab
- Shows a green ✓ badge on the extension icon when a listing is detected
- Popup offers a "Save to buyer-v2" CTA that opens the intake flow in a new tab

## Load in Chrome

1. Go to `chrome://extensions`
2. Enable "Developer mode" (top right)
3. Click "Load unpacked"
4. Select this `extension/` directory

The extension will register for `zillow.com`, `redfin.com`, and `realtor.com` host permissions. The popup reads `tab.url` via `activeTab`, no content scripts are injected.

## How detection works

- **Pure TypeScript source**: `src/lib/extension/detect-listing.ts` reuses the canonical `parseListingUrl` from KIN-774 so portal rules live in exactly one place. This is covered by `src/__tests__/lib/extension/detect-listing.test.ts`.
- **Extension runtime**: `extension/background.js` and `extension/popup.js` duplicate the minimal host + path matching logic in plain JavaScript so the extension can load without a bundler. They're deliberately narrow — just enough to decide "show ✓ badge" and "enable Save button". Full parsing is delegated to the backend intake flow, which is the source of truth.

## Forwarding contract

Clicking the Save button sends a `forward_to_intake` message to the service worker, which opens:

```
{buyerV2BaseUrl}/intake?url={encoded_listing_url}&source=extension
```

- `buyerV2BaseUrl` defaults to `https://buyer-v2.app` (dev users edit `popup.js` to point at `localhost:3000` during local testing)
- `source=extension` feeds the KIN-860 analytics taxonomy so funnel attribution works correctly
- The intake web flow (served by the Next.js app) handles signed-in / signed-out / duplicate routing — the extension does not know or care which branch the user ends up in

## File layout

```
extension/
├── manifest.json         # Manifest v3, host permissions + action popup
├── background.js         # Service worker: badge updates + forward handler
├── popup.html            # Popup UI shell
├── popup.js              # Popup controller: detection + click handler
├── icons/                # Action icons (16/48/128 — TODO: generate)
└── README.md             # This file
```

## Testing

- **Detection logic**: `pnpm test -- detect-listing` runs the TS unit tests (26 cases).
- **Extension runtime**: manually load the unpacked extension per the steps above and navigate to a supported listing. Automated Chrome extension tests are out of scope for v1.

## Out of scope for v1

- Content scripts (no DOM access required — URL alone is enough)
- Background sync / offline queueing
- Options page (buyerV2BaseUrl is hardcoded; will become configurable in v2)
- Firefox / Edge parity (Manifest v3 works on Edge; Firefox needs a separate manifest)
- Custom icons — manifest omits `icons` / `default_icon` in v1 so the extension loads with Chrome's default puzzle-piece icon. Branded icons are a design follow-up (need 16/48/128 PNG exports of the buyer-v2 logo).

Follow-ups tracked under the same parent epic (KIN-743 Intake umbrella).
