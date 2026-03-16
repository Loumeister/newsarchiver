const { escapeHtml, escapeAttr } = require('../shared/utils');

/**
 * Inject the archive toolbar at the top of <body>.
 */
function injectToolbar($, originalUrl, timestamp, snapshotId) {
  const toolbar = `
<div id="__archive-toolbar__" style="position:fixed;top:0;left:0;right:0;z-index:2147483647;background:#1a1a2e;color:#e0e0e0;padding:8px 16px;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;font-size:13px;display:flex;align-items:center;justify-content:space-between;box-shadow:0 2px 8px rgba(0,0,0,0.3);gap:12px;">
  <span style="flex-shrink:0;font-weight:600;color:#7c83ff;">&#128230; newsarchive</span>
  <span style="overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">Archived from <a href="${escapeAttr(originalUrl)}" style="color:#64b5f6;text-decoration:none;" target="_blank">${escapeHtml(originalUrl)}</a></span>
  <span style="flex-shrink:0;color:#aaa;">${escapeHtml(timestamp)}</span>
  <a href="/snap/${snapshotId}/screenshot" style="color:#64b5f6;text-decoration:none;flex-shrink:0;">Screenshot</a>
</div>
<div style="height:40px;"></div>`;

  $('body').prepend(toolbar);
}

module.exports = { injectToolbar };
