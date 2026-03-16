const path = require('path');
const fs = require('fs');
const config = require('../config');
const { READABILITY_CSS } = require('../shared/constants');

/**
 * Inject CSS that forces readable colors on article content.
 * Defeats paywall techniques that hide text via dark-on-dark colors.
 */
function injectReadabilityCss($) {
  $('head').append(`<style data-newsarchive="readability">${READABILITY_CSS}</style>`);
}

/**
 * Replace <link rel="stylesheet"> with inline <style> blocks,
 * rewriting url() references inside the CSS.
 */
function inlineExternalCss($, assetMap) {
  $('link[rel="stylesheet"]').each((_, el) => {
    const $el = $(el);
    const href = $el.attr('href');
    if (!href) return;

    // Find the local path for this CSS file
    let localPath = null;
    for (const [origUrl, lp] of assetMap.entries()) {
      if (origUrl === href || origUrl.endsWith(href) || href.endsWith(new URL(origUrl).pathname)) {
        localPath = lp;
        break;
      }
    }

    // Try to read the CSS content from disk
    if (localPath) {
      const fullPath = path.join(config.dataDir, '..', localPath);
      try {
        let cssText = fs.readFileSync(fullPath, 'utf-8');
        cssText = rewriteCssUrls(cssText, assetMap);
        $el.replaceWith(`<style>${cssText}</style>`);
        return;
      } catch {
        // Fall through — couldn't read file
      }
    }

    // If we couldn't inline it, just remove the link (the asset wasn't fetched)
    // Leave it as-is so the base tag can try to resolve it
  });
}

/**
 * Rewrite url(...) references in CSS text using the asset map.
 */
function rewriteCssUrls(cssText, assetMap) {
  return cssText.replace(/url\(\s*['"]?([^'")]+)['"]?\s*\)/g, (match, rawUrl) => {
    if (rawUrl.startsWith('data:')) return match;
    // Find in asset map
    for (const [origUrl, localPath] of assetMap.entries()) {
      if (origUrl === rawUrl || origUrl.endsWith(rawUrl)) {
        return `url(${localPath})`;
      }
    }
    return match;
  });
}

module.exports = { injectReadabilityCss, inlineExternalCss, rewriteCssUrls };
