const { chromium } = require('playwright');
const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
const config = require('./config');

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
 * Dismiss overlays: paywall gates, cookie consent banners, modals.
 * Also inject CSS overrides to reveal truncated article content.
 */
async function dismissOverlays(page) {
  await page.evaluate(() => {
    // Remove paywall/overlay elements (only fixed/absolute/sticky positioned)
    const selectors = [
      '[class*="paywall"]', '[class*="wall"]', '[id*="paywall"]',
      '[class*="premium-gate"]', '[class*="cookie"]', '[id*="consent"]',
      '[class*="overlay"]', '[class*="modal"]', '[class*="subscribe-gate"]',
      '[class*="registration-wall"]',
    ];
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
    styleOverride.textContent = `
      article, [role="article"], [data-testid="article-body"],
      [class*="story-body"], [class*="article-body"],
      [class*="post-content"], [class*="entry-content"],
      [class*="content-body"] {
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
      /* Remove gradient/backdrop overlays used as paywall fade-out */
      [class*="gradient"], [class*="fade"], [class*="backdrop"],
      [class*="curtain"], [class*="premium-overlay"] {
        background: transparent !important;
        display: none !important;
      }
      html, body {
        overflow: visible !important;
        height: auto !important;
      }
    `;
    document.head.appendChild(styleOverride);
  });
}

/**
 * Fetch a page using headless Chromium.
 * Returns { html, screenshot, title, snapshotId }.
 */
async function fetchPage(url) {
  const snapshotId = generateSnapshotId();
  let browser;

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

    // Dismiss overlays (paywall, cookie consent, etc.)
    await dismissOverlays(page);

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
