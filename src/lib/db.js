// Local activity store (IndexedDB). Two stores: `activities` holds light meta records for
// lists, `tracks` holds the raw points by activity id, loaded only on the detail screen.
// Platform module: a native storage plugin can replace it without touching components.

import { analyze } from './analyze.js';
import { bestEfforts } from './records.js';

const DB_NAME = 'allure';
const VERSION = 2;
let dbPromise;

// Schema migrations, keyed by the version they upgrade to. They run inside the upgrade
// transaction, in order, for every version above the one stored on the device.
const MIGRATIONS = {
  1: (db) => {
    db.createObjectStore('activities', { keyPath: 'id' });
    db.createObjectStore('tracks');
  },
  // v2: metas gain `bestEfforts`, computed from the stored tracks.
  2: (db, tx) => {
    const tracks = tx.objectStore('tracks');
    tx.objectStore('activities').openCursor().onsuccess = (e) => {
      const cursor = e.target.result;
      if (!cursor) return;
      tracks.get(cursor.key).onsuccess = (t) => {
        const points = t.target.result;
        cursor.update({ ...cursor.value, bestEfforts: points ? bestEfforts(analyze(points).track) : {} });
        cursor.continue();
      };
    };
  },
};

function open() {
  return (dbPromise ??= new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, VERSION);
    req.onupgradeneeded = (e) => {
      for (let v = e.oldVersion + 1; v <= VERSION; v++) MIGRATIONS[v](req.result, req.transaction);
    };
    req.onsuccess = () => {
      // Let a newer version of the app (another tab) upgrade the schema.
      req.result.onversionchange = () => req.result.close();
      resolve(req.result);
    };
    req.onerror = () => reject(req.error);
    // An older version of the app open elsewhere holds the DB: the upgrade waits for it.
    req.onblocked = () => {
      dbPromise = null; // retry on next access
      reject(new Error("Allure est ouvert dans un autre onglet : ferme-le pour terminer la mise à jour."));
    };
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
