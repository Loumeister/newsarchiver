/**
 * Fallback chain for fetching article content when Playwright output
 * is insufficient (e.g. hard-paywalled sites).
 *
 * Attempts in order:
 * 1. JSON-LD extraction from Playwright HTML
 * 2. Plain Googlebot HTTP fetch → JSON-LD / content check
 * 3. Google Web Cache → JSON-LD / content check
 * 4. archive.is snapshot → JSON-LD / content check
 */

const fetch = require('node-fetch');
const config = require('./config');
const { extractJsonLdArticle, buildArticleHtml } = require('./jsonld');

/**
 * Check if HTML has enough article content.
 * @param {string} html
 * @returns {boolean}
 */
function hasEnoughContent(html) {
  const pCount = (html.match(/<p[\s>]/gi) || []).length;
  if (pCount < 3) return false;

  const pTextMatches = html.match(/<p[^>]*>([\s\S]*?)<\/p>/gi) || [];
  const totalTextLength = pTextMatches.reduce((sum, match) => {
    const text = match.replace(/<[^>]+>/g, '').trim();
    return sum + text.length;
  }, 0);

  return totalTextLength >= 500;
}

/**
 * Fetch a URL with Googlebot UA via plain HTTP (no browser).
 * @param {string} url
 * @returns {Promise<string|null>}
 */
async function fetchWithGooglebot(url) {
  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), config.fallbackTimeoutMs);
    const response = await fetch(url, {
      headers: {
        'User-Agent': config.userAgent,
        'Referer': config.referer,
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
        'Accept-Language': 'en-US,en;q=0.5',
      },
      signal: controller.signal,
      redirect: 'follow',
    });
    clearTimeout(timeout);
    if (!response.ok) return null;
    return await response.text();
  } catch (err) {
    console.warn('[fallback] Googlebot fetch failed:', err.message);
    return null;
  }
}

/**
 * Fetch from Google Web Cache.
 * @param {string} url
 * @returns {Promise<string|null>}
 */
async function fetchFromGoogleCache(url) {
  const cacheUrl = `https://webcache.googleusercontent.com/search?q=cache:${encodeURIComponent(url)}&strip=1`;
  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), config.fallbackTimeoutMs);
    const response = await fetch(cacheUrl, {
      headers: {
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
        'Accept-Language': 'en-US,en;q=0.5',
      },
      signal: controller.signal,
    });
    clearTimeout(timeout);
    if (!response.ok) return null;

    let html = await response.text();

    // Google's cache wraps content — extract after their header div
    const marker = '<div style="position:relative">';
    const markerIdx = html.indexOf(marker);
    if (markerIdx !== -1) {
      html = html.substring(markerIdx + marker.length);
      const lastDiv = html.lastIndexOf('</div>');
      if (lastDiv !== -1) {
        html = html.substring(0, lastDiv);
      }
    }

    return html;
  } catch (err) {
    console.warn('[fallback] Google Cache fetch failed:', err.message);
    return null;
  }
}

/**
 * Fetch a page snapshot from archive.is (archive.today).
 * @param {string} url
 * @returns {Promise<string|null>}
 */
async function fetchFromArchiveIs(url) {
  // archive.is expects the raw URL appended after /newest/, not percent-encoded
  const archiveUrl = `https://archive.is/newest/${url}`;
  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), config.fallbackTimeoutMs);
    const response = await fetch(archiveUrl, {
      headers: {
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
        'Accept-Language': 'en-US,en;q=0.5',
      },
      signal: controller.signal,
      redirect: 'follow',
    });
    clearTimeout(timeout);
    if (!response.ok) return null;

    const html = await response.text();

    // Detect archive.is "no snapshot found" pages using multiple known patterns
    const noSnapshotPatterns = [
      'No results',
      'no snapshots',
      "hasn't been archived",
      'is not archived',
      'This page has not been archived',
      'Sorry, this page',
      '<title>archive.today</title>',
    ];
    if (noSnapshotPatterns.some(p => html.includes(p))) {
      return null;
    }

    // Confirm response URL contains an archive timestamp (e.g. /20240101120000/)
    // to distinguish a real snapshot from a search/error page
    const finalUrl = response.url;
    if (finalUrl && finalUrl.includes('archive.') && !(/\/\d{14}\//.test(finalUrl))) {
      console.warn('[fallback] archive.is returned a non-snapshot URL:', finalUrl);
      return null;
    }

    return html;
  } catch (err) {
    console.warn('[fallback] archive.is fetch failed:', err.message);
    return null;
  }
}

/**
 * Try to extract usable article content from HTML.
 * Attempts JSON-LD first, then checks raw HTML quality.
 * @param {string} html
 * @param {string} originalUrl
 * @returns {{ html: string, title: string, source: string } | null}
 */
function tryExtractContent(html, originalUrl, sourceName) {
  const article = extractJsonLdArticle(html);
  if (article) {
    return {
      html: buildArticleHtml(article, originalUrl, html),
      title: article.headline,
      source: sourceName + '/jsonld',
    };
  }

  if (hasEnoughContent(html)) {
    return { html, title: '', source: sourceName };
  }

  return null;
}

/**
 * Run the fallback chain to obtain article content.
 * @param {string} originalUrl - The article URL
 * @param {string|null} playwrightHtml - HTML from Playwright (may be null if Playwright failed)
 * @param {object} [options]
 * @param {object} [options.siteHandler] - The site handler for this URL
 * @returns {Promise<{ html: string, title: string, source: string } | null>}
 */
async function runFallbackChain(originalUrl, playwrightHtml, options = {}) {
  // Attempt 1: JSON-LD extraction from Playwright HTML
  if (playwrightHtml) {
    console.log('[fallback] Trying JSON-LD extraction from Playwright HTML...');
    const result = tryExtractContent(playwrightHtml, originalUrl, 'playwright');
    if (result) return result;
  }

  // Attempt 2: Plain Googlebot HTTP fetch
  console.log('[fallback] Trying plain Googlebot HTTP fetch...');
  const googlebotHtml = await fetchWithGooglebot(originalUrl);
  if (googlebotHtml) {
    const result = tryExtractContent(googlebotHtml, originalUrl, 'googlebot');
    if (result) return result;
  }

  // Attempt 3: Google Web Cache
  console.log('[fallback] Trying Google Cache...');
  const cacheHtml = await fetchFromGoogleCache(originalUrl);
  if (cacheHtml) {
    const result = tryExtractContent(cacheHtml, originalUrl, 'googleCache');
    if (result) return result;
  }

  // Attempt 4: archive.is
  console.log('[fallback] Trying archive.is...');
  const archiveHtml = await fetchFromArchiveIs(originalUrl);
  if (archiveHtml) {
    const result = tryExtractContent(archiveHtml, originalUrl, 'archive.is');
    if (result) return result;
  }

  console.warn('[fallback] All fallback attempts failed for:', originalUrl);
  return null;
}

module.exports = {
  hasEnoughContent,
  fetchWithGooglebot,
  fetchFromGoogleCache,
  fetchFromArchiveIs,
  tryExtractContent,
  runFallbackChain,
};
