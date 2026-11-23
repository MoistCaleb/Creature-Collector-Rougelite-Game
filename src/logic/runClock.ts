import type { Meta, Run } from './run';

/**
 * How long a run takes: active play only. The clock runs while you're on the run's screens with
 * the app in front, and stops when you leave, put the phone down or close the app (and for online
 * races, which aren't timed).
 */

/** Screens that count as playing the run. */
const PLAYING = new Set(['Map', 'Battle', 'Team', 'Bag']);

let last = 0;

/** Start counting (once, at launch). `active` names the screen in front. */
export function startRunClock(getRun: () => Run | null, active: () => string) {
  last = Date.now();
  setInterval(() => {
    const now = Date.now();
    // A long gap (the phone slept) doesn't count.
    const dt = Math.min(now - last, 5000);
    last = now;
    const run = getRun();
    if (!run || run.race || run.endedAt || typeof document === 'undefined' || document.visibilityState !== 'visible') return;
    const key = active();
    // Camp counts while you're choosing what to take for this run (before the first step).
    if (PLAYING.has(key) || (key === 'Camp' && run.floor === 0 && run.visited.length === 1 && !run.prep)) run.playMs = (run.playMs ?? 0) + dt;
  }, 1000);
}

/** 1:05:09, 23:41 or 0:42. */
export function formatDuration(ms: number): string {
  const s = Math.max(0, Math.round(ms / 1000));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = s % 60;
  const p = (n: number) => String(n).padStart(2, '0');
  return h ? `${h}:${p(m)}:${p(sec)}` : `${m}:${p(sec)}`;
}

/**
 * The run is over (or won, before a Gilded Hunt): stop its clock. A win (not online) that beats
 * your fastest is your new record; returns true when it is.
 */
export function finishRunClock(meta: Meta, run: Run, won: boolean): boolean {
  if (run.endedAt) return false;
  run.endedAt = Date.now();
  const t = run.playMs ?? 0;
  if (!won || run.race || t < 60_000) return false;
  // Quick runs keep their own fastest win.
  if (run.quick) {
    const q = (meta.quick ??= { wins: 0, losses: 0, streak: 0, best: 0 });
    if (q.fastest && q.fastest <= t) return false;
    q.fastest = t;
    return true;
  }
  if (meta.fastestWin && meta.fastestWin <= t) return false;
  meta.fastestWin = t;
  return true;
}
