import { prefs } from './prefs';

/** Android (and other) browsers: the standard vibration API. */
const hasVibrate = typeof navigator !== 'undefined' && typeof navigator.vibrate === 'function';

/**
 * iPhone Safari has no vibration API, but from iOS 18 flipping a "switch" checkbox gives the
 * system's haptic tick. iOS only allows it while handling a real touch, so:
 * - the switch lives in the page (off-screen, not display:none, which iOS can ignore), and
 * - a tick asked for during a touch fires right inside that touch's event handler.
 * Ticks asked for later (a hit landing a second after you tapped) are tried too; iOS may skip them.
 */
const iosTicks = (() => {
  if (hasVibrate || typeof navigator === 'undefined' || typeof document === 'undefined') return false;
  const ua = navigator.userAgent;
  return /iPhone|iPod|iPad/.test(ua) || (/Macintosh/.test(ua) && navigator.maxTouchPoints > 1);
})();

/** True when this device can buzz: a real vibration API, or iPhone haptic ticks. */
export const canVibrate = hasVibrate || iosTicks;

let label: HTMLLabelElement | null = null;
function ensureSwitch(): HTMLLabelElement | null {
  if (label?.isConnected) return label;
  if (!document.body) return null;
  label = document.createElement('label');
  label.setAttribute('aria-hidden', 'true');
  label.style.cssText = 'position:fixed;left:-200px;top:0;width:40px;height:30px;opacity:0.01;pointer-events:none;overflow:hidden';
  const input = document.createElement('input');
  input.type = 'checkbox';
  input.setAttribute('switch', '');
  input.tabIndex = -1;
  label.appendChild(input);
  document.body.appendChild(label);
  return label;
}

function tick() {
  try {
    ensureSwitch()?.click();
  } catch {
    // No haptics here; that's fine.
  }
}

/** Is a touch being handled right now (the only time iOS allows the tick)? */
let inTouch = false;
if (iosTicks) {
  const start = () => {
    inTouch = true;
    // Cleared after this event finishes (the game handles the touch in between).
    setTimeout(() => (inTouch = false), 0);
  };
  for (const ev of ['touchstart', 'touchend', 'pointerdown', 'pointerup', 'click'])
    document.addEventListener(ev, start, { capture: true, passive: true });
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', () => ensureSwitch());
  else ensureSwitch();
}

/** iPhone: a pattern becomes a tick at the start of each buzz (longer buzzes get a second tick). */
function playTicks(pattern: number[]) {
  tick(); // the first one right away (inside the touch, when there is one)
  let t = pattern[0] ?? 0;
  if ((pattern[0] ?? 0) >= 60) setTimeout(tick, 70);
  for (let i = 1; i < pattern.length; i++) {
    if (i % 2 === 0) {
      setTimeout(tick, t);
      if (pattern[i] >= 60) setTimeout(tick, t + 70);
    }
    t += pattern[i];
  }
}

let last = 0;
/** A short buzz. Ignored when vibration is off, unsupported, or another buzz just fired. */
export function buzz(pattern: number | number[]) {
  if (!canVibrate || !prefs.haptics) return;
  const now = Date.now();
  if (now - last < 40 && !inTouch) return;
  last = now;
  if (iosTicks) return playTicks(Array.isArray(pattern) ? pattern : [pattern]);
  try {
    navigator.vibrate(pattern);
  } catch {
    // Some browsers refuse vibration without a recent tap; that's fine.
  }
}

/** A light tap for pressing a button (always inside the touch, so it works on iPhone too). */
export function tapFeel() {
  if (iosTicks) buzz(10);
  else buzz(8);
}
