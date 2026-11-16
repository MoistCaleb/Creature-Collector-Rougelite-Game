import { prefs } from './prefs';

/** True when this device can vibrate (Android browsers; iPhone Safari can't). */
export const canVibrate = typeof navigator !== 'undefined' && typeof navigator.vibrate === 'function';

let last = 0;
/** A short buzz. Ignored when vibration is off, unsupported, or another buzz just fired. */
export function buzz(pattern: number | number[]) {
  if (!canVibrate || !prefs.haptics) return;
  const now = Date.now();
  if (now - last < 40) return;
  last = now;
  try {
    navigator.vibrate(pattern);
  } catch {
    // Some browsers refuse vibration without a recent tap; that's fine.
  }
}
