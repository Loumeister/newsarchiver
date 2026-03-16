const cheerio = require('cheerio');
const crypto = require('crypto');
const fetch = require('node-fetch');
const fs = require('fs');
const path = require('path');
const mime = require('mime-types');
const { URL } = require('url');
const config = require('./config');
const { parseSrcset } = require('./shared/utils');

/**
 * Collect all asset URLs from the rendered HTML.
 * Returns an array of absolute URL strings.
 */
function collectAssetUrls(html, baseUrl) {
  const $ = cheerio.load(html);
  const urls = new Set();

  // Helper to resolve and add a URL
  function addUrl(rawUrl) {
    if (!rawUrl || rawUrl.startsWith('data:') || rawUrl.startsWith('javascript:')) return;
    try {
      const absolute = new URL(rawUrl, baseUrl).href;
      urls.add(absolute);
    } catch {
      // Invalid URL, skip
    }
  }

  // <link rel="stylesheet" href="...">
  $('link[rel="stylesheet"][href]').each((_, el) => addUrl($(el).attr('href')));

  // <img src="..."> and <img srcset="...">
  $('img[src]').each((_, el) => addUrl($(el).attr('src')));
  $('img[srcset]').each((_, el) => parseSrcset($(el).attr('srcset')).forEach(addUrl));

  // <source src="..."> and <source srcset="...">
  $('source[src]').each((_, el) => addUrl($(el).attr('src')));
  $('source[srcset]').each((_, el) => parseSrcset($(el).attr('srcset')).forEach(addUrl));

  // <video src="...">, <audio src="...">
  $('video[src]').each((_, el) => addUrl($(el).attr('src')));
  $('audio[src]').each((_, el) => addUrl($(el).attr('src')));

  // <link href="..."> (non-stylesheet, e.g. icons)
  $('link[href]:not([rel="stylesheet"])').each((_, el) => {
    const rel = $(el).attr('rel') || '';
    if (rel.includes('icon') || rel.includes('apple-touch')) {
      addUrl($(el).attr('href'));
    }
  });

  // url(...) in <style> blocks
  $('style').each((_, el) => {
    extractCssUrls($(el).html() || '', baseUrl).forEach(u => urls.add(u));
  });

  // url(...) in inline style attributes
  $('[style]').each((_, el) => {
    extractCssUrls($(el).attr('style') || '', baseUrl).forEach(u => urls.add(u));
  });

  return Array.from(urls);
}

/**
 * Extract url(...) references from CSS text and resolve them against a base URL.
 * Returns an array of absolute URLs.
 */
function extractCssUrls(cssText, baseUrl) {
  const urls = [];
  const regex = /url\(\s*['"]?([^'")]+)['"]?\s*\)/g;
  let match;
  while ((match = regex.exec(cssText)) !== null) {
    const rawUrl = match[1].trim();
    if (rawUrl.startsWith('data:')) continue;
    try {
      urls.push(new URL(rawUrl, baseUrl).href);
    } catch {
      // skip invalid
    }
  }
  return urls;
}

/**
 * Fetch a single asset, compute SHA-1, save to disk.
 * Returns { originalUrl, localPath, sha1, ext } or null on failure.
 */
async function fetchAsset(assetUrl, snapshotId) {
  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 5000);

    const res = await fetch(assetUrl, {
      signal: controller.signal,
      headers: {
        'User-Agent': config.userAgent,
        'Referer': config.referer,
      },
    });
    clearTimeout(timeout);

    if (!res.ok) return null;

    const buffer = await res.buffer();
    const sha1 = crypto.createHash('sha1').update(buffer).digest('hex');

    // Determine extension from content-type or URL
    const contentType = res.headers.get('content-type') || '';
    let ext = mime.extension(contentType.split(';')[0].trim());
    if (!ext) {
      // Fallback to URL extension
      try {
        const parsed = new URL(assetUrl);
        const urlExt = path.extname(parsed.pathname).replace('.', '');
        if (urlExt) ext = urlExt;
      } catch {
        // ignore
      }
    }
    if (!ext) ext = 'bin';

    const assetDir = path.join(config.dataDir, 'assets', snapshotId);
    fs.mkdirSync(assetDir, { recursive: true });

    const filename = `${sha1}.${ext}`;
    const localPath = path.join(assetDir, filename);
    fs.writeFileSync(localPath, buffer);

    return {
      originalUrl: assetUrl,
      localPath: `/assets/${snapshotId}/${filename}`,
      sha1,
      ext,
    };
  } catch {
    return null;
  }
}

/**
 * Fetch all assets in parallel (with concurrency limit).
 * Returns a Map<originalUrl, localPath>.
 */
async function fetchAllAssets(assetUrls, snapshotId) {
  const assetMap = new Map();
  const concurrency = 10;

  for (let i = 0; i < assetUrls.length; i += concurrency) {
    const batch = assetUrls.slice(i, i + concurrency);
    const results = await Promise.all(
      batch.map(url => fetchAsset(url, snapshotId))
    );
    for (const result of results) {
      if (result) {
        assetMap.set(result.originalUrl, result.localPath);
      }
    }
  }

  return assetMap;
}

module.exports = { collectAssetUrls, fetchAllAssets, extractCssUrls };
