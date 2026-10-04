// Shared IndexedDB storage layer for the embroidery pop-up app.
const DB_NAME = 'embroideryPopupDB';
const DB_VERSION = 1;
const STORE_META = 'meta';
const STORE_SUBMISSIONS = 'submissions';

function openDB() {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = (e) => {
      const db = e.target.result;
      if (!db.objectStoreNames.contains(STORE_META)) {
        db.createObjectStore(STORE_META, { keyPath: 'key' });
      }
      if (!db.objectStoreNames.contains(STORE_SUBMISSIONS)) {
        db.createObjectStore(STORE_SUBMISSIONS, { keyPath: 'id', autoIncrement: true });
      }
    };
    req.onsuccess = (e) => resolve(e.target.result);
    req.onerror = (e) => reject(e.target.error);
  });
}

function makeId() {
  if (window.crypto && crypto.randomUUID) return crypto.randomUUID();
  return 'id-' + Math.random().toString(36).slice(2) + Date.now();
}

function defaultConfig() {
  return {
    logo: null,
    fields: [
      { id: 'firstName', label: 'First Name', type: 'text', required: true },
      { id: 'lastName', label: 'Last Name', type: 'text', required: true },
      { id: 'phone', label: 'Phone Number', type: 'tel', required: true },
      { id: 'email', label: 'Email', type: 'email', required: true },
    ],
    fontOptions: [
      { id: makeId(), label: 'Option 1', image: null },
      { id: makeId(), label: 'Option 2', image: null },
      { id: makeId(), label: 'Option 3', image: null },
      { id: makeId(), label: 'Option 4', image: null },
    ],
    initialsMaxLength: 3,
    idleResetSeconds: 60,
    pinHash: null,
    sheetWebAppUrl: null,
  };
}

async function getConfig() {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_META, 'readonly');
    const req = tx.objectStore(STORE_META).get('config');
    req.onsuccess = () => resolve(req.result ? req.result.value : null);
    req.onerror = () => reject(req.error);
  });
}

async function getConfigOrDefault() {
  const cfg = await getConfig();
  return cfg || defaultConfig();
}

async function setConfig(config) {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_META, 'readwrite');
    tx.objectStore(STORE_META).put({ key: 'config', value: config });
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

async function addSubmission(sub) {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_SUBMISSIONS, 'readwrite');
    const req = tx.objectStore(STORE_SUBMISSIONS).add(sub);
    req.onsuccess = () => { sub.id = req.result; };
    tx.oncomplete = () => resolve(sub.id);
    tx.onerror = () => reject(tx.error);
  });
}

async function getAllSubmissions() {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const req = db.transaction(STORE_SUBMISSIONS, 'readonly').objectStore(STORE_SUBMISSIONS).getAll();
    req.onsuccess = () => resolve(req.result || []);
    req.onerror = () => reject(req.error);
  });
}

async function clearSubmissions() {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_SUBMISSIONS, 'readwrite');
    tx.objectStore(STORE_SUBMISSIONS).clear();
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

async function deleteSubmissionLocal(id) {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_SUBMISSIONS, 'readwrite');
    tx.objectStore(STORE_SUBMISSIONS).delete(id);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

// Deletes can't be retried from the submissions store (the record is gone
// once deleted locally), so pending deletes are tracked separately until
// the Sheet confirms the row is gone too.
async function getPendingDeletes() {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const req = db.transaction(STORE_META, 'readonly').objectStore(STORE_META).get('pendingDeletes');
    req.onsuccess = () => resolve(req.result ? req.result.value : []);
    req.onerror = () => reject(req.error);
  });
}

async function addPendingDelete(orderNumber) {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_META, 'readwrite');
    const store = tx.objectStore(STORE_META);
    const req = store.get('pendingDeletes');
    req.onsuccess = () => {
      const list = req.result ? req.result.value : [];
      if (!list.includes(orderNumber)) list.push(orderNumber);
      store.put({ key: 'pendingDeletes', value: list });
    };
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

