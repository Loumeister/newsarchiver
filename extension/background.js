/**
 * Background service worker for newsarchive Chrome extension.
 * Orchestrates the snapshot pipeline: inject content script → capture HTML →
 * fetch assets → rewrite HTML → store in IndexedDB.
 */

import { saveSnapshot } from './lib/storage.js';
import { fetchAllAssets } from './lib/assets.js';

/**
 * Ensure the offscreen document (which has DOM access) is created.
 */
async function ensureOffscreen() {
  const existing = await chrome.offscreen.hasDocument();
  if (!existing) {
    await chrome.offscreen.createDocument({
      url: 'offscreen.html',
      reasons: ['DOM_PARSER'],
      justification: 'Parse and rewrite HTML for archiving',
    });
  }
}

/**
 * Send a message to the offscreen document and return its response.
 */
async function sendToOffscreen(action, data) {
  await ensureOffscreen();
  return new Promise((resolve, reject) => {
    chrome.runtime.sendMessage(
      { target: 'offscreen', action, data },
      (response) => {
        if (chrome.runtime.lastError) {
          reject(new Error(chrome.runtime.lastError.message));
        } else {
          resolve(response);
        }
      }
    );
  });
}

/**
 * Generate a short random snapshot ID (6 hex chars).
 */
function generateSnapshotId() {
  const array = new Uint8Array(3);
  crypto.getRandomValues(array);
  return Array.from(array, b => b.toString(16).padStart(2, '0')).join('');
}

const GOOGLEBOT_UA = 'Mozilla/5.0 (Linux; Android 6.0.1; Nexus 5X Build/MMB29P) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Mobile Safari/537.36 (compatible; Googlebot/2.1; +http://www.google.com/bot.html)';
const GOOGLE_REFERER = 'https://www.google.com/';

// Rule ID for the temporary declarativeNetRequest rule
const DNR_RULE_ID = 1;

/**
 * Get user settings from chrome.storage.sync.
 */
async function getSettings() {
  return new Promise(resolve => {
    chrome.storage.sync.get({ keepScripts: false, googlebotMode: true }, resolve);
  });
}

/**
 * Add a temporary declarativeNetRequest rule to override User-Agent
 * and Referer headers for a specific URL. fetch() cannot override
 * User-Agent (it's a forbidden header), so we must use DNR.
 */
