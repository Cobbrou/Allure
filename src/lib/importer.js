import { createActivity, dupKey } from './activity.js';
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
  throw new Error('Format non supporté (.gpx, .tcx, .fit, .gz ou archive .zip).');
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
    const byFile = new Map(rows.map((r) => [r.Filename, r]));
    for (const e of entries.filter((x) => ACTIVITY_FILE.test(x.name))) {
      // Archives re-zipped by the user may add a root folder: "export_123/activities/1.gpx".
      const row = byFile.get(e.name) ?? byFile.get(e.name.slice(e.name.indexOf('/') + 1));
      tasks.push({
        label: e.name,
        read: async () => {
          const parsed = await parseActivityFile(e.name, await e.bytes());
          return row ? { ...parsed, name: row['Activity Name'] || parsed.name, type: row['Activity Type'] || parsed.type } : parsed;
        },
      });
    }
  }
  return tasks;
}

/**
 * Import files into the store, skipping duplicates of `existing` metas.
 * Returns { ids, duplicates, failed: [{ label, error }] }.
 */
export async function importFiles(files, existing, onProgress = () => {}) {
  const tasks = await collectTasks(files);
  const seen = new Set(existing.map(dupKey));
  const result = { ids: [], duplicates: 0, failed: [], total: tasks.length };
  let batch = [];
  for (const [i, task] of tasks.entries()) {
    onProgress(i, tasks.length);
    await new Promise((r) => setTimeout(r)); // let the progress paint between files
    try {
      const { name, type, points, laps } = await task.read();
      const item = createActivity({ name, sport: sportFromGpxType(type), points, laps });
      const key = dupKey(item.meta);
      if (seen.has(key)) { result.duplicates++; continue; }
      seen.add(key);
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
