// Full local backup: every activity with its track and photos (as data URLs), settings,
// segments and routes in one JSON file the athlete keeps, restores on another phone, or
// reads elsewhere.

import { t } from './i18n.js';
import { refreshStats } from './activity.js';

const DAY = 86400e3;

/** Backup object from the stores' contents. `schema` is the db VERSION it was taken at. */
export const makeBackup = ({ schema, activities, settings, segments, routes }, now = Date.now()) => ({
  app: 'allure',
  schema,
  exported: now,
  activities,
  settings,
  segments,
  routes,
});

/**
 * Validate a backup file's text against the current db VERSION; throws a translated message.
 * A backup from an older schema missed the migrations since: its stats are recomputed.
 */
export function parseBackup(text, schema) {
  let data;
  try { data = JSON.parse(text); } catch { throw new Error(t("Ce fichier n'est pas une sauvegarde Allure.")); }
  if (data?.app !== 'allure' || !Array.isArray(data.activities)) throw new Error(t("Ce fichier n'est pas une sauvegarde Allure."));
  if (data.schema > schema) throw new Error(t("Sauvegarde faite avec une version plus récente d'Allure : mets l'app à jour."));
  const old = !(data.schema >= schema);
  const valid = data.activities.filter((a) => a?.meta?.id && Array.isArray(a.points)).map(({ meta, points, photos }) => {
    if (old) meta = refreshStats(meta, points);
    const pics = Array.isArray(photos) ? photos.filter((u) => typeof u === 'string' && u.startsWith('data:image/')) : [];
    return pics.length ? { meta, points, photos: pics } : { meta, points };
  });
  return {
    activities: valid,
    settings: data.settings && typeof data.settings === 'object' ? data.settings : {},
    segments: (data.segments ?? []).filter((s) => s?.id),
    routes: (data.routes ?? []).filter((r) => r?.id),
  };
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

export const backupName =(now = Date.now()) => `allure-sauvegarde-${new Date(now).toISOString().slice(0, 10)}.json`;