async function addGooglebotDnrRule(url) {
  let urlFilter;
  try {
    const u = new URL(url);
    urlFilter = u.origin + u.pathname;
  } catch {
    urlFilter = url;
  }

  await chrome.declarativeNetRequest.updateDynamicRules({
    removeRuleIds: [DNR_RULE_ID],
    addRules: [{
      id: DNR_RULE_ID,
      priority: 1,
      action: {
        type: 'modifyHeaders',
        requestHeaders: [
          { header: 'User-Agent', operation: 'set', value: GOOGLEBOT_UA },
          { header: 'Referer', operation: 'set', value: GOOGLE_REFERER },
          { header: 'Accept', operation: 'set', value: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8' },
        ],
      },
      condition: {
        urlFilter,
        resourceTypes: ['xmlhttprequest', 'other'],
      },
    }],
  });
}

/**
 * Remove the temporary declarativeNetRequest rule.
 */
async function removeGooglebotDnrRule() {
  await chrome.declarativeNetRequest.updateDynamicRules({
    removeRuleIds: [DNR_RULE_ID],
  });
}

/**
 * Re-fetch a URL using a Googlebot user agent and Google referer.
 * Uses declarativeNetRequest to override User-Agent at the network level,
 * since fetch() cannot override this forbidden header.
 */
async function fetchWithGooglebot(url) {
  await addGooglebotDnrRule(url);
  try {
    const response = await fetch(url, {
      headers: {
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
        'Accept-Language': 'en-US,en;q=0.5',
      },
    });

    if (!response.ok) {
      throw new Error(`Fetch failed: ${response.status} ${response.statusText}`);
    }

    return await response.text();
  } finally {
    await removeGooglebotDnrRule();
  }
}

/**
 * Fetch a page from Google's web cache as a fallback.
 * Returns the HTML content or null if unavailable.
 */
async function fetchFromGoogleCache(url) {
  const cacheUrl = `https://webcache.googleusercontent.com/search?q=cache:${encodeURIComponent(url)}&strip=1`;
  try {
    const response = await fetch(cacheUrl, {
      headers: {
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
        'Accept-Language': 'en-US,en;q=0.5',
      },
    });
    if (!response.ok) return null;

    let html = await response.text();

    // Google's cache wraps the content — extract everything after Google's
    // cache header div. The actual page starts after the first </div> that
    // closes Google's metadata bar.
    const marker = '<div style="position:relative">';
    const markerIdx = html.indexOf(marker);
    if (markerIdx !== -1) {
      html = html.substring(markerIdx + marker.length);
      // Remove the closing </div> that belongs to Google's wrapper
      const lastDiv = html.lastIndexOf('</div>');
      if (lastDiv !== -1) {
        html = html.substring(0, lastDiv);
      }
    }

    return html;
  } catch (err) {
    console.warn('[archive] Google Cache fetch failed:', err.message);
    return null;
  }
}

/**
 * Fetch a page snapshot from archive.is (archive.today) as a fallback.
 * This is the most reliable method for hard-paywalled sites like AD.nl
 * where content is never delivered to non-subscribers.
 * Returns the HTML content or null if unavailable.
 */
async function fetchFromArchiveIs(url) {
  // archive.is provides the most recent snapshot at /newest/<url>
  const archiveUrl = `https://archive.is/newest/${encodeURIComponent(url)}`;
  try {
    const response = await fetch(archiveUrl, {
      headers: {
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
        'Accept-Language': 'en-US,en;q=0.5',
      },
      redirect: 'follow',
    });
    if (!response.ok) return null;

    const html = await response.text();

    // Verify we got a real page, not an error or "no results" page
    if (html.includes('No results') || html.includes('no snapshots') || !hasEnoughContent(html)) {
      return null;
    }

    return html;
  } catch (err) {
    console.warn('[archive] archive.is fetch failed:', err.message);
    return null;
  }
}

/**
 * Evaluate the quality of fetched HTML content.
 * Returns true if it appears to contain a real article.
 */
function hasEnoughContent(html) {
  // Count <p> tags
  const pCount = (html.match(/<p[\s>]/gi) || []).length;
  if (pCount < 3) return false;

  // Extract text from <p> tags and check total length
  const pTextMatches = html.match(/<p[^>]*>([\s\S]*?)<\/p>/gi) || [];
  const totalTextLength = pTextMatches.reduce((sum, match) => {
    const text = match.replace(/<[^>]+>/g, '').trim();
    return sum + text.length;
  }, 0);

  return totalTextLength >= 500;
}

/**
 * Extract article content from JSON-LD structured data in HTML.
 * Many publishers (DPG Media, NYT, etc.) embed full article text in
 * <script type="application/ld+json"> for SEO, even on paywalled pages.
 */
function extractJsonLdArticle(html) {
  const jsonLdRegex = /<script[^>]*type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi;
  let match;
  while ((match = jsonLdRegex.exec(html)) !== null) {
    try {
      const data = JSON.parse(match[1]);
      const items = Array.isArray(data) ? data : [data];
      for (const item of items) {
        const candidates = item['@graph'] ? [...item['@graph'], item] : [item];
        for (const candidate of candidates) {
          if (candidate.articleBody && candidate.articleBody.length > 200) {
            return {
              articleBody: candidate.articleBody,
              headline: candidate.headline || '',
              author: extractAuthor(candidate),
              datePublished: candidate.datePublished || '',
              image: extractImage(candidate),
            };
          }
        }
      }
    } catch { /* skip malformed JSON-LD */ }
  }
  return null;
}

function extractAuthor(item) {
  if (!item.author) return '';
  if (typeof item.author === 'string') return item.author;
  if (Array.isArray(item.author)) {
    return item.author.map(a => typeof a === 'string' ? a : a.name || '').filter(Boolean).join(', ');
  }
  return item.author.name || '';
}

function extractImage(item) {
  if (!item.image) return '';
  if (typeof item.image === 'string') return item.image;
  if (Array.isArray(item.image)) {
    const first = item.image[0];
    return typeof first === 'string' ? first : (first && first.url) || '';
  }
  return item.image.url || '';
}

/**
 * Build a clean article HTML page from extracted JSON-LD data.
 * Preserves the <head> from the original HTML for meta tags/styles.
 */
function buildArticleHtml(article, originalUrl, originalHtml) {
  const paragraphs = article.articleBody
    .split(/\n+/)
    .filter(p => p.trim().length > 0)
    .map(p => `<p>${escapeHtml(p.trim())}</p>`)
    .join('\n    ');

  const headMatch = originalHtml.match(/<head[^>]*>([\s\S]*?)<\/head>/i);
  const headContent = headMatch
    ? headMatch[1]
    : `<meta charset="utf-8"><title>${escapeHtml(article.headline)}</title>`;

  return `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  ${headContent}
</head>
<body>
  <article>
    <h1>${escapeHtml(article.headline)}</h1>
    ${article.author ? `<p class="author">By ${escapeHtml(article.author)}</p>` : ''}
    ${article.datePublished ? `<time datetime="${escapeHtml(article.datePublished)}">${escapeHtml(article.datePublished)}</time>` : ''}
    ${article.image ? `<figure><img src="${escapeHtml(article.image)}" alt=""></figure>` : ''}
    ${paragraphs}
  </article>
</body>
</html>`;
}

function escapeHtml(str) {
  return str.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

// Track pending captures: tabId → { resolve, reject }
const pendingCaptures = new Map();

// Listen for messages from content scripts and popup
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.target === 'offscreen') return;

  if (message.action === 'archive') {
    // Triggered by popup — start the archive pipeline
    handleArchive(message.tabId)
      .then(result => sendResponse({ success: true, ...result }))
      .catch(err => sendResponse({ success: false, error: err.message }));
    return true; // Keep message channel open for async response
  }

  if (message.action === 'pageCaptured' && sender.tab) {
    // Content script finished capturing
    const pending = pendingCaptures.get(sender.tab.id);
    if (pending) {
      pendingCaptures.delete(sender.tab.id);
      pending.resolve(message.data);
    }
  }
});

