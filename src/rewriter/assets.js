const { rewriteCssUrls } = require('./css');

/**
 * Find an original URL in the asset map (exact or suffix match).
 */
function findInAssetMap(url, assetMap) {
  if (!url || url.startsWith('data:')) return null;
  if (assetMap.has(url)) return assetMap.get(url);
  // Try suffix match
  for (const [origUrl, localPath] of assetMap.entries()) {
    if (origUrl.endsWith(url) || url.endsWith(new URL(origUrl).pathname)) {
      return localPath;
    }
  }
  return null;
}

/**
 * Rewrite a srcset attribute, replacing each URL with its local path.
 */
function rewriteSrcset(srcset, assetMap) {
  if (!srcset) return '';
  return srcset.split(',').map(entry => {
    const parts = entry.trim().split(/\s+/);
    const url = parts[0];
    const descriptor = parts.slice(1).join(' ');
    const local = findInAssetMap(url, assetMap);
    return local ? `${local} ${descriptor}`.trim() : entry.trim();
  }).join(', ');
}

/**
 * Rewrite src, srcset, and inline style url() references to local asset paths.
 */
function rewriteAssetUrls($, assetMap) {
  // img[src]
  $('img[src]').each((_, el) => {
    const $el = $(el);
    const src = $el.attr('src');
    const local = findInAssetMap(src, assetMap);
    if (local) $el.attr('src', local);
  });

  // img[srcset]
  $('img[srcset]').each((_, el) => {
    const $el = $(el);
    $el.attr('srcset', rewriteSrcset($el.attr('srcset'), assetMap));
  });

  // source[src]
  $('source[src]').each((_, el) => {
    const $el = $(el);
    const src = $el.attr('src');
    const local = findInAssetMap(src, assetMap);
    if (local) $el.attr('src', local);
  });

  // source[srcset]
  $('source[srcset]').each((_, el) => {
    const $el = $(el);
    $el.attr('srcset', rewriteSrcset($el.attr('srcset'), assetMap));
  });

  // video[src], audio[src]
  $('video[src], audio[src]').each((_, el) => {
    const $el = $(el);
    const src = $el.attr('src');
    const local = findInAssetMap(src, assetMap);
    if (local) $el.attr('src', local);
  });

  // link[href] (non-stylesheet, e.g. icons)
  $('link[href]:not([rel="stylesheet"])').each((_, el) => {
    const $el = $(el);
    const href = $el.attr('href');
    const local = findInAssetMap(href, assetMap);
    if (local) $el.attr('href', local);
  });

  // Inline style url(...) rewriting
  $('[style]').each((_, el) => {
    const $el = $(el);
    const style = $el.attr('style');
    if (style && style.includes('url(')) {
      $el.attr('style', rewriteCssUrls(style, assetMap));
    }
  });

  // <style> blocks — rewrite url() references
  $('style').each((_, el) => {
    const $el = $(el);
    const cssText = $el.html();
    if (cssText && cssText.includes('url(')) {
      $el.html(rewriteCssUrls(cssText, assetMap));
    }
  });
}

module.exports = { rewriteAssetUrls, findInAssetMap, rewriteSrcset };
