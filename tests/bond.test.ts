import { describe, expect, it } from 'vitest';
import { DEFAULT_STARTERS } from '../src/data/species';
import { traitsOf } from '../src/data/traits';
import { emptyStats } from '../src/logic/achievements';
import {
  heartFill,
  BOND_POINTS,
  BOND_START_LEVELS,
  BOND_VERSION,
  bondColours,
  bondTrait,
  camp,
  CAMP_HEARTS,
  CAMP_START_BOND,
  campCrew,
  campHearts,
  campVisitor,
  canChooseTrait,
  care,
  convertBond,
  payRunBond,
  runBond,
  setBondTrait,
  toggleBondColours,
} from '../src/logic/camp';
import { emptyDex } from '../src/logic/dex';
import { clearFloor, startRun, type Meta } from '../src/logic/run';
import { BALANCE } from '../src/data/balance';

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

const at = (m: Meta, id: string, points: number) => (camp(m).bond[id] = points);

describe('Camp bond, deepened (2.0)', () => {
  it('five hearts at 10, 30, 60, 100, 150', () => {
    expect(CAMP_HEARTS).toEqual([10, 30, 60, 100, 150]);
    const m = mkMeta();
    for (const [pts, h] of [[9, 0], [10, 1], [59, 2], [60, 3], [149, 4], [150, 5], [999, 5]]) {
      at(m, 'emberkit', pts);
      expect(campHearts(m, 'emberkit')).toBe(h);
    }
  });

  it('converts 1.x points so everyone keeps their hearts (and no one gets a new one for free)', () => {
    const oldHearts = (p: number) => [3, 10, 21].filter((n) => p >= n).length;
    for (let old = 0; old <= 200; old++) {
      const now = CAMP_HEARTS.filter((n) => convertBond(old) >= n).length;
      expect(now).toBe(oldHearts(old));
    }
    expect(convertBond(3)).toBe(10);
    expect(convertBond(10)).toBe(30);
    expect(convertBond(21)).toBe(60);
    // A 1.x save is converted once, on load.
    const m = mkMeta();
    m.camp = { day: '', base: {}, claimed: [], done: 0, embers: 0, owned: [], bond: { emberkit: 21, frostling: 4 }, cared: {} };
    camp(m);
    expect(m.camp.bond).toEqual({ emberkit: 60, frostling: 12 });
    expect(m.camp.bondV).toBe(BOND_VERSION);
    camp(m);
    expect(m.camp.bond.emberkit).toBe(60);
    // A new camp starts on the new scale.
    const fresh = mkMeta();
    expect(camp(fresh).bondV).toBe(BOND_VERSION);
  });

  it('pet, feed and play each build bond once between runs', () => {
    const m = mkMeta();
    expect(care(m, 'emberkit', 'pet')).toBe(0);
    expect(care(m, 'emberkit', 'feed')).toBe(0);
    expect(care(m, 'emberkit', 'pet')).toBeNull();
    expect(care(m, 'emberkit', 'play')).toBe(0);
    expect(care(m, 'emberkit', 'play')).toBeNull();
    expect(camp(m).bond.emberkit).toBe(BOND_POINTS.care * 3);
    at(m, 'frostling', CAMP_HEARTS[0] - 1);
    expect(care(m, 'frostling', 'play')).toBe(1);
  });

  it('care comes back after every run, losses too, but not after online races', () => {
    const m = mkMeta();
    care(m, 'emberkit', 'pet');
    expect(care(m, 'emberkit', 'pet')).toBeNull();
    payRunBond(m, startRun(m, 'emberkit', 3), false);
    expect(care(m, 'emberkit', 'pet')).toBe(0);
    expect(camp(m).bond.emberkit).toBe(BOND_POINTS.care * 2 + BOND_POINTS.finished);
    const race = startRun(m, 'emberkit', 4);
    race.race = {} as never;
    payRunBond(m, race, true);
    expect(care(m, 'emberkit', 'pet')).toBeNull();
  });

  it('the bond meter fills one heart after another', () => {
    expect(heartFill(0)).toEqual([0, 0, 0, 0, 0]);
    expect(heartFill(CAMP_HEARTS[0] / 2)).toEqual([0.5, 0, 0, 0, 0]);
    const mid = (CAMP_HEARTS[0] + CAMP_HEARTS[1]) / 2;
    expect(heartFill(mid)).toEqual([1, 0.5, 0, 0, 0]);
    expect(heartFill(CAMP_HEARTS[4] + 99)).toEqual([1, 1, 1, 1, 1]);
  });

  it('runs pay bond: finishing, winning, MVP and each guardian it helped beat, once', () => {
    const m = mkMeta();
    const run = startRun(m, 'emberkit', 11);
    run.team[0].dealt = 500;
    clearFloor(run);
    const pts = runBond(run, true);
    expect(pts.emberkit).toBe(BOND_POINTS.finished + BOND_POINTS.won + BOND_POINTS.mvp + BOND_POINTS.guardian);
    expect(runBond(run, false).emberkit).toBe(BOND_POINTS.finished + BOND_POINTS.mvp + BOND_POINTS.guardian);
    const paid = payRunBond(m, run, true);
    expect(paid[0]).toMatchObject({ speciesId: 'emberkit', points: pts.emberkit });
    payRunBond(m, run, true);
    expect(camp(m).bond.emberkit).toBe(pts.emberkit);
  });

  it('heart 3: starts runs with a bond heart (not on dailies)', () => {
    const m = mkMeta();
    at(m, 'emberkit', CAMP_HEARTS[1]);
    expect(startRun(m, 'emberkit', 7).team[0].bond ?? 0).toBe(0);
    at(m, 'emberkit', CAMP_HEARTS[2]);
    expect(startRun(m, 'emberkit', 7).team[0].bond).toBe(CAMP_START_BOND);
    expect(startRun(m, 'emberkit', 7, 'wildlands', '2026-11-20').team[0].bond ?? 0).toBe(0);
  });

  it("heart 4: choose its trait, but only one you've found", () => {
    const m = mkMeta();
    const [a, b, rare] = traitsOf('emberkit');
    m.dex.traits = [`emberkit:${a}`, `emberkit:${rare}`];
    setBondTrait(m, 'emberkit', rare);
    at(m, 'emberkit', CAMP_HEARTS[2]);
    expect(canChooseTrait(m, 'emberkit')).toBe(false);
    expect(bondTrait(m, 'emberkit')).toBeUndefined();
    at(m, 'emberkit', CAMP_HEARTS[3]);
    expect(canChooseTrait(m, 'emberkit')).toBe(true);
    expect(bondTrait(m, 'emberkit')).toBe(rare);
    setBondTrait(m, 'emberkit', b);
    expect(bondTrait(m, 'emberkit')).toBeUndefined();
  });

  it('heart 5: +2 starting levels (not seeded), bond colours (switchable), and a camp visitor', () => {
    const m = mkMeta();
    at(m, 'emberkit', CAMP_HEARTS[4]);
    expect(startRun(m, 'emberkit', 7).team[0].level).toBe(BALANCE.starterLevel + BOND_START_LEVELS);
    expect(startRun(m, 'emberkit', 7, 'wildlands', '2026-11-20').team[0].level).toBe(BALANCE.starterLevel);
    expect(startRun(m, 'frostling', 7).team[0].level).toBe(BALANCE.starterLevel);
    expect(bondColours(m, 'emberkit')).toBe(true);
    expect(startRun(m, 'emberkit', 7).team[0].alt).toBe(true);
    toggleBondColours(m, 'emberkit');
    expect(bondColours(m, 'emberkit')).toBe(false);
    expect(startRun(m, 'emberkit', 7).team[0].alt).toBeUndefined();
    // Visits only when it isn't already staying at camp.
    camp(m).crew = ['emberkit'];
    expect(campCrew(m)[0].speciesId).toBe('emberkit');
    expect(campVisitor(m)).toBeNull();
    camp(m).crew = ['frostling'];
    expect(campVisitor(m)).toBe('emberkit');
  });
});
