/**
 * Content script injected into the target tab.
 * Dismisses overlays, unlocks truncated article content, captures the
 * rendered DOM, and sends it back.
 */

(async () => {
  // Clear metered paywall state (localStorage/sessionStorage counters)
  try {
    const meterPatterns = ['meter', 'paywall', 'article_count', 'pw_', 'visits', 'articleCount', 'freeArticle'];
    for (let i = localStorage.length - 1; i >= 0; i--) {
      const key = localStorage.key(i);
      if (key && meterPatterns.some(p => key.toLowerCase().includes(p))) {
        localStorage.removeItem(key);
      }
    }
    for (let i = sessionStorage.length - 1; i >= 0; i--) {
      const key = sessionStorage.key(i);
      if (key && meterPatterns.some(p => key.toLowerCase().includes(p))) {
        sessionStorage.removeItem(key);
      }
    }
  } catch {
    // Storage may be unavailable
  }

  // Scroll the page to trigger Intersection Observer lazy loading
  {
    const delay = ms => new Promise(r => setTimeout(r, ms));
    const height = document.body.scrollHeight;
    const step = window.innerHeight;
    for (let y = 0; y < height; y += step) {
      window.scrollTo(0, y);
      await delay(100);
    }
    window.scrollTo(0, 0);
    await delay(1500);
  }

  // Promote lazy-load data attributes to src
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

  // Dismiss paywall/cookie/overlay elements (only fixed/absolute/sticky positioned)
  const overlaySelectors = [
    '[class*="paywall"]', '[class*="wall"]', '[id*="paywall"]',
    '[class*="premium-gate"]', '[class*="cookie"]', '[id*="consent"]',
    '[class*="overlay"]', '[class*="modal"]', '[class*="subscribe-gate"]',
    '[class*="registration-wall"]',
    '[data-paywall]', '[data-premium]', '[class*="meter"]',
    '[aria-modal="true"]', '[class*="piano"]', '[id*="piano"]',
    '[class*="signin"]', '[class*="sign-in"]',
    '[class*="regwall"]', '[class*="tp-modal"]', '[id*="tp-modal"]',
  ];

  for (const sel of overlaySelectors) {
    document.querySelectorAll(sel).forEach(el => {
      const style = window.getComputedStyle(el);
      if (
        style.position === 'fixed' || style.position === 'absolute' ||
        style.position === 'sticky' || el.getAttribute('role') === 'dialog' ||
        el.getAttribute('aria-modal') === 'true'
      ) {
        el.remove();
      }
    });
  }

  // Remove interstitial/subscribe prompts that block content
  document.querySelectorAll('[class*="interstitial"], [class*="barrier"], [class*="gate"]').forEach(el => {
    const style = window.getComputedStyle(el);
    if (style.position === 'fixed' || style.position === 'absolute' || style.zIndex > 999) {
      el.remove();
    }
  });

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

    /* Ensure html/body scroll is not locked */
    html, body {
      overflow: visible !important;
      height: auto !important;
    }
  `;
  document.head.appendChild(styleOverride);

  // Strip lock/gate classes from article containers
  const lockClassPatterns = [
    /\blocked\b/, /\bis-locked\b/, /\bsubscriber-only\b/,
    /\bpremium-content\b/, /\bmembers-only\b/, /\bpaid-content\b/,
    /\brestricted\b/, /\bgated\b/, /\bpaywall-active\b/,
    /\barticle--locked\b/, /\bcontent--locked\b/
  ];
  document.querySelectorAll('*').forEach(el => {
    if (!el.closest('article, [role="article"], [class*="article-body"], [class*="story-body"], main')) return;
    [...el.classList].forEach(cls => {
      if (lockClassPatterns.some(p => p.test(cls))) el.classList.remove(cls);
    });
  });

  // Reset negative text-indent used to hide content off-screen
  document.querySelectorAll('article *, [role="article"] *, [class*="article-body"] *, [class*="story-body"] *, main *').forEach(el => {
    const style = window.getComputedStyle(el);
    if (parseInt(style.textIndent, 10) < -99) {
      el.style.textIndent = '0';
    }
  });

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
