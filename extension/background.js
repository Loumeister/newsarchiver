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

  // Step 2: Inject content script to capture page HTML
  const pageData = await injectAndCapture(tabId);

  // Step 3: Collect and fetch assets (collectAssetUrls runs in offscreen doc for DOM access)
  const { urls: assetUrls } = await sendToOffscreen('collectAssetUrls', {
    html: pageData.html,
    baseUrl: pageData.url,
  });
  const assetMap = await fetchAllAssets(assetUrls, snapshotId);

  // Step 4: Rewrite HTML (runs in offscreen doc for DOM access)
  const timestamp = new Date().toISOString();
  const { html: rewrittenHtml } = await sendToOffscreen('rewriteHtml', {
    html: pageData.html,
    assetMapEntries: Array.from(assetMap.entries()),
    snapshotId,
    originalUrl: pageData.url,
    timestamp,
    options: { keepScripts: settings.keepScripts },
  });

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
