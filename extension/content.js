/**
 * Content script injected into the target tab.
 * Dismisses overlays, unlocks truncated article content, captures the
 * rendered DOM, and sends it back.
 */

(async () => {
  // Dismiss paywall/cookie/overlay elements (only fixed/absolute/sticky positioned)
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

  // Inject CSS overrides to reveal article content hidden by paywall CSS.
  // This is non-destructive — it only adds style rules, never removes DOM nodes
  // that could be structural.
  const styleOverride = document.createElement('style');
  styleOverride.setAttribute('data-newsarchive', 'unlock');
  styleOverride.textContent = `
    /* Unlock article body containers that use overflow/height to truncate */
    article, [role="article"], [data-testid="article-body"],
    [class*="story-body"], [class*="article-body"],
    [class*="post-content"], [class*="entry-content"],
    [class*="content-body"] {
      overflow: visible !important;
      max-height: none !important;
      height: auto !important;
    }

    /* Reveal paragraphs hidden inside article elements */
    article p, [role="article"] p,
    [data-testid="article-body"] p,
    [class*="story-body"] p,
    [class*="article-body"] p {
      display: block !important;
    }

    /* Override common paywall truncation class patterns */
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

    /* Ensure html/body scroll is not locked */
    html, body {
      overflow: visible !important;
      height: auto !important;
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
