// Local store (IndexedDB): `activities` holds light meta records for lists, `tracks` the
// raw points by activity id (loaded only on the detail screen), plus `drafts`, `settings`
// `segments`, planned `routes` (metas; their points in `routeLegs`) and activity `photos`.
// Platform module: a native storage plugin can replace it without touching components.

import { t } from './i18n.js';
import { analyze } from './analyze.js';
import { AUTO_DIR, autoBackupName, BATCH, backupBatches, backupHeader, splitLines, staleBackups } from './backup.js';
import { thin } from './heatmap.js';
import { defaultGear } from './gear.js';
import { bestEfforts, effortDistances, RIDE_DISTANCES } from './records.js';
import { draftWrites, joinDraft } from './recorder.js';
import { segmentEfforts } from './segments.js';
import { hrTime } from './training.js';

const DB_NAME = 'allure';
export const VERSION = 10;
let dbPromise;

// Meta patches of the data migrations: pure (track points, meta) -> fields, tested on their own.
export const PATCHES = {
  2: (points) => ({ bestEfforts: points ? bestEfforts(analyze(points).track) : {} }),
  4: (points) => ({ hrTime: points ? hrTime(points) : {} }),
  8: (points, meta) => {
    if (!points || !['hike', 'walk', 'swim'].includes(meta.sport)) return {};
    const { movingTime, avgPace } = analyze(points, meta.sport);
    return { movingTime, avgPace };
  },
  10: (points, meta) => (points?.length > 1 && effortDistances(meta.sport) === RIDE_DISTANCES
    ? { bestEfforts: bestEfforts(analyze(points, meta.sport).track, RIDE_DISTANCES) }
    : {}),
};

/** v9: a route record split into its meta and its points (`legs`, null when it had none). */
export const splitRoute = ({ legs, ...meta }) => ({ meta, legs: legs ?? null });

// Schema migrations, keyed by the version they upgrade to. They run inside the upgrade
// transaction, in order, for every version above the one stored on the device.
export const MIGRATIONS = {
  1: (db) => {
    db.createObjectStore('activities', { keyPath: 'id' });
    db.createObjectStore('tracks');
  },
  // v2: metas gain `bestEfforts`, computed from the stored tracks.
  2: (db, tx) => backfill(tx, PATCHES[2]),
  // v3: `drafts` holds the in-progress live recording, so a crash or reload loses nothing.
  3: (db) => db.createObjectStore('drafts'),
  // v4: metas gain `hrTime` (seconds per bpm); `settings` holds user preferences by key.
  4: (db, tx) => {
    db.createObjectStore('settings');
    backfill(tx, PATCHES[4]);
  },
  // v5: `segments`; metas gain `efforts` when a segment matches (none exist before v5).
  5: (db) => db.createObjectStore('segments', { keyPath: 'id' }),
  // v6: `routes` planned with the route builder.
  6: (db) => db.createObjectStore('routes', { keyPath: 'id' }),
  // v7: `photos` holds each activity's pictures (array of JPEG Blobs) by activity id.
  7: (db) => db.createObjectStore('photos'),
  // v8: moving speed threshold per sport (was 0.5 m/s for all): recompute slow sports' moving time.
  8: (db, tx) => backfill(tx, PATCHES[8], (meta) => ['hike', 'walk', 'swim'].includes(meta.sport)),
  // v9: route points (`legs`) move to `routeLegs` by route id, so listing routes reads metas only.
  9: (db, tx) => {
    db.createObjectStore('routeLegs');
    const legs = tx.objectStore('routeLegs');
    tx.objectStore('routes').openCursor().onsuccess = (e) => {
      const cursor = e.target.result;
      if (!cursor) return;
      const { meta, legs: l } = splitRoute(cursor.value);
      if (l) {
        legs.put(l, cursor.key);
        cursor.update(meta);
      }
      cursor.continue();
    };
  },
  // v10: rides' best efforts are 20 / 40 / 100 km (were the running distances).
  10: (db, tx) => backfill(tx, PATCHES[10], (meta) => effortDistances(meta.sport) === RIDE_DISTANCES),
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
      // Let a newer version of the app (another tab) upgrade the schema. This tab's code is
      // now stale: reopening at its old version would fail, so every later access says why.
      req.result.onversionchange = () => {
        req.result.close();
        dbPromise = Promise.reject(new Error(t('Allure a été mis à jour dans un autre onglet : recharge cette page.')));
        dbPromise.catch(() => {}); // reported by the caller that needs it
      };
      resolve(req.result);
    };
    req.onerror = () => reject(req.error);
    // An older version of the app open elsewhere holds the DB: the upgrade waits for it.
    req.onblocked = () => {
      dbPromise = null; // retry on next access
      reject(new Error(t("Allure est ouvert dans un autre onglet : ferme-le pour terminer la mise à jour.")));
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
  return tx(['activities', 'tracks', 'photos'], 'readwrite', (acts, tracks, photos) => {
    for (const id of ids) {
      acts.delete(id);
      tracks.delete(id);
      photos.delete(id);
    }
  });
}

