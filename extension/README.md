# newsarchive — Chrome Extension

A Chrome extension that archives news articles as self-contained HTML snapshots with a single click. Works like [archive.is](https://archive.is), but runs entirely in your browser — no server needed.

## Installation

1. Clone or download this repository
2. Open Chrome and navigate to `chrome://extensions`
3. Enable **Developer mode** (toggle in the top-right corner)
4. Click **Load unpacked**
5. Select the `extension/` directory from this repository
6. The newsarchive icon will appear in your browser toolbar

## Usage

### Archiving an article

1. Navigate to the news article you want to archive
2. Click the **newsarchive** icon in the toolbar
3. Click **Archive this page**
4. Wait 15–30 seconds while the extension captures the page, downloads all assets, and creates a self-contained snapshot
5. When complete, the snapshot appears in the popup's list

### Viewing a snapshot

Click **View** on any snapshot in the popup. The archived article opens in a new tab with:
- All images, fonts, and styles preserved
- Scripts and trackers removed
- A toolbar showing the source URL and archive timestamp

### Downloading a snapshot

Click **Download** to save the snapshot as a standalone `.html` file. This file is fully self-contained — all assets are embedded as data URIs, so it works in any browser without an internet connection.

### Viewing the screenshot

Click **Screenshot** to see the viewport capture taken at archive time.

### Deleting a snapshot

Click **Delete** to permanently remove a snapshot and its associated assets from browser storage.

## Settings

Click **Settings** at the bottom of the popup (or right-click the extension icon → Options) to access:

| Setting | Default | Description |
|---------|---------|-------------|
| Keep inline scripts | Off | Preserve inline JavaScript from the original page. **Warning:** enabling this may re-enable paywalls, trackers, or other unwanted behavior. |
| Block ads & trackers | On | Drop known ad/tracker requests at the network level and hide ad slots on the page. Cleaner browsing and cleaner snapshots. |
| Ad-block allowlist | _empty_ | Domains (one per line) where ad blocking is turned off, including their subdomains. |

## Ad & tracker blocking

The extension ships a built-in ad/tracker blocker, adapted from the
[medoxisto/ad-blocker-chrome-extension](https://github.com/medoxisto/ad-blocker-chrome-extension)
design. It runs in two layers, both kicking in at `document_start` so blocking
happens *before* the page's own scripts execute:

1. **Network layer** — a static [`declarativeNetRequest`](https://developer.chrome.com/docs/extensions/reference/api/declarativeNetRequest)
   ruleset (`adblock/network_rules.json`) drops requests to known ad, analytics,
   and tracker domains (Google Ads, Taboola/Outbrain, Criteo, Scorecard, Hotjar,
   social pixels, and more).

2. **Content layer** — two content scripts, mirroring the upstream MAIN/ISOLATED
   split:
   - `adblock/scriptlets.js` (**MAIN world**) installs quiet no-op stubs for ad
     SDKs (`googletag`, `adsbygoogle`) and common anti-adblock detectors
     (`FuckAdBlock`, `BlockAdBlock`, `canRunAds`, …) so pages render their
     article instead of an "ad blocker detected" wall. It never removes page
     content.
   - `adblock/cosmetic.js` (**ISOLATED world**) hides ad/widget containers with
     an injected stylesheet ("hide first") and strips late-injected ad nodes via
     a short-lived `MutationObserver`. Selectors are conservative (named ad
     slots, not bare `ad` substrings) so article content is never hidden.

Because trackers and ad iframes never load, **archive snapshots come out
cleaner and capture faster**.

Blocking is on by default. Toggle it off globally, or add specific domains to
the **allowlist**, in Settings. Allowlisting a host re-enables ads everywhere on
that site (a high-priority dynamic `allow` rule undoes the network blocks, and
the cosmetic layer pulls its stylesheet back out).

## How it works

1. **Content script** is injected into the active tab. It dismisses paywall/cookie overlays by removing fixed-position elements matching common paywall selectors, then captures the fully-rendered DOM (`document.documentElement.outerHTML`).

2. **Screenshot** is captured using Chrome's `captureVisibleTab` API (visible viewport).

3. **Asset collection** — the captured HTML is parsed to find all external assets: stylesheets, images (including `srcset`), fonts, CSS `url()` references, and media elements.

4. **Asset fetching** — each asset is downloaded, hashed with SHA-1 (via Web Crypto API), and stored in IndexedDB.

5. **HTML rewriting** — the HTML is processed with DOMParser:
   - All `<script>`, `<iframe>`, `<noscript>` tags are removed
   - Tracking pixels and analytics scripts are stripped
   - External CSS is fetched and inlined as `<style>` blocks
   - All asset URLs are replaced with data URIs for self-containment
   - An archive toolbar is injected at the top
   - Archival metadata tags are added

6. **Storage** — the rewritten HTML, screenshot, and metadata are saved to IndexedDB.

## Paywalled articles

If you have a subscription and are **already logged in** to a news site, the extension captures the full article content. This works because the content script reads the live DOM — which already includes the subscriber-only content rendered by the site's JavaScript — and then strips the paywall overlay.

The extension does **not** bypass authentication or inject credentials. It simply captures what is already visible in your browser.

## Limitations

- **Viewport screenshot only** — the screenshot captures only the visible portion of the page, not the full scrollable content
- **Large snapshots** — pages with many high-resolution images may produce large snapshot files (10+ MB) because assets are embedded as data URIs
- **SPA content** — single-page applications that load content lazily may not have all content captured; only what was rendered at capture time is archived
- **Service worker timeouts** — pages with hundreds of assets may cause the service worker to time out on slower connections
- **No full-page scroll capture** — unlike the Node.js version which uses Playwright for full-page screenshots, the extension only captures the visible viewport

## Privacy

This extension:
- Does **not** send any data to external servers
- Does **not** collect analytics or telemetry
- Stores all data locally in your browser's IndexedDB
- Only fetches assets from URLs found in the page you choose to archive
- Requires `<all_urls>` host permission solely to download assets (images, CSS, fonts) from any domain

## Permissions explained

| Permission | Why it's needed |
|------------|----------------|
| `activeTab` | Access the current tab's content when you click "Archive" |
| `scripting` | Inject the content script that captures the page DOM |
| `storage` | Store your settings (keep scripts toggle) |
| `downloads` | Enable the "Download" button to save snapshots as HTML files |
| `tabs` | Capture screenshots and get tab information |
| `declarativeNetRequest` | Block ad/tracker requests and override headers for archival fetches |
| `<all_urls>` | Fetch assets (images, CSS, fonts) from any domain for archiving |

## Legal disclaimer

**This tool is intended for personal archival and research purposes only.** Bypassing paywalls may violate the terms of service of the archived website and/or applicable laws in your jurisdiction. The user assumes all responsibility for how this tool is used. The authors of this software do not encourage or condone any unlawful use.
