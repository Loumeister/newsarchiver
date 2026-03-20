/**
 * DPG Media site handler.
 *
 * DPG Media publishes several major Dutch news sites with hard paywalls.
 * Content is NOT delivered in the DOM for non-subscribers, but full
 * articleBody is embedded in JSON-LD structured data for SEO.
 *
 * Covered sites: AD.nl, Volkskrant, Trouw, Het Parool, Tubantia,
 * Eindhovens Dagblad, BN DeStem, PZC, De Gelderlander, De Stentor, BD.
 */

const name = 'dpg';

const DPG_DOMAINS = [
  'ad.nl', 'volkskrant.nl', 'trouw.nl', 'parool.nl',
  'tubantia.nl', 'ed.nl', 'bndestem.nl', 'pzc.nl',
  'gelderlander.nl', 'destentor.nl', 'bd.nl',
];

/**
 * Match any DPG Media domain.
 */
function matches(url) {
  try {
    const hostname = new URL(url).hostname;
    return DPG_DOMAINS.some(d =>
      hostname === d || hostname === 'www.' + d || hostname.endsWith('.' + d)
    );
  } catch {
    return false;
  }
}

/**
 * Hard paywall — content is not in the DOM for non-subscribers.
 * Signals the fallback chain to always run.
 */
const paywallType = 'hard';

/**
 * DPG-specific overlay selectors.
 */
const overlaySelectors = [
  '[class*="paywall"]',
  '[data-testid*="paywall"]',
  '[class*="premium"]',
  '[id*="piano"]',
  '[class*="article-wall"]',
];

/**
 * DPG lock-class patterns.
 */
const lockClassPatterns = [
  /\bpremium\b/,
  /\blocked\b/,
  /\bpaywall\b/,
];

/**
 * DPG-specific CSS overrides.
 */
const unlockCss = `
  /* DPG article containers */
  article, [class*="article-body"], [class*="article__body"],
  [class*="article-content"], [class*="article__content"] {
    overflow: visible !important;
    max-height: none !important;
    height: auto !important;
  }
  /* Remove DPG premium/paywall overlays */
  [class*="paywall"], [class*="premium-overlay"],
  [class*="article-wall"] {
    display: none !important;
  }`;

module.exports = {
  name,
  matches,
  paywallType,
  overlaySelectors,
  lockClassPatterns,
  unlockCss,
};
