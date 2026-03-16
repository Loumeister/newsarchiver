describe('config', () => {
  const originalEnv = process.env;

  beforeEach(() => {
    jest.resetModules();
    process.env = { ...originalEnv };
    // Clear all relevant env vars
    delete process.env.PORT;
    delete process.env.HEADLESS;
    delete process.env.WAIT_STRATEGY;
    delete process.env.TIMEOUT_MS;
    delete process.env.KEEP_SCRIPTS;
    delete process.env.PROXY_LINKS;
    delete process.env.COOKIES_FILE;
  });

  afterAll(() => {
    process.env = originalEnv;
  });

  test('provides default values when env vars are not set', () => {
    const config = require('../src/config');
    expect(config.port).toBe(3000);
    expect(config.headless).toBe(true);
    expect(config.waitStrategy).toBe('networkidle');
    expect(config.timeoutMs).toBe(15000);
    expect(config.keepScripts).toBe(false);
    expect(config.proxyLinks).toBe(false);
    expect(config.cookiesFile).toBeNull();
  });

  test('parses PORT as integer', () => {
    process.env.PORT = '8080';
    const config = require('../src/config');
    expect(config.port).toBe(8080);
  });

  test('parses HEADLESS=false correctly', () => {
    process.env.HEADLESS = 'false';
    const config = require('../src/config');
    expect(config.headless).toBe(false);
  });

  test('HEADLESS defaults to true for any value other than "false"', () => {
    process.env.HEADLESS = 'true';
    const config = require('../src/config');
    expect(config.headless).toBe(true);
  });

  test('parses WAIT_STRATEGY', () => {
    process.env.WAIT_STRATEGY = 'domcontentloaded';
    const config = require('../src/config');
    expect(config.waitStrategy).toBe('domcontentloaded');
  });

  test('parses TIMEOUT_MS as integer', () => {
    process.env.TIMEOUT_MS = '30000';
    const config = require('../src/config');
    expect(config.timeoutMs).toBe(30000);
  });

  test('KEEP_SCRIPTS=true enables script keeping', () => {
    process.env.KEEP_SCRIPTS = 'true';
    const config = require('../src/config');
    expect(config.keepScripts).toBe(true);
  });

  test('KEEP_SCRIPTS with any other value defaults to false', () => {
    process.env.KEEP_SCRIPTS = 'yes';
    const config = require('../src/config');
    expect(config.keepScripts).toBe(false);
  });

  test('PROXY_LINKS=true enables proxy', () => {
    process.env.PROXY_LINKS = 'true';
    const config = require('../src/config');
    expect(config.proxyLinks).toBe(true);
  });

  test('COOKIES_FILE sets cookie path', () => {
    process.env.COOKIES_FILE = '/path/to/cookies.json';
    const config = require('../src/config');
    expect(config.cookiesFile).toBe('/path/to/cookies.json');
  });

  test('dataDir points to project data directory', () => {
    const config = require('../src/config');
    expect(config.dataDir).toContain('data');
  });
});
