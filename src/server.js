const express = require('express');
const fs = require('fs');
const path = require('path');
const config = require('./config');
const { fetchPage } = require('./fetcher');
const { collectAssetUrls, fetchAllAssets } = require('./assets');
const { rewriteHtml } = require('./rewriter');

const app = express();
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Serve static assets from the data directory
app.use('/assets', express.static(path.join(config.dataDir, 'assets'), {
  maxAge: '1y',
  immutable: true,
}));

// ─── GET / — Landing page with submission form ──────────────────────────

app.get('/', (req, res) => {
  const snapshotsDir = path.join(config.dataDir, 'snapshots');
  let snapshots = [];
  if (fs.existsSync(snapshotsDir)) {
    const dirs = fs.readdirSync(snapshotsDir).filter(d =>
      fs.existsSync(path.join(snapshotsDir, d, 'meta.json'))
    );
    snapshots = dirs.map(d => {
      const meta = JSON.parse(fs.readFileSync(path.join(snapshotsDir, d, 'meta.json'), 'utf-8'));
      return meta;
    }).sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));
  }

  res.type('html').send(renderHomePage(snapshots));
});

// ─── POST /archive — Trigger snapshot pipeline ─────────────────────────

app.post('/archive', async (req, res) => {
  const url = req.body.url;
  if (!url) {
    return res.status(400).json({ error: 'Missing "url" parameter' });
  }

  // Validate URL
  try {
    new URL(url);
  } catch {
    return res.status(400).json({ error: 'Invalid URL' });
  }

  try {
    console.log(`[archive] Starting snapshot of: ${url}`);

    // Step 1: Fetch with headless browser
    console.log('[archive] Step 1/4: Fetching page with headless browser...');
    const { html, screenshot, title, snapshotId } = await fetchPage(url);

    // Step 2: Collect and fetch assets
    console.log('[archive] Step 2/4: Collecting and fetching assets...');
    const assetUrls = collectAssetUrls(html, url);
    console.log(`[archive]   Found ${assetUrls.length} assets`);
    const assetMap = await fetchAllAssets(assetUrls, snapshotId);
    console.log(`[archive]   Successfully fetched ${assetMap.size} assets`);

    // Step 3: Rewrite HTML
    console.log('[archive] Step 3/4: Rewriting HTML...');
    const timestamp = new Date().toISOString();
    const rewrittenHtml = rewriteHtml(html, assetMap, snapshotId, url, timestamp, config.port);

    // Step 4: Save snapshot
    console.log('[archive] Step 4/4: Saving snapshot...');
    const snapDir = path.join(config.dataDir, 'snapshots', snapshotId);
    fs.mkdirSync(snapDir, { recursive: true });
    fs.writeFileSync(path.join(snapDir, 'index.html'), rewrittenHtml);
    fs.writeFileSync(path.join(snapDir, 'screenshot.png'), screenshot);
    fs.writeFileSync(path.join(snapDir, 'meta.json'), JSON.stringify({
      id: snapshotId,
      originalUrl: url,
      timestamp,
      title: title || '',
    }, null, 2));

    console.log(`[archive] Done! Snapshot ID: ${snapshotId}`);

    // If request came from a form, redirect to the snapshot
    if (req.headers['content-type']?.includes('application/x-www-form-urlencoded')) {
      return res.redirect(`/snap/${snapshotId}`);
    }

    res.json({ id: snapshotId, url: `/snap/${snapshotId}` });
  } catch (err) {
    console.error('[archive] Error:', err);
    res.status(500).json({ error: err.message });
  }
});

// ─── GET /snap/:id — Serve snapshot HTML ────────────────────────────────

app.get('/snap/:id', (req, res) => {
  const htmlPath = path.join(config.dataDir, 'snapshots', req.params.id, 'index.html');
  if (!fs.existsSync(htmlPath)) {
    return res.status(404).send('Snapshot not found');
  }
  res.type('html').sendFile(htmlPath);
});

// ─── GET /snap/:id/screenshot — Serve screenshot ───────────────────────

app.get('/snap/:id/screenshot', (req, res) => {
  const pngPath = path.join(config.dataDir, 'snapshots', req.params.id, 'screenshot.png');
  if (!fs.existsSync(pngPath)) {
    return res.status(404).send('Screenshot not found');
  }
  res.type('png').sendFile(pngPath);
});

