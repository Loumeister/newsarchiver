const fs = require('fs');
const path = require('path');
const config = require('./config');
const { fetchPage } = require('./fetcher');
const { collectAssetUrls, fetchAllAssets } = require('./assets');
const { rewriteHtml } = require('./rewriter');

/**
 * Run the full archive pipeline for a URL.
 * Fetches the page, collects and downloads assets, rewrites HTML, and saves to disk.
 *
 * @param {string} url - The URL to archive
 * @returns {Promise<{ snapshotId, title, timestamp }>}
 */
async function archiveUrl(url) {
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

  return { snapshotId, title, timestamp };
}

module.exports = { archiveUrl };
