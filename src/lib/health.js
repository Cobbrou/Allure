// Platform module for Health Connect (Android): reads exercise sessions recorded by a
// watch (Pixel Watch, Fitbit…) through the capacitor-health plugin. Native shell only.

import { t } from './i18n.js';
import { Capacitor, registerPlugin } from '@capacitor/core';

import { restingFromWatch } from './training.js';

const PERMISSIONS = ['READ_WORKOUTS', 'READ_ROUTE', 'READ_HEART_RATE'];
let Health, RestingHr;
const plugin = () => (Health ??= registerPlugin('HealthPlugin'));
// Local plugin (android/app/src/main/java/app/allure/RestingHrPlugin.kt): capacitor-health can't
// read resting HR, nor heart rate outside an exercise session.
const restingPlugin = () => (RestingHr ??= registerPlugin('RestingHr'));

/** 'unsupported' (browser, iOS), 'missing' (Health Connect not installed) or 'ready'. */
export async function healthStatus() {
  if (Capacitor.getPlatform() !== 'android') return 'unsupported';
  try {
    return (await plugin().isHealthAvailable()).available ? 'ready' : 'missing';
  } catch {
    return 'missing';
  }
}

export const installHealthConnect = () => plugin().showHealthConnectInPlayStore();

/**
 * Ask for read access, then return the workouts of the last `days` days with their route
 * and heart rate. Throws when the user refuses access to exercise sessions.
 */
export async function readWorkouts(days = 365) {
  const granted = await requestAccess(PERMISSIONS);
  if (!granted.READ_WORKOUTS) throw new Error(t('Accès aux séances Health Connect refusé.'));
  const endDate = new Date();
  const startDate = new Date(+endDate - days * 86400e3);
  const { workouts } = await plugin().queryWorkouts({
    startDate: startDate.toISOString(), endDate: endDate.toISOString(),
    includeRoute: true, includeHeartRate: true, includeSteps: false,
  });
  return workouts;
}

/** { READ_WORKOUTS: true, … } once the user answered the access screen; prompt false: no screen. */
async function requestAccess(permissions, prompt = true) {
  const r = await plugin()[prompt ? 'requestHealthPermissions' : 'checkHealthPermissions']({ permissions });
  // The plugin returns { permissions: { READ_WORKOUTS: true, … } } despite its typings.
  return Array.isArray(r.permissions) ? Object.assign({}, ...r.permissions) : r.permissions;
}

/**
 * Heart rate samples [{ time, bpm }] sorted by time, recorded between start and end (ms) by
 * any source, e.g. a watch worn during an Allure recording. Throws when access is refused.
 * prompt false: no access screen, and no samples when access isn't granted yet.
 */
export async function readHeartRate(start, end, { prompt = true } = {}) {
  if (!(await requestAccess(['READ_HEART_RATE'], prompt)).READ_HEART_RATE) {
    if (!prompt) return [];
    throw new Error(t('Accès à la fréquence cardiaque Health Connect refusé.'));
  }
  const { samples } = await restingPlugin().heartRate({ start, end });
  return samples.sort((a, b) => a.time - b.time);
}

/** Resting HR from the watch (last 30 days), or null. prompt: ask for access if not granted yet. */
export async function readRestingHr({ prompt = false } = {}) {
  const { bpm } = await restingPlugin().read({ days: 30, prompt });
  return restingFromWatch(bpm);
}
