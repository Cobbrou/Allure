// Platform module (native shell only, loaded behind Capacitor.isNativePlatform()): local
// notifications the morning of plan sessions. Everything pending is replaced on each call,
// so the list always follows the plan.

import { LocalNotifications } from '@capacitor/local-notifications';
import { fmtDist, distUnit } from './format.js';
import { t } from './i18n.js';
import { reminderList, SESSION_TYPES } from './plan.js';

/** Asks for the notification permission; resolves true when granted. */
export async function allowReminders() {
  const { display } = await LocalNotifications.requestPermissions();
  return display === 'granted';
}

/** Replaces the pending reminders: sessions of the next 14 days at `plan.reminder` o'clock, none without. */
export async function scheduleReminders(plan, matches, now = Date.now()) {
  const { notifications } = await LocalNotifications.getPending();
  if (notifications.length) await LocalNotifications.cancel({ notifications: notifications.map(({ id }) => ({ id })) });
  if (plan?.reminder == null || (await LocalNotifications.checkPermissions()).display !== 'granted') return;
  const list = reminderList(plan, now, plan.reminder, matches);
  if (!list.length) return;
  await LocalNotifications.schedule({
    notifications: list.map(({ at, session: s }, i) => ({
      id: i + 1,
      title: t('Séance du jour : {type}', { type: SESSION_TYPES[s.type].label }),
      body: `${fmtDist(s.distance, 1)} ${distUnit()}`,
      schedule: { at: new Date(at), allowWhileIdle: true },
      extra: { hash: `/plan/session/${s.id}` },
    })),
  });
}

/** Tapping a reminder opens its session. */
export const openOnTap = () => LocalNotifications.addListener('localNotificationActionPerformed', ({ notification }) => {
  if (notification.extra?.hash) location.hash = notification.extra.hash;
});