/** The in-progress live recording (one at a time), stored in parts: see draftWrites. */
let savedDraft = null;
export async function saveDraft(rec) {
  const { writes, saved } = draftWrites(rec, savedDraft);
  await tx(['drafts'], 'readwrite', (s) => writes.forEach(([key, value]) => s.put(value, key)));
  savedDraft = saved;
}
export async function loadDraft() {
  const [keys, values] = await tx(['drafts'], 'readonly', (s) => {
    const k = s.getAllKeys(), v = s.getAll();
    return { get result() { return [k.result, v.result]; } };
  });
  return joinDraft(new Map(keys.map((key, i) => [key, values[i]])));
}
export async function clearDraft() {
  await tx(['drafts'], 'readwrite', (s) => s.clear());
  savedDraft = null;
}

/** An activity's photos (Blobs, oldest first); [] when it has none. */
export const getPhotos = async (id) => (await tx(['photos'], 'readonly', (s) => s.get(id))) ?? [];
export const setPhotos = (id, blobs) => tx(['photos'], 'readwrite', (s) => (blobs.length ? s.put(blobs, id) : s.delete(id)));

/** User preferences, e.g. getSetting('hr') -> { max, rest }. */
export const getSetting = (key) => tx(['settings'], 'readonly', (s) => s.get(key));
export const setSetting = (key, value) => tx(['settings'], 'readwrite', (s) => s.put(value, key));

/** Call fn(id, points) for every stored track, one at a time, without loading them all in memory. */
// Thinned tracks by activity id, for the session: opening Maps again reads only new or
// changed tracks (a crop changes the distance) instead of every full track.
const thinned = new Map(); // id → { distance, coords }

/** [{ id, sport, coords }] thinned [lon, lat] lines (see heatmap.thin) of the metas with a track. */
export async function thinTracks(metas) {
  const todo = metas.filter((m) => thinned.get(m.id)?.distance !== m.distance);
  if (todo.length) {
    await tx(['tracks'], 'readonly', (s) => todo.forEach((m) => {
      s.get(m.id).onsuccess = (e) => {
        const points = e.target.result;
        thinned.set(m.id, { distance: m.distance, coords: points?.length > 1 ? thin(points) : null });
      };
    }));
  }
  return metas.flatMap((m) => {
    const coords = thinned.get(m.id)?.coords;
    return coords ? [{ id: m.id, sport: m.sport, coords }] : [];
  });
}


export const listSegments = () => tx(['segments'], 'readonly', (s) => s.getAll());

/** Store a segment and record its efforts on every activity of the same sport. */
export const saveSegment = (seg) =>
  tx(['activities', 'tracks', 'segments'], 'readwrite', (acts, tracks, segs) => {
    segs.put(seg);
    backfill(acts.transaction, (points, meta) => ({
      efforts: [...(meta.efforts ?? []).filter((e) => e.seg !== seg.id), ...(points ? segmentEfforts([seg], meta.sport, points) : [])],
    }), (meta) => meta.sport === seg.sport);
  });

/** Delete a segment and strip its efforts from the metas. */
export const deleteSegment = (id) =>
  tx(['activities', 'segments'], 'readwrite', (acts, segs) => {
    segs.delete(id);
    acts.openCursor().onsuccess = (e) => {
      const cursor = e.target.result;
      if (!cursor) return;
      const { efforts } = cursor.value;
      if (efforts?.some((x) => x.seg === id)) cursor.update({ ...cursor.value, efforts: efforts.filter((x) => x.seg !== id) });
      cursor.continue();
    };
  });

/** Route metas (no points), most recently edited first. */
export const listRoutes = async () => (await tx(['routes'], 'readonly', (s) => s.getAll())).sort((a, b) => b.updated - a.updated);
/** A route with its `legs`, or undefined. */
export async function getRoute(id) {
  const [meta, legs] = await tx(['routes', 'routeLegs'], 'readonly', (r, l) => {
    const m = r.get(id), g = l.get(id);
    return { get result() { return [m.result, g.result]; } };
  });
  return meta && { ...meta, legs: legs ?? [] };
}
export const saveRoute = ({ legs, ...meta }) => tx(['routes', 'routeLegs'], 'readwrite', (r, l) => {
  r.put(meta);
  l.put(legs, meta.id);
});
export const deleteRoute = (id) => tx(['routes', 'routeLegs'], 'readwrite', (r, l) => {
  r.delete(id);
  l.delete(id);
});

