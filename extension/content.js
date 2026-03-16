/**
 * Content script injected into the target tab.
 * Dismisses overlays, captures the rendered DOM, and sends it back.
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

  // Restore scroll in case it was locked
  document.body.style.overflow = 'auto';
  document.documentElement.style.overflow = 'auto';

  // Wait briefly for reflow after overlay removal
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
