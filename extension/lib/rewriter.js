/**
 * HTML rewriter for the Chrome extension.
 * Uses DOMParser instead of Cheerio, operates on a Document object.
 */

import { extractCssUrls } from './assets.js';

// Tracking/analytics script patterns to remove
const TRACKING_PATTERNS = /gtag|fbq|_gaq|dataLayer|adsbygoogle|google-analytics|googletag|GoogleAnalyticsObject|ga\s*\(|_paq|hotjar|mixpanel|segment\.com|optimizely|amplitude/i;

/**
 * Rewrite captured HTML into a self-contained snapshot.
 *
 * @param {string} html - The raw captured HTML
 * @param {Map<string, object>} assetMap - Map of originalUrl → { dataUri, cssText, ... }
 * @param {string} snapshotId
 * @param {string} originalUrl
 * @param {string} timestamp - ISO 8601
 * @param {object} options - { keepScripts: boolean }
 * @returns {string} Rewritten HTML string
 */
export function rewriteHtml(html, assetMap, snapshotId, originalUrl, timestamp, options = {}) {
  const parser = new DOMParser();
  const doc = parser.parseFromString(html, 'text/html');

  removeNoiseElements(doc, options.keepScripts);
  injectReadabilityCss(doc);
  inlineExternalCss(doc, assetMap);
  rewriteAssetUrls(doc, assetMap);
  rewriteHyperlinks(doc, originalUrl);
  injectToolbar(doc, originalUrl, timestamp, snapshotId);
  addMetaTags(doc, originalUrl, timestamp);

  return '<!DOCTYPE html>\n' + doc.documentElement.outerHTML;
}

/**
 * Remove scripts, iframes, noscript, tracking pixels, preload/prefetch links,
 * meta refresh, and overlay elements.
 */
function removeNoiseElements(doc, keepScripts = false) {
  // Remove iframes
  doc.querySelectorAll('iframe').forEach(el => el.remove());

  // Remove noscript
  doc.querySelectorAll('noscript').forEach(el => el.remove());

  // Remove preload/prefetch links
  doc.querySelectorAll('link[rel="preload"], link[rel="prefetch"]').forEach(el => el.remove());

  // Remove meta refresh
  doc.querySelectorAll('meta[http-equiv="refresh"]').forEach(el => el.remove());

  // Remove tracking pixels
  doc.querySelectorAll('img').forEach(el => {
    const width = el.getAttribute('width');
    const height = el.getAttribute('height');
    const src = (el.getAttribute('src') || '').toLowerCase();
    if (
      (width === '1' && height === '1') ||
      src.includes('beacon') ||
      src.includes('pixel') ||
      src.includes('tracker')
    ) {
      el.remove();
    }
  });

  // Handle scripts
  doc.querySelectorAll('script').forEach(el => {
    const src = el.getAttribute('src') || '';
    const type = el.getAttribute('type') || '';
    const content = el.textContent || '';

    // Keep structured data
    if (type === 'application/ld+json') return;

    // Remove external scripts
    if (src) { el.remove(); return; }

    // Remove tracking scripts
    if (TRACKING_PATTERNS.test(content)) { el.remove(); return; }

    // If keepScripts is false, remove all remaining
    if (!keepScripts) el.remove();
  });

  // Strip lock/gate classes from article containers
  const lockClassPatterns = [
    /\blocked\b/, /\bis-locked\b/, /\bsubscriber-only\b/,
    /\bpremium-content\b/, /\bmembers-only\b/, /\bpaid-content\b/,
    /\brestricted\b/, /\bgated\b/, /\bpaywall-active\b/,
    /\barticle--locked\b/, /\bcontent--locked\b/
  ];
  doc.querySelectorAll('article *, [role="article"] *, [class*="article-body"] *, [class*="story-body"] *, main *').forEach(el => {
    const classAttr = el.getAttribute('class');
    if (!classAttr) return;
    const classes = classAttr.split(/\s+/);
    const filtered = classes.filter(cls => !lockClassPatterns.some(p => p.test(cls)));
    if (filtered.length !== classes.length) {
      el.setAttribute('class', filtered.join(' '));
    }
  });

  // Remove known overlay containers
  const overlaySelectors = [
    '[class*="paywall"]', '[class*="premium-gate"]',
    '[class*="subscribe-wall"]', '[class*="registration-wall"]',
    '[class*="cookie-consent"]', '[id*="cookie-consent"]',
    '[class*="cookie-banner"]', '[id*="cookie-banner"]',
  ];
  for (const sel of overlaySelectors) {
    doc.querySelectorAll(sel).forEach(el => {
      const style = getComputedStyle(el);
      if (style.position === 'fixed' || style.position === 'absolute' || style.position === 'sticky') {
        el.remove();
      }
    });
  }
}

/**
 * Inject CSS that forces readable colors on article content.
 * Defeats paywall techniques that hide text via dark-on-dark colors.
 */
function injectReadabilityCss(doc) {
  const style = doc.createElement('style');
  style.setAttribute('data-newsarchive', 'readability');
  style.textContent = `
    article, [role="article"], [data-testid="article-body"],
    [class*="story-body"], [class*="article-body"],
    [class*="post-content"], [class*="entry-content"],
    [class*="content-body"] {
      color: #1a1a1a !important;
      background: #fff !important;
    }
    article p, article li, article h1, article h2, article h3,
    article h4, article h5, article h6, article span, article a,
    article blockquote, article figcaption,
    [role="article"] p, [role="article"] li, [role="article"] span,
    [class*="article-body"] p, [class*="article-body"] span,
    [class*="story-body"] p, [class*="story-body"] span,
    [class*="post-content"] p, [class*="post-content"] span,
    [class*="entry-content"] p, [class*="entry-content"] span,
    [class*="content-body"] p, [class*="content-body"] span {
      color: #1a1a1a !important;
    }
    [class*="gradient"], [class*="fade"], [class*="backdrop"],
    [class*="curtain"], [class*="premium-overlay"] {
      background: transparent !important;
      display: none !important;
    }
    article *, [role="article"] *, [class*="article-body"] *,
    [class*="story-body"] *, [class*="post-content"] *,
    [class*="entry-content"] *, [class*="content-body"] * {
      filter: none !important;
      -webkit-filter: none !important;
      visibility: visible !important;
      opacity: 1 !important;
      clip-path: none !important;
    }
  `;
  const head = doc.querySelector('head');
  if (head) head.appendChild(style);
}

/**
 * Replace <link rel="stylesheet"> with inline <style> blocks.
 */
function inlineExternalCss(doc, assetMap) {
  doc.querySelectorAll('link[rel="stylesheet"]').forEach(el => {
    const href = el.getAttribute('href');
    if (!href) return;

    const asset = findInAssetMap(href, assetMap);
    if (asset && asset.cssText) {
      const style = doc.createElement('style');
      style.textContent = rewriteCssUrls(asset.cssText, assetMap);
      el.replaceWith(style);
    }
    // If no asset found, leave as-is (may still work if it's a CDN link)
  });
}

/**
 * Rewrite url(...) references in CSS text using asset data URIs.
 */
function rewriteCssUrls(cssText, assetMap) {
  return cssText.replace(/url\(\s*['"]?([^'")]+)['"]?\s*\)/g, (match, rawUrl) => {
    if (rawUrl.startsWith('data:')) return match;
    const asset = findInAssetMap(rawUrl, assetMap);
    if (asset) return `url(${asset.dataUri})`;
    return match;
  });
}

/**
 * Rewrite src, srcset, and inline style url() references to data URIs.
 */
function rewriteAssetUrls(doc, assetMap) {
  // img[src]
  doc.querySelectorAll('img[src]').forEach(el => {
    const asset = findInAssetMap(el.getAttribute('src'), assetMap);
    if (asset) el.setAttribute('src', asset.dataUri);
  });

  // img[srcset]
  doc.querySelectorAll('img[srcset]').forEach(el => {
    el.setAttribute('srcset', rewriteSrcset(el.getAttribute('srcset'), assetMap));
  });

  // source[src]
  doc.querySelectorAll('source[src]').forEach(el => {
    const asset = findInAssetMap(el.getAttribute('src'), assetMap);
    if (asset) el.setAttribute('src', asset.dataUri);
  });

  // source[srcset]
  doc.querySelectorAll('source[srcset]').forEach(el => {
    el.setAttribute('srcset', rewriteSrcset(el.getAttribute('srcset'), assetMap));
  });

  // video[src], audio[src]
  doc.querySelectorAll('video[src], audio[src]').forEach(el => {
    const asset = findInAssetMap(el.getAttribute('src'), assetMap);
    if (asset) el.setAttribute('src', asset.dataUri);
  });

  // link[href] (non-stylesheet, e.g. icons)
  doc.querySelectorAll('link[href]:not([rel="stylesheet"])').forEach(el => {
    const asset = findInAssetMap(el.getAttribute('href'), assetMap);
    if (asset) el.setAttribute('href', asset.dataUri);
  });

  // Promote lazy-load data attributes to src and rewrite them
  const lazyAttrs = ['data-src', 'data-lazy-src', 'data-original', 'data-lazy'];
  for (const attr of lazyAttrs) {
    doc.querySelectorAll(`img[${attr}]`).forEach(el => {
      const lazySrc = el.getAttribute(attr);
      const asset = findInAssetMap(lazySrc, assetMap);
      if (asset) {
        el.setAttribute('src', asset.dataUri);
        el.removeAttribute(attr);
      }
    });
  }
  doc.querySelectorAll('source[data-srcset]').forEach(el => {
    const lazySrcset = el.getAttribute('data-srcset');
    if (lazySrcset) {
      el.setAttribute('srcset', rewriteSrcset(lazySrcset, assetMap));
      el.removeAttribute('data-srcset');
    }
  });

  // Inline style url(...) rewriting
  doc.querySelectorAll('[style]').forEach(el => {
    const style = el.getAttribute('style');
    if (style && style.includes('url(')) {
      el.setAttribute('style', rewriteCssUrls(style, assetMap));
    }
  });

  // <style> blocks
  doc.querySelectorAll('style').forEach(el => {
    if (el.textContent && el.textContent.includes('url(')) {
      el.textContent = rewriteCssUrls(el.textContent, assetMap);
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
  for (const [origUrl, asset] of assetMap.entries()) {
    try {
      if (origUrl.endsWith(url) || url.endsWith(new URL(origUrl).pathname)) {
        return asset;
      }
    } catch {
      // skip
    }
  }
  return null;
}

/**
 * Rewrite a srcset attribute, replacing each URL with its data URI.
 */
function rewriteSrcset(srcset, assetMap) {
  if (!srcset) return '';
  return srcset.split(',').map(entry => {
    const parts = entry.trim().split(/\s+/);
    const url = parts[0];
    const descriptor = parts.slice(1).join(' ');
    const asset = findInAssetMap(url, assetMap);
    return asset ? `${asset.dataUri} ${descriptor}`.trim() : entry.trim();
  }).join(', ');
}

/**
 * Rewrite <a href="..."> links. External links are left as-is in the extension version.
 */
function rewriteHyperlinks(doc, originalUrl) {
  doc.querySelectorAll('a[href]').forEach(el => {
    const href = el.getAttribute('href');
    if (!href) return;
    if (href.startsWith('#') || href.startsWith('mailto:') || href.startsWith('tel:')) return;
    if (href.startsWith('javascript:')) {
      el.setAttribute('href', '#');
    }
  });
}

/**
 * Inject the archive toolbar at the top of <body>.
 */
function injectToolbar(doc, originalUrl, timestamp, snapshotId) {
  const toolbar = doc.createElement('div');
  toolbar.id = '__archive-toolbar__';
  toolbar.setAttribute('style',
    'position:fixed;top:0;left:0;right:0;z-index:2147483647;background:#1a1a2e;color:#e0e0e0;' +
    'padding:8px 16px;font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,sans-serif;' +
    'font-size:13px;display:flex;align-items:center;justify-content:space-between;' +
    'box-shadow:0 2px 8px rgba(0,0,0,0.3);gap:12px;'
  );

  toolbar.innerHTML =
    `<span style="flex-shrink:0;font-weight:600;color:#7c83ff;">&#128230; newsarchive</span>` +
    `<span style="overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">Archived from ` +
    `<a href="${escapeAttr(originalUrl)}" style="color:#64b5f6;text-decoration:none;" target="_blank">` +
    `${escapeHtml(originalUrl)}</a></span>` +
    `<span style="flex-shrink:0;color:#aaa;">${escapeHtml(timestamp)}</span>`;

  const spacer = doc.createElement('div');
  spacer.setAttribute('style', 'height:40px;');

  const body = doc.querySelector('body');
  if (body) {
    body.insertBefore(spacer, body.firstChild);
    body.insertBefore(toolbar, body.firstChild);
  }
}

/**
 * Add meta tags for archival metadata.
 */
function addMetaTags(doc, originalUrl, timestamp) {
  const head = doc.querySelector('head');
  if (!head) return;

  const metas = [
    { name: 'robots', content: 'noindex,noarchive' },
    { name: 'archived-from', content: originalUrl },
    { name: 'archived-at', content: timestamp },
  ];

  for (const { name, content } of metas) {
    const meta = doc.createElement('meta');
    meta.setAttribute('name', name);
    meta.setAttribute('content', content);
    head.appendChild(meta);
  }
}

function escapeHtml(str) {
  return str.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

function escapeAttr(str) {
  return str.replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}
