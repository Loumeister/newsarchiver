function escapeHtml(str) {
  return str.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

function escapeAttr(str) {
  return str.replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

/**
 * Parse a srcset attribute into an array of URLs.
 */
function parseSrcset(srcset) {
  if (!srcset) return [];
  return srcset.split(',').map(entry => entry.trim().split(/\s+/)[0]).filter(Boolean);
}

module.exports = { escapeHtml, escapeAttr, parseSrcset };
