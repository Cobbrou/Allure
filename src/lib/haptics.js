// Platform module for haptic feedback: the Vibration API on the web (Android browsers;
// iOS Safari ignores it). A native haptics plugin can replace it.

const PATTERNS = {
  tap: 10, // a control armed or toggled
  start: [30, 50, 30], // recording started or resumed
  pause: 25,
  lap: [15, 40, 15],
  success: [20, 70, 50], // a record, a goal reached, an activity saved
  alert: [200, 100, 200], // heart rate above the alert
  alarm: [400, 200, 400, 200, 400, 200, 800], // safety check-in
};

export function haptic(kind = 'tap') {
  try { navigator.vibrate?.(PATTERNS[kind] ?? PATTERNS.tap); } catch { /* not allowed before a user gesture */ }
}
