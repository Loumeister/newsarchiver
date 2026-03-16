require('dotenv').config();

module.exports = {
  port: parseInt(process.env.PORT, 10) || 3000,
  headless: process.env.HEADLESS !== 'false',
  waitStrategy: process.env.WAIT_STRATEGY || 'networkidle',
  timeoutMs: parseInt(process.env.TIMEOUT_MS, 10) || 15000,
  keepScripts: process.env.KEEP_SCRIPTS === 'true',
  proxyLinks: process.env.PROXY_LINKS === 'true',
  cookiesFile: process.env.COOKIES_FILE || null,
  dataDir: require('path').join(__dirname, '..', 'data'),
};
