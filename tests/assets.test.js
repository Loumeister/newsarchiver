const path = require('path');

// Mock node-fetch before requiring the module
jest.mock('node-fetch', () => jest.fn());
// Mock fs to avoid actual disk writes in fetchAsset
jest.mock('fs', () => {
  const actual = jest.requireActual('fs');
  return {
    ...actual,
    mkdirSync: jest.fn(),
    writeFileSync: jest.fn(),
  };
});

const { collectAssetUrls, fetchAllAssets, extractCssUrls } = require('../src/assets');
const fetch = require('node-fetch');
const fs = require('fs');

afterEach(() => {
  jest.clearAllMocks();
});

// ─── extractCssUrls ──────────────────────────────────────────────────────

describe('extractCssUrls', () => {
  const base = 'https://example.com/page';

  test('extracts url() references from CSS text', () => {
    const css = 'body { background: url("bg.png"); } .icon { background-image: url(icons/star.svg); }';
    const urls = extractCssUrls(css, base);
    expect(urls).toContain('https://example.com/bg.png');
    expect(urls).toContain('https://example.com/icons/star.svg');
  });

  test('skips data: URIs', () => {
    const css = 'div { background: url(data:image/png;base64,abc123); }';
    const urls = extractCssUrls(css, base);
    expect(urls).toHaveLength(0);
  });

  test('resolves relative URLs against base', () => {
    const css = '.hero { background: url("../images/hero.jpg"); }';
    const urls = extractCssUrls(css, 'https://example.com/css/style.css');
    expect(urls).toContain('https://example.com/images/hero.jpg');
  });

  test('handles absolute URLs', () => {
    const css = 'div { background: url("https://cdn.example.com/img.png"); }';
    const urls = extractCssUrls(css, base);
    expect(urls).toContain('https://cdn.example.com/img.png');
  });

  test('handles single-quoted and unquoted URLs', () => {
    const css = "a { background: url('foo.png'); } b { background: url(bar.png); }";
    const urls = extractCssUrls(css, base);
    expect(urls).toHaveLength(2);
  });

  test('returns empty array for CSS with no url()', () => {
    const urls = extractCssUrls('body { color: red; }', base);
    expect(urls).toEqual([]);
  });

  test('skips invalid URLs gracefully', () => {
    const css = 'div { background: url("://invalid"); }';
    const urls = extractCssUrls(css, base);
    // Should not throw, may or may not include depending on URL parsing
    expect(Array.isArray(urls)).toBe(true);
  });
});

// ─── collectAssetUrls ────────────────────────────────────────────────────

describe('collectAssetUrls', () => {
  const base = 'https://example.com/article';

  test('collects stylesheet URLs', () => {
    const html = '<html><head><link rel="stylesheet" href="/css/main.css"></head><body></body></html>';
    const urls = collectAssetUrls(html, base);
    expect(urls).toContain('https://example.com/css/main.css');
  });

  test('collects image src URLs', () => {
    const html = '<html><body><img src="photo.jpg"></body></html>';
    const urls = collectAssetUrls(html, base);
    expect(urls).toContain('https://example.com/photo.jpg');
  });

  test('collects image srcset URLs', () => {
    const html = '<html><body><img srcset="small.jpg 480w, large.jpg 1024w"></body></html>';
    const urls = collectAssetUrls(html, base);
    expect(urls).toContain('https://example.com/small.jpg');
    expect(urls).toContain('https://example.com/large.jpg');
  });

  test('collects video and audio src', () => {
    const html = '<html><body><video src="clip.mp4"></video><audio src="song.mp3"></audio></body></html>';
    const urls = collectAssetUrls(html, base);
    expect(urls).toContain('https://example.com/clip.mp4');
    expect(urls).toContain('https://example.com/song.mp3');
  });

  test('collects source element src and srcset', () => {
    const html = '<html><body><picture><source src="img.webp" srcset="a.webp 1x, b.webp 2x"></picture></body></html>';
    const urls = collectAssetUrls(html, base);
    expect(urls).toContain('https://example.com/img.webp');
    expect(urls).toContain('https://example.com/a.webp');
    expect(urls).toContain('https://example.com/b.webp');
  });

  test('collects icon link URLs', () => {
    const html = '<html><head><link rel="icon" href="/favicon.ico"></head><body></body></html>';
    const urls = collectAssetUrls(html, base);
    expect(urls).toContain('https://example.com/favicon.ico');
  });

  test('collects apple-touch-icon URLs', () => {
    const html = '<html><head><link rel="apple-touch-icon" href="/apple-icon.png"></head><body></body></html>';
    const urls = collectAssetUrls(html, base);
    expect(urls).toContain('https://example.com/apple-icon.png');
  });

  test('collects url() from style blocks', () => {
    const html = '<html><head><style>body { background: url("bg.png"); }</style></head><body></body></html>';
    const urls = collectAssetUrls(html, base);
    expect(urls).toContain('https://example.com/bg.png');
  });

  test('collects url() from inline styles', () => {
    const html = '<html><body><div style="background: url(\'tile.png\')"></div></body></html>';
    const urls = collectAssetUrls(html, base);
    expect(urls).toContain('https://example.com/tile.png');
  });

  test('skips data: URIs', () => {
    const html = '<html><body><img src="data:image/png;base64,abc"></body></html>';
    const urls = collectAssetUrls(html, base);
    expect(urls).toHaveLength(0);
  });

  test('skips javascript: URIs', () => {
    const html = '<html><body><img src="javascript:void(0)"></body></html>';
    const urls = collectAssetUrls(html, base);
    expect(urls).toHaveLength(0);
  });

  test('deduplicates URLs', () => {
    const html = '<html><body><img src="photo.jpg"><img src="photo.jpg"></body></html>';
    const urls = collectAssetUrls(html, base);
    const photoUrls = urls.filter(u => u.includes('photo.jpg'));
    expect(photoUrls).toHaveLength(1);
  });

  test('returns empty array for HTML with no assets', () => {
    const html = '<html><body><p>Hello world</p></body></html>';
    const urls = collectAssetUrls(html, base);
    expect(urls).toEqual([]);
  });
});

