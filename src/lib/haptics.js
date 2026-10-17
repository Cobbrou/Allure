// Platform module for haptic feedback: the Vibration API on the web (Android browsers;
// iOS Safari ignores it). A native haptics plugin can replace it.

const PATTERNS = {
  tap: 10, // a control armed or toggled
  start: [30, 50, 30], // recording started or resumed
  pause: 25,
  lap: [15, 40, 15],
  success: [20, 70, 50], // a record, a goal reached, an activity saved
};

export function haptic(kind = 'tap') {
  try { navigator.vibrate?.(PATTERNS[kind] ?? PATTERNS.tap); } catch { /* not allowed before a user gesture */ }
}
