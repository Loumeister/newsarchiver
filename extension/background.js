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

/**
 * Get user settings from chrome.storage.sync.
 */
async function getSettings() {
  return new Promise(resolve => {
    chrome.storage.sync.get({ keepScripts: false, googlebotMode: true }, resolve);
  });
}

/**
 * Re-fetch a URL using a Googlebot user agent and Google referer.
 * This causes most news sites to serve full, unpaywalled content.
 */
async function fetchWithGooglebot(url) {
  const response = await fetch(url, {
    headers: {
      'User-Agent': GOOGLEBOT_UA,
      'Referer': GOOGLE_REFERER,
      'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
      'Accept-Language': 'en-US,en;q=0.5',
    },
  });

  if (!response.ok) {
    throw new Error(`Fetch failed: ${response.status} ${response.statusText}`);
  }

  return await response.text();
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
    try {
      const tab = await chrome.tabs.get(tabId);
      pageUrl = tab.url;
      pageTitle = tab.title || '';
      pageHtml = await fetchWithGooglebot(pageUrl);
    } catch (err) {
      console.warn('[archive] Googlebot fetch failed, falling back to content script:', err.message);
      const pageData = await injectAndCapture(tabId);
      pageHtml = pageData.html;
      pageUrl = pageData.url;
      pageTitle = pageData.title;
    }
  } else {
    const pageData = await injectAndCapture(tabId);
    pageHtml = pageData.html;
    pageUrl = pageData.url;
    pageTitle = pageData.title;
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
