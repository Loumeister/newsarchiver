/**
 * archive-detector.js
 *
 * Injected by the background service worker into every tab opened on an
 * archive.* mirror domain.  Evaluates whether the snapshot contains a
 * complete article, then reports the result back so the background can
 * decide whether to trigger the local-DOM fallback.
 *
 * Messages sent to background:
 *   { action: 'archiveResult', success: boolean, reason: string }
 *   { action: 'requestFallback' }   (user clicked the fallback button)
 */

(async () => {
  // Guard: run only once per page (re-injection safe)
  if (window.__newsarchiveDetector) return;
  window.__newsarchiveDetector = true;

  // ── Helpers ────────────────────────────────────────────────────────────

  /** Visible paragraph text length on the page. */
  function articleTextLength() {
    let len = 0;
    document.querySelectorAll('p').forEach(p => {
      len += (p.innerText || '').trim().length;
    });
    return len;
  }

  /** True if the page looks like an archive.is error / no-snapshot page. */
  function isErrorPage() {
    const body = (document.body && document.body.innerText) ? document.body.innerText.toLowerCase() : '';
    const errorPhrases = [
      'no results',
      'not found',
      'this url has not been archived',
      'service temporarily unavailable',
      'too many requests',
      'blocked',
      'captcha',
      'cf-challenge',
      'access denied',
    ];
    if (errorPhrases.some(p => body.includes(p))) return true;

    // archive.is shows a specific element when there are no snapshots
    if (document.querySelector('#no-results, .error-block, #error')) return true;

    // Cloudflare / DDoS-Guard challenge pages
    if (document.querySelector('#cf-wrapper, #challenge-form, #ddos-protection')) return true;

    return false;
  }

  /** True if the page contains an article-like paywall (snapshot of a paywalled page). */
  function isStillPaywalled() {
    const paywallSignals = [
      '[class*="paywall"]', '[class*="subscribe"]', '[class*="piano"]',
      '.tp-modal', '.tp-backdrop', '[id*="gateway"]',
      '[class*="meter-"]', '[class*="regwall"]',
    ];
    for (const sel of paywallSignals) {
      try {
        if (document.querySelector(sel)) return true;
      } catch { /* ignore */ }
    }
    return false;
  }

  /**
   * Evaluate snapshot quality.
   * Returns { success: boolean, reason: string }
   */
  function evaluate() {
    if (isErrorPage()) {
      return { success: false, reason: 'error-page' };
    }

    const textLen = articleTextLength();

    if (textLen >= 1500) {
      // Good amount of text — treat as success even if some paywall UI leaked in
      return { success: true, reason: 'sufficient-text' };
    }

    if (isStillPaywalled() || textLen < 400) {
      return { success: false, reason: textLen < 400 ? 'insufficient-text' : 'still-paywalled' };
    }

    // Ambiguous — moderate text, no obvious paywall: call it a success
    return { success: true, reason: 'moderate-text' };
  }

  // ── Floating fallback button ────────────────────────────────────────────

  function showFallbackButton(labelOverride) {
    if (document.getElementById('__na-fallback-btn')) return; // already shown

    const btn = document.createElement('button');
    btn.id = '__na-fallback-btn';
    btn.textContent = labelOverride || 'Archive failed? Try local bypass →';
    Object.assign(btn.style, {
      position:     'fixed',
      bottom:       '20px',
      right:        '20px',
      zIndex:       '2147483647',
      background:   '#f97316',
      color:        '#fff',
      border:       'none',
      borderRadius: '8px',
      padding:      '10px 16px',
      fontSize:     '13px',
      fontFamily:   '-apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
      fontWeight:   '600',
      cursor:       'pointer',
      boxShadow:    '0 4px 16px rgba(0,0,0,0.25)',
      lineHeight:   '1.4',
      maxWidth:     '260px',
      textAlign:    'left',
    });

    // Dismiss × control
    const dismiss = document.createElement('span');
    dismiss.textContent = ' ✕';
    Object.assign(dismiss.style, {
      marginLeft: '8px',
      opacity:    '0.7',
      fontSize:   '11px',
    });
    btn.appendChild(dismiss);

    btn.addEventListener('click', (e) => {
      if (e.target === dismiss || dismiss.contains(e.target)) {
        btn.remove();
        return;
      }
      btn.textContent = 'Applying local bypass…';
      btn.disabled = true;
      chrome.runtime.sendMessage({ action: 'requestFallback' });
    });

    document.body.appendChild(btn);
  }

  // ── Main detection logic ────────────────────────────────────────────────

  // Wait for the page to finish rendering (archive.is pages are mostly SSR,
  // but some mirrors add lazy elements).
  await new Promise(r => setTimeout(r, 2000));

  const result = evaluate();

  // Always report the result to background
  try {
    chrome.runtime.sendMessage({ action: 'archiveResult', ...result });
  } catch { /* service worker may have restarted; non-fatal */ }

  if (!result.success) {
    // Immediate failure — show the fallback button with descriptive label
    const labels = {
      'error-page':           'No snapshot found. Try local bypass →',
      'insufficient-text':    'Snapshot incomplete. Try local bypass →',
      'still-paywalled':      'Snapshot still paywalled. Try local bypass →',
    };
    showFallbackButton(labels[result.reason]);
  } else {
    // Success, but still offer the button subtly after a delay in case the
    // user notices the content is truncated.
    setTimeout(() => {
      showFallbackButton('Article incomplete? Try local bypass →');
    }, 8000);
  }
})();