/**
 * Main archive pipeline.
 * @param {number} tabId - The tab to archive
 * @returns {Promise<{ id, title }>}
 */
async function handleArchive(tabId) {
  const settings = await getSettings();
  const snapshotId = generateSnapshotId();

  // Step 1: Capture screenshot (visible viewport)
  const screenshotDataUrl = await chrome.tabs.captureVisibleTab(null, {
    format: 'png',
  });

  // Step 2: Get page HTML — either via Googlebot fetch or content script
  let pageHtml, pageUrl, pageTitle;

  if (settings.googlebotMode) {
    const tab = await chrome.tabs.get(tabId);
    pageUrl = tab.url;
    pageTitle = tab.title || '';
    let rawHtml = null;

    // Attempt 1: Googlebot fetch (with real UA override via declarativeNetRequest)
    try {
      rawHtml = await fetchWithGooglebot(pageUrl);
    } catch (err) {
      console.warn('[archive] Googlebot fetch failed:', err.message);
    }

    // Try JSON-LD articleBody extraction from Googlebot HTML
    if (rawHtml) {
      const article = extractJsonLdArticle(rawHtml);
      if (article) {
        console.log('[archive] Extracted article from JSON-LD articleBody');
        pageHtml = buildArticleHtml(article, pageUrl, rawHtml);
        pageTitle = article.headline || pageTitle;
      } else if (hasEnoughContent(rawHtml)) {
        pageHtml = rawHtml;
      } else {
        console.warn('[archive] Googlebot HTML has insufficient content, trying Google Cache');
      }
    }

    // Attempt 2: Google Web Cache fallback (also try JSON-LD extraction)
    if (!pageHtml) {
      const cacheHtml = await fetchFromGoogleCache(pageUrl);
      if (cacheHtml) {
        const article = extractJsonLdArticle(cacheHtml);
        if (article) {
          console.log('[archive] Extracted article from Google Cache JSON-LD');
          pageHtml = buildArticleHtml(article, pageUrl, cacheHtml);
          pageTitle = article.headline || pageTitle;
        } else if (hasEnoughContent(cacheHtml)) {
          console.log('[archive] Using Google Cache content');
          pageHtml = cacheHtml;
        }
      }
    }

    // Attempt 3: archive.is snapshot (best for hard-paywalled sites like AD.nl)
    if (!pageHtml) {
      console.log('[archive] Trying archive.is snapshot');
      const archiveHtml = await fetchFromArchiveIs(pageUrl);
      if (archiveHtml) {
        const article = extractJsonLdArticle(archiveHtml);
        if (article) {
          console.log('[archive] Extracted article from archive.is JSON-LD');
          pageHtml = buildArticleHtml(article, pageUrl, archiveHtml);
          pageTitle = article.headline || pageTitle;
        } else if (hasEnoughContent(archiveHtml)) {
          console.log('[archive] Using archive.is content');
          pageHtml = archiveHtml;
        }
      }
    }

    // Attempt 4: Content script (captures rendered DOM from the tab)
    if (!pageHtml) {
      console.warn('[archive] Falling back to content script');
      const pageData = await injectAndCapture(tabId);
      pageHtml = pageData.html;
      pageUrl = pageData.url;
      pageTitle = pageData.title;

      // Try JSON-LD extraction from content script HTML too
      if (pageData.jsonLdArticle) {
        console.log('[archive] Using JSON-LD from content script');
        pageHtml = buildArticleHtml(pageData.jsonLdArticle, pageUrl, pageHtml);
        pageTitle = pageData.jsonLdArticle.headline || pageTitle;
      } else {
        const article = extractJsonLdArticle(pageHtml);
        if (article) {
          console.log('[archive] Extracted article from content script JSON-LD');
          pageHtml = buildArticleHtml(article, pageUrl, pageHtml);
          pageTitle = article.headline || pageTitle;
        }
      }
    }
  } else {
    const pageData = await injectAndCapture(tabId);
    pageHtml = pageData.html;
    pageUrl = pageData.url;
    pageTitle = pageData.title;

    // Try JSON-LD extraction even in non-Googlebot mode
    const article = extractJsonLdArticle(pageHtml);
    if (article && !hasEnoughContent(pageHtml)) {
      console.log('[archive] Extracted article from JSON-LD (non-Googlebot mode)');
      pageHtml = buildArticleHtml(article, pageUrl, pageHtml);
      pageTitle = article.headline || pageTitle;
    }
  }

  // Step 3: Collect and fetch assets (collectAssetUrls runs in offscreen doc for DOM access)
  const { urls: assetUrls } = await sendToOffscreen('collectAssetUrls', {
    html: pageHtml,
    baseUrl: pageUrl,
  });
  const assetMap = await fetchAllAssets(assetUrls, snapshotId);

  // Step 4: Rewrite HTML (runs in offscreen doc for DOM access)
  const timestamp = new Date().toISOString();
  const { html: rewrittenHtml } = await sendToOffscreen('rewriteHtml', {
    html: pageHtml,
    assetMapEntries: Array.from(assetMap.entries()),
    snapshotId,
    originalUrl: pageUrl,
    timestamp,
    options: { keepScripts: settings.keepScripts },
  });

  // Step 5: Save to IndexedDB
  await saveSnapshot({
    id: snapshotId,
    originalUrl: pageUrl,
    timestamp,
    title: pageTitle || '',
    html: rewrittenHtml,
    screenshot: screenshotDataUrl,
  });

  return { id: snapshotId, title: pageTitle };
}

/**
 * Inject content.js into a tab and wait for the captured page data.
 * @param {number} tabId
 * @returns {Promise<{ html, title, url }>}
 */
function injectAndCapture(tabId) {
  return new Promise((resolve, reject) => {
    const timeout = setTimeout(() => {
      pendingCaptures.delete(tabId);
      reject(new Error('Content script timed out after 30 seconds'));
    }, 30000);

    pendingCaptures.set(tabId, {
      resolve: (data) => {
        clearTimeout(timeout);
        resolve(data);
      },
      reject: (err) => {
        clearTimeout(timeout);
        reject(err);
      },
    });

    chrome.scripting.executeScript({
      target: { tabId },
      files: ['content.js'],
    }).catch(err => {
      clearTimeout(timeout);
      pendingCaptures.delete(tabId);
      reject(new Error(`Failed to inject content script: ${err.message}`));
    });
  });
}
