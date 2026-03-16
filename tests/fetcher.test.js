jest.mock('playwright', () => {
  const mockPage = {
    goto: jest.fn().mockResolvedValue(undefined),
    waitForTimeout: jest.fn().mockResolvedValue(undefined),
    evaluate: jest.fn().mockResolvedValue('<html lang="en"><head><title>Test</title></head><body>Hello</body></html>'),
    title: jest.fn().mockResolvedValue('Test Page'),
    screenshot: jest.fn().mockResolvedValue(Buffer.from('fake-screenshot')),
  };
  const mockContext = {
    newPage: jest.fn().mockResolvedValue(mockPage),
    addCookies: jest.fn().mockResolvedValue(undefined),
  };
  const mockBrowser = {
    newContext: jest.fn().mockResolvedValue(mockContext),
    close: jest.fn().mockResolvedValue(undefined),
  };
  return {
    chromium: {
      launch: jest.fn().mockResolvedValue(mockBrowser),
    },
    _mocks: { mockBrowser, mockContext, mockPage },
  };
});

jest.mock('../src/config', () => ({
  headless: true,
  waitStrategy: 'networkidle',
  timeoutMs: 15000,
  cookiesFile: null,
  dataDir: '/tmp/newsarchiver-test/data',
}));

const { fetchPage, generateSnapshotId } = require('../src/fetcher');
const { chromium, _mocks } = require('playwright');

afterEach(() => {
  jest.clearAllMocks();
});

// ─── generateSnapshotId ──────────────────────────────────────────────────

describe('generateSnapshotId', () => {
  test('returns a 6-character hex string', () => {
    const id = generateSnapshotId();
    expect(id).toMatch(/^[0-9a-f]{6}$/);
  });

  test('generates unique IDs on successive calls', () => {
    const ids = new Set(Array.from({ length: 50 }, () => generateSnapshotId()));
    // With 3 random bytes, collisions in 50 attempts are astronomically unlikely
    expect(ids.size).toBe(50);
  });

  test('returns a string type', () => {
    expect(typeof generateSnapshotId()).toBe('string');
  });
});

// ─── fetchPage ───────────────────────────────────────────────────────────

describe('fetchPage', () => {
  test('returns html, screenshot, title, and snapshotId', async () => {
    const result = await fetchPage('https://example.com');
    expect(result).toHaveProperty('html');
    expect(result).toHaveProperty('screenshot');
    expect(result).toHaveProperty('title');
    expect(result).toHaveProperty('snapshotId');
  });

  test('snapshotId is a 6-char hex string', async () => {
    const result = await fetchPage('https://example.com');
    expect(result.snapshotId).toMatch(/^[0-9a-f]{6}$/);
  });

  test('title comes from page.title()', async () => {
    const result = await fetchPage('https://example.com');
    expect(result.title).toBe('Test Page');
  });

  test('screenshot is a Buffer', async () => {
    const result = await fetchPage('https://example.com');
    expect(Buffer.isBuffer(result.screenshot)).toBe(true);
  });

  test('html contains DOCTYPE', async () => {
    const result = await fetchPage('https://example.com');
    expect(result.html).toContain('<!DOCTYPE html>');
  });

  test('launches browser with headless mode', async () => {
    await fetchPage('https://example.com');
    expect(chromium.launch).toHaveBeenCalledWith({ headless: true });
  });

  test('navigates to the provided URL', async () => {
    await fetchPage('https://example.com/test');
    expect(_mocks.mockPage.goto).toHaveBeenCalledWith(
      'https://example.com/test',
      expect.objectContaining({ waitUntil: 'networkidle', timeout: 15000 })
    );
  });

  test('closes browser after fetching', async () => {
    await fetchPage('https://example.com');
    expect(_mocks.mockBrowser.close).toHaveBeenCalled();
  });

  test('closes browser even on error', async () => {
    _mocks.mockPage.goto.mockRejectedValueOnce(new Error('Navigation failed'));
    await expect(fetchPage('https://example.com')).rejects.toThrow('Navigation failed');
    expect(_mocks.mockBrowser.close).toHaveBeenCalled();
  });
});
