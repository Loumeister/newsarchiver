const { getSiteHandler, handlers } = require('../src/sites');
const nyt = require('../src/sites/nyt');
const dpg = require('../src/sites/dpg');

describe('Site handler registry', () => {
  test('returns NYT handler for nytimes.com URLs', () => {
    expect(getSiteHandler('https://www.nytimes.com/2024/01/01/article.html')).toBe(nyt);
    expect(getSiteHandler('https://nytimes.com/article')).toBe(nyt);
    expect(getSiteHandler('https://cooking.nytimes.com/recipes/123')).toBe(nyt);
  });

  test('returns DPG handler for Dutch news sites', () => {
    expect(getSiteHandler('https://www.ad.nl/article')).toBe(dpg);
    expect(getSiteHandler('https://www.volkskrant.nl/article')).toBe(dpg);
    expect(getSiteHandler('https://www.trouw.nl/article')).toBe(dpg);
    expect(getSiteHandler('https://www.parool.nl/article')).toBe(dpg);
  });

  test('returns null for non-matching URLs', () => {
    expect(getSiteHandler('https://www.washingtonpost.com/article')).toBeNull();
    expect(getSiteHandler('https://example.com')).toBeNull();
    expect(getSiteHandler('https://notnytimes.com')).toBeNull();
  });

  test('handlers array contains NYT and DPG', () => {
    expect(handlers.length).toBeGreaterThanOrEqual(2);
    expect(handlers).toContain(nyt);
    expect(handlers).toContain(dpg);
  });
});

describe('NYT handler', () => {
  test('has required properties', () => {
    expect(nyt.name).toBe('nyt');
    expect(typeof nyt.matches).toBe('function');
    expect(typeof nyt.preConfigure).toBe('function');
    expect(typeof nyt.postProcess).toBe('function');
    expect(typeof nyt.extractContent).toBe('function');
    expect(Array.isArray(nyt.overlaySelectors)).toBe(true);
    expect(Array.isArray(nyt.meterKeys)).toBe(true);
    expect(Array.isArray(nyt.lockClassPatterns)).toBe(true);
    expect(typeof nyt.unlockCss).toBe('string');
  });

  test('matches nytimes.com variants', () => {
    expect(nyt.matches('https://www.nytimes.com/2024/article')).toBe(true);
    expect(nyt.matches('https://nytimes.com/article')).toBe(true);
    expect(nyt.matches('https://cooking.nytimes.com/recipe')).toBe(true);
  });

  test('does not match other sites', () => {
    expect(nyt.matches('https://example.com')).toBe(false);
    expect(nyt.matches('https://nytimes.fake.com')).toBe(false);
    expect(nyt.matches('invalid-url')).toBe(false);
  });

  test('overlaySelectors includes NYT gateway selectors', () => {
    expect(nyt.overlaySelectors).toContain('#gateway-content');
    expect(nyt.overlaySelectors).toContain('#gatewayCreative');
    expect(nyt.overlaySelectors).toContain('[data-testid="inline-message"]');
  });

  test('meterKeys includes NYT cookie names', () => {
    expect(nyt.meterKeys).toContain('nyt-a');
    expect(nyt.meterKeys).toContain('nyt-purr');
    expect(nyt.meterKeys).toContain('nyt-b');
  });

  test('unlockCss targets NYT-specific containers', () => {
    expect(nyt.unlockCss).toContain('StoryBodyCompanionColumn');
    expect(nyt.unlockCss).toContain('articleBody');
    expect(nyt.unlockCss).toContain('#gateway-content');
  });

  test('lockClassPatterns match NYT gateway classes', () => {
    const matchesGateway = nyt.lockClassPatterns.some(p => p.test('gateway-visible'));
    expect(matchesGateway).toBe(true);
    const matchesTruncated = nyt.lockClassPatterns.some(p => p.test('truncated'));
    expect(matchesTruncated).toBe(true);
  });
});

describe('DPG handler', () => {
  test('has required properties', () => {
    expect(dpg.name).toBe('dpg');
    expect(typeof dpg.matches).toBe('function');
    expect(dpg.paywallType).toBe('hard');
    expect(Array.isArray(dpg.overlaySelectors)).toBe(true);
    expect(Array.isArray(dpg.lockClassPatterns)).toBe(true);
    expect(typeof dpg.unlockCss).toBe('string');
  });

  test('matches all DPG Media domains', () => {
    const domains = ['ad.nl', 'volkskrant.nl', 'trouw.nl', 'parool.nl',
      'tubantia.nl', 'ed.nl', 'bndestem.nl', 'pzc.nl',
      'gelderlander.nl', 'destentor.nl', 'bd.nl'];
    for (const domain of domains) {
      expect(dpg.matches(`https://www.${domain}/article`)).toBe(true);
      expect(dpg.matches(`https://${domain}/article`)).toBe(true);
    }
  });

  test('does not match non-DPG sites', () => {
    expect(dpg.matches('https://example.com')).toBe(false);
    expect(dpg.matches('https://www.nytimes.com')).toBe(false);
    expect(dpg.matches('invalid-url')).toBe(false);
  });

  test('has no preConfigure or postProcess (hard paywall)', () => {
    expect(dpg.preConfigure).toBeUndefined();
    expect(dpg.postProcess).toBeUndefined();
  });
});
