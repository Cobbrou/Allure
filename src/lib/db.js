// Local store (IndexedDB): `activities` holds light meta records for lists, `tracks` the
// raw points by activity id (loaded only on the detail screen), plus `drafts`, `settings`
// `segments` and planned `routes`.
// Platform module: a native storage plugin can replace it without touching components.

import { analyze } from './analyze.js';
import { defaultGear } from './gear.js';
import { bestEfforts } from './records.js';
import { segmentEfforts } from './segments.js';
import { hrTime } from './training.js';

const DB_NAME = 'allure';
export const VERSION = 6;
let dbPromise;

// Schema migrations, keyed by the version they upgrade to. They run inside the upgrade
// transaction, in order, for every version above the one stored on the device.
const MIGRATIONS = {
  1: (db) => {
    db.createObjectStore('activities', { keyPath: 'id' });
    db.createObjectStore('tracks');
  },
  // v2: metas gain `bestEfforts`, computed from the stored tracks.
  2: (db, tx) => backfill(tx, (points) => ({ bestEfforts: points ? bestEfforts(analyze(points).track) : {} })),
  // v3: `drafts` holds the in-progress live recording, so a crash or reload loses nothing.
  3: (db) => db.createObjectStore('drafts'),
  // v4: metas gain `hrTime` (seconds per bpm); `settings` holds user preferences by key.
  4: (db, tx) => {
    db.createObjectStore('settings');
    backfill(tx, (points) => ({ hrTime: points ? hrTime(points) : {} }));
  },
  // v5: `segments`; metas gain `efforts` when a segment matches (none exist before v5).
  5: (db) => db.createObjectStore('segments', { keyPath: 'id' }),
  // v6: `routes` planned with the route builder.
  6: (db) => db.createObjectStore('routes', { keyPath: 'id' }),
};

// Patch every meta accepted by `want` with fields computed from its track and the meta.
// ponytail: each migration runs its own cursor, so a v1 -> v4 upgrade could interleave two
// backfills on one record; only pre-v2 dev databases could hit it. Merge them if that matters.
function backfill(tx, patch, want = () => true) {
  const tracks = tx.objectStore('tracks');
  tx.objectStore('activities').openCursor().onsuccess = (e) => {
    const cursor = e.target.result;
    if (!cursor) return;
    if (!want(cursor.value)) return cursor.continue();
    tracks.get(cursor.key).onsuccess = (t) => {
      cursor.update({ ...cursor.value, ...patch(t.target.result, cursor.value) });
      cursor.continue();
    };
  };
}

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

/**
 * Save many { meta, points } in a single transaction, matching them against every segment
 * and giving them the default gear of their sport.
 */
export function saveActivities(items) {
  return tx(['activities', 'tracks', 'segments', 'settings'], 'readwrite', (acts, tracks, segs, settings) => {
    segs.getAll().onsuccess = (e) => {
      settings.get('gear').onsuccess = (g) => {
        const gears = g.target.result ?? [];
        for (const { meta, points } of items) {
          const gear = meta.gear ?? defaultGear(gears, meta.sport);
          acts.put({ ...meta, efforts: segmentEfforts(e.target.result, meta.sport, points), ...(gear && { gear }) });
          tracks.put(points, meta.id);
        }
      };
    };
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

/** The in-progress live recording (one at a time). */
export const saveDraft = (rec) => tx(['drafts'], 'readwrite', (s) => s.put(rec, 'current'));
export const loadDraft = () => tx(['drafts'], 'readonly', (s) => s.get('current'));
export const clearDraft = () => tx(['drafts'], 'readwrite', (s) => s.delete('current'));

/** User preferences, e.g. getSetting('hr') -> { max, rest }. */
export const getSetting = (key) => tx(['settings'], 'readonly', (s) => s.get(key));
export const setSetting = (key, value) => tx(['settings'], 'readwrite', (s) => s.put(value, key));

/** Call fn(id, points) for every stored track, one at a time, without loading them all in memory. */
export const forEachTrack = (fn) =>
  tx(['tracks'], 'readonly', (s) => {
    s.openCursor().onsuccess = (e) => {
      const c = e.target.result;
      if (c) { fn(c.key, c.value); c.continue(); }
    };
  });

export const listSegments = () => tx(['segments'], 'readonly', (s) => s.getAll());

/** Store a segment and record its efforts on every activity of the same sport. */
export const saveSegment = (seg) =>
  tx(['activities', 'tracks', 'segments'], 'readwrite', (acts, tracks, segs) => {
    segs.put(seg);
    backfill(acts.transaction, (points, meta) => ({
      efforts: [...(meta.efforts ?? []).filter((e) => e.seg !== seg.id), ...(points ? segmentEfforts([seg], meta.sport, points) : [])],
    }), (meta) => meta.sport === seg.sport);
  });

// ponytail: efforts of a deleted segment stay on metas; every reader goes through the
// segment list, so they are dead weight only. Strip them with backfill if that grows.
export const deleteSegment = (id) => tx(['segments'], 'readwrite', (s) => s.delete(id));

// ponytail: routes keep their points inline, so listing loads every point. Split them into
// their own store like tracks if athletes save hundreds of long routes.
export const listRoutes = async () => (await tx(['routes'], 'readonly', (s) => s.getAll())).sort((a, b) => b.updated - a.updated);
export const saveRoute = (route) => tx(['routes'], 'readwrite', (s) => s.put(route));
export const deleteRoute = (id) => tx(['routes'], 'readwrite', (s) => s.delete(id));

/** Every store's contents, for a full backup (see lib/backup.js). */
export async function exportAll() {
  const [metas, keys, values, segments, routes] = await Promise.all([
    tx(['activities'], 'readonly', (s) => s.getAll()),
    tx(['settings'], 'readonly', (s) => s.getAllKeys()),
    tx(['settings'], 'readonly', (s) => s.getAll()),
    listSegments(),
    tx(['routes'], 'readonly', (s) => s.getAll()),
  ]);
  const points = new Map();
  await forEachTrack((id, pts) => points.set(id, pts));
  return {
    schema: VERSION,
    activities: metas.map((meta) => ({ meta, points: points.get(meta.id) ?? [] })),
    settings: Object.fromEntries(keys.map((k, i) => [k, values[i]])),
    segments,
    routes,
  };
}

/** Write a parsed backup over the local data (same ids are replaced, others kept). */
export const restoreAll = ({ activities, settings, segments, routes }) =>
  tx(['activities', 'tracks', 'settings', 'segments', 'routes'], 'readwrite', (acts, tracks, sets, segs, rts) => {
    for (const { meta, points } of activities) {
      acts.put(meta);
      tracks.put(points, meta.id);
    }
    for (const [key, value] of Object.entries(settings)) sets.put(value, key);
    for (const seg of segments) segs.put(seg);
    for (const route of routes) rts.put(route);
  });

/** Erase the whole local database. The app must reload afterwards. */
export async function deleteAllData() {
  (await open()).close();
  dbPromise = null;
  await new Promise((resolve, reject) => {
    const req = indexedDB.deleteDatabase(DB_NAME);
    req.onsuccess = resolve;
    req.onerror = () => reject(req.error);
    req.onblocked = () => reject(new Error('Allure est ouvert dans un autre onglet : ferme-le puis réessaie.'));
  });
}
