const config = require('../config');

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

module.exports = { rewriteHyperlinks };