/**
 * Full backup file (see lib/backup.js), read BATCH activities at a time: each batch of
 * lines becomes a Blob, which the browser may keep on disk, so the whole archive is never
 * one string in memory.
 */
export async function exportBackup(now = Date.now()) {
  let keys;
  const [values, metas, segments, routes] = await Promise.all([
    // Keys and values in one transaction, so a write in between can't misalign them.
    tx(['settings'], 'readonly', (s) => { s.getAllKeys().onsuccess = (e) => { keys = e.target.result; }; return s.getAll(); }),
    tx(['activities'], 'readonly', (s) => s.getAll()),
    listSegments(),
    listRoutes().then((metas) => Promise.all(metas.map((r) => getRoute(r.id)))),
  ]);
  const settings = Object.fromEntries(keys.map((k, i) => [k, values[i]]));
  const parts = [`${backupHeader({ schema: VERSION, settings, segments, routes }, now)}\n`];
  for (let i = 0; i < metas.length; i += BATCH) {
    const chunk = metas.slice(i, i + BATCH);
    const points = [], pics = [];
    await tx(['tracks', 'photos'], 'readonly', (tracks, photos) => chunk.forEach((m, j) => {
      tracks.get(m.id).onsuccess = (e) => { points[j] = e.target.result; };
      photos.get(m.id).onsuccess = (e) => { pics[j] = e.target.result; };
    }));
    const lines = await Promise.all(chunk.map(async (meta, j) => {
      const photos = pics[j]?.length ? await Promise.all(pics[j].map(toDataUrl)) : null;
      return `${JSON.stringify({ meta, points: points[j] ?? [], ...(photos && { photos }) })}\n`;
    }));
    parts.push(new Blob(lines));
  }
  return new Blob(parts, { type: 'application/json' });
}

/** Automatic backup (native shell): written to Documents/Allure, then recorded as the last backup of `count` activities. */
export async function autoBackup(count, now = Date.now()) {
  const { keepFile } = await import('./share.js');
  await keepFile(await exportBackup(now), AUTO_DIR, autoBackupName(now), staleBackups);
  await setSetting('autoBackup', { on: true, at: now });
  await setSetting('backup', { at: now, count });
}

/** Restore a backup File over the local data, BATCH activities per transaction (same ids replaced, others kept). */
export async function restoreBackup(file) {
  const reader = file.stream().pipeThrough(new TextDecoderStream()).getReader();
  async function* chunks() {
    for (let r; !(r = await reader.read()).done;) yield r.value;
  }
  for await (const batch of backupBatches(splitLines(chunks()), VERSION)) await restoreAll(batch);
}

const toDataUrl = (blob) => new Promise((resolve, reject) => {
  const r = new FileReader();
  r.onload = () => resolve(r.result);
  r.onerror = () => reject(r.error);
  r.readAsDataURL(blob);
});

/** Write a parsed backup batch over the local data (same ids are replaced, others kept). */
async function restoreAll({ activities, settings, segments, routes }) {
  // Decoded before the transaction: an await inside it would let it auto-commit.
  const photos = await Promise.all(activities.map((a) => Promise.all((a.photos ?? []).map(async (u) => (await fetch(u)).blob()))));
  return tx(['activities', 'tracks', 'settings', 'segments', 'routes', 'routeLegs', 'photos'], 'readwrite', (acts, tracks, sets, segs, rts, legs, pics) => {
    activities.forEach(({ meta, points }, i) => {
      acts.put(meta);
      tracks.put(points, meta.id);
      if (photos[i].length) pics.put(photos[i], meta.id);
    });
    for (const [key, value] of Object.entries(settings)) sets.put(value, key);
    for (const seg of segments) segs.put(seg);
    for (const { legs: l, ...route } of routes) {
      rts.put(route);
      legs.put(l ?? [], route.id);
    }
  });
}

/**
 * Ask the browser not to evict the database under storage pressure: with no server, an
 * eviction loses everything. True when granted, false when refused, null when unsupported.
 */
export async function persistStorage() {
  if (!navigator.storage?.persist) return null;
  return (await navigator.storage.persisted()) || navigator.storage.persist();
}

/** Erase the whole local database. The app must reload afterwards. */
export async function deleteAllData() {
  (await open()).close();
  dbPromise = null;
  await new Promise((resolve, reject) => {
    const req = indexedDB.deleteDatabase(DB_NAME);
    req.onsuccess = resolve;
    req.onerror = () => reject(req.error);
    req.onblocked = () => reject(new Error(t('Allure est ouvert dans un autre onglet : ferme-le puis réessaie.')));
  });
}
