import { beforeEach, describe, expect, it } from 'vitest';
import { DEFAULT_STARTERS } from '../src/data/species';
import { emptyStats } from '../src/logic/achievements';
import { runEmbers } from '../src/logic/camp';
import { setFloorCeiling } from '../src/logic/creature';
import { emptyDex } from '../src/logic/dex';
import { generateFloor, stepsToBoss } from '../src/logic/map';
import { clearFloor, floorsOf, recordRun, startRun, type Meta } from '../src/logic/run';

beforeEach(() => setFloorCeiling(Infinity));

const mkMeta = (): Meta => ({
  unlockedStarters: [...DEFAULT_STARTERS],
  unlockedPassives: [],
  equippedPassive: null,
  runs: 0,
  wins: 0,
  dex: emptyDex(),
  coinsSpent: 0,
  bossesDefeated: 0,
  clearedMaps: [],
  lastMap: 'wildlands',
  stats: emptyStats(),
  achievements: [],
  newAchievements: [],
});

const quickRun = (meta: Meta, seed = 5) => startRun(meta, 'emberkit', seed, 'wildlands', undefined, false, undefined, undefined, true);

describe('quick runs', () => {
  it('have two floors on smaller maps', () => {
    const run = quickRun(mkMeta());
    expect(run.quick).toBe(true);
    expect(floorsOf(run)).toBe(2);
    const full = generateFloor(0, 'Fire', 9);
    const small = generateFloor(0, 'Fire', 9, true);
    expect(stepsToBoss(small, small.startId)).toBeLessThan(stepsToBoss(full, full.startId));
    expect(Object.keys(small.nodes).length).toBeLessThan(Object.keys(full.nodes).length);
  });

  it('open with a boon offer', () => {
    expect(quickRun(mkMeta()).boons?.offer?.ids.length).toBeGreaterThan(0);
  });

  it('end after the second guardian without touching wins, unlocks or Heat', () => {
    const meta = mkMeta();
    meta.heat = 0;
    const run = quickRun(meta);
    expect(meta.runs).toBe(0);
    if (run.boons) run.boons.offer = null;
    expect(clearFloor(run)).toBe(false);
    expect(run.floor).toBe(1);
    expect(clearFloor(run)).toBe(true);
    expect(meta.wins).toBe(0);
    expect(meta.heatUnlocked ?? 0).toBe(0);
    expect(meta.clearedMaps).toEqual([]);
    expect(run.unlockedThisRun).toEqual([]);
    recordRun(run, true);
    expect(meta.runRecord ?? { wins: 0, losses: 0 }).toEqual({ wins: 0, losses: 0 });
    expect(meta.history ?? []).toEqual([]);
    expect(meta.quick).toMatchObject({ wins: 1, losses: 0, streak: 1, best: 1 });
    recordRun(quickRun(meta, 6), false);
    expect(meta.quick).toMatchObject({ wins: 1, losses: 1, streak: 0, best: 1 });
  });

  it('pay about half the embers', () => {
    const full = startRun(mkMeta(), 'emberkit', 5);
    const quick = quickRun(mkMeta());
    full.log.battlesWon = quick.log.battlesWon = 8;
    const a = runEmbers(full, true).total;
    const b = runEmbers(quick, true).total;
    expect(b).toBeLessThan(a * 0.55);
    expect(b).toBeGreaterThan(a * 0.3);
  });

  it('are never quick when seeded (daily, weekly, races)', () => {
    const run = startRun(mkMeta(), 'emberkit', 5, 'wildlands', '2026-11-20', true, undefined, undefined, true);
    expect(run.quick).toBeUndefined();
  });
});
