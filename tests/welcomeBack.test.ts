import { describe, expect, it } from 'vitest';

const store: Record<string, string> = {};
(globalThis as unknown as { localStorage: Storage }).localStorage = {
  getItem: (k: string) => store[k] ?? null,
  setItem: (k: string, v: string) => void (store[k] = v),
  removeItem: (k: string) => void delete store[k],
} as Storage;

const { loadMeta, saveMeta } = await import('../src/logic/run');
const { camp } = await import('../src/logic/camp');
const { payWelcomeBack, WELCOME_CAP, WELCOME_PER_RUN, WELCOME_PER_WIN, welcomeGift, welcomeText } = await import('../src/logic/welcomeBack');

const storage = await import('../src/storage');
const KEY = 'ccr-meta-v1';

describe('welcome-back embers (2.0)', () => {
  it('pays from past progress: per win, a little per other run, capped at one Workshop branch', () => {
    expect(welcomeGift(0, 0)).toBe(0);
    expect(welcomeGift(4, 10)).toBe(4 * WELCOME_PER_WIN + 6 * WELCOME_PER_RUN);
    expect(welcomeGift(500, 900)).toBe(WELCOME_CAP);
    expect(WELCOME_CAP).toBe(1250);
  });

  it('a save from before 2.0 gets it once, at camp; a new save gets nothing', () => {
    storage.setItem(KEY, JSON.stringify({ runs: 30, wins: 12, dex: { caught: ['emberkit'] }, camp: { day: '', base: {}, claimed: [], done: 0, embers: 40, owned: [], bond: {}, cared: {} } }));
    const m = loadMeta();
    const gift = welcomeGift(12, 30);
    expect(m.welcome).toMatchObject({ embers: gift, wins: 12, runs: 30, paid: false });
    const paid = payWelcomeBack(m);
    expect(paid?.embers).toBe(gift);
    expect(camp(m).embers).toBe(40 + gift);
    expect(welcomeText(paid!)).toContain(`${gift} embers`);
    expect(payWelcomeBack(m)).toBeNull();
    saveMeta(m);
    // Loading it again (or on another device after a sync) doesn't pay twice.
    const again = loadMeta();
    expect(again.welcome?.paid).toBe(true);
    expect(payWelcomeBack(again)).toBeNull();
    expect(camp(again).embers).toBe(40 + gift);

    storage.removeItem(KEY);
    const fresh = loadMeta();
    expect(fresh.welcome).toMatchObject({ embers: 0, paid: true });
    expect(payWelcomeBack(fresh)).toBeNull();
    // A fresh save that's saved and reloaded doesn't look like an old one.
    saveMeta(fresh);
    fresh.wins = 5;
    saveMeta(fresh);
    expect(payWelcomeBack(loadMeta())).toBeNull();
  });
});
