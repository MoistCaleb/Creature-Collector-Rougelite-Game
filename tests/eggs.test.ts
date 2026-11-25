import { describe, expect, it } from 'vitest';
import { DEFAULT_STARTERS, SPECIES } from '../src/data/species';
import { LEGENDS } from '../src/data/legends';
import { traitsOf } from '../src/data/traits';
import { createCreature, creatureName, hatchName, learnset, learnsetOf } from '../src/logic/creature';
import { emptyDex } from '../src/logic/dex';
import { emptyStats } from '../src/logic/achievements';
import { CAMP_HEARTS, camp, payRunBond } from '../src/logic/camp';
import {
  EGG_STARS,
  eggBaby,
  eggLength,
  hatchNest,
  hatchedPairs,
  layNestEgg,
  NURSERY_MAX,
  nest,
  nestReady,
  releaseHatchling,
  rollEggTier,
  tickNest,
  whyNot,
  type EggTier,
} from '../src/logic/nest';
import { startNestRun, startRun, type Meta } from '../src/logic/run';
import { eggNeed, eggReady, hatchEgg, layEgg, tickEgg } from '../src/logic/surprises';
import { colours } from '../src/ui/sprites';

const mkMeta = (): Meta => ({
  unlockedStarters: [...DEFAULT_STARTERS], unlockedPassives: [], equippedPassive: null, runs: 0, wins: 0, dex: emptyDex(),
  coinsSpent: 0, bossesDefeated: 0, clearedMaps: [], lastMap: 'wildlands', stats: emptyStats(), achievements: [], newAchievements: [],
});

/** A meta with a camp crew of `ids`, each at 3 hearts. */
function withCrew(ids: string[]): Meta {
  const meta = mkMeta();
  const c = camp(meta);
  c.crew = ids;
  for (const id of ids) c.bond[id] = CAMP_HEARTS[2];
  return meta;
}

describe('egg strength', () => {
  it('takes 3-7 and strong eggs are rarer; legendary eggs are always 3+', () => {
    const counts = [0, 0, 0, 0, 0];
    for (let s = 0; s < 4000; s++) counts[rollEggTier(s) - 1]++;
    expect(counts[0]).toBeGreaterThan(counts[4] * 2);
    expect(counts.every((n) => n > 0)).toBe(true);
    for (let s = 0; s < 500; s++) expect(rollEggTier(s, true)).toBeGreaterThanOrEqual(3);
    expect([1, 2, 3, 4, 5].map((t) => eggLength(t as EggTier))).toEqual([3, 4, 5, 6, 7]);
    expect(Math.max(...EGG_STARS)).toBe(2);
  });
});

describe('hatchlings', () => {
  it('learn the same number of moves at the same levels, each from one parent or the other', () => {
    const c = createCreature('emberkit', 70);
    const own = learnset(SPECIES.find((s) => s.id === 'emberkit')!);
    const other = learnset(SPECIES.find((s) => s.id === 'puddlet')!);
    c.heir = { other: 'puddlet', mix: 0b11111110 };
    const mixed = learnsetOf(c);
    expect(mixed.map((e) => e.level)).toEqual(own.map((e) => e.level));
    expect(mixed[0]).toEqual(own[0]); // its first move is always its own
    mixed.forEach((e, i) => expect([own[i].id, other[i].id]).toContain(e.id));
    expect(mixed.some((e, i) => e.id === other[i].id && e.id !== own[i].id)).toBe(true);
  });

  it('are named from both parents', () => {
    expect(hatchName('emberkit', 0, 'puddlet')).toMatch(/^Emb/);
    expect(hatchName('sproutle', 0, 'zapling').endsWith('ling')).toBe(true);
    for (const a of SPECIES.slice(0, 40)) for (const b of SPECIES.slice(40, 44)) {
      const n = hatchName(a.id, 0, b.id);
      expect(n.length).toBeGreaterThan(2);
      expect(n[0]).toBe(n[0].toUpperCase());
    }
    const c = createCreature('emberkit', 5);
    c.heir = { other: 'puddlet', mix: 0 };
    expect(creatureName(c)).toBe(hatchName('emberkit', 0, 'puddlet'));
    expect(colours(c)).toBe('hatch:puddlet');
  });
});

