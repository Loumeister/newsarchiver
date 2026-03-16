const { escapeHtml } = require('./shared/utils');

function renderHomePage(snapshots) {
  const esc = escapeHtml;
  const snapshotRows = snapshots.map(s => `
    <tr>
      <td><a href="/snap/${esc(s.id)}">${esc(s.id)}</a></td>
      <td title="${esc(s.originalUrl)}" style="max-width:400px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">
        <a href="${esc(s.originalUrl)}" target="_blank">${esc(s.title || s.originalUrl)}</a>
      </td>
      <td>${esc(new Date(s.timestamp).toLocaleString())}</td>
      <td>
        <a href="/snap/${esc(s.id)}/screenshot">img</a> |
        <a href="/snap/${esc(s.id)}/meta">meta</a> |
        <a href="/snap/${esc(s.id)}/download">dl</a>
      </td>
    </tr>
  `).join('');

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>newsarchive</title>
  <style>
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body {
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', sans-serif;
      background: #0d1117;
      color: #c9d1d9;
      min-height: 100vh;
    }
    .container { max-width: 800px; margin: 0 auto; padding: 48px 24px; }
    h1 { font-size: 28px; color: #7c83ff; margin-bottom: 8px; }
    .subtitle { color: #8b949e; margin-bottom: 32px; font-size: 14px; }
    .card {
      background: #161b22;
      border: 1px solid #30363d;
      border-radius: 8px;
      padding: 24px;
      margin-bottom: 24px;
    }
    .form-group { margin-bottom: 16px; }
    label { display: block; font-size: 14px; color: #8b949e; margin-bottom: 6px; }
    input[type="text"] {
      width: 100%;
      padding: 10px 14px;
      background: #0d1117;
      border: 1px solid #30363d;
      border-radius: 6px;
      color: #c9d1d9;
      font-size: 15px;
      outline: none;
      transition: border-color 0.2s;
    }
    input[type="text"]:focus { border-color: #7c83ff; }
    button {
      background: #7c83ff;
      color: #fff;
      border: none;
      padding: 10px 24px;
      border-radius: 6px;
      font-size: 15px;
      cursor: pointer;
      transition: background 0.2s;
    }
    button:hover { background: #6a71e0; }
    button:disabled { opacity: 0.6; cursor: not-allowed; }
    .spinner { display: none; margin-left: 8px; }
    .loading .spinner { display: inline-block; }
    .loading button { pointer-events: none; opacity: 0.6; }
    table { width: 100%; border-collapse: collapse; font-size: 14px; }
    th { text-align: left; color: #8b949e; padding: 8px 12px; border-bottom: 1px solid #30363d; }
    td { padding: 8px 12px; border-bottom: 1px solid #21262d; }
    a { color: #58a6ff; text-decoration: none; }
    a:hover { text-decoration: underline; }
    .empty { color: #484f58; text-align: center; padding: 24px; font-style: italic; }
    .disclaimer {
      margin-top: 48px;
      padding: 16px;
      background: #1c1e26;
      border: 1px solid #30363d;
      border-radius: 6px;
      font-size: 12px;
      color: #6e7681;
      line-height: 1.5;
    }
  </style>
</head>
<body>
  <div class="container">
    <h1>newsarchive</h1>
    <p class="subtitle">Self-hosted news article archiver — create local, self-contained snapshots of web pages.</p>

    <div class="card" id="form-card">
      <form method="POST" action="/archive" id="archive-form">
        <div class="form-group">
          <label for="url">Article URL</label>
          <input type="text" id="url" name="url" placeholder="https://www.example.com/article..." required>
        </div>
        <button type="submit" id="submit-btn">Archive</button>
        <span class="spinner" id="spinner">Archiving... this may take 15-30 seconds.</span>
      </form>
    </div>

    <div class="card">
      <h2 style="font-size:18px;margin-bottom:16px;">Snapshots</h2>
      ${snapshots.length === 0
        ? '<p class="empty">No snapshots yet. Archive your first article above.</p>'
        : `<table>
            <thead><tr><th>ID</th><th>Title / URL</th><th>Date</th><th>Links</th></tr></thead>
            <tbody>${snapshotRows}</tbody>
          </table>`
      }
    </div>

    <div class="disclaimer">
      <strong>Legal Disclaimer:</strong> This tool is intended for personal archival and research purposes only.
      Bypassing paywalls may violate the terms of service of the archived website and/or applicable laws in your
      jurisdiction. The user assumes all responsibility for how this tool is used. The authors of this software
      do not encourage or condone any unlawful use.
    </div>
  </div>
  <script>
    document.getElementById('archive-form').addEventListener('submit', function() {
      document.getElementById('form-card').classList.add('loading');
      document.getElementById('submit-btn').disabled = true;
      document.getElementById('spinner').style.display = 'inline';
    });
  </script>
</body>
</html>`;
}

module.exports = { renderHomePage };
