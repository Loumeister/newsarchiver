const fs = require('fs');
const path = require('path');
const config = require('./config');
const { archiveUrl } = require('./archiver');
const { renderHomePage } = require('./template');

function registerRoutes(app) {
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

    try {
      new URL(url);
    } catch {
      return res.status(400).json({ error: 'Invalid URL' });
    }

    try {
      const { snapshotId } = await archiveUrl(url);

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

  // ─── GET /snap/:id/download — Download snapshot as HTML ─────────────────
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

      try {
        const { snapshotId } = await archiveUrl(url);
        res.redirect(`/snap/${snapshotId}`);
      } catch (err) {
        res.status(500).send(`Proxy error: ${err.message}`);
      }
    });
  }
}

module.exports = { registerRoutes };
