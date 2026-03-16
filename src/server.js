const express = require('express');
const path = require('path');
const config = require('./config');
const { registerRoutes } = require('./routes');

const app = express();
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Serve static assets from the data directory
app.use('/assets', express.static(path.join(config.dataDir, 'assets'), {
  maxAge: '1y',
  immutable: true,
}));

registerRoutes(app);

app.listen(config.port, () => {
  console.log(`newsarchive server running on http://localhost:${config.port}`);
  console.log(`  Headless: ${config.headless}`);
  console.log(`  Wait strategy: ${config.waitStrategy}`);
  console.log(`  Keep scripts: ${config.keepScripts}`);
  console.log(`  Proxy links: ${config.proxyLinks}`);
  console.log(`  User agent: ${config.userAgent.slice(0, 60)}...`);
});
