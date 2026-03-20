const { chromium } = require('playwright');
const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
const config = require('./config');
const { OVERLAY_SELECTORS_BROWSER, UNLOCK_CSS, LOCK_CLASS_PATTERNS } = require('./shared/constants');
const { getSiteHandler } = require('./sites');

/**
 * Generate a short random snapshot ID (6 hex chars).
 */
function generateSnapshotId() {
  return crypto.randomBytes(3).toString('hex');
}

/**
 * Load cookies from a JSON file if configured.
 * Expected format: array of { name, value, domain, path } objects.
 */
function loadCookies() {
  if (!config.cookiesFile) return null;
  const cookiePath = path.resolve(config.cookiesFile);
  if (!fs.existsSync(cookiePath)) return null;
  return JSON.parse(fs.readFileSync(cookiePath, 'utf-8'));
}

/**
 * Scroll the page from top to bottom to trigger Intersection Observer
 * callbacks and lazy-load images/content below the fold.
 */
async function scrollToBottom(page) {
  await page.evaluate(async () => {
    const delay = ms => new Promise(r => setTimeout(r, ms));
    const height = document.body.scrollHeight;
    const step = window.innerHeight;
    for (let y = 0; y < height; y += step) {
      window.scrollTo(0, y);
      await delay(100);
    }
    window.scrollTo(0, 0);
  });
  await page.waitForTimeout(1500);
}

/**
 * Promote lazy-load data attributes (data-src, data-lazy-src, etc.) to src
 * so images render without JavaScript in the archived snapshot.
 */
async function promoteLazyImages(page) {
  await page.evaluate(() => {
    document.querySelectorAll('img[data-src], img[data-lazy-src], img[data-original], img[data-lazy]').forEach(el => {
      const lazySrc = el.getAttribute('data-src') || el.getAttribute('data-lazy-src') ||
                      el.getAttribute('data-original') || el.getAttribute('data-lazy');
      if (lazySrc && (!el.src || el.src.includes('placeholder') || el.src.includes('data:') || el.src.includes('blank'))) {
        el.src = lazySrc;
      }
    });
    document.querySelectorAll('source[data-srcset]').forEach(el => {
      const lazySrcset = el.getAttribute('data-srcset');
      if (lazySrcset) el.srcset = lazySrcset;
    });
  });
}

/**
 * Dismiss overlays: paywall gates, cookie consent banners, modals.
 * Also inject CSS overrides to reveal truncated article content.
 */
async function dismissOverlays(page, { extraOverlaySelectors = [], extraLockPatterns = [], extraUnlockCss = '' } = {}) {
  await page.evaluate(({ selectors, unlockCss, lockPatterns }) => {
    // Remove paywall/overlay elements (only fixed/absolute/sticky positioned)
    for (const sel of selectors) {
      document.querySelectorAll(sel).forEach(el => {
        const style = window.getComputedStyle(el);
        if (
          style.position === 'fixed' || style.position === 'absolute' ||
          style.position === 'sticky' || el.getAttribute('role') === 'dialog'
        ) {
          el.remove();
        }
      });
    }

    // Restore scroll
    document.body.style.overflow = 'auto';
    document.documentElement.style.overflow = 'auto';

    // Inject CSS overrides to reveal article content hidden by paywall CSS.
    // Non-destructive: only adds style rules, never removes structural DOM nodes.
    const styleOverride = document.createElement('style');
    styleOverride.setAttribute('data-newsarchive', 'unlock');
    styleOverride.textContent = unlockCss;
    document.head.appendChild(styleOverride);

    // Strip lock/gate classes from article containers
    for (const patternStr of lockPatterns) {
      const pattern = new RegExp(patternStr);
      document.querySelectorAll('*').forEach(el => {
        if (!el.closest('article, [role="article"], [class*="article-body"], [class*="story-body"], main')) return;
        [...el.classList].forEach(cls => {
          if (pattern.test(cls)) el.classList.remove(cls);
        });
      });
    }

    // Reset negative text-indent used to hide content off-screen
    document.querySelectorAll('article *, [role="article"] *, [class*="article-body"] *, [class*="story-body"] *, main *').forEach(el => {
      const style = window.getComputedStyle(el);
      if (parseInt(style.textIndent, 10) < -99) {
        el.style.textIndent = '0';
      }
    });
  }, {
    selectors: [...OVERLAY_SELECTORS_BROWSER, ...extraOverlaySelectors],
    unlockCss: UNLOCK_CSS + '\n' + extraUnlockCss,
    lockPatterns: [...LOCK_CLASS_PATTERNS.map(p => p.source), ...extraLockPatterns],
  });
}