describe('the camp Nest', () => {
  it('breeds two crew lines with 3+ hearts, takes its runs, and hatches into the Nursery', () => {
    const meta = withCrew(['emberkit', 'puddlet']);
    expect(whyNot(meta, 'emberkit', 'emberkit')).toBeTruthy();
    const egg = layNestEgg(meta, 'emberkit', 'puddlet', 42)!;
    expect(egg.left).toBe(eggLength(egg.tier));
    expect(whyNot(meta, 'emberkit', 'puddlet')).toMatch(/already/);
    for (let i = 1; i < eggLength(egg.tier); i++) expect(tickNest(meta)).toBe(false);
    expect(tickNest(meta)).toBe(true);
    expect(nestReady(meta)).toBe(true);
    const h = hatchNest(meta)!;
    expect(['emberkit', 'puddlet']).toContain(h.speciesId);
    expect(h.other).not.toBe(h.speciesId);
    expect(traitsOf(h.speciesId)).toContain(h.trait);
    expect(h.stars).toBe(EGG_STARS[h.tier - 1]);
    expect(nest(meta).brood).toHaveLength(1);
    expect(hatchedPairs(meta)[0]).toMatchObject({ speciesId: h.speciesId, other: h.other });
  });

  it('needs hearts, and a legendary parent never passes on its line', () => {
    const meta = withCrew(['emberkit', 'puddlet']);
    camp(meta).bond.puddlet = 0;
    expect(whyNot(meta, 'emberkit', 'puddlet')).toMatch(/can’t be a parent/);
    const leg = LEGENDS[0].id;
    expect(whyNot(meta, 'emberkit', leg)).toBeTruthy(); // not caught
    meta.legends = { [leg]: { hp: 0, caught: true } };
    expect(whyNot(meta, leg, 'emberkit')).toBeNull();
    expect(whyNot(meta, leg, LEGENDS[1].id)).toBeTruthy();
    for (let s = 0; s < 30; s++) {
      const m = withCrew(['emberkit']);
      m.legends = { [leg]: { hp: 0, caught: true } };
      const egg = layNestEgg(m, leg, 'emberkit', s)!;
      expect(egg.tier).toBeGreaterThanOrEqual(3);
      expect(eggBaby(egg)).toMatchObject({ speciesId: 'emberkit', other: leg, legendary: true });
    }
  });

  it('counts finished runs, not online races', () => {
    const meta = withCrew(['emberkit', 'puddlet']);
    const egg = layNestEgg(meta, 'emberkit', 'puddlet', 7)!;
    const run = startRun(meta, 'emberkit', 1);
    payRunBond(meta, run, false);
    expect(nest(meta).egg!.left).toBe(eggLength(egg.tier) - 1);
    const race = startRun(meta, 'emberkit', 2, 'wildlands', undefined, true, undefined, null);
    race.race = { opponent: 'x', role: 'host' };
    payRunBond(meta, race, false);
    expect(nest(meta).egg!.left).toBe(eggLength(egg.tier) - 1);
  });

  it('keeps up to six, and releasing pays embers', () => {
    const meta = withCrew(['emberkit', 'puddlet']);
    for (let i = 0; i < NURSERY_MAX; i++) {
      layNestEgg(meta, 'emberkit', 'puddlet', 100 + i);
      nest(meta).egg!.left = 0;
      hatchNest(meta);
    }
    expect(whyNot(meta, 'emberkit', 'puddlet')).toMatch(/full/);
    const before = camp(meta).embers;
    const h = nest(meta).brood[0];
    expect(releaseHatchling(meta, h.id)).toBeGreaterThanOrEqual(2);
    expect(camp(meta).embers).toBeGreaterThan(before);
    expect(nest(meta).brood).toHaveLength(NURSERY_MAX - 1);
    expect(hatchedPairs(meta).reduce((n, p) => n + p.rec.n, 0)).toBe(NURSERY_MAX);
  });

  it('a hatchling starts a run as itself and stays in the Nursery', () => {
    const meta = withCrew(['emberkit', 'puddlet']);
    layNestEgg(meta, 'emberkit', 'puddlet', 9);
    nest(meta).egg!.left = 0;
    const h = hatchNest(meta)!;
    const run = startNestRun(meta, h, 5);
    const lead = run.team[0];
    expect(lead.speciesId).toBe(h.speciesId);
    expect(lead.heir).toEqual({ other: h.other, mix: h.mix });
    expect(lead.trait).toBe(h.trait);
    expect(lead.stars).toBe(h.stars);
    expect(lead.moves.length).toBeGreaterThan(0);
    expect(nest(meta).brood).toHaveLength(1);
  });
});

describe('the Hatchery egg on a run', () => {
  it('has two seeded parents, needs 3-7 wins, and hatches a hatchling', () => {
    const meta = mkMeta();
    const run = startRun(meta, 'emberkit', 77);
    const egg = layEgg(run);
    expect(egg.other).toBeTruthy();
    expect(egg.other).not.toBe(egg.speciesId);
    expect(eggNeed(egg)).toBe(eggLength(egg.tier!));
    const again = layEgg(startRun(mkMeta(), 'emberkit', 77));
    expect([again.speciesId, again.other, again.tier]).toEqual([egg.speciesId, egg.other, egg.tier]);
    for (let i = 0; i < eggNeed(egg); i++) tickEgg(run);
    expect(eggReady(run)).toBe(true);
    const c = hatchEgg(run)!;
    expect(c.heir?.other).toBe(egg.other);
    expect(c.stars).toBe(EGG_STARS[egg.tier! - 1]);
  });
});
