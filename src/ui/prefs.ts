/** Small per-device preferences (battle speed, auto-battle, vibration). Never part of a save. */

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
  get haptics(): boolean {
    return get('ccr-haptics', '1') === '1';
  },
  set haptics(v: boolean) {
    set('ccr-haptics', v ? '1' : '0');
  },
};
