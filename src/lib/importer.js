import { t } from './i18n.js';
import { createActivity, indoorActivity, isDuplicate, withHr } from './activity.js';
import { saveActivities } from './db.js';
import { parseCsv } from './formats/csv.js';
import { parseGpx } from './formats/gpx.js';
import { parseTcx } from './formats/tcx.js';
import { inflate, readZip } from './formats/zip.js';
import { sportFromGpxType } from './sports.js';

export const ACCEPT = '.gpx,.tcx,.fit,.gz,.zip';
const ACTIVITY_FILE = /\.(gpx|tcx|fit)(\.gz)?$/i;
const utf8 = (bytes) => new TextDecoder().decode(bytes);

/** Parse one activity file (optionally gzipped) into { name?, type?, points, laps? }. */
export async function parseActivityFile(name, bytes) {
  let lower = name.toLowerCase();
  if (lower.endsWith('.gz')) {
    bytes = await inflate(bytes, 'gzip');
    lower = lower.slice(0, -3);
  }
  if (lower.endsWith('.gpx')) return parseGpx(utf8(bytes));
  if (lower.endsWith('.tcx')) return parseTcx(utf8(bytes));
  // Garmin's FIT SDK is heavy: load it only when a FIT file shows up.
  if (lower.endsWith('.fit')) return (await import('./formats/fit.js')).parseFit(bytes);
  throw new Error(t('Format non supporté (.gpx, .tcx, .fit, .gz ou archive .zip).'));
}

// Strava writes activities.csv headers in the account's language.
const STRAVA_COLS = {
  file: ['Filename', 'Nom du fichier'],
  name: ['Activity Name', "Nom de l'activité"],
  type: ['Activity Type', "Type d'activité"],
};

/**
 * Header keys of the file, name and type columns of a Strava activities.csv (rows from
 * parseCsv). Unknown language: the file column is the one holding "activities/…" paths,
 * name and type are the 3rd and 4th columns, Strava's fixed order.
 */
export function stravaColumns(rows) {
  const head = Object.keys(rows[0] ?? {});
  const pick = (names, fallback) => names.find((n) => head.includes(n)) ?? fallback;
  return {
    file: pick(STRAVA_COLS.file, head.find((h) => rows.some((r) => /^activities\//.test(r[h])))),
    name: pick(STRAVA_COLS.name, head[2]),
    type: pick(STRAVA_COLS.type, head[3]),
  };
}

/**
 * Expand picked files into import tasks: [{ label, read(): Promise<{ name?, type?, points }> }].
 * A .zip is treated as a Strava bulk export: activity files inside it are imported, with
 * names and sports taken from its activities.csv when present.
 */
export async function collectTasks(files) {
  const tasks = [];
  for (const file of files) {
    if (!/\.zip$/i.test(file.name)) {
      tasks.push({ label: file.name, read: async () => parseActivityFile(file.name, new Uint8Array(await file.arrayBuffer())) });
      continue;
    }
    const entries = await readZip(file);
    const csv = entries.find((e) => /(^|\/)activities\.csv$/i.test(e.name));
    const rows = csv ? parseCsv(utf8(await csv.bytes())) : [];
    const col = stravaColumns(rows);
    const byFile = new Map(rows.map((r) => [r[col.file], r]));
    for (const e of entries.filter((x) => ACTIVITY_FILE.test(x.name))) {
      // Archives re-zipped by the user may add a root folder: "export_123/activities/1.gpx".
      const row = byFile.get(e.name) ?? byFile.get(e.name.slice(e.name.indexOf('/') + 1));
      tasks.push({
        label: e.name,
        read: async () => {
          const parsed = await parseActivityFile(e.name, await e.bytes());
          return row ? { ...parsed, name: row[col.name] || parsed.name, type: row[col.type] || parsed.type } : parsed;
        },
      });
    }
  }
  return tasks;
}

/**
 * Import files into the store, skipping duplicates of `existing` metas.
 * Returns { ids, duplicates, failed: [{ label, error }], total }.
 */
export async function importFiles(files, existing, onProgress = () => {}) {
  return importTasks(await collectTasks(files), existing, onProgress);
}

/** Run import tasks (see collectTasks, healthTasks) into the store. Same result as importFiles. */
export async function importTasks(tasks, existing, onProgress = () => {}) {
  const seen = [...existing];
  const result = { ids: [], duplicates: 0, failed: [], total: tasks.length };
  let batch = [];
  for (const [i, task] of tasks.entries()) {
    onProgress(i, tasks.length);
    await new Promise((r) => setTimeout(r)); // let the progress paint between files
    try {
      const { name, type, points, samples, distance, movingTime, laps, source } = await task.read();
      const sport = sportFromGpxType(type);
      const item = points
        ? createActivity({ name, sport, points, laps, source })
        : indoorActivity({ name, sport, samples, distance, movingTime, source });
      if (seen.some((m) => isDuplicate(m, item.meta))) { result.duplicates++; continue; }
      seen.push(item.meta);
      batch.push(item);
      result.ids.push(item.meta.id);
      if (batch.length >= 25) { await saveActivities(batch); batch = []; }
    } catch (e) {
      result.failed.push({ label: task.label, error: e.message });
    }
  }
  if (batch.length) await saveActivities(batch);
  return result;
}

// Health Connect exercise types Allure has a sport for (sportFromGpxType maps them).
const HEALTH_SPORTS = /^(RUNNING|RUNNING_TREADMILL|BIKING|BIKING_STATIONARY|HIKING|WALKING|SWIMMING_OPEN_WATER|SWIMMING_POOL)$/;

/**
 * Health Connect workouts (capacitor-health queryWorkouts) to import tasks, for the sports
 * Allure has. A workout without a route (treadmill, indoor bike, pool) comes in track-less.
 */
export function healthTasks(workouts) {
  return workouts
    .filter((w) => HEALTH_SPORTS.test(w.workoutType))
    .map((w) => ({ label: w.title || w.workoutType, read: async () => fromHealthWorkout(w) }));
}

/**
 * One workout to { name, type, points, source }; each point takes the nearest heart rate sample
 * within 10 s. Without a route: { name, type, samples, distance, movingTime, source }.
 */
export function fromHealthWorkout(w) {
  const hrs = (w.heartRate ?? []).map((s) => ({ time: Date.parse(s.timestamp), bpm: s.bpm })).sort((a, b) => a.time - b.time);
  if (!(w.route?.length >= 2)) {
    // ponytail: distance stays undefined while READ_DISTANCE is not requested (AndroidManifest.xml).
    const samples = [{ time: Date.parse(w.startDate) }, ...hrs.map((s) => ({ time: s.time, hr: s.bpm })), { time: Date.parse(w.endDate) }];
    return { name: w.title || undefined, type: w.workoutType, samples, distance: w.distance, movingTime: w.duration, source: 'healthconnect' };
  }
  const route = w.route
    .map((r) => ({ lat: r.lat, lon: r.lng, ele: r.alt ?? null, time: Date.parse(r.timestamp) }))
    .sort((a, b) => a.time - b.time);
  const points = withHr(route, hrs, 10000);
  return { name: w.title || undefined, type: w.workoutType, points, source: 'healthconnect' };
}
