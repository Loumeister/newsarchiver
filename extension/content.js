/**
 * Content script for newsarchive / PaywallVault.
 *
 * Execution flow:
 *   1. Request site-specific rules from background service worker.
 *   2. Clear meter cookies / localStorage keys from the matched rule.
 *   3. Apply site-specific remove/unlock selectors.
 *   4. Apply generic overlay + CSS unlock pass.
 *   5. Install a MutationObserver for SPA-injected paywall elements.
 *   6. Scroll page to trigger lazy loading.
 *   7. (Archive pipeline) Capture outerHTML and send back to background.
 */

(async () => {
  // ── 1. Fetch site-specific rules ────────────────────────────────────────
  let siteRule = null;
  try {
    siteRule = await new Promise((resolve) => {
      chrome.runtime.sendMessage(
        { action: 'getRulesForDomain', domain: window.location.hostname },
        (response) => resolve(response && response.rule ? response.rule : null)
      );
    });
  } catch {
    // Background may not be reachable in standalone injection; proceed without rule
  }

  // ── 2. Clear meter storage ──────────────────────────────────────────────
  if (siteRule) {
    // Clear matching localStorage keys
    if (Array.isArray(siteRule.localStorageClear)) {
      try {
        for (let i = localStorage.length - 1; i >= 0; i--) {
          const key = localStorage.key(i);
          if (key && siteRule.localStorageClear.some(p => key.toLowerCase().includes(p.toLowerCase()))) {
            localStorage.removeItem(key);
          }
        }
      } catch { /* storage may be unavailable */ }
    }

    // Clear site-specific cookies by setting max-age=0
    if (Array.isArray(siteRule.cookieClear)) {
      try {
        for (const name of siteRule.cookieClear) {
          document.cookie = `${name}=; max-age=0; path=/; domain=${window.location.hostname}`;
          document.cookie = `${name}=; max-age=0; path=/`;
        }
      } catch { /* cookie access may fail */ }
    }
  }

  // Generic meter key clear (runs regardless of site rule)
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
  } catch { /* storage may be unavailable */ }

  // ── 3. Site-specific DOM manipulation ───────────────────────────────────

  /**
   * Remove elements matching a list of CSS selectors.
   * @param {string[]} selectors
   */
  function removeBySelectors(selectors) {
    if (!Array.isArray(selectors)) return;
    for (const sel of selectors) {
      try {
        document.querySelectorAll(sel).forEach(el => el.remove());
      } catch { /* invalid selector — skip */ }
    }
  }

  /**
   * Unlock article containers — remove max-height, overflow, blur, etc.
   * @param {string[]} selectors
   */
  function unlockBySelectors(selectors) {
    if (!Array.isArray(selectors)) return;
    for (const sel of selectors) {
      try {
        document.querySelectorAll(sel).forEach(el => {
          el.style.maxHeight = 'none';
          el.style.overflow = 'visible';
          el.style.height = 'auto';
          el.style.filter = 'none';
          el.style.webkitFilter = 'none';
          el.style.clipPath = 'none';
          el.style.webkitClipPath = 'none';
          el.style.opacity = '1';
          el.style.visibility = 'visible';
        });
      } catch { /* invalid selector — skip */ }
    }
  }

  if (siteRule) {
    removeBySelectors(siteRule.removeSelectors);
    unlockBySelectors(siteRule.unlockSelectors);

    // Inject site-specific CSS override if provided
    if (siteRule.cssUnlock) {
      const style = document.createElement('style');
      style.setAttribute('data-newsarchive', 'site-unlock');
      style.textContent = siteRule.cssUnlock;
      document.head.appendChild(style);
    }
  }

  // ── 4. Generic overlay removal ───────────────────────────────────────────
  const GENERIC_REMOVE_SELECTORS = [
    // Piano/TP (paywall platform used by 100s of publishers)
    '.tp-modal', '.tp-backdrop', '#tp-container', '.tp-container-inner',
    '[id*="piano"]', '[class*="piano-id"]', '[class*="tp-modal"]',
    // Generic paywall patterns
    '[class*="paywall-modal"]', '[class*="paywall-container"]',
    '[class*="paywall-overlay"]', '[class*="paywall-gate"]',
    '[id*="paywall"]', '[data-paywall]', '[data-premium]',
    // Registration / sign-in walls
    '[class*="regwall"]', '[class*="registration-wall"]',
    '[class*="sign-in-gate"]', '[class*="login-gate"]',
    '[class*="access-gate"]', '[class*="article-gate"]',
    '[class*="subscribe-wall"]', '[class*="subscription-wall"]',
    // Meter / banner
    '[class*="meter-paywall"]', '[class*="meter-bar"]',
    // Modals/overlays with paywall roles
    '[aria-modal="true"][class*="paywall"]',
    '[role="dialog"][class*="paywall"]',
    '[role="dialog"][class*="subscribe"]',
  ];

  // Remove fixed/absolute/sticky overlays matching generic selectors
  const overlaySelectors = [
    ...GENERIC_REMOVE_SELECTORS,
    '[class*="paywall"]', '[class*="wall"]', '[id*="paywall"]',
    '[class*="premium-gate"]', '[class*="cookie"]', '[id*="consent"]',
    '[class*="overlay"]', '[class*="modal"]', '[class*="subscribe-gate"]',
    '[class*="registration-wall"]',
    '[class*="piano"]', '[id*="piano"]',
    '[class*="signin"]', '[class*="sign-in"]',
    '[class*="regwall"]', '[class*="tp-modal"]', '[id*="tp-modal"]',
  ];

  for (const sel of overlaySelectors) {
    try {
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
    } catch { /* invalid selector */ }
  }

  // Remove interstitial/barrier elements that block content
  document.querySelectorAll('[class*="interstitial"], [class*="barrier"], [class*="gate"]').forEach(el => {
    const style = window.getComputedStyle(el);
    if (style.position === 'fixed' || style.position === 'absolute' || Number(style.zIndex) > 999) {
      el.remove();
    }
  });

  // Restore scroll in case it was locked
  document.body.style.overflow = 'auto';
  document.documentElement.style.overflow = 'auto';

  // ── 5. Generic CSS unlock injection ──────────────────────────────────────
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
    [class*="gradient"][class*="paywall"],
    [class*="fade"][class*="paywall"],
    [class*="backdrop"][class*="paywall"],
    [class*="curtain"], [class*="premium-overlay"] {
      background: transparent !important;
      display: none !important;
    }
    article *, [role="article"] *, [class*="article-body"] *,
    [class*="story-body"] *, [class*="post-content"] *,
    [class*="entry-content"] *, [class*="content-body"] * {
      filter: none !important;
      -webkit-filter: none !important;
    }
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
  document.querySelectorAll(
    'article *, [role="article"] *, [class*="article-body"] *, [class*="story-body"] *, main *'
  ).forEach(el => {
    const style = window.getComputedStyle(el);
    if (parseInt(style.textIndent, 10) < -99) {
      el.style.textIndent = '0';
    }
  });

  // ── 6. MutationObserver for SPA-injected paywall elements ─────────────────
  // Sites like Medium, Bloomberg, and Substack inject paywall overlays after
  // the React/Vue tree renders — the observer catches and removes them.

  const allRemoveSelectors = [
    ...(siteRule && Array.isArray(siteRule.removeSelectors) ? siteRule.removeSelectors : []),
    ...GENERIC_REMOVE_SELECTORS,
  ];

  /**
   * Remove a node if it matches any paywall selector.
   * @param {Node} node
   */
  function maybeRemovePaywallNode(node) {
    if (!(node instanceof Element)) return;
    for (const sel of allRemoveSelectors) {
      try {
        if (node.matches(sel)) {
          node.remove();
          return;
        }
      } catch { /* invalid selector */ }
    }
    // Check descendants too
    for (const sel of allRemoveSelectors) {
      try {
        node.querySelectorAll(sel).forEach(child => child.remove());
      } catch { /* invalid selector */ }
    }
  }

  const observer = new MutationObserver((mutations) => {
    for (const mutation of mutations) {
      for (const node of mutation.addedNodes) {
        maybeRemovePaywallNode(node);
      }
    }
    // Re-apply scroll unlock in case SPA re-locked it
    document.body.style.overflow = 'auto';
    document.documentElement.style.overflow = 'auto';
  });

  observer.observe(document.body, { childList: true, subtree: true });
  // Disconnect after 45 s to avoid long-lived overhead
  setTimeout(() => observer.disconnect(), 45000);

  // ── 7. Scroll page to trigger lazy loading ────────────────────────────────
  {
    const delay = ms => new Promise(r => setTimeout(r, ms));
    const height = document.body.scrollHeight;
    const step = window.innerHeight;
    for (let y = 0; y < height; y += step) {
      window.scrollTo(0, y);
      await delay(80);
    }
    window.scrollTo(0, 0);
    await delay(1200);
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

  // Wait for final reflow
  await new Promise(resolve => setTimeout(resolve, 400));

  // ── 8. Reader mode activation (via popup "Reader Mode" button) ───────────
  chrome.runtime.onMessage.addListener((message) => {
    if (message.action === 'activateReader') {
      activateReaderMode();
    }
  });

  /**
   * Find the article body element with the most text content.
   * @returns {Element|null}
   */
  function findArticleBody() {
    const candidates = [
      '[data-testid="article-body"]',
      '[role="article"]',
      'article',
      '[class*="article-body"]',
      '[class*="story-body"]',
      '[class*="post-content"]',
      '[class*="entry-content"]',
      '[class*="content-body"]',
      'main',
    ];
    let best = null;
    let bestLen = 0;
    for (const sel of candidates) {
      const el = document.querySelector(sel);
      if (el) {
        const len = el.innerText ? el.innerText.length : 0;
        if (len > bestLen) { bestLen = len; best = el; }
      }
    }
    return best;
  }

  /**
   * Inject reader.css and render a clean reading layout over the page.
   */
  async function activateReaderMode() {
    const link = document.createElement('link');
    link.rel = 'stylesheet';
    link.href = chrome.runtime.getURL('reader.css');
    document.head.appendChild(link);

    const articleEl = findArticleBody();
    const headline = document.querySelector('h1') ||
                     document.querySelector('[class*="headline"]') ||
                     document.querySelector('[class*="title"]');
    const byline = document.querySelector('[class*="byline"]') ||
                   document.querySelector('[class*="author"]') ||
                   document.querySelector('[rel="author"]');
    const dateEl = document.querySelector('time') ||
                   document.querySelector('[class*="date"]') ||
                   document.querySelector('[class*="timestamp"]');

    const root = document.createElement('div');
    root.id = 'reader-root';

    const header = document.createElement('div');
    header.className = 'reader-header';
    if (headline) {
      const h = document.createElement('h1');
      h.className = 'reader-headline';
      h.textContent = headline.textContent.trim();
      header.appendChild(h);
    }
    if (byline) {
      const b = document.createElement('div');
      b.className = 'reader-byline';
      b.textContent = byline.textContent.trim();
      header.appendChild(b);
    }
    if (dateEl) {
      const d = document.createElement('div');
      d.className = 'reader-date';
      d.textContent = dateEl.textContent.trim();
      header.appendChild(d);
    }
    const sourceLink = document.createElement('a');
    sourceLink.className = 'reader-source-link';
    sourceLink.href = window.location.href;
    sourceLink.target = '_blank';
    sourceLink.rel = 'noopener';
    sourceLink.textContent = window.location.hostname;
    header.appendChild(sourceLink);
    root.appendChild(header);

    const bodyDiv = document.createElement('div');
    bodyDiv.className = 'reader-body';
    bodyDiv.innerHTML = articleEl ? articleEl.innerHTML : '<p><em>Could not extract article body.</em></p>';
    root.appendChild(bodyDiv);

    // Toolbar with font size + theme + exit
    const toolbar = document.createElement('div');
    toolbar.id = 'reader-toolbar';
    toolbar.innerHTML = `
      <span class="reader-title-bar">${document.title.replace(/</g, '&lt;')}</span>
      <div class="reader-font-controls">
        <button class="reader-btn" id="reader-font-dec" title="Smaller">A−</button>
        <span class="reader-font-size-label" id="reader-font-label">18px</span>
        <button class="reader-btn" id="reader-font-inc" title="Larger">A+</button>
      </div>
      <button class="reader-btn" id="reader-theme-sepia">Sepia</button>
      <button class="reader-btn" id="reader-theme-dark">Dark</button>
      <button class="reader-btn" id="reader-theme-light">Light</button>
      <button class="reader-btn" id="reader-exit">✕ Exit</button>
    `;

    const progress = document.createElement('div');
    progress.id = 'reader-progress';

    document.body.appendChild(root);
    document.body.appendChild(toolbar);
    document.body.appendChild(progress);
    document.body.classList.add('reader-active');

    // Font size controls
    let fontSize = 18;
    const fontLabel = document.getElementById('reader-font-label');
    const updateFontSize = () => {
      document.documentElement.style.setProperty('--reader-font-size', fontSize + 'px');
      fontLabel.textContent = fontSize + 'px';
    };
    document.getElementById('reader-font-inc').addEventListener('click', () => { fontSize = Math.min(fontSize + 2, 32); updateFontSize(); });
    document.getElementById('reader-font-dec').addEventListener('click', () => { fontSize = Math.max(fontSize - 2, 12); updateFontSize(); });

    // Theme switching
    document.getElementById('reader-theme-dark').addEventListener('click', () => { document.body.classList.remove('reader-sepia'); document.body.classList.add('reader-dark'); });
    document.getElementById('reader-theme-sepia').addEventListener('click', () => { document.body.classList.remove('reader-dark'); document.body.classList.add('reader-sepia'); });
    document.getElementById('reader-theme-light').addEventListener('click', () => { document.body.classList.remove('reader-dark', 'reader-sepia'); });

    // Exit reader
    document.getElementById('reader-exit').addEventListener('click', () => {
      document.body.classList.remove('reader-active', 'reader-dark', 'reader-sepia');
      root.remove(); toolbar.remove(); progress.remove(); link.remove();
    });

    // Reading progress bar
    window.addEventListener('scroll', () => {
      const scrolled = window.scrollY;
      const total = document.documentElement.scrollHeight - window.innerHeight;
      progress.style.width = (total > 0 ? Math.round((scrolled / total) * 100) : 0) + '%';
    }, { passive: true });
  }

  // ── 9. Capture HTML for archive pipeline ─────────────────────────────────
  await new Promise(resolve => setTimeout(resolve, 300));

  const html = document.documentElement.outerHTML;

  // Extract JSON-LD articleBody if present
  let jsonLdArticle = null;
  try {
    const jsonLdScripts = document.querySelectorAll('script[type="application/ld+json"]');
    for (const script of jsonLdScripts) {
      try {
        const data = JSON.parse(script.textContent);
        const items = Array.isArray(data) ? data : [data];
        for (const item of items) {
          const candidates = item['@graph'] ? [...item['@graph'], item] : [item];
          for (const candidate of candidates) {
            if (candidate.articleBody && candidate.articleBody.length > 200) {
              const author = candidate.author
                ? (typeof candidate.author === 'string' ? candidate.author
                  : Array.isArray(candidate.author)
                    ? candidate.author.map(a => typeof a === 'string' ? a : a.name || '').filter(Boolean).join(', ')
                    : candidate.author.name || '')
                : '';
              const image = candidate.image
                ? (typeof candidate.image === 'string' ? candidate.image
                  : Array.isArray(candidate.image)
                    ? (typeof candidate.image[0] === 'string' ? candidate.image[0] : (candidate.image[0] && candidate.image[0].url) || '')
                    : candidate.image.url || '')
                : '';
              jsonLdArticle = {
                articleBody: candidate.articleBody,
                headline: candidate.headline || '',
                author,
                datePublished: candidate.datePublished || '',
                image,
              };
              break;
            }
          }
          if (jsonLdArticle) break;
        }
      } catch { /* skip malformed JSON-LD */ }
      if (jsonLdArticle) break;
    }
  } catch { /* JSON-LD extraction failed */ }

  // Send captured data back to the background service worker
  chrome.runtime.sendMessage({
    action: 'pageCaptured',
    data: {
      html,
      title: document.title,
      url: window.location.href,
      jsonLdArticle,
    },
  });
})();
