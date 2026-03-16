# newsarchive

A locally hosted web service that creates self-contained HTML snapshots of news articles — functionally equivalent to [archive.is](https://archive.is), but running on your own machine.

## How it works

1. **Fetches the page** using a headless Chromium browser (Playwright), executing JavaScript and waiting for the DOM to stabilise
2. **Downloads all assets** (images, CSS, fonts) and stores them locally with content-addressed SHA-1 filenames
3. **Rewrites the HTML** — inlines CSS, rewrites all asset URLs to local paths, strips scripts/trackers/ads, removes paywall overlays
4. **Serves the snapshot** as a self-contained page with an archive toolbar, screenshot, and metadata

## Quick start

```bash
# Install dependencies
npm install

# Install Chromium for Playwright
npm run setup

# Start the server
npm start
```

Then open [http://localhost:3000](http://localhost:3000) and paste an article URL.

## API

| Method | Path | Description |
|--------|------|-------------|
| `GET /` | Landing page with submission form |
| `POST /archive` | `{ "url": "..." }` — trigger snapshot, returns `{ id, url }` |
| `GET /snap/:id` | Serve the archived HTML snapshot |
| `GET /snap/:id/screenshot` | Serve the full-page screenshot |
| `GET /snap/:id/meta` | Serve snapshot metadata (JSON) |
| `GET /snap/:id/download` | Download the snapshot HTML file |
| `GET /snapshots` | List all snapshots (JSON) |
| `GET /assets/:id/:file` | Serve a stored asset |

## Configuration

Copy `.env.example` to `.env` and adjust:

| Variable | Default | Description |
|----------|---------|-------------|
| `PORT` | `3000` | Server port |
| `HEADLESS` | `true` | Set `false` to watch the browser |
| `WAIT_STRATEGY` | `networkidle` | Or `domcontentloaded` for faster captures |
| `TIMEOUT_MS` | `15000` | Page load timeout |
| `KEEP_SCRIPTS` | `false` | Keep inline scripts (risky) |
| `PROXY_LINKS` | `false` | Enable `/proxy?url=` endpoint for link following |
| `COOKIES_FILE` | — | Path to a JSON file with session cookies |

### Session cookies

To archive paywalled content you have a subscription for, export your session cookies as JSON:

```json
[
  { "name": "session_id", "value": "abc123", "domain": ".example.com", "path": "/" }
]
```

Save as `cookies.json` and set `COOKIES_FILE=./cookies.json` in `.env`.

## Storage layout

```
data/
  snapshots/<id>/
    index.html        # rewritten HTML snapshot
    screenshot.png    # full-page screenshot
    meta.json         # { id, originalUrl, timestamp, title }
  assets/<id>/
    <sha1>.css
    <sha1>.woff2
    <sha1>.webp
    ...
```

## Legal disclaimer

**This tool is intended for personal archival and research purposes only.** Bypassing paywalls may violate the terms of service of the archived website and/or applicable laws in your jurisdiction. The user assumes all responsibility for how this tool is used. The authors of this software do not encourage or condone any unlawful use.
