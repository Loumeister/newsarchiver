// Tracking/analytics script patterns to remove
const TRACKING_PATTERNS = /gtag|fbq|_gaq|dataLayer|adsbygoogle|google-analytics|googletag|GoogleAnalyticsObject|ga\s*\(|_paq|hotjar|mixpanel|segment\.com|optimizely|amplitude/i;

// Overlay/paywall selectors used in both fetcher (browser-side) and rewriter (server-side)
const OVERLAY_SELECTORS_BROWSER = [
  '[class*="paywall"]', '[class*="wall"]', '[id*="paywall"]',
  '[class*="premium-gate"]', '[class*="cookie"]', '[id*="consent"]',
  '[class*="overlay"]', '[class*="modal"]', '[class*="subscribe-gate"]',
  '[class*="registration-wall"]',
];

const OVERLAY_SELECTORS_REWRITER = [
  '[class*="paywall"]', '[class*="premium-gate"]',
  '[class*="subscribe-wall"]', '[class*="registration-wall"]',
  '[class*="cookie-consent"]', '[id*="cookie-consent"]',
  '[class*="cookie-banner"]', '[id*="cookie-banner"]',
];

// CSS selectors for article content containers
const ARTICLE_SELECTORS = `article, [role="article"], [data-testid="article-body"],
    [class*="story-body"], [class*="article-body"],
    [class*="post-content"], [class*="entry-content"],
    [class*="content-body"]`;

// Readability CSS injected into snapshots to defeat color-based paywall obfuscation
const READABILITY_CSS = `
    ${ARTICLE_SELECTORS} {
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
    }`;

// Lock/gate class patterns to strip from article elements
const LOCK_CLASS_PATTERNS = [
  /\blocked\b/, /\bis-locked\b/, /\bsubscriber-only\b/,
  /\bpremium-content\b/, /\bmembers-only\b/, /\bpaid-content\b/,
  /\brestricted\b/, /\bgated\b/, /\bpaywall-active\b/,
  /\barticle--locked\b/, /\bcontent--locked\b/
];

// CSS overrides injected by fetcher to unlock paywalled content in-browser
const UNLOCK_CSS = `
      ${ARTICLE_SELECTORS} {
        overflow: visible !important;
        max-height: none !important;
        height: auto !important;
      }
      article p, [role="article"] p,
      [data-testid="article-body"] p,
      [class*="story-body"] p,
      [class*="article-body"] p {
        display: block !important;
      }
      [class*="truncat"], [class*="preview-only"],
      [class*="gated-content"] {
        max-height: none !important;
        overflow: visible !important;
      }
      /* Force readable colors — defeats dark-background text obfuscation */
      ${ARTICLE_SELECTORS} {
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
      /* Remove gradient/backdrop overlays used as paywall fade-out */
      [class*="gradient"], [class*="fade"], [class*="backdrop"],
      [class*="curtain"], [class*="premium-overlay"] {
        background: transparent !important;
        display: none !important;
      }
      /* Remove blur/filter overlays */
      article *, [role="article"] *, [class*="article-body"] *,
      [class*="story-body"] *, [class*="post-content"] *,
      [class*="entry-content"] *, [class*="content-body"] * {
        filter: none !important;
        -webkit-filter: none !important;
      }
      /* Override visibility/opacity/clip-path hiding */
      article *, [role="article"] *, [class*="article-body"] *,
      [class*="story-body"] *, [class*="post-content"] *,
      [class*="entry-content"] *, [class*="content-body"] * {
        visibility: visible !important;
        opacity: 1 !important;
        clip-path: none !important;
      }
      html, body {
        overflow: visible !important;
        height: auto !important;
      }`;

module.exports = {
  TRACKING_PATTERNS,
  OVERLAY_SELECTORS_BROWSER,
  OVERLAY_SELECTORS_REWRITER,
  ARTICLE_SELECTORS,
  READABILITY_CSS,
  UNLOCK_CSS,
  LOCK_CLASS_PATTERNS,
};