// ─── GET /snap/:id/meta — Serve metadata ───────────────────────────────

app.get('/snap/:id/meta', (req, res) => {
  const metaPath = path.join(config.dataDir, 'snapshots', req.params.id, 'meta.json');
  if (!fs.existsSync(metaPath)) {
    return res.status(404).send('Metadata not found');
  }
  res.type('json').sendFile(metaPath);
});

// ─── GET /snap/:id/download — Download snapshot as zip ──────────────────

app.get('/snap/:id/download', (req, res) => {
  const snapDir = path.join(config.dataDir, 'snapshots', req.params.id);
  const htmlPath = path.join(snapDir, 'index.html');
  if (!fs.existsSync(htmlPath)) {
    return res.status(404).send('Snapshot not found');
  }
  res.download(htmlPath, `snapshot-${req.params.id}.html`);
});

// ─── GET /snapshots — List all snapshots ────────────────────────────────

app.get('/snapshots', (req, res) => {
  const snapshotsDir = path.join(config.dataDir, 'snapshots');
  if (!fs.existsSync(snapshotsDir)) {
    return res.json([]);
  }

  const dirs = fs.readdirSync(snapshotsDir).filter(d =>
    fs.existsSync(path.join(snapshotsDir, d, 'meta.json'))
  );
  const snapshots = dirs.map(d => {
    return JSON.parse(fs.readFileSync(path.join(snapshotsDir, d, 'meta.json'), 'utf-8'));
  }).sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));

  res.json(snapshots);
});

// ─── GET /proxy — Optional live proxy endpoint ──────────────────────────

if (config.proxyLinks) {
  app.get('/proxy', async (req, res) => {
    const url = req.query.url;
    if (!url) {
      return res.status(400).send('Missing "url" query parameter');
    }
    try {
      new URL(url);
    } catch {
      return res.status(400).send('Invalid URL');
    }

    // Re-run the archive pipeline for the linked page
    try {
      const { html, screenshot, title, snapshotId } = await fetchPage(url);
      const assetUrls = collectAssetUrls(html, url);
      const assetMap = await fetchAllAssets(assetUrls, snapshotId);
      const timestamp = new Date().toISOString();
      const rewrittenHtml = rewriteHtml(html, assetMap, snapshotId, url, timestamp, config.port);

      const snapDir = path.join(config.dataDir, 'snapshots', snapshotId);
      fs.mkdirSync(snapDir, { recursive: true });
      fs.writeFileSync(path.join(snapDir, 'index.html'), rewrittenHtml);
      fs.writeFileSync(path.join(snapDir, 'screenshot.png'), screenshot);
      fs.writeFileSync(path.join(snapDir, 'meta.json'), JSON.stringify({
        id: snapshotId, originalUrl: url, timestamp, title: title || '',
      }, null, 2));

      res.redirect(`/snap/${snapshotId}`);
    } catch (err) {
      res.status(500).send(`Proxy error: ${err.message}`);
    }
  });
}

// ─── Start server ───────────────────────────────────────────────────────

app.listen(config.port, () => {
  console.log(`newsarchive server running on http://localhost:${config.port}`);
  console.log(`  Headless: ${config.headless}`);
  console.log(`  Wait strategy: ${config.waitStrategy}`);
  console.log(`  Keep scripts: ${config.keepScripts}`);
  console.log(`  Proxy links: ${config.proxyLinks}`);
});

// ─── Home page HTML ─────────────────────────────────────────────────────

