import { getSnapshot } from '../lib/storage.js';

const contentEl = document.getElementById('content');

async function loadSnapshot() {
  const params = new URLSearchParams(window.location.search);
  const id = params.get('id');

  if (!id) {
    contentEl.className = 'error';
    contentEl.textContent = 'No snapshot ID provided.';
    return;
  }

  try {
    const snapshot = await getSnapshot(id);

    if (!snapshot) {
      contentEl.className = 'error';
      contentEl.textContent = `Snapshot "${id}" not found.`;
      return;
    }

    // Update page title
    document.title = `newsarchive — ${snapshot.title || snapshot.originalUrl}`;

    // Render the snapshot in a sandboxed iframe using srcdoc
    const iframe = document.createElement('iframe');
    iframe.sandbox = 'allow-same-origin';
    iframe.srcdoc = snapshot.html;

    contentEl.replaceWith(iframe);
  } catch (err) {
    contentEl.className = 'error';
    contentEl.textContent = `Error loading snapshot: ${err.message}`;
  }
}

loadSnapshot();
