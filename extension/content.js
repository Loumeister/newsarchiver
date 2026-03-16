/**
 * Content script injected into the target tab.
 * Dismisses overlays, unlocks truncated article content, captures the
 * rendered DOM, and sends it back.
 */

(async () => {
  // Dismiss paywall/cookie/overlay elements
  const overlaySelectors = [
    '[class*="paywall"]', '[class*="wall"]', '[id*="paywall"]',
    '[class*="premium-gate"]', '[class*="cookie"]', '[id*="consent"]',
    '[class*="overlay"]', '[class*="modal"]', '[class*="subscribe-gate"]',
    '[class*="registration-wall"]',
  ];

  for (const sel of overlaySelectors) {
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

  // Remove gate/metering elements that block article content
  const gateSelectors = [
    '[id*="gateway"]', '[class*="gateway"]',
    '[id*="meter"]', '[class*="meter"]',
    '[data-testid*="paywall"]', '[data-testid*="inline-message"]',
    '[class*="subscribe-callout"]', '[class*="truncate-content"]',
    '[id*="subscribe"]', '[class*="regwall"]',
    '[aria-label*="subscribe"]',
  ];
  for (const sel of gateSelectors) {
    document.querySelectorAll(sel).forEach(el => el.remove());
  }

  // Restore scroll in case it was locked
  document.body.style.overflow = 'auto';
  document.documentElement.style.overflow = 'auto';

  // Unlock CSS-hidden article content: remove overflow/height restrictions
  // that paywalled sites use to truncate articles.
  const articleContainers = document.querySelectorAll(
    'article, [role="article"], [class*="article"], [class*="story-body"], ' +
    '[class*="post-content"], [class*="entry-content"], [class*="content-body"], ' +
    '[data-testid="article-body"], main, [id*="article"], [class*="Article"]'
  );
  for (const container of articleContainers) {
    container.style.overflow = 'visible';
    container.style.maxHeight = 'none';
    container.style.height = 'auto';

    // Also unlock all child elements within article that may be hidden
    container.querySelectorAll('*').forEach(child => {
      const cs = window.getComputedStyle(child);
      if (cs.overflow === 'hidden' && cs.maxHeight !== 'none') {
        child.style.overflow = 'visible';
        child.style.maxHeight = 'none';
      }
      // Reveal hidden paragraphs/sections within the article
      if (cs.display === 'none' && (
        child.tagName === 'P' || child.tagName === 'SECTION' ||
        child.tagName === 'DIV' || child.tagName === 'FIGURE'
      )) {
        child.style.display = '';
        // If still hidden after removing inline style, force block
        if (window.getComputedStyle(child).display === 'none') {
          child.style.setProperty('display', 'block', 'important');
        }
      }
    });
  }

  // Inject a style override to disable common paywall CSS class patterns
  const styleOverride = document.createElement('style');
  styleOverride.textContent = `
    [class*="truncat"], [class*="collapsed"], [class*="preview-only"],
    [class*="gated"], [class*="hidden-content"] {
      max-height: none !important;
      overflow: visible !important;
      display: block !important;
    }
    body, html {
      overflow: visible !important;
    }
  `;
  document.head.appendChild(styleOverride);

  // Wait briefly for reflow after overlay removal and style changes
  await new Promise(resolve => setTimeout(resolve, 500));

  // Capture the fully-rendered HTML
  const html = document.documentElement.outerHTML;

  // Send the captured data back to the background service worker
  chrome.runtime.sendMessage({
    action: 'pageCaptured',
    data: {
      html,
      title: document.title,
      url: window.location.href,
    },
  });
})();
