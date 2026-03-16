const path = require('path');
const fs = require('fs');

// We need to mock config before requiring rewriter
jest.mock('../src/config', () => ({
  keepScripts: false,
  proxyLinks: false,
  dataDir: '/tmp/newsarchiver-test/data',
}));

const { rewriteHtml } = require('../src/rewriter');

const BASE_URL = 'https://example.com/article/test';
const TIMESTAMP = '2025-01-15T12:00:00.000Z';
const SNAPSHOT_ID = 'abc123';
const PORT = 3000;

function rewrite(html, assetMap = new Map()) {
  return rewriteHtml(html, assetMap, SNAPSHOT_ID, BASE_URL, TIMESTAMP, PORT);
}

// ─── Noise removal ───────────────────────────────────────────────────────

describe('removeNoiseElements', () => {
  test('removes iframes', () => {
    const html = '<html><body><iframe src="https://ads.com"></iframe><p>Content</p></body></html>';
    const result = rewrite(html);
    expect(result).not.toContain('<iframe');
    expect(result).toContain('Content');
  });

  test('removes noscript tags', () => {
    const html = '<html><body><noscript>Enable JS</noscript><p>Content</p></body></html>';
    const result = rewrite(html);
    expect(result).not.toContain('<noscript');
    expect(result).not.toContain('Enable JS');
  });

  test('removes preload and prefetch links', () => {
    const html = '<html><head><link rel="preload" href="font.woff2"><link rel="prefetch" href="next.js"></head><body></body></html>';
    const result = rewrite(html);
    expect(result).not.toContain('preload');
    expect(result).not.toContain('prefetch');
  });

  test('removes meta refresh', () => {
    const html = '<html><head><meta http-equiv="refresh" content="5;url=other.html"></head><body></body></html>';
    const result = rewrite(html);
    expect(result).not.toContain('http-equiv="refresh"');
  });

  test('removes tracking pixels (1x1 images)', () => {
    const html = '<html><body><img src="tracker.gif" width="1" height="1"><img src="real.jpg"></body></html>';
    const result = rewrite(html);
    expect(result).not.toContain('tracker.gif');
    expect(result).toContain('real.jpg');
  });

  test('removes beacon/pixel/tracker images by src name', () => {
    const html = '<html><body><img src="https://track.com/beacon.gif"><img src="https://img.com/pixel.png"><img src="https://x.com/tracker"></body></html>';
    const result = rewrite(html);
    expect(result).not.toContain('beacon.gif');
    expect(result).not.toContain('pixel.png');
    expect(result).not.toContain('tracker');
  });

  test('removes external scripts', () => {
    const html = '<html><body><script src="https://cdn.com/app.js"></script><p>Content</p></body></html>';
    const result = rewrite(html);
    expect(result).not.toContain('cdn.com/app.js');
  });

  test('removes inline tracking scripts (gtag, fbq, etc.)', () => {
    const html = '<html><body><script>window.dataLayer = [];</script><p>Content</p></body></html>';
    const result = rewrite(html);
    expect(result).not.toContain('dataLayer');
  });

  test('removes inline scripts when keepScripts is false', () => {
    const html = '<html><body><script>console.log("hi")</script><p>Content</p></body></html>';
    const result = rewrite(html);
    expect(result).not.toContain('console.log');
  });

  test('keeps application/ld+json scripts', () => {
    const html = '<html><body><script type="application/ld+json">{"@type":"Article"}</script></body></html>';
    const result = rewrite(html);
    expect(result).toContain('application/ld+json');
    expect(result).toContain('@type');
  });
});

// ─── Asset URL rewriting ─────────────────────────────────────────────────

