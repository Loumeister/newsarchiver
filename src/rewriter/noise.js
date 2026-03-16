const config = require('../config');
const { TRACKING_PATTERNS, OVERLAY_SELECTORS_REWRITER } = require('../shared/constants');

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
  for (const sel of OVERLAY_SELECTORS_REWRITER) {
    $(sel).each((_, el) => {
      const $el = $(el);
      const pos = $el.css('position');
      if (pos === 'fixed' || pos === 'absolute' || pos === 'sticky') {
        $el.remove();
      }
    });
  }
}

module.exports = { removeNoiseElements };
