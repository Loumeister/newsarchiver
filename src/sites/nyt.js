/**
 * NYT (New York Times) site-specific handler.
 *
 * NYT uses a client-side metered paywall:
 * - Full article HTML is delivered server-side (SSR React)
 * - Paywall overlay (#gateway-content / [data-testid="inline-message"]) hides content
 * - Cookie-based metering tracks free article views (nyt-a, nyt-purr, nyt-b, nyt-geo)
 * - Content container: [data-testid="StoryBodyCompanionColumn"] / article#story
 * - Content is truncated via CSS max-height + overflow:hidden, not removed from DOM
 * - Gateway overlay selectors have evolved: #gatewayCreative → #gateway-content → css-hash classes
 */

const name = 'nyt';

/**
 * Match any nytimes.com URL.
 */
function matches(url) {
  try {
    const hostname = new URL(url).hostname;
    return hostname === 'www.nytimes.com' || hostname === 'nytimes.com'
      || hostname.endsWith('.nytimes.com');
  } catch {
    return false;
  }
}

/**
 * NYT metering keys stored in localStorage/sessionStorage.
 */
const meterKeys = [
  'nyt-a', 'nyt-purr', 'nyt-b', 'nyt-geo', 'nyt-mab',
  'nyt-jkidd', 'nyt-gdpr', 'nyt-us', 'nyt-tos',
  'meter', 'gateway', 'articleCount', 'freeArticle',
];

/**
 * NYT-specific overlay selectors (gateway, inline message, registration gate).
 */
const overlaySelectors = [
  '#gateway-content',
  '#gatewayCreative',
  '[data-testid="inline-message"]',
  '[data-testid="gateway"]',
  '[class*="gateway"]',
  '[id*="gateway"]',
  '[data-testid="registration-wall"]',
  '[class*="css-mcm29f"]',
  '[class*="css-1bd8bfl"]',
  '.expanded-dock',
];

/**
 * NYT lock-class patterns.
 */
const lockClassPatterns = [
  /\bgateway-visible\b/,
  /\bshowing-gateway\b/,
  /\btruncated\b/,
];

/**
 * NYT-specific CSS overrides to reveal full article content.
 */
const unlockCss = `
  /* NYT article body containers */
  [data-testid="StoryBodyCompanionColumn"],
  section[name="articleBody"],
  article#story,
  [class*="StoryBodyCompanionColumn"] {
    overflow: visible !important;
    max-height: none !important;
    height: auto !important;
  }
  /* NYT truncation containers */
  [class*="StoryBodyCompanionColumn"] > div {
    max-height: none !important;
    overflow: visible !important;
  }
  /* Remove NYT gateway/overlay elements */
  #gateway-content, #gatewayCreative,
  [data-testid="inline-message"],
  [data-testid="gateway"],
  .expanded-dock {
    display: none !important;
  }
  /* Ensure all paragraphs inside NYT article are visible */
  [data-testid="StoryBodyCompanionColumn"] p,
  section[name="articleBody"] p,
  article#story p {
    display: block !important;
    visibility: visible !important;
    opacity: 1 !important;
  }`;

/**
 * Pre-navigation setup: clear NYT-specific metering cookies and storage.
 */
async function preConfigure(page, url) {
  // Block NYT meter/gateway scripts to prevent paywall from activating
  await page.route('**/*', (route) => {
    const reqUrl = route.request().url();
    if (
      reqUrl.includes('meter') ||
      reqUrl.includes('gateway') ||
      reqUrl.includes('vi-assets/static/gateway')
    ) {
      return route.abort();
    }
    return route.continue();
  });

  // Set init script to clear NYT meter state before any page JS runs
  await page.addInitScript(() => {
    // Override document.cookie getter/setter to filter meter cookies
    const nytCookiePatterns = ['nyt-a', 'nyt-purr', 'nyt-b', 'nyt-mab', 'nyt-jkidd', 'nyt-geo'];
    const originalCookieDescriptor = Object.getOwnPropertyDescriptor(Document.prototype, 'cookie');
    if (originalCookieDescriptor) {
      Object.defineProperty(document, 'cookie', {
        get() {
          const raw = originalCookieDescriptor.get.call(this);
          return raw.split(';')
            .filter(c => !nytCookiePatterns.some(p => c.trim().startsWith(p + '=')))
            .join(';');
        },
        set(val) {
          // Allow setting but silently drop meter cookies
          if (nytCookiePatterns.some(p => val.trim().startsWith(p + '='))) return;
          originalCookieDescriptor.set.call(this, val);
        },
      });
    }

    // Clear NYT keys from storage
    try {
      const patterns = ['nyt-', 'meter', 'gateway', 'articleCount', 'freeArticle'];
      for (let i = localStorage.length - 1; i >= 0; i--) {
        const key = localStorage.key(i);
        if (key && patterns.some(p => key.includes(p))) localStorage.removeItem(key);
      }
      for (let i = sessionStorage.length - 1; i >= 0; i--) {
        const key = sessionStorage.key(i);
        if (key && patterns.some(p => key.includes(p))) sessionStorage.removeItem(key);
      }
    } catch { /* storage unavailable */ }
  });
}

/**
 * Post-processing: remove NYT gateway elements and reveal article body.
 */
async function postProcess(page) {
  await page.evaluate(() => {
    // Remove gateway overlay elements
    const gatewaySelectors = [
      '#gateway-content', '#gatewayCreative',
      '[data-testid="inline-message"]', '[data-testid="gateway"]',
      '[data-testid="registration-wall"]',
      '.expanded-dock',
    ];
    for (const sel of gatewaySelectors) {
      document.querySelectorAll(sel).forEach(el => el.remove());
    }

    // Restore scroll on body
    document.body.style.overflow = 'auto';
    document.documentElement.style.overflow = 'auto';

    // Remove NYT's height/overflow restrictions on story body containers
    document.querySelectorAll(
      '[data-testid="StoryBodyCompanionColumn"], section[name="articleBody"], article#story'
    ).forEach(el => {
      el.style.maxHeight = 'none';
      el.style.overflow = 'visible';
      el.style.height = 'auto';
    });
  });
}

/**
 * Extract article content from NYT's specific DOM structure.
 * Returns article text if found, or null to fall back to generic extraction.
 */
async function extractContent(page) {
  return page.evaluate(() => {
    // Try NYT's known content containers in order of specificity
    const selectors = [
      '[data-testid="StoryBodyCompanionColumn"]',
      'section[name="articleBody"]',
      'article#story',
      'article[data-testid="article"]',
    ];

    for (const sel of selectors) {
      const el = document.querySelector(sel);
      if (el && el.textContent.trim().length > 200) {
        return el.textContent.trim();
      }
    }

    // Fallback: try JSON-LD structured data
    const ldScripts = document.querySelectorAll('script[type="application/ld+json"]');
    for (const script of ldScripts) {
      try {
        const data = JSON.parse(script.textContent);
        if (data.articleBody) return data.articleBody;
        if (Array.isArray(data['@graph'])) {
          const article = data['@graph'].find(item => item.articleBody);
          if (article) return article.articleBody;
        }
      } catch { /* invalid JSON */ }
    }

    return null;
  });
}

module.exports = {
  name,
  matches,
  meterKeys,
  overlaySelectors,
  lockClassPatterns,
  unlockCss,
  preConfigure,
  postProcess,
  extractContent,
};