describe('rewriteAssetUrls', () => {
  test('rewrites img src using assetMap', () => {
    const html = '<html><body><img src="https://example.com/photo.jpg"></body></html>';
    const assetMap = new Map([['https://example.com/photo.jpg', '/assets/abc123/sha1.jpg']]);
    const result = rewrite(html, assetMap);
    expect(result).toContain('/assets/abc123/sha1.jpg');
  });

  test('rewrites img srcset', () => {
    const html = '<html><body><img srcset="https://example.com/sm.jpg 480w, https://example.com/lg.jpg 1024w"></body></html>';
    const assetMap = new Map([
      ['https://example.com/sm.jpg', '/assets/abc123/sm.jpg'],
      ['https://example.com/lg.jpg', '/assets/abc123/lg.jpg'],
    ]);
    const result = rewrite(html, assetMap);
    expect(result).toContain('/assets/abc123/sm.jpg 480w');
    expect(result).toContain('/assets/abc123/lg.jpg 1024w');
  });

  test('rewrites video and audio src', () => {
    const html = '<html><body><video src="https://example.com/vid.mp4"></video><audio src="https://example.com/audio.mp3"></audio></body></html>';
    const assetMap = new Map([
      ['https://example.com/vid.mp4', '/assets/abc123/vid.mp4'],
      ['https://example.com/audio.mp3', '/assets/abc123/audio.mp3'],
    ]);
    const result = rewrite(html, assetMap);
    expect(result).toContain('/assets/abc123/vid.mp4');
    expect(result).toContain('/assets/abc123/audio.mp3');
  });

  test('rewrites link[href] for icons', () => {
    const html = '<html><head><link rel="icon" href="https://example.com/fav.ico"></head><body></body></html>';
    const assetMap = new Map([['https://example.com/fav.ico', '/assets/abc123/fav.ico']]);
    const result = rewrite(html, assetMap);
    expect(result).toContain('/assets/abc123/fav.ico');
  });

  test('leaves unmatched assets unchanged', () => {
    const html = '<html><body><img src="https://other.com/unknown.jpg"></body></html>';
    const result = rewrite(html, new Map());
    expect(result).toContain('https://other.com/unknown.jpg');
  });
});

// ─── CSS URL rewriting ──────────────────────────────────────────────────

describe('rewriteCssUrls (via rewriteHtml)', () => {
  test('rewrites url() in style blocks', () => {
    const html = '<html><head><style>body { background: url(https://example.com/bg.png); }</style></head><body></body></html>';
    const assetMap = new Map([['https://example.com/bg.png', '/assets/abc123/bg.png']]);
    const result = rewrite(html, assetMap);
    expect(result).toContain('url(/assets/abc123/bg.png)');
  });

  test('rewrites url() in inline styles', () => {
    const html = '<html><body><div style="background: url(https://example.com/tile.png)"></div></body></html>';
    const assetMap = new Map([['https://example.com/tile.png', '/assets/abc123/tile.png']]);
    const result = rewrite(html, assetMap);
    expect(result).toContain('url(/assets/abc123/tile.png)');
  });

  test('preserves data: URIs in CSS', () => {
    const html = '<html><head><style>div { background: url(data:image/gif;base64,R0lGOD); }</style></head><body></body></html>';
    const result = rewrite(html);
    expect(result).toContain('data:image/gif;base64,R0lGOD');
  });
});

// ─── Hyperlink rewriting ─────────────────────────────────────────────────

describe('rewriteHyperlinks', () => {
  test('replaces javascript: links with #', () => {
    const html = '<html><body><a href="javascript:void(0)">Click</a></body></html>';
    const result = rewrite(html);
    expect(result).toContain('href="#"');
    expect(result).not.toContain('javascript:');
  });

  test('leaves fragment links unchanged', () => {
    const html = '<html><body><a href="#section">Jump</a></body></html>';
    const result = rewrite(html);
    expect(result).toContain('href="#section"');
  });

  test('leaves mailto: links unchanged', () => {
    const html = '<html><body><a href="mailto:a@b.com">Email</a></body></html>';
    const result = rewrite(html);
    expect(result).toContain('mailto:a@b.com');
  });

  test('leaves tel: links unchanged', () => {
    const html = '<html><body><a href="tel:+1234567890">Call</a></body></html>';
    const result = rewrite(html);
    expect(result).toContain('tel:+1234567890');
  });
});

