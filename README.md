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

## Chrome Extension

A Chrome extension version is also available that runs entirely in your browser — no server needed. See [extension/README.md](extension/README.md) for installation and usage instructions.

## Recommended Agency Team

For this project, the best-fit "Agency" squad is:

1. **🏗️ Backend Architect** — core value is in reliable fetch/rewrite/storage pipelines, API design, and long-term maintainability of the archiving service.
2. **🔒 Security Engineer** — this app ingests untrusted HTML and assets, so secure sanitization, SSRF hardening, and safe defaults are critical.
3. **🚀 DevOps Automator** — Playwright + Chromium setup, runtime dependencies, and deployment/CI consistency are a major operational concern.
4. **👁️ Code Reviewer** — helps continuously enforce quality around URL rewriting, parser edge-cases, and regression risk in archival fidelity.
5. **📸 Evidence Collector** — snapshot quality is visual/output-driven, so screenshot-backed verification is a natural QA gate.
6. **📚 Technical Writer** — this project benefits from strong user docs (setup, legal constraints, cookie workflows, extension usage).

### Why this mix works

- The product is infrastructure-heavy (fetching, rewriting, storing, serving), so backend + ops + security should lead.
- Success criteria are output correctness and safety, so review + evidence-driven testing reduce regressions.
- Adoption depends on clarity of setup and legal boundaries, so technical documentation is part of product quality.

> Installed locally in this environment at `/.claude/agents`: Backend-Architect, Security-Engineer, DevOps-Automator, Code-Reviewer, Evidence-Collector, Technical-Writer.


## Legal disclaimer

**This tool is intended for personal archival and research purposes only.** Bypassing paywalls may violate the terms of service of the archived website and/or applicable laws in your jurisdiction. The user assumes all responsibility for how this tool is used. The authors of this software do not encourage or condone any unlawful use.
