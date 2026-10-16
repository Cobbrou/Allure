// Local activity store (IndexedDB). Two stores: `activities` holds light meta records for
// lists, `tracks` holds the raw points by activity id, loaded only on the detail screen.
// Platform module: a native storage plugin can replace it without touching components.

const DB_NAME = 'allure';
const VERSION = 1;
let dbPromise;

function open() {
  return (dbPromise ??= new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, VERSION);
    req.onupgradeneeded = () => {
      req.result.createObjectStore('activities', { keyPath: 'id' });
      req.result.createObjectStore('tracks');
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  }));
}

/** Run fn(...stores) in one transaction; resolves with the result of the request fn returns. */
async function tx(names, mode, fn) {
  const db = await open();
  return new Promise((resolve, reject) => {
    const t = db.transaction(names, mode);
    const req = fn(...names.map((n) => t.objectStore(n)));
    t.oncomplete = () => resolve(req?.result);
    t.onerror = () => reject(t.error);
    t.onabort = () => reject(t.error);
  });
}

export async function listActivities() {
  const all = await tx(['activities'], 'readonly', (s) => s.getAll());
  return all.sort((a, b) => b.date - a.date);
}

export async function getActivity(id) {
  const [meta, points] = await Promise.all([
    tx(['activities'], 'readonly', (s) => s.get(id)),
    tx(['tracks'], 'readonly', (s) => s.get(id)),
  ]);
  return meta && { meta, points };
}

/** Save many { meta, points } in a single transaction. */
export function saveActivities(items) {
  return tx(['activities', 'tracks'], 'readwrite', (acts, tracks) => {
    for (const { meta, points } of items) {
      acts.put(meta);
      tracks.put(points, meta.id);
    }
  });
}

export function updateActivity(meta) {
  return tx(['activities'], 'readwrite', (s) => s.put(meta));
}

export function deleteActivities(ids) {
  return tx(['activities', 'tracks'], 'readwrite', (acts, tracks) => {
    for (const id of ids) {
      acts.delete(id);
      tracks.delete(id);
    }
  });
}
