const cheerio = require('cheerio');
const { URL } = require('url');
const config = require('./config');
const { extractCssUrls } = require('./assets');

// Tracking/analytics script patterns to remove
const TRACKING_PATTERNS = /gtag|fbq|_gaq|dataLayer|adsbygoogle|google-analytics|googletag|GoogleAnalyticsObject|ga\s*\(|_paq|hotjar|mixpanel|segment\.com|optimizely|amplitude/i;

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

/**
 * Remove script tags, iframes, noscript, tracking pixels, preload/prefetch links,
 * meta refresh, and overlay elements.
 */
function removeNoiseElements($) {
  // Remove iframes
  $('iframe').remove();

  // Remove noscript
  $('noscript').remove();

  // Remove preload/prefetch links
  $('link[rel="preload"], link[rel="prefetch"]').remove();

  // Remove meta refresh
  $('meta[http-equiv="refresh"]').remove();

  // Remove tracking pixels (1x1 images, beacon images)
  $('img').each((_, el) => {
    const $el = $(el);
    const width = $el.attr('width');
    const height = $el.attr('height');
    const src = ($el.attr('src') || '').toLowerCase();
    if (
      (width === '1' && height === '1') ||
      src.includes('beacon') ||
      src.includes('pixel') ||
      src.includes('tracker')
    ) {
      $el.remove();
    }
  });

  // Handle scripts according to policy
  $('script').each((_, el) => {
    const $el = $(el);
    const src = $el.attr('src') || '';
    const type = $el.attr('type') || '';
    const content = $el.html() || '';

    // Keep structured data (ld+json)
    if (type === 'application/ld+json') return;

    // Remove external scripts
    if (src) {
      $el.remove();
      return;
    }

    // Remove inline tracking/analytics scripts
    if (TRACKING_PATTERNS.test(content)) {
      $el.remove();
      return;
    }

    // If keepScripts is false (default), remove all remaining inline scripts
    if (!config.keepScripts) {
      $el.remove();
    }
  });

  // Remove known overlay/paywall containers that might remain
  const overlaySelectors = [
    '[class*="paywall"]', '[class*="premium-gate"]',
    '[class*="subscribe-wall"]', '[class*="registration-wall"]',
    '[class*="cookie-consent"]', '[id*="cookie-consent"]',
    '[class*="cookie-banner"]', '[id*="cookie-banner"]',
  ];
  for (const sel of overlaySelectors) {
    $(sel).each((_, el) => {
      const $el = $(el);
      const pos = $el.css('position');
      if (pos === 'fixed' || pos === 'absolute' || pos === 'sticky') {
        $el.remove();
      }
    });
  }
}

/**
 * Replace <link rel="stylesheet"> with inline <style> blocks,
 * rewriting url() references inside the CSS.
 */
function inlineExternalCss($, assetMap) {
  $('link[rel="stylesheet"]').each((_, el) => {
    const $el = $(el);
    const href = $el.attr('href');
    if (!href) return;

    // Find the local path for this CSS file
    let localPath = null;
    for (const [origUrl, lp] of assetMap.entries()) {
      if (origUrl === href || origUrl.endsWith(href) || href.endsWith(new URL(origUrl).pathname)) {
        localPath = lp;
        break;
      }
    }

    // Try to read the CSS content from disk
    if (localPath) {
      const fullPath = require('path').join(config.dataDir, '..', localPath);
      try {
        let cssText = require('fs').readFileSync(fullPath, 'utf-8');
        cssText = rewriteCssUrls(cssText, assetMap);
        $el.replaceWith(`<style>${cssText}</style>`);
        return;
      } catch {
        // Fall through — couldn't read file
      }
    }

    // If we couldn't inline it, just remove the link (the asset wasn't fetched)
    // Leave it as-is so the base tag can try to resolve it
  });
}

/**
 * Rewrite url(...) references in CSS text using the asset map.
 */
function rewriteCssUrls(cssText, assetMap) {
  return cssText.replace(/url\(\s*['"]?([^'")]+)['"]?\s*\)/g, (match, rawUrl) => {
    if (rawUrl.startsWith('data:')) return match;
    // Find in asset map
    for (const [origUrl, localPath] of assetMap.entries()) {
      if (origUrl === rawUrl || origUrl.endsWith(rawUrl)) {
        return `url(${localPath})`;
      }
    }
    return match;
  });
}

/**
 * Rewrite src, srcset, and inline style url() references to local asset paths.
 */
function rewriteAssetUrls($, assetMap) {
  // img[src]
  $('img[src]').each((_, el) => {
    const $el = $(el);
    const src = $el.attr('src');
    const local = findInAssetMap(src, assetMap);
    if (local) $el.attr('src', local);
  });

  // img[srcset]
  $('img[srcset]').each((_, el) => {
    const $el = $(el);
    $el.attr('srcset', rewriteSrcset($el.attr('srcset'), assetMap));
  });

  // source[src]
  $('source[src]').each((_, el) => {
    const $el = $(el);
    const src = $el.attr('src');
    const local = findInAssetMap(src, assetMap);
    if (local) $el.attr('src', local);
  });

  // source[srcset]
  $('source[srcset]').each((_, el) => {
    const $el = $(el);
    $el.attr('srcset', rewriteSrcset($el.attr('srcset'), assetMap));
  });

  // video[src], audio[src]
  $('video[src], audio[src]').each((_, el) => {
    const $el = $(el);
    const src = $el.attr('src');
    const local = findInAssetMap(src, assetMap);
    if (local) $el.attr('src', local);
  });

  // link[href] (non-stylesheet, e.g. icons)
  $('link[href]:not([rel="stylesheet"])').each((_, el) => {
    const $el = $(el);
    const href = $el.attr('href');
    const local = findInAssetMap(href, assetMap);
    if (local) $el.attr('href', local);
  });

  // Inline style url(...) rewriting
  $('[style]').each((_, el) => {
    const $el = $(el);
    const style = $el.attr('style');
    if (style && style.includes('url(')) {
      $el.attr('style', rewriteCssUrls(style, assetMap));
    }
  });

  // <style> blocks — rewrite url() references
  $('style').each((_, el) => {
    const $el = $(el);
    const cssText = $el.html();
    if (cssText && cssText.includes('url(')) {
      $el.html(rewriteCssUrls(cssText, assetMap));
    }
  });
}

/**
 * Find an original URL in the asset map (exact or suffix match).
 */
function findInAssetMap(url, assetMap) {
  if (!url || url.startsWith('data:')) return null;
  if (assetMap.has(url)) return assetMap.get(url);
  // Try suffix match
  for (const [origUrl, localPath] of assetMap.entries()) {
    if (origUrl.endsWith(url) || url.endsWith(new URL(origUrl).pathname)) {
      return localPath;
    }
  }
  return null;
}

/**
 * Rewrite a srcset attribute, replacing each URL with its local path.
 */
function rewriteSrcset(srcset, assetMap) {
  if (!srcset) return '';
  return srcset.split(',').map(entry => {
    const parts = entry.trim().split(/\s+/);
    const url = parts[0];
    const descriptor = parts.slice(1).join(' ');
    const local = findInAssetMap(url, assetMap);
    return local ? `${local} ${descriptor}`.trim() : entry.trim();
  }).join(', ');
}

/**
 * Rewrite <a href="..."> links.
 * External links get wrapped with /proxy?url= if proxyLinks is enabled.
 */
function rewriteHyperlinks($, originalUrl) {
  const originUrl = new URL(originalUrl);

  $('a[href]').each((_, el) => {
    const $el = $(el);
    const href = $el.attr('href');
    if (!href) return;

    // Leave fragments, mailto, tel alone
    if (href.startsWith('#') || href.startsWith('mailto:') || href.startsWith('tel:')) return;

    // Leave javascript: void links alone
    if (href.startsWith('javascript:')) {
      $el.attr('href', '#');
      return;
    }

    try {
      const parsed = new URL(href, originalUrl);
      if (config.proxyLinks) {
        $el.attr('href', `/proxy?url=${encodeURIComponent(parsed.href)}`);
      }
      // If proxyLinks is off, leave external links as-is
    } catch {
      // Invalid URL, leave as-is
    }
  });
}

/**
 * Inject the archive toolbar at the top of <body>.
 */
function injectToolbar($, originalUrl, timestamp, snapshotId) {
  const toolbar = `
<div id="__archive-toolbar__" style="position:fixed;top:0;left:0;right:0;z-index:2147483647;background:#1a1a2e;color:#e0e0e0;padding:8px 16px;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;font-size:13px;display:flex;align-items:center;justify-content:space-between;box-shadow:0 2px 8px rgba(0,0,0,0.3);gap:12px;">
  <span style="flex-shrink:0;font-weight:600;color:#7c83ff;">&#128230; newsarchive</span>
  <span style="overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">Archived from <a href="${escapeAttr(originalUrl)}" style="color:#64b5f6;text-decoration:none;" target="_blank">${escapeHtml(originalUrl)}</a></span>
  <span style="flex-shrink:0;color:#aaa;">${escapeHtml(timestamp)}</span>
  <a href="/snap/${snapshotId}/screenshot" style="color:#64b5f6;text-decoration:none;flex-shrink:0;">Screenshot</a>
</div>
<div style="height:40px;"></div>`;

  $('body').prepend(toolbar);
}

function escapeHtml(str) {
  return str.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

function escapeAttr(str) {
  return str.replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

module.exports = { rewriteHtml };