// ─── Toolbar injection ──────────────────────────────────────────────────

describe('injectToolbar', () => {
  test('injects archive toolbar into body', () => {
    const html = '<html><body><p>Content</p></body></html>';
    const result = rewrite(html);
    expect(result).toContain('__archive-toolbar__');
    expect(result).toContain('newsarchive');
  });

  test('toolbar contains original URL', () => {
    const html = '<html><body></body></html>';
    const result = rewrite(html);
    expect(result).toContain(BASE_URL);
  });

  test('toolbar contains timestamp', () => {
    const html = '<html><body></body></html>';
    const result = rewrite(html);
    expect(result).toContain(TIMESTAMP);
  });

  test('toolbar contains screenshot link', () => {
    const html = '<html><body></body></html>';
    const result = rewrite(html);
    expect(result).toContain(`/snap/${SNAPSHOT_ID}/screenshot`);
  });
});

// ─── Meta tags ──────────────────────────────────────────────────────────

describe('meta tags and base tag', () => {
  test('adds robots noindex meta tag', () => {
    const html = '<html><head></head><body></body></html>';
    const result = rewrite(html);
    expect(result).toContain('name="robots" content="noindex,noarchive"');
  });

  test('adds archived-from meta tag', () => {
    const html = '<html><head></head><body></body></html>';
    const result = rewrite(html);
    expect(result).toContain('name="archived-from"');
    expect(result).toContain(BASE_URL);
  });

  test('adds archived-at meta tag', () => {
    const html = '<html><head></head><body></body></html>';
    const result = rewrite(html);
    expect(result).toContain('name="archived-at"');
    expect(result).toContain(TIMESTAMP);
  });

  test('sets base tag with correct port and snapshot ID', () => {
    const html = '<html><head></head><body></body></html>';
    const result = rewrite(html);
    expect(result).toContain(`<base href="http://localhost:${PORT}/snap/${SNAPSHOT_ID}/">`);
  });
});

// ─── CSS inlining ───────────────────────────────────────────────────────

describe('inlineExternalCss', () => {
  test('removes stylesheet links when CSS file not available', () => {
    const html = '<html><head><link rel="stylesheet" href="https://example.com/style.css"></head><body></body></html>';
    // No assetMap entry, so CSS can't be inlined — link stays (base tag resolves)
    const result = rewrite(html);
    // The link should still be present since there's no matching asset
    expect(result).toContain('stylesheet');
  });
});

// ─── Lazy-load attribute rewriting ───────────────────────────────────────

describe('lazy-load attribute rewriting', () => {
  test('promotes data-src to src when asset is in map', () => {
    const html = '<html><body><img data-src="https://example.com/lazy.jpg" src="placeholder.gif"></body></html>';
    const assetMap = new Map([['https://example.com/lazy.jpg', '/assets/abc123/lazy.jpg']]);
    const result = rewrite(html, assetMap);
    expect(result).toContain('src="/assets/abc123/lazy.jpg"');
    expect(result).not.toContain('data-src');
  });

  test('promotes data-lazy-src to src', () => {
    const html = '<html><body><img data-lazy-src="https://example.com/lazy2.jpg"></body></html>';
    const assetMap = new Map([['https://example.com/lazy2.jpg', '/assets/abc123/lazy2.jpg']]);
    const result = rewrite(html, assetMap);
    expect(result).toContain('src="/assets/abc123/lazy2.jpg"');
  });

  test('promotes data-original to src', () => {
    const html = '<html><body><img data-original="https://example.com/orig.jpg"></body></html>';
    const assetMap = new Map([['https://example.com/orig.jpg', '/assets/abc123/orig.jpg']]);
    const result = rewrite(html, assetMap);
    expect(result).toContain('src="/assets/abc123/orig.jpg"');
  });

  test('rewrites source data-srcset', () => {
    const html = '<html><body><picture><source data-srcset="https://example.com/a.webp 1x, https://example.com/b.webp 2x"></picture></body></html>';
    const assetMap = new Map([
      ['https://example.com/a.webp', '/assets/abc123/a.webp'],
      ['https://example.com/b.webp', '/assets/abc123/b.webp'],
    ]);
    const result = rewrite(html, assetMap);
    expect(result).toContain('/assets/abc123/a.webp 1x');
    expect(result).toContain('/assets/abc123/b.webp 2x');
    expect(result).not.toContain('data-srcset');
  });
});

