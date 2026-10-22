// Full local backup: every activity with its track and photos (as data URLs), settings,
// segments and routes in one file the athlete keeps, restores on another phone, or reads
// elsewhere.
//
// The file is NDJSON: a header line (settings, segments, routes), then one line per
// activity, so a big archive is written and restored a few activities at a time instead of
// as one huge string. Older backups are a single JSON object, still restored.

import { t } from './i18n.js';
import { refreshStats } from './activity.js';

const DAY = 86400e3;
export const BATCH = 50; // activities per restore transaction

/** First line of a backup. `schema` is the db VERSION it was taken at. */
export const backupHeader = ({ schema, settings, segments, routes }, now = Date.now()) =>
  JSON.stringify({ app: 'allure', format: 'ndjson', schema, exported: now, settings, segments, routes });

const notBackup = () => new Error(t("Ce fichier n'est pas une sauvegarde Allure."));

/** Throws a translated message unless `data` is a header this app can read; true when its schema is older. */
function checkHeader(data, schema) {
  if (data?.app !== 'allure') throw notBackup();
  if (data.schema > schema) throw new Error(t("Sauvegarde faite avec une version plus récente d'Allure : mets l'app à jour."));
  return !(data.schema >= schema);
}

/** A backed-up activity, cleaned (image data URLs only), or null when malformed. A backup from an older schema missed the migrations since: its stats are recomputed. */
function cleanActivity(a, old) {
  if (!a?.meta?.id || !Array.isArray(a.points)) return null;
  const meta = old ? refreshStats(a.meta, a.points) : a.meta;
  const pics = Array.isArray(a.photos) ? a.photos.filter((u) => typeof u === 'string' && u.startsWith('data:image/')) : [];
  return pics.length ? { meta, points: a.points, photos: pics } : { meta, points: a.points };
}

const extras = (data) => ({
  settings: data.settings && typeof data.settings === 'object' ? data.settings : {},
  segments: (data.segments ?? []).filter((s) => s?.id),
  routes: (data.routes ?? []).filter((r) => r?.id),
});

/** Validate a single-object (pre-NDJSON) backup's text against the current db VERSION. */
export function parseBackup(text, schema) {
  let data;
  try { data = JSON.parse(text); } catch { throw notBackup(); }
  if (!Array.isArray(data?.activities)) throw notBackup();
  const old = checkHeader(data, schema);
  return { activities: data.activities.map((a) => cleanActivity(a, old)).filter(Boolean), ...extras(data) };
}

/**
 * Restore batches from a backup's lines (any async or sync iterable of strings): each one
 * { activities, settings, segments, routes }, at most `size` activities, the extras on the
 * first one only. Throws a translated message on a file that isn't a backup. A broken
 * activity line (file cut short) is skipped.
 */
export async function* backupBatches(lines, schema, size = BATCH) {
  let header, old, batch = [], first = true;
  const out = () => {
    const b = { activities: batch, ...(first ? extras(header) : { settings: {}, segments: [], routes: [] }) };
    first = false;
    batch = [];
    return b;
  };
  for await (const line of lines) {
    if (!line.trim()) continue;
    if (!header) {
      try { header = JSON.parse(line); } catch { throw notBackup(); }
      if (Array.isArray(header?.activities)) return yield parseBackup(line, schema); // single-object backup
      old = checkHeader(header, schema);
      continue;
    }
    let a;
    try { a = JSON.parse(line); } catch { continue; }
    const c = cleanActivity(a, old);
    if (c) batch.push(c);
    if (batch.length >= size) yield out();
  }
  if (!header) throw notBackup();
  if (batch.length || first) yield out();
}

/** Lines of a text arriving in chunks (async or sync iterable of strings), without re-copying a long line per chunk. */
export async function* splitLines(chunks) {
  let pending = [];
  for await (const c of chunks) {
    let start = 0;
    for (let i; (i = c.indexOf('\n', start)) !== -1; start = i + 1) {
      pending.push(c.slice(start, i));
      yield pending.join('');
      pending = [];
    }
    if (start < c.length) pending.push(c.slice(start));
  }
  if (pending.length) yield pending.join('');
}

/**
 * Whether to remind the athlete to back up: 20 activities since the last backup, or new ones
 * and a backup over 30 days old (never backed up: counted from the oldest activity).
 * last: { at, count } saved on backup; nudged: when the last reminder showed (weekly at most).
 */
export function backupDue({ last, nudged, activities, now = Date.now() }) {
  if (nudged && now - nudged < 7 * DAY) return false;
  const since = last ?? { at: Math.min(...activities.map((a) => a.date)), count: 0 };
  const fresh = activities.length - since.count;
  return fresh >= 20 || (fresh > 0 && now - since.at > 30 * DAY);
}

export const backupName = (now = Date.now()) => `allure-sauvegarde-${new Date(now).toISOString().slice(0, 10)}.json`;

// Automatic backup (native shell): a weekly file in Documents/Allure, which outlives the app.
export const AUTO_DIR = 'Allure';
export const AUTO_KEEP = 2; // newest automatic backups kept
const AUTO = /^allure-auto-\d{4}-\d{2}-\d{2}\.json$/;
export const autoBackupName = (now = Date.now()) => `allure-auto-${new Date(now).toISOString().slice(0, 10)}.json`;

/** Whether the weekly automatic backup is due. auto: the 'autoBackup' setting { on, at? }. */
export const autoBackupDue = (auto, count, now = Date.now()) => !!auto?.on && count > 0 && now - (auto.at ?? 0) >= 7 * DAY;

/** Files of the backup folder to delete: automatic backups past the newest `keep`, and leftovers of a cut write. */
export function staleBackups(names, keep = AUTO_KEEP) {
  const autos = names.filter((n) => AUTO.test(n)).sort().reverse();
  return [...autos.slice(keep), ...names.filter((n) => n.endsWith('.part'))];
}
