import { listSnapshots, deleteSnapshot, getSnapshot } from '../lib/storage.js';

const archiveBtn = document.getElementById('archive-btn');
const bypassBtn = document.getElementById('bypass-btn');
const readerBtn = document.getElementById('reader-btn');
const statusEl = document.getElementById('status');
const snapshotList = document.getElementById('snapshot-list');

// Open options page
document.getElementById('options-link').addEventListener('click', (e) => {
  e.preventDefault();
  chrome.runtime.openOptionsPage();
});

// Bypass Paywall button — inject DOM bypass without archiving
bypassBtn.addEventListener('click', async () => {
  bypassBtn.disabled = true;
  showStatus('Bypassing paywall...', 'info');
  try {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    if (!tab) throw new Error('No active tab found');
    const response = await chrome.runtime.sendMessage({ action: 'bypass', tabId: tab.id });
    if (response && response.success) {
      showStatus('Paywall bypass applied.', 'success');
    } else {
      showStatus(`Error: ${response && response.error ? response.error : 'Unknown error'}`, 'error');
    }
  } catch (err) {
    showStatus(`Error: ${err.message}`, 'error');
  } finally {
    bypassBtn.disabled = false;
  }
});

// Reader Mode button — activate clean reading view in the current tab
readerBtn.addEventListener('click', async () => {
  readerBtn.disabled = true;
  try {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    if (!tab) throw new Error('No active tab found');
    // First bypass the paywall, then activate reader mode
    await chrome.runtime.sendMessage({ action: 'bypass', tabId: tab.id });
    await chrome.tabs.sendMessage(tab.id, { action: 'activateReader' });
    showStatus('Reader mode activated.', 'success');
  } catch (err) {
    showStatus(`Error: ${err.message}`, 'error');
  } finally {
    readerBtn.disabled = false;
  }
});

// Archive button
archiveBtn.addEventListener('click', async () => {
  archiveBtn.disabled = true;
  showStatus('Archiving... this may take 15-30 seconds.', 'info');

  try {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    if (!tab) throw new Error('No active tab found');

    const response = await chrome.runtime.sendMessage({
      action: 'archive',
      tabId: tab.id,
    });

    if (response.success) {
      showStatus(`Archived! Snapshot ID: ${response.id}`, 'success');
      await loadSnapshots();
    } else {
      showStatus(`Error: ${response.error}`, 'error');
    }
  } catch (err) {
    showStatus(`Error: ${err.message}`, 'error');
  } finally {
    archiveBtn.disabled = false;
  }
});

function showStatus(message, type) {
  statusEl.textContent = message;
  statusEl.className = `status visible ${type}`;
}

async function loadSnapshots() {
  try {
    const snapshots = await listSnapshots();

    if (snapshots.length === 0) {
      snapshotList.innerHTML = '<li class="empty">No snapshots yet. Archive your first article above.</li>';
      return;
    }

    snapshotList.innerHTML = snapshots.map(s => `
      <li class="snapshot-item" data-id="${esc(s.id)}">
        <div class="snapshot-title" title="${esc(s.originalUrl)}">${esc(s.title || s.originalUrl)}</div>
        <div class="snapshot-meta">${esc(s.id)} &middot; ${esc(new Date(s.timestamp).toLocaleString())}</div>
        <div class="snapshot-actions">
          <button class="btn btn-sm action-view" data-id="${esc(s.id)}">View</button>
          <button class="btn btn-sm action-screenshot" data-id="${esc(s.id)}">Screenshot</button>
          <button class="btn btn-sm action-download" data-id="${esc(s.id)}">Download</button>
          <button class="btn btn-sm btn-danger action-delete" data-id="${esc(s.id)}">Delete</button>
        </div>
      </li>
    `).join('');

    // Attach event listeners
    snapshotList.querySelectorAll('.action-view').forEach(btn => {
      btn.addEventListener('click', () => {
        chrome.tabs.create({ url: chrome.runtime.getURL(`viewer/viewer.html?id=${btn.dataset.id}`) });
      });
    });

    snapshotList.querySelectorAll('.action-screenshot').forEach(btn => {
      btn.addEventListener('click', async () => {
        const snap = await getSnapshot(btn.dataset.id);
        if (snap && snap.screenshot) {
          chrome.tabs.create({ url: snap.screenshot });
        }
      });
    });

    snapshotList.querySelectorAll('.action-download').forEach(btn => {
      btn.addEventListener('click', async () => {
        const snap = await getSnapshot(btn.dataset.id);
        if (snap && snap.html) {
          const blob = new Blob([snap.html], { type: 'text/html' });
          const url = URL.createObjectURL(blob);
          chrome.downloads.download({
            url,
            filename: `snapshot-${snap.id}.html`,
            saveAs: true,
          });
        }
      });
    });

    snapshotList.querySelectorAll('.action-delete').forEach(btn => {
      btn.addEventListener('click', async () => {
        await deleteSnapshot(btn.dataset.id);
        await loadSnapshots();
      });
    });
  } catch (err) {
    snapshotList.innerHTML = `<li class="empty">Error loading snapshots: ${esc(err.message)}</li>`;
  }
}

function esc(str) {
  if (!str) return '';
  return String(str).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

// Load snapshots on popup open
loadSnapshots();