async function removePendingDelete(orderNumber) {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_META, 'readwrite');
    const store = tx.objectStore(STORE_META);
    const req = store.get('pendingDeletes');
    req.onsuccess = () => {
      const list = (req.result ? req.result.value : []).filter((n) => n !== orderNumber);
      store.put({ key: 'pendingDeletes', value: list });
    };
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

async function sendDeleteRequest(cfg, orderNumber) {
  const res = await fetch(cfg.sheetWebAppUrl, {
    method: 'POST',
    headers: { 'Content-Type': 'text/plain;charset=utf-8' },
    body: JSON.stringify({ action: 'delete', orderNumber }),
  });
  return res.ok;
}

async function syncDeleteSubmission(cfg, sub) {
  if (!cfg.sheetWebAppUrl) return false;
  await addPendingDelete(sub.orderNumber);
  try {
    if (await sendDeleteRequest(cfg, sub.orderNumber)) {
      await removePendingDelete(sub.orderNumber);
      return true;
    }
  } catch (e) {
    // Offline or unreachable — stays queued in pendingDeletes and gets retried later.
  }
  return false;
}

async function retryPendingDeletes(cfg) {
  if (!cfg.sheetWebAppUrl) return;
  const pending = await getPendingDeletes();
  for (const orderNumber of pending) {
    try {
      if (await sendDeleteRequest(cfg, orderNumber)) {
        await removePendingDelete(orderNumber);
      }
    } catch (e) {
      // Still offline — leave it queued.
    }
  }
}

async function markSubmissionSynced(id) {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_SUBMISSIONS, 'readwrite');
    const store = tx.objectStore(STORE_SUBMISSIONS);
    const req = store.get(id);
    req.onsuccess = () => {
      const rec = req.result;
      if (rec) { rec.synced = true; store.put(rec); }
    };
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

// Sends one submission to the configured Google Sheet web app. Uses
// text/plain as the content type so the browser skips the CORS preflight
// that Apps Script web apps don't handle — the body is still JSON.
async function syncSubmission(cfg, sub) {
  if (!cfg.sheetWebAppUrl) return false;
  try {
    const payload = {
      orderNumber: sub.orderNumber,
      timestamp: sub.timestamp,
      fields: cfg.fields.map((f) => ({ label: f.label, value: (sub.values && sub.values[f.id]) || '' })),
      styleLabel: sub.fontOptionLabel,
      initials: sub.initials,
    };
    const res = await fetch(cfg.sheetWebAppUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'text/plain;charset=utf-8' },
      body: JSON.stringify(payload),
    });
    if (res.ok) {
      await markSubmissionSynced(sub.id);
      return true;
    }
  } catch (e) {
    // Offline or unreachable — stays queued as unsynced and gets retried later.
  }
  return false;
}

async function retryPendingSyncs(cfg) {
  if (!cfg.sheetWebAppUrl) return;
  const subs = await getAllSubmissions();
  const pending = subs.filter((s) => !s.synced);
  for (const s of pending) {
    await syncSubmission(cfg, s);
  }
}

// Assigns the next order number (starting at 100) and advances the counter,
// in one transaction so concurrent calls can't hand out the same number.
async function getNextOrderNumber() {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_META, 'readwrite');
    const store = tx.objectStore(STORE_META);
    const req = store.get('orderCounter');
    req.onsuccess = () => {
      const current = req.result ? req.result.value : 100;
      store.put({ key: 'orderCounter', value: current + 1 });
    };
    req.onerror = () => reject(req.error);
    tx.oncomplete = () => resolve(req.result ? req.result.value : 100);
    tx.onerror = () => reject(tx.error);
  });
}

async function sha256Hex(text) {
  const enc = new TextEncoder().encode(text);
  const buf = await crypto.subtle.digest('SHA-256', enc);
  return Array.from(new Uint8Array(buf)).map((b) => b.toString(16).padStart(2, '0')).join('');
}

function readFileAsDataURL(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}
