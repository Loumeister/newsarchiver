require('dotenv').config();

module.exports = {
  port: parseInt(process.env.PORT, 10) || 3000,
  headless: process.env.HEADLESS !== 'false',
  waitStrategy: process.env.WAIT_STRATEGY || 'networkidle',
  timeoutMs: parseInt(process.env.TIMEOUT_MS, 10) || 15000,
  keepScripts: process.env.KEEP_SCRIPTS === 'true',
  proxyLinks: process.env.PROXY_LINKS === 'true',
  cookiesFile: process.env.COOKIES_FILE || null,
  userAgent: process.env.USER_AGENT || 'Mozilla/5.0 (Linux; Android 6.0.1; Nexus 5X Build/MMB29P) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Mobile Safari/537.36 (compatible; Googlebot/2.1; +http://www.google.com/bot.html)',
  referer: process.env.REFERER || 'https://www.google.com/',
  dataDir: require('path').join(__dirname, '..', 'data'),
};