// ─── fetchAllAssets ──────────────────────────────────────────────────────

describe('fetchAllAssets', () => {
  function mockFetchResponse(buffer, contentType = 'image/png') {
    return Promise.resolve({
      ok: true,
      buffer: () => Promise.resolve(buffer),
      headers: { get: (h) => h === 'content-type' ? contentType : null },
    });
  }

  test('fetches assets and returns a Map of originalUrl -> localPath', async () => {
    const buf = Buffer.from('fake-image-data');
    fetch.mockImplementation(() => mockFetchResponse(buf));

    const urls = ['https://example.com/img1.png', 'https://example.com/img2.png'];
    const result = await fetchAllAssets(urls, 'abc123');

    expect(result).toBeInstanceOf(Map);
    expect(result.size).toBe(2);
    for (const [origUrl, localPath] of result) {
      expect(urls).toContain(origUrl);
      expect(localPath).toMatch(/^\/assets\/abc123\//);
      expect(localPath).toMatch(/\.png$/);
    }
  });

  test('skips assets that fail to fetch (non-200)', async () => {
    fetch.mockImplementation(() => Promise.resolve({ ok: false }));

    const urls = ['https://example.com/missing.png'];
    const result = await fetchAllAssets(urls, 'abc123');
    expect(result.size).toBe(0);
  });

  test('skips assets that throw errors (network failure)', async () => {
    fetch.mockImplementation(() => Promise.reject(new Error('Network error')));

    const urls = ['https://example.com/fail.png'];
    const result = await fetchAllAssets(urls, 'abc123');
    expect(result.size).toBe(0);
  });

  test('returns empty map for empty URL list', async () => {
    const result = await fetchAllAssets([], 'abc123');
    expect(result.size).toBe(0);
  });

  test('creates asset directory and writes file to disk', async () => {
    const buf = Buffer.from('test-data');
    fetch.mockImplementation(() => mockFetchResponse(buf));

    await fetchAllAssets(['https://example.com/test.png'], 'snap1');

    expect(fs.mkdirSync).toHaveBeenCalled();
    expect(fs.writeFileSync).toHaveBeenCalled();
  });

  test('handles mixed success and failure', async () => {
    const buf = Buffer.from('ok');
    let callCount = 0;
    fetch.mockImplementation(() => {
      callCount++;
      if (callCount === 2) return Promise.resolve({ ok: false });
      return mockFetchResponse(buf);
    });

    const urls = ['https://example.com/a.png', 'https://example.com/b.png', 'https://example.com/c.png'];
    const result = await fetchAllAssets(urls, 'snap2');
    expect(result.size).toBe(2);
  });
});
