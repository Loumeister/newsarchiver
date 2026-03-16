const cheerio = require('cheerio');
const { escapeAttr } = require('../shared/utils');
const { removeNoiseElements } = require('./noise');
const { injectReadabilityCss, inlineExternalCss } = require('./css');
const { rewriteAssetUrls } = require('./assets');
const { rewriteHyperlinks } = require('./links');
const { injectToolbar } = require('./toolbar');

/**
 * Rewrite the captured HTML into a self-contained snapshot.
 *
 * @param {string} html - The raw captured HTML
 * @param {Map<string, string>} assetMap - Map of original URL -> local path
 * @param {string} snapshotId - The snapshot identifier
 * @param {string} originalUrl - The URL that was archived
 * @param {string} timestamp - ISO 8601 timestamp
 * @param {number} port - Server port for base tag
 */
function rewriteHtml(html, assetMap, snapshotId, originalUrl, timestamp, port) {
  const $ = cheerio.load(html, { decodeEntities: false });

  // 3a. Remove noise elements
  removeNoiseElements($);

  // 3a-2. Inject readability CSS to defeat color-based paywall obfuscation
  injectReadabilityCss($);

  // 3b. Inline external CSS
  inlineExternalCss($, assetMap);

  // 3c. Rewrite asset URLs
  rewriteAssetUrls($, assetMap);

  // 3d. Rewrite hyperlinks
  rewriteHyperlinks($, originalUrl);

  // 3e. Set base tag
  $('head').prepend(`<base href="http://localhost:${port}/snap/${snapshotId}/">`);

  // 3f. Inject toolbar
  injectToolbar($, originalUrl, timestamp, snapshotId);

  // 3g. Add meta tags
  $('head').append(`<meta name="robots" content="noindex,noarchive">`);
  $('head').append(`<meta name="archived-from" content="${escapeAttr(originalUrl)}">`);
  $('head').append(`<meta name="archived-at" content="${escapeAttr(timestamp)}">`);

  return $.html();
}

module.exports = { rewriteHtml };
