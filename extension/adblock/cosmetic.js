/**
 * Cosmetic ad filtering — runs in the ISOLATED world at document_start.
 *
 * Two phases, mirroring the medoxisto/ad-blocker-chrome-extension design:
 *   1. Inject a hiding stylesheet immediately (before paint) so ad slots never
 *      flash in. This is "hide first".
 *   2. Asynchronously check whether ad blocking is enabled and whether this
 *      host is allowlisted. If blocking is off here, the stylesheet is pulled
 *      back out — "reveal if allowed".
 *
 * A short-lived MutationObserver also strips ad containers that frameworks
 * inject after first paint. Selectors are intentionally conservative (named ad
 * slots, not bare "ad" substrings) so article content is never hidden.
 */

(() => {
  'use strict';

  if (window.__newsarchiveCosmetic) return;
  window.__newsarchiveCosmetic = true;

  const STYLE_ID = 'newsarchive-adblock-cosmetic';

  // Named ad/widget containers — deliberately specific to avoid false matches
  // on editorial classes that merely contain the letters "ad".
  const AD_SELECTORS = [
    'ins.adsbygoogle',
    'iframe[id^="google_ads_iframe"]',
    'iframe[src*="doubleclick.net"]',
    'iframe[src*="googlesyndication.com"]',
    'iframe[src*="adnxs.com"]',
    'iframe[src*="amazon-adsystem.com"]',
    '[id^="div-gpt-ad"]',
    '[id^="google_ads_"]',
    '[id*="gpt-ad"]',
    '[class*="adsbygoogle"]',
    '[class~="ad-slot"]',
    '[class~="ad-unit"]',
    '[class~="ad-banner"]',
    '[class~="ad-container"]',
    '[class~="ad-wrapper"]',
    '[class~="advertisement"]',
    '[class*="advert-"]',
    '[class*="sponsored-ad"]',
    '[data-ad-slot]',
    '[data-ad-unit]',
    '[data-google-query-id]',
    '.taboola',
    '[id^="taboola-"]',
    '[class*="trc_related_container"]',
    '.OUTBRAIN',
    '[data-widget-id^="AR_"]',
    '[class*="ob-widget"]',
    '[class*="outbrain"]',
    '[class*="revcontent"]',
    '[id^="mgid-"]',
    '[class*="mgbox"]',
  ];

  const CSS = AD_SELECTORS.join(',\n') +
    ' { display: none !important; visibility: hidden !important; height: 0 !important; min-height: 0 !important; }';

  /** Inject the hiding stylesheet (idempotent). */
  function injectStyle() {
    if (document.getElementById(STYLE_ID)) return;
    const style = document.createElement('style');
    style.id = STYLE_ID;
    style.textContent = CSS;
    (document.head || document.documentElement).appendChild(style);
  }

  /** Remove the hiding stylesheet — used when this host is allowlisted. */
  function removeStyle() {
    const style = document.getElementById(STYLE_ID);
    if (style) style.remove();
  }

  // ── Phase 1: hide first ───────────────────────────────────────────────────
  injectStyle();

  // ── Phase 2: reveal if blocking is disabled or host is allowlisted ────────
  const host = location.hostname.replace(/^www\./, '');
  let active = true;

  chrome.storage.local.get(
    { adBlockEnabled: true, adBlockAllowlist: [] },
    (cfg) => {
      const allowlisted = Array.isArray(cfg.adBlockAllowlist) &&
        cfg.adBlockAllowlist.some((d) => host === d || host.endsWith('.' + d));
      if (!cfg.adBlockEnabled || allowlisted) {
        active = false;
        removeStyle();
        observer.disconnect();
      }
    }
  );

  /** Strip a node (and descendants) if it matches an ad selector. */
  function strip(node) {
    if (!active || !(node instanceof Element)) return;
    for (const sel of AD_SELECTORS) {
      try {
        if (node.matches(sel)) { node.remove(); return; }
      } catch { /* invalid selector for this engine */ }
    }
    for (const sel of AD_SELECTORS) {
      try {
        node.querySelectorAll(sel).forEach((el) => el.remove());
      } catch { /* ignore */ }
    }
  }

  const observer = new MutationObserver((mutations) => {
    if (!active) return;
    for (const m of mutations) {
      for (const node of m.addedNodes) strip(node);
    }
  });

  // document.documentElement exists at document_start; body may not yet.
  observer.observe(document.documentElement, { childList: true, subtree: true });

  // Re-assert the stylesheet once the head is ready, then stop observing after
  // the page has settled to avoid long-lived overhead.
  document.addEventListener('DOMContentLoaded', injectStyle, { once: true });
  setTimeout(() => observer.disconnect(), 20000);

  // React to live allowlist/toggle changes without a reload.
  chrome.storage.onChanged.addListener((changes, area) => {
    if (area !== 'local') return;
    if (!('adBlockEnabled' in changes) && !('adBlockAllowlist' in changes)) return;
    chrome.storage.local.get({ adBlockEnabled: true, adBlockAllowlist: [] }, (cfg) => {
      const allowlisted = Array.isArray(cfg.adBlockAllowlist) &&
        cfg.adBlockAllowlist.some((d) => host === d || host.endsWith('.' + d));
      if (!cfg.adBlockEnabled || allowlisted) {
        active = false;
        removeStyle();
      } else {
        active = true;
        injectStyle();
      }
    });
  });
})();
