/**
 * Ad-block scriptlets — runs in the MAIN world at document_start.
 *
 * Modelled on the medoxisto/ad-blocker-chrome-extension approach: intervene
 * *before* the page's own scripts execute so that ad SDKs and anti-adblock
 * detectors initialise against harmless stubs instead of real ad code. Sites
 * detect the side effects of blocking (missing ad iframes, throwing SDKs), not
 * the extension itself — so we provide quiet no-op stubs rather than letting
 * those SDKs fail loudly.
 *
 * This script never removes page content; it only neutralises ad/analytics
 * globals and common anti-adblock bait. The cosmetic (ISOLATED world) script
 * and the declarativeNetRequest ruleset handle the rest.
 */

(() => {
  'use strict';

  // Guard against double injection (all_frames + SPA re-entry).
  if (window.__newsarchiveAdShield) return;
  Object.defineProperty(window, '__newsarchiveAdShield', {
    value: true,
    writable: false,
    enumerable: false,
    configurable: false,
  });

  const noop = function () {};

  /** Define a property that silently absorbs writes/reads. */
  function harden(obj, key, value) {
    try {
      Object.defineProperty(obj, key, {
        get() { return value; },
        set() { /* swallow reassignment by page scripts */ },
        configurable: false,
        enumerable: false,
      });
    } catch {
      try { obj[key] = value; } catch { /* frozen / cross-origin */ }
    }
  }

  // ── Google Publisher Tag (GPT) ──────────────────────────────────────────
  // Pages push render callbacks onto googletag.cmd; we drain it into no-ops so
  // nothing throws when the real library never loads.
  try {
    const slotStub = new Proxy({}, {
      get() { return () => slotStub; },
    });
    const gptCmd = [];
    gptCmd.push = (fn) => { try { typeof fn === 'function' && fn(); } catch {} return 1; };
    const googletag = {
      cmd: gptCmd,
      apiReady: true,
      pubadsReady: true,
      defineSlot: () => slotStub,
      defineOutOfPageSlot: () => slotStub,
      sizeMapping: () => ({ addSize: () => ({}), build: () => [] }),
      pubads: () => new Proxy({}, { get() { return () => undefined; } }),
      companionAds: () => ({ setRefreshUnfilledSlots: noop }),
      enableServices: noop,
      display: noop,
      destroySlots: () => true,
      setAdIframeTitle: noop,
    };
    harden(window, 'googletag', googletag);
  } catch { /* ignore */ }

  // ── AdSense (adsbygoogle) ───────────────────────────────────────────────
  // Pages do `(adsbygoogle = window.adsbygoogle || []).push({})`. A plain array
  // with a no-op push keeps that call from erroring.
  try {
    const ads = window.adsbygoogle || [];
    ads.push = () => 1;
    ads.loaded = true;
    harden(window, 'adsbygoogle', ads);
  } catch { /* ignore */ }

  // ── Analytics / pixels ──────────────────────────────────────────────────
  // No-op the common globals so trackers blocked at the network layer don't
  // leave the page throwing ReferenceErrors mid-render.
  try {
    window.dataLayer = window.dataLayer || [];
    window.dataLayer.push = window.dataLayer.push || noop;
    const gtag = function () { try { window.dataLayer.push(arguments); } catch {} };
    harden(window, 'gtag', gtag);
    harden(window, 'ga', function () {});
    harden(window, '_gaq', { push: noop });
    harden(window, 'fbq', Object.assign(function () {}, { queue: [], loaded: true, version: '2.0', push: noop, callMethod: noop }));
    harden(window, '_fbq', window.fbq);
    harden(window, 'ttq', new Proxy(function () {}, { get() { return () => undefined; } }));
    harden(window, '_tfa', { push: noop });
  } catch { /* ignore */ }

  // ── Anti-adblock neutralisers ───────────────────────────────────────────
  // Common detector libraries probe for a bait element/callback. We answer
  // "no blocker detected" so the page renders its article instead of a wall.
  try {
    const FakeBAB = function () {};
    FakeBAB.prototype.check = noop;
    FakeBAB.prototype.onDetected = noop;
    FakeBAB.prototype.onNotDetected = function (fn) { try { typeof fn === 'function' && fn(); } catch {} };
    const fab = {
      setOption: function () { return this; },
      check: function () { return this; },
      detected: function () { return false; },
      clearEvent: noop,
      saveincache: noop,
      onDetected: function () { return this; },
      onNotDetected: function (fn) { try { typeof fn === 'function' && fn(); } catch {} return this; },
      emitEvent: function () { return this; },
    };
    harden(window, 'BlockAdBlock', FakeBAB);
    harden(window, 'FuckAdBlock', FakeBAB);
    harden(window, 'blockAdBlock', fab);
    harden(window, 'fuckAdBlock', fab);
    harden(window, 'canRunAds', true);
    harden(window, 'canShowAds', true);
    harden(window, 'isAdBlockActive', false);
    harden(window, 'adblockDetector', { init: function (_o, cb) { try { typeof cb === 'function' && cb(false); } catch {} } });
  } catch { /* ignore */ }
})();
