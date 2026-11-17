import { prefs } from './prefs';

/** Android (and other) browsers: the standard vibration API. */
const hasVibrate = typeof navigator !== 'undefined' && typeof navigator.vibrate === 'function';

/**
 * iPhone Safari has no vibration API, but from iOS 18 toggling a "switch" checkbox gives a light
 * haptic tick (the same one as the system switches). We click a hidden one to get a tap.
 */
const iosTicks = (() => {
  if (hasVibrate || typeof navigator === 'undefined' || typeof document === 'undefined') return false;
  const ua = navigator.userAgent;
  const ios = /iPhone|iPod/.test(ua) || (/iPad|Macintosh/.test(ua) && navigator.maxTouchPoints > 1);
  const v = ua.match(/OS (\d+)_/);
  return ios && (!v || Number(v[1]) >= 18);
})();

/** True when this device can buzz: a real vibration motor API, or iPhone haptic ticks. */
export const canVibrate = hasVibrate || iosTicks;

function tick() {
  try {
    const label = document.createElement('label');
    label.setAttribute('aria-hidden', 'true');
    label.style.display = 'none';
    const input = document.createElement('input');
    input.type = 'checkbox';
    input.setAttribute('switch', '');
    label.appendChild(input);
    document.head.appendChild(label);
    label.click();
    label.remove();
  } catch {
    // No haptics here; that's fine.
  }
}

/** iPhone: a pattern becomes a tick at the start of each buzz (longer buzzes get a second tick). */
function playTicks(pattern: number[]) {
  let t = 0;
  pattern.forEach((ms, i) => {
    if (i % 2 === 0) {
      const at = t;
      setTimeout(tick, at);
      if (ms >= 60) setTimeout(tick, at + Math.min(ms - 20, 70));
    }
    t += ms;
  });
}

let last = 0;
/** A short buzz. Ignored when vibration is off, unsupported, or another buzz just fired. */
export function buzz(pattern: number | number[]) {
  if (!canVibrate || !prefs.haptics) return;
  const now = Date.now();
  if (now - last < 40) return;
  last = now;
  if (iosTicks) return playTicks(Array.isArray(pattern) ? pattern : [pattern]);
  try {
    navigator.vibrate(pattern);
  } catch {
    // Some browsers refuse vibration without a recent tap; that's fine.
  }
}
