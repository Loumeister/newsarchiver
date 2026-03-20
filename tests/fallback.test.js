jest.mock('node-fetch', () => jest.fn());
jest.mock('../src/config', () => ({
  userAgent: 'Googlebot/2.1',
  referer: 'https://www.google.com/',
  fallbackTimeoutMs: 5000,
}));

const fetch = require('node-fetch');
const { hasEnoughContent, tryExtractContent, runFallbackChain } = require('../src/fallback');

afterEach(() => jest.clearAllMocks());

// ─── hasEnoughContent ─────────────────────────────────────────────

describe('hasEnoughContent', () => {
  test('returns true for HTML with sufficient paragraphs and text', () => {
    const paragraphs = Array.from({ length: 5 }, (_, i) =>
      `<p>${'This is a test paragraph with enough text. '.repeat(5)}</p>`
    ).join('');
    expect(hasEnoughContent(`<html><body>${paragraphs}</body></html>`)).toBe(true);
  });

  test('returns false for HTML with fewer than 3 paragraphs', () => {
    expect(hasEnoughContent('<html><body><p>Short</p><p>Text</p></body></html>')).toBe(false);
  });

  test('returns false for HTML with many empty paragraphs', () => {
    expect(hasEnoughContent('<html><body><p></p><p></p><p></p><p></p></body></html>')).toBe(false);
  });

  test('returns false for empty HTML', () => {
    expect(hasEnoughContent('')).toBe(false);
  });

  test('returns false for HTML with <p> tags but insufficient total text', () => {
    expect(hasEnoughContent('<html><body><p>a</p><p>b</p><p>c</p></body></html>')).toBe(false);
  });
});

// ─── tryExtractContent ────────────────────────────────────────────

describe('tryExtractContent', () => {
  const articleBody = 'A'.repeat(250);
  const htmlWithJsonLd = `<html><head>
    <script type="application/ld+json">
    {"@type":"Article","headline":"Test","articleBody":"${articleBody}"}
    </script>
  </head><body></body></html>`;

  test('extracts from JSON-LD when available', () => {
    const result = tryExtractContent(htmlWithJsonLd, 'https://example.com', 'test');
    expect(result).not.toBeNull();
    expect(result.source).toBe('test/jsonld');
    expect(result.title).toBe('Test');
  });

  test('falls back to hasEnoughContent check', () => {
    const paragraphs = Array.from({ length: 5 }, () =>
      `<p>${'Test content here. '.repeat(10)}</p>`
    ).join('');
    const html = `<html><body>${paragraphs}</body></html>`;
    const result = tryExtractContent(html, 'https://example.com', 'test');
    expect(result).not.toBeNull();
    expect(result.source).toBe('test');
  });

  test('returns null for insufficient content without JSON-LD', () => {
    expect(tryExtractContent('<html><body>short</body></html>', 'https://example.com', 'test')).toBeNull();
  });
});

// ─── runFallbackChain ─────────────────────────────────────────────

describe('runFallbackChain', () => {
  const articleBody = 'B'.repeat(250);
  const jsonLdHtml = `<html><head>
    <script type="application/ld+json">
    {"@type":"Article","headline":"Fallback Test","articleBody":"${articleBody}"}
    </script>
  </head><body></body></html>`;

  test('returns JSON-LD from Playwright HTML as first priority', async () => {
    const result = await runFallbackChain('https://example.com', jsonLdHtml);
    expect(result).not.toBeNull();
    expect(result.source).toBe('playwright/jsonld');
    expect(fetch).not.toHaveBeenCalled(); // no HTTP requests needed
  });

  test('tries Googlebot fetch when Playwright has no content', async () => {
    fetch.mockResolvedValueOnce({ ok: true, text: () => Promise.resolve(jsonLdHtml) });

    const result = await runFallbackChain('https://example.com', '<html><body>empty</body></html>');
    expect(result).not.toBeNull();
    expect(result.source).toBe('googlebot/jsonld');
    expect(fetch).toHaveBeenCalledTimes(1);
  });

  test('tries Google Cache when Googlebot fails', async () => {
    fetch
      .mockResolvedValueOnce({ ok: false }) // Googlebot fails
      .mockResolvedValueOnce({ ok: true, text: () => Promise.resolve(jsonLdHtml) }); // Cache succeeds

    const result = await runFallbackChain('https://example.com', '<html><body>empty</body></html>');
    expect(result).not.toBeNull();
    expect(result.source).toBe('googleCache/jsonld');
    expect(fetch).toHaveBeenCalledTimes(2);
  });

  test('tries archive.is when all prior attempts fail', async () => {
    fetch
      .mockResolvedValueOnce({ ok: false }) // Googlebot fails
      .mockResolvedValueOnce({ ok: false }) // Cache fails
      .mockResolvedValueOnce({ ok: true, text: () => Promise.resolve(jsonLdHtml) }); // archive.is succeeds

    const result = await runFallbackChain('https://example.com', '<html><body>empty</body></html>');
    expect(result).not.toBeNull();
    expect(result.source).toBe('archive.is/jsonld');
    expect(fetch).toHaveBeenCalledTimes(3);
  });

  test('returns null when all attempts fail', async () => {
    fetch.mockResolvedValue({ ok: false });

    const result = await runFallbackChain('https://example.com', '<html><body>empty</body></html>');
    expect(result).toBeNull();
    expect(fetch).toHaveBeenCalledTimes(3); // googlebot, cache, archive.is
  });

  test('handles null playwrightHtml', async () => {
    fetch.mockResolvedValueOnce({ ok: true, text: () => Promise.resolve(jsonLdHtml) });

    const result = await runFallbackChain('https://example.com', null);
    expect(result).not.toBeNull();
    expect(result.source).toBe('googlebot/jsonld');
  });
});
