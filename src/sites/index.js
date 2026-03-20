/**
 * Site-handler registry.
 *
 * Each handler in ./handlers/ exports:
 *   matches(url)            – returns true if this handler applies
 *   preConfigure(page, url) – (optional) run before navigation (e.g. set cookies, intercept requests)
 *   postProcess(page, url)  – (optional) run after page load & generic overlay removal
 *   extractContent(page)    – (optional) extract article text from site-specific DOM structure
 *   meterKeys               – (optional) array of extra localStorage/sessionStorage key patterns to clear
 *   overlaySelectors        – (optional) array of extra CSS selectors for overlay removal
 *   lockClassPatterns       – (optional) array of extra RegExp patterns for lock-class stripping
 *   unlockCss               – (optional) extra CSS to inject for content reveal
 */

const handlers = [
  require('./nyt'),
];

/**
 * Find the first matching site handler for a URL.
 * Returns the handler object, or null if no site-specific handler exists.
 */
function getSiteHandler(url) {
  for (const handler of handlers) {
    if (handler.matches(url)) return handler;
  }
  return null;
}

module.exports = { getSiteHandler, handlers };