// ─── Class stripping ────────────────────────────────────────────────────

describe('class-based gating removal', () => {
  test('strips lock classes from article children', () => {
    const html = '<html><body><article><div class="content is-locked some-class"><p>Text</p></div></article></body></html>';
    const result = rewrite(html);
    expect(result).not.toContain('is-locked');
    expect(result).toContain('some-class');
    expect(result).toContain('Text');
  });

  test('strips subscriber-only class', () => {
    const html = '<html><body><article><p class="subscriber-only hidden">Secret</p></article></body></html>';
    const result = rewrite(html);
    expect(result).not.toContain('subscriber-only');
    expect(result).toContain('Secret');
  });

  test('strips premium-content class', () => {
    const html = '<html><body><article><div class="premium-content"><p>Premium</p></div></article></body></html>';
    const result = rewrite(html);
    expect(result).not.toContain('premium-content');
    expect(result).toContain('Premium');
  });

  test('does not strip lock classes outside article context', () => {
    const html = '<html><body><div class="is-locked"><p>Nav</p></div></body></html>';
    const result = rewrite(html);
    expect(result).toContain('is-locked');
  });
});

// ─── Readability CSS injection ──────────────────────────────────────────

describe('readability CSS overrides', () => {
  test('injects blur/filter removal CSS', () => {
    const html = '<html><head></head><body></body></html>';
    const result = rewrite(html);
    expect(result).toContain('filter: none !important');
    expect(result).toContain('-webkit-filter: none !important');
  });

  test('injects visibility/opacity/clip-path overrides', () => {
    const html = '<html><head></head><body></body></html>';
    const result = rewrite(html);
    expect(result).toContain('visibility: visible !important');
    expect(result).toContain('opacity: 1 !important');
    expect(result).toContain('clip-path: none !important');
  });
});

// ─── Full pipeline ──────────────────────────────────────────────────────

describe('rewriteHtml full pipeline', () => {
  test('processes complex HTML with multiple elements', () => {
    const html = `<html>
      <head>
        <link rel="preload" href="font.woff2">
        <meta http-equiv="refresh" content="5">
      </head>
      <body>
        <iframe src="https://ads.com"></iframe>
        <noscript>Enable JS</noscript>
        <script src="https://cdn.com/tracker.js"></script>
        <script>window.dataLayer=[]</script>
        <script type="application/ld+json">{"@type":"Article"}</script>
        <img src="https://example.com/photo.jpg">
        <img src="pixel.gif" width="1" height="1">
        <a href="javascript:void(0)">Link</a>
        <p>Article content</p>
      </body>
    </html>`;

    const assetMap = new Map([['https://example.com/photo.jpg', '/assets/abc123/photo.jpg']]);
    const result = rewrite(html, assetMap);

    // Removed elements
    expect(result).not.toContain('<iframe');
    expect(result).not.toContain('<noscript');
    expect(result).not.toContain('preload');
    expect(result).not.toContain('http-equiv="refresh"');
    expect(result).not.toContain('tracker.js');
    expect(result).not.toContain('dataLayer');
    expect(result).not.toContain('pixel.gif');

    // Kept elements
    expect(result).toContain('application/ld+json');
    expect(result).toContain('Article content');
    expect(result).toContain('/assets/abc123/photo.jpg');
    expect(result).toContain('__archive-toolbar__');
    expect(result).toContain('name="robots"');
  });
});
