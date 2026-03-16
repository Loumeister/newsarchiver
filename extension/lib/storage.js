/**
 * IndexedDB wrapper for newsarchive Chrome extension.
 * Stores snapshots (HTML + metadata) and assets (binary blobs).
 */

const DB_NAME = 'newsarchive';
const DB_VERSION = 1;

function openDB() {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);
    request.onupgradeneeded = (event) => {
      const db = event.target.result;
      if (!db.objectStoreNames.contains('snapshots')) {
        db.createObjectStore('snapshots', { keyPath: 'id' });
      }
      if (!db.objectStoreNames.contains('assets')) {
        db.createObjectStore('assets');
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

/**
 * Save a snapshot to IndexedDB.
 * @param {{ id, originalUrl, timestamp, title, html, screenshot }} snapshot
 */
export async function saveSnapshot(snapshot) {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction('snapshots', 'readwrite');
    tx.objectStore('snapshots').put(snapshot);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

/**
 * Get a snapshot by ID.
 * @param {string} id
 * @returns {Promise<object|undefined>}
 */
export async function getSnapshot(id) {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction('snapshots', 'readonly');
    const req = tx.objectStore('snapshots').get(id);
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

/**
 * List all snapshots, sorted by timestamp descending.
 * @returns {Promise<object[]>}
 */
export async function listSnapshots() {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction('snapshots', 'readonly');
    const req = tx.objectStore('snapshots').getAll();
    req.onsuccess = () => {
      const results = req.result || [];
      results.sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));
      resolve(results);
    };
    req.onerror = () => reject(req.error);
  });
}

/**
 * Delete a snapshot and its associated assets.
 * @param {string} id
 */
export async function deleteSnapshot(id) {
  const db = await openDB();

  // Delete the snapshot
  await new Promise((resolve, reject) => {
    const tx = db.transaction('snapshots', 'readwrite');
    tx.objectStore('snapshots').delete(id);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });

  // Delete associated assets (keys prefixed with snapshotId/)
  await new Promise((resolve, reject) => {
    const tx = db.transaction('assets', 'readwrite');
    const store = tx.objectStore('assets');
    const req = store.openCursor();
    req.onsuccess = (event) => {
      const cursor = event.target.result;
      if (cursor) {
        if (typeof cursor.key === 'string' && cursor.key.startsWith(id + '/')) {
          cursor.delete();
        }
        cursor.continue();
      }
    };
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

/**
 * Save an asset blob to IndexedDB.
 * @param {string} key - Format: "snapshotId/sha1.ext"
 * @param {Blob} blob
 * @param {string} mimeType
 */
export async function saveAsset(key, blob, mimeType) {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction('assets', 'readwrite');
    tx.objectStore('assets').put({ blob, mimeType }, key);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

/**
 * Get an asset blob from IndexedDB.
 * @param {string} key - Format: "snapshotId/sha1.ext"
 * @returns {Promise<{ blob: Blob, mimeType: string }|undefined>}
 */
export async function getAsset(key) {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction('assets', 'readonly');
    const req = tx.objectStore('assets').get(key);
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}
