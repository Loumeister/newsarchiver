import { collectAssetUrls } from './lib/assets.js';
import { rewriteHtml } from './lib/rewriter.js';

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.target !== 'offscreen') return;

  if (message.action === 'collectAssetUrls') {
    const urls = collectAssetUrls(message.data.html, message.data.baseUrl);
    sendResponse({ urls });
    return;
  }

  if (message.action === 'rewriteHtml') {
    const { html, assetMapEntries, snapshotId, originalUrl, timestamp, options } = message.data;
    const assetMap = new Map(assetMapEntries);
    const result = rewriteHtml(html, assetMap, snapshotId, originalUrl, timestamp, options);
    sendResponse({ html: result });
    return;
  }
});
