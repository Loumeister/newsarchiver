require('dotenv').config();

const VALID_WAIT_STRATEGIES = ['networkidle', 'domcontentloaded'];

const port = parseInt(process.env.PORT, 10) || 3000;
if (isNaN(port) || port < 1 || port > 65535) {
  throw new Error(`Invalid PORT: ${process.env.PORT} (must be 1-65535)`);
}

const timeoutMs = parseInt(process.env.TIMEOUT_MS, 10) || 15000;
if (isNaN(timeoutMs) || timeoutMs <= 0) {
  throw new Error(`Invalid TIMEOUT_MS: ${process.env.TIMEOUT_MS} (must be a positive number)`);
}

const waitStrategy = process.env.WAIT_STRATEGY || 'networkidle';
if (!VALID_WAIT_STRATEGIES.includes(waitStrategy)) {
  throw new Error(`Invalid WAIT_STRATEGY: ${waitStrategy} (must be one of: ${VALID_WAIT_STRATEGIES.join(', ')})`);
}

module.exports = {
  port,
  headless: process.env.HEADLESS !== 'false',
  waitStrategy,
  timeoutMs,
  keepScripts: process.env.KEEP_SCRIPTS === 'true',
  proxyLinks: process.env.PROXY_LINKS === 'true',
  cookiesFile: process.env.COOKIES_FILE || null,
  clearMeterState: process.env.CLEAR_METER_STATE !== 'false',
  userAgent: process.env.USER_AGENT || 'Mozilla/5.0 (Linux; Android 6.0.1; Nexus 5X Build/MMB29P) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Mobile Safari/537.36 (compatible; Googlebot/2.1; +http://www.google.com/bot.html)',
  referer: process.env.REFERER || 'https://www.google.com/',
  dataDir: require('path').join(__dirname, '..', 'data'),
};