function renderHomePage(snapshots) {
  const snapshotRows = snapshots.map(s => `
    <tr>
      <td><a href="/snap/${esc(s.id)}">${esc(s.id)}</a></td>
      <td title="${esc(s.originalUrl)}" style="max-width:400px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">
        <a href="${esc(s.originalUrl)}" target="_blank">${esc(s.title || s.originalUrl)}</a>
      </td>
      <td>${esc(new Date(s.timestamp).toLocaleString())}</td>
      <td>
        <a href="/snap/${esc(s.id)}/screenshot">img</a> |
        <a href="/snap/${esc(s.id)}/meta">meta</a> |
        <a href="/snap/${esc(s.id)}/download">dl</a>
      </td>
    </tr>
  `).join('');

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>newsarchive</title>
  <style>
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body {
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', sans-serif;
      background: #0d1117;
      color: #c9d1d9;
      min-height: 100vh;
    }
    .container { max-width: 800px; margin: 0 auto; padding: 48px 24px; }
    h1 { font-size: 28px; color: #7c83ff; margin-bottom: 8px; }
    .subtitle { color: #8b949e; margin-bottom: 32px; font-size: 14px; }
    .card {
      background: #161b22;
      border: 1px solid #30363d;
      border-radius: 8px;
      padding: 24px;
      margin-bottom: 24px;
    }
    .form-group { margin-bottom: 16px; }
    label { display: block; font-size: 14px; color: #8b949e; margin-bottom: 6px; }
    input[type="text"] {
      width: 100%;
      padding: 10px 14px;
      background: #0d1117;
      border: 1px solid #30363d;
      border-radius: 6px;
      color: #c9d1d9;
      font-size: 15px;
      outline: none;
      transition: border-color 0.2s;
    }
    input[type="text"]:focus { border-color: #7c83ff; }
    button {
      background: #7c83ff;
      color: #fff;
      border: none;
      padding: 10px 24px;
      border-radius: 6px;
      font-size: 15px;
      cursor: pointer;
      transition: background 0.2s;
    }
    button:hover { background: #6a71e0; }
    button:disabled { opacity: 0.6; cursor: not-allowed; }
    .spinner { display: none; margin-left: 8px; }
    .loading .spinner { display: inline-block; }
    .loading button { pointer-events: none; opacity: 0.6; }
    table { width: 100%; border-collapse: collapse; font-size: 14px; }
    th { text-align: left; color: #8b949e; padding: 8px 12px; border-bottom: 1px solid #30363d; }
    td { padding: 8px 12px; border-bottom: 1px solid #21262d; }
    a { color: #58a6ff; text-decoration: none; }
    a:hover { text-decoration: underline; }
    .empty { color: #484f58; text-align: center; padding: 24px; font-style: italic; }
    .disclaimer {
      margin-top: 48px;
      padding: 16px;
      background: #1c1e26;
      border: 1px solid #30363d;
      border-radius: 6px;
      font-size: 12px;
      color: #6e7681;
      line-height: 1.5;
    }
  </style>
</head>
<body>
  <div class="container">
    <h1>newsarchive</h1>
    <p class="subtitle">Self-hosted news article archiver — create local, self-contained snapshots of web pages.</p>

    <div class="card" id="form-card">
      <form method="POST" action="/archive" id="archive-form">
        <div class="form-group">
          <label for="url">Article URL</label>
          <input type="text" id="url" name="url" placeholder="https://www.example.com/article..." required>
        </div>
        <button type="submit" id="submit-btn">Archive</button>
        <span class="spinner" id="spinner">Archiving... this may take 15-30 seconds.</span>
      </form>
    </div>

    <div class="card">
      <h2 style="font-size:18px;margin-bottom:16px;">Snapshots</h2>
      ${snapshots.length === 0
        ? '<p class="empty">No snapshots yet. Archive your first article above.</p>'
        : `<table>
            <thead><tr><th>ID</th><th>Title / URL</th><th>Date</th><th>Links</th></tr></thead>
            <tbody>${snapshotRows}</tbody>
          </table>`
      }
    </div>

    <div class="disclaimer">
      <strong>Legal Disclaimer:</strong> This tool is intended for personal archival and research purposes only.
      Bypassing paywalls may violate the terms of service of the archived website and/or applicable laws in your
      jurisdiction. The user assumes all responsibility for how this tool is used. The authors of this software
      do not encourage or condone any unlawful use.
    </div>
  </div>
  <script>
    document.getElementById('archive-form').addEventListener('submit', function() {
      document.getElementById('form-card').classList.add('loading');
      document.getElementById('submit-btn').disabled = true;
      document.getElementById('spinner').style.display = 'inline';
    });
  </script>
</body>
</html>`;
}

function esc(str) {
  if (!str) return '';
  return String(str).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}
