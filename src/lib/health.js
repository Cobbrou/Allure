// Platform module for Health Connect (Android): reads exercise sessions recorded by a
// watch (Pixel Watch, Fitbit…) through the capacitor-health plugin. Native shell only.

import { Capacitor, registerPlugin } from '@capacitor/core';

const PERMISSIONS = ['READ_WORKOUTS', 'READ_ROUTE', 'READ_HEART_RATE'];
let Health;
const plugin = () => (Health ??= registerPlugin('HealthPlugin'));

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
  const { permissions } = await plugin().requestHealthPermissions({ permissions: PERMISSIONS });
  // The plugin returns { permissions: { READ_WORKOUTS: true, … } } despite its typings.
  const granted = Array.isArray(permissions) ? Object.assign({}, ...permissions) : permissions;
  if (!granted.READ_WORKOUTS) throw new Error('Accès aux séances Health Connect refusé.');
  const endDate = new Date();
  const startDate = new Date(+endDate - days * 86400e3);
  const { workouts } = await plugin().queryWorkouts({
    startDate: startDate.toISOString(), endDate: endDate.toISOString(),
    includeRoute: true, includeHeartRate: true, includeSteps: false,
  });
  return workouts;
}
