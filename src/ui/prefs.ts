import { setWorldClock } from '../logic/ambience';
/** Small per-device preferences (volumes, battle speed, auto-battle, tips). Never part of a save. */

function read(key: string): string | null {
  try {
    return globalThis.localStorage?.getItem(key) ?? null;
  } catch {
    return null;
  }
}

function write(key: string, value: string) {
  try {
    globalThis.localStorage?.setItem(key, value);
  } catch {
    // Storage blocked: the preference just lasts for this session.
  }
}

const cache: Record<string, string | null> = {};
function get(key: string, fallback: string): string {
  if (!(key in cache)) cache[key] = read(key);
  return cache[key] ?? fallback;
}
function set(key: string, value: string) {
  cache[key] = value;
  write(key, value);
}

export const BATTLE_SPEEDS = [1, 2, 3] as const;

export const prefs = {
  get battleSpeed(): number {
    const v = Number(get('ccr-battle-speed', '1'));
    return (BATTLE_SPEEDS as readonly number[]).includes(v) ? v : 1;
  },
  set battleSpeed(v: number) {
    set('ccr-battle-speed', String(v));
  },
  get autoBattle(): boolean {
    return get('ccr-battle-auto', '0') === '1';
  },
  set autoBattle(v: boolean) {
    set('ccr-battle-auto', v ? '1' : '0');
  },
  /** Music and sound-effect volume, 0-10. */
  get musicVol(): number {
    return vol(get('ccr-music-vol', '10'));
  },
  set musicVol(v: number) {
    set('ccr-music-vol', String(vol(String(v))));
  },
  get sfxVol(): number {
    return vol(get('ccr-sfx-vol', '10'));
  },
  set sfxVol(v: number) {
    set('ccr-sfx-vol', String(vol(String(v))));
  },
  /** First-time tips (see ui/tips.ts). */
  get tips(): boolean {
    return get('ccr-tips', '1') === '1';
  },
  set tips(v: boolean) {
    set('ccr-tips', v ? '1' : '0');
  },
  /** Tips already shown, comma-separated ids. */
  get tipsSeen(): string[] {
    return get('ccr-tips-seen', '').split(',').filter(Boolean);
  },
  set tipsSeen(v: string[]) {
    set('ccr-tips-seen', v.join(','));
  },
  /** Tone down screen shake, flashes and zooms. Starts on when the device asks for reduced motion. */
  get reduceMotion(): boolean {
    const os = typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches;
    return get('ccr-reduce-motion', os ? '1' : '0') === '1';
  },
  set reduceMotion(v: boolean) {
    set('ccr-reduce-motion', v ? '1' : '0');
  },
  /** Day and night, and holiday themes, on the map (from the device's clock). */
  get worldClock(): boolean {
    return get('ccr-world-clock', '1') === '1';
  },
  set worldClock(v: boolean) {
    set('ccr-world-clock', v ? '1' : '0');
    setWorldClock(v);
  },
  /** The last game version whose What's new you've seen. */
  get lastVersion(): string | null {
    return get('ccr-last-version', '') || null;
  },
  set lastVersion(v: string | null) {
    set('ccr-last-version', v ?? '');
  },
};

function vol(s: string): number {
  const n = Math.round(Number(s));
  return Number.isFinite(n) ? Math.max(0, Math.min(10, n)) : 10;
}

setWorldClock(prefs.worldClock);