/**
 * Fetch a page using headless Chromium.
 * Returns { html, screenshot, title, snapshotId }.
 */
async function fetchPage(url) {
  const snapshotId = generateSnapshotId();
  const siteHandler = getSiteHandler(url);
  let browser;

  if (siteHandler) {
    console.log(`[fetcher] Using site handler: ${siteHandler.name}`);
  }

  try {
    browser = await chromium.launch({ headless: config.headless });
    const context = await browser.newContext({
      userAgent: config.userAgent,
      viewport: { width: 1280, height: 900 },
      extraHTTPHeaders: {
        'Referer': config.referer,
      },
    });

    // Inject cookies if available
    const cookies = loadCookies();
    if (cookies) {
      await context.addCookies(cookies);
    }

    const page = await context.newPage();

    // Run site-specific pre-configuration (request interception, cookie manipulation, etc.)
    if (siteHandler && siteHandler.preConfigure) {
      await siteHandler.preConfigure(page, url);
    }

    // Clear metered paywall state (localStorage/sessionStorage counters)
    if (config.clearMeterState) {
      // Merge generic + site-specific meter key patterns
      const meterPatterns = ['meter', 'paywall', 'article_count', 'pw_', 'visits', 'articleCount', 'freeArticle'];
      if (siteHandler && siteHandler.meterKeys) {
        meterPatterns.push(...siteHandler.meterKeys);
      }
      await page.addInitScript((patterns) => {
        try {
          for (let i = localStorage.length - 1; i >= 0; i--) {
            const key = localStorage.key(i);
            if (key && patterns.some(p => key.toLowerCase().includes(p.toLowerCase()))) {
              localStorage.removeItem(key);
            }
          }
          for (let i = sessionStorage.length - 1; i >= 0; i--) {
            const key = sessionStorage.key(i);
            if (key && patterns.some(p => key.toLowerCase().includes(p.toLowerCase()))) {
              sessionStorage.removeItem(key);
            }
          }
        } catch {
          // Storage may be unavailable
        }
      }, meterPatterns);
    }

    // Navigate with configured wait strategy
    const waitUntil = config.waitStrategy === 'domcontentloaded'
      ? 'domcontentloaded'
      : 'networkidle';

    await page.goto(url, {
      waitUntil,
      timeout: config.timeoutMs,
    });

    // Give a brief moment for late-loading content
    await page.waitForTimeout(1000);

    // Scroll page to trigger Intersection Observer lazy loading
    await scrollToBottom(page);

    // Promote lazy-load data attributes to src
    await promoteLazyImages(page);

    // Dismiss overlays (paywall, cookie consent, etc.) — merge site-specific selectors
    const extraOverlaySelectors = siteHandler ? siteHandler.overlaySelectors || [] : [];
    const extraLockPatterns = siteHandler ? (siteHandler.lockClassPatterns || []).map(p => p.source) : [];
    const extraUnlockCss = siteHandler ? siteHandler.unlockCss || '' : '';
    await dismissOverlays(page, { extraOverlaySelectors, extraLockPatterns, extraUnlockCss });

    // Run site-specific post-processing
    if (siteHandler && siteHandler.postProcess) {
      await siteHandler.postProcess(page, url);
    }

    // Wait briefly after overlay removal for reflow
    await page.waitForTimeout(500);

    // Capture the fully-rendered HTML
    const html = await page.evaluate(() => document.documentElement.outerHTML);

    // Get page title
    const title = await page.title();

    // Capture full-page screenshot
    const screenshot = await page.screenshot({ fullPage: true, type: 'png' });

    await browser.close();
    browser = null;

    return { html: `<!DOCTYPE html>\n<html${getHtmlAttrs(html)}>\n${getInnerContent(html)}`, screenshot, title, snapshotId };
  } finally {
    if (browser) await browser.close().catch(() => {});
  }
}

/**
 * Extract html tag attributes from outerHTML string.
 */
function getHtmlAttrs(html) {
  const match = html.match(/^<html([^>]*)>/i);
  return match ? match[1] : '';
}

/**
 * Get inner content of the <html> tag.
 */
function getInnerContent(html) {
  // outerHTML includes <html>...</html>, we need the content inside
  const startIdx = html.indexOf('>') + 1;
  const endIdx = html.lastIndexOf('</html>');
  return endIdx > startIdx ? html.slice(startIdx, endIdx) : html;
}

module.exports = { fetchPage, generateSnapshotId };
