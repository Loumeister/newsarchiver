/**
 * Asset collection and fetching for the Chrome extension.
 * Uses DOMParser instead of Cheerio, native fetch() instead of node-fetch,
 * and crypto.subtle for SHA-1 hashing.
 */

import { saveAsset } from './storage.js';

/**
 * Collect all asset URLs from captured HTML.
 * @param {string} html - Raw HTML string
 * @param {string} baseUrl - The page's URL for resolving relative paths
 * @returns {string[]} Array of absolute URLs
 */
export function collectAssetUrls(html, baseUrl) {
  const parser = new DOMParser();
  const doc = parser.parseFromString(html, 'text/html');
  const urls = new Set();

  function addUrl(rawUrl) {
    if (!rawUrl || rawUrl.startsWith('data:') || rawUrl.startsWith('javascript:')) return;
    try {
      urls.add(new URL(rawUrl, baseUrl).href);
    } catch {
      // Invalid URL
    }
  }

  // <link rel="stylesheet" href="...">
  doc.querySelectorAll('link[rel="stylesheet"][href]').forEach(el => {
    addUrl(el.getAttribute('href'));
  });

  // <img src="..."> and <img srcset="...">
  doc.querySelectorAll('img[src]').forEach(el => addUrl(el.getAttribute('src')));
  doc.querySelectorAll('img[srcset]').forEach(el => {
    parseSrcset(el.getAttribute('srcset')).forEach(addUrl);
  });

  // Lazy-load data attributes on img and source elements
  const lazyAttrs = ['data-src', 'data-lazy-src', 'data-original', 'data-lazy', 'data-hi-res-src'];
  for (const attr of lazyAttrs) {
    doc.querySelectorAll(`img[${attr}]`).forEach(el => addUrl(el.getAttribute(attr)));
    doc.querySelectorAll(`source[${attr}]`).forEach(el => addUrl(el.getAttribute(attr)));
  }

  // <source src="..."> and <source srcset="...">
  doc.querySelectorAll('source[src]').forEach(el => addUrl(el.getAttribute('src')));
  doc.querySelectorAll('source[srcset]').forEach(el => {
    parseSrcset(el.getAttribute('srcset')).forEach(addUrl);
  });

  // <video src="...">, <audio src="...">
  doc.querySelectorAll('video[src], audio[src]').forEach(el => {
    addUrl(el.getAttribute('src'));
  });

  // <link href="..."> (icons, etc.)
  doc.querySelectorAll('link[href]:not([rel="stylesheet"])').forEach(el => {
    const rel = el.getAttribute('rel') || '';
    if (rel.includes('icon') || rel.includes('apple-touch')) {
      addUrl(el.getAttribute('href'));
    }
  });

  // url(...) in <style> blocks
  doc.querySelectorAll('style').forEach(el => {
    extractCssUrls(el.textContent || '', baseUrl).forEach(u => urls.add(u));
  });

  // url(...) in inline style attributes
  doc.querySelectorAll('[style]').forEach(el => {
    extractCssUrls(el.getAttribute('style') || '', baseUrl).forEach(u => urls.add(u));
  });

  return Array.from(urls);
}

/**
 * Parse a srcset attribute into an array of URLs.
 */
export function parseSrcset(srcset) {
  if (!srcset) return [];
  return srcset.split(',').map(entry => entry.trim().split(/\s+/)[0]).filter(Boolean);
}

/**
 * Extract url(...) references from CSS text and resolve against a base URL.
 * @returns {string[]} Absolute URLs
 */
export function extractCssUrls(cssText, baseUrl) {
  const urls = [];
  const regex = /url\(\s*['"]?([^'")]+)['"]?\s*\)/g;
  let match;
  while ((match = regex.exec(cssText)) !== null) {
    const rawUrl = match[1].trim();
    if (rawUrl.startsWith('data:')) continue;
    try {
      urls.push(new URL(rawUrl, baseUrl).href);
    } catch {
      // skip
    }
  }
  return urls;
}

/**
 * Compute SHA-1 hash of an ArrayBuffer using Web Crypto API.
 * @param {ArrayBuffer} buffer
 * @returns {Promise<string>} Hex-encoded hash
 */
async function sha1(buffer) {
  const hashBuffer = await crypto.subtle.digest('SHA-1', buffer);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  return hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
}

/**
 * Guess file extension from MIME type or URL.
 */
function guessExtension(mimeType, url) {
  const mimeMap = {
    'text/css': 'css',
    'text/html': 'html',
    'text/javascript': 'js',
    'application/javascript': 'js',
    'image/png': 'png',
    'image/jpeg': 'jpg',
    'image/gif': 'gif',
    'image/webp': 'webp',
    'image/svg+xml': 'svg',
    'image/avif': 'avif',
    'font/woff': 'woff',
    'font/woff2': 'woff2',
    'application/font-woff': 'woff',
    'application/font-woff2': 'woff2',
    'font/ttf': 'ttf',
    'font/otf': 'otf',
    'video/mp4': 'mp4',
    'audio/mpeg': 'mp3',
  };

  const cleanMime = (mimeType || '').split(';')[0].trim().toLowerCase();
  if (mimeMap[cleanMime]) return mimeMap[cleanMime];

  // Fallback to URL extension
  try {
    const pathname = new URL(url).pathname;
    const ext = pathname.split('.').pop();
    if (ext && ext.length <= 5 && ext !== pathname) return ext;
  } catch {
    // ignore
  }

  return 'bin';
}

/**
 * Fetch a single asset, hash it, store in IndexedDB.
 * @returns {{ originalUrl, dataUri, sha1, ext, mimeType, cssText }|null}
 */
async function fetchAsset(assetUrl, snapshotId) {
  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 5000);

    const res = await fetch(assetUrl, { signal: controller.signal });
    clearTimeout(timeout);

    if (!res.ok) return null;

    const mimeType = (res.headers.get('content-type') || '').split(';')[0].trim();
    const buffer = await res.arrayBuffer();
    const hash = await sha1(buffer);
    const ext = guessExtension(mimeType, assetUrl);
    const key = `${snapshotId}/${hash}.${ext}`;

    const blob = new Blob([buffer], { type: mimeType });

    // Store in IndexedDB
    await saveAsset(key, blob, mimeType);

    // Create data URI for embedding in HTML
    const dataUri = await blobToDataUri(blob);

    // If it's CSS, also extract the text content for inlining
    let cssText = null;
    if (mimeType === 'text/css' || ext === 'css') {
      cssText = new TextDecoder().decode(buffer);
    }

    return { originalUrl: assetUrl, dataUri, sha1: hash, ext, mimeType, cssText, key };
  } catch {
    return null;
  }
}

/**
 * Convert a Blob to a data URI.
 */
function blobToDataUri(blob) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onloadend = () => resolve(reader.result);
    reader.onerror = reject;
    reader.readAsDataURL(blob);
  });
}

/**
 * Fetch all assets in parallel (batched with concurrency limit).
 * @param {string[]} assetUrls
 * @param {string} snapshotId
 * @returns {Promise<Map<string, object>>} Map of originalUrl → asset info
 */
export async function fetchAllAssets(assetUrls, snapshotId) {
  const assetMap = new Map();
  const concurrency = 10;

  for (let i = 0; i < assetUrls.length; i += concurrency) {
    const batch = assetUrls.slice(i, i + concurrency);
    const results = await Promise.all(
      batch.map(url => fetchAsset(url, snapshotId))
    );
    for (const result of results) {
      if (result) {
        assetMap.set(result.originalUrl, result);
      }
    }
  }

  return assetMap;
}
