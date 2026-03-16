/**
 * Background service worker for newsarchive Chrome extension.
 * Orchestrates the snapshot pipeline: inject content script → capture HTML →
 * fetch assets → rewrite HTML → store in IndexedDB.
 */

import { saveSnapshot } from './lib/storage.js';
import { collectAssetUrls, fetchAllAssets } from './lib/assets.js';
import { rewriteHtml } from './lib/rewriter.js';

/**
 * Generate a short random snapshot ID (6 hex chars).
 */
function generateSnapshotId() {
  const array = new Uint8Array(3);
  crypto.getRandomValues(array);
  return Array.from(array, b => b.toString(16).padStart(2, '0')).join('');
}

/**
 * Get user settings from chrome.storage.sync.
 */
async function getSettings() {
  return new Promise(resolve => {
    chrome.storage.sync.get({ keepScripts: false }, resolve);
  });
}

// Track pending captures: tabId → { resolve, reject }
const pendingCaptures = new Map();

// Listen for messages from content scripts and popup
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
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

  // Step 2: Inject content script to capture page HTML
  const pageData = await injectAndCapture(tabId);

  // Step 3: Collect and fetch assets
  const assetUrls = collectAssetUrls(pageData.html, pageData.url);
  const assetMap = await fetchAllAssets(assetUrls, snapshotId);

  // Step 4: Rewrite HTML
  const timestamp = new Date().toISOString();
  const rewrittenHtml = rewriteHtml(
    pageData.html,
    assetMap,
    snapshotId,
    pageData.url,
    timestamp,
    { keepScripts: settings.keepScripts }
  );

  // Step 5: Save to IndexedDB
  await saveSnapshot({
    id: snapshotId,
    originalUrl: pageData.url,
    timestamp,
    title: pageData.title || '',
    html: rewrittenHtml,
    screenshot: screenshotDataUrl,
  });

  return { id: snapshotId, title: pageData.title };
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
