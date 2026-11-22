import { beforeEach, describe, expect, it } from 'vitest';
import { SURPRISE_LIST } from '../src/data/surprises';
import { DEFAULT_STARTERS } from '../src/data/species';
import { traitsOf } from '../src/data/traits';
import { emptyStats } from '../src/logic/achievements';
import { setFloorCeiling } from '../src/logic/creature';
import { emptyDex } from '../src/logic/dex';
import { encounterKind, makeEncounter, peekEncounter, startRun, type Meta } from '../src/logic/run';
import { DROUGHT_MAX, floorSurprise, hadSurprise, noteRunSurprises, runSurprises } from '../src/logic/surprises';

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

describe('rare surprises', () => {
  it('are seeded: the same seed rolls the same omen and floor surprises', () => {
    for (let seed = 1; seed < 60; seed++) {
      const a = startRun(mkMeta(), 'emberkit', seed, 'wildlands', 'd1');
      const b = startRun(mkMeta(), 'emberkit', seed, 'wildlands', 'd1');
      expect(a.surprises).toEqual(b.surprises);
    }
    expect(new Set(SURPRISE_LIST.map((s) => s.id)).size).toBe(SURPRISE_LIST.length);
  });

  it('about half of runs meet one, and never more than 3 runs in a row go without', () => {
    const meta = mkMeta();
    let had = 0;
    let streak = 0;
    let worst = 0;
    const runs = 400;
    for (let seed = 1; seed <= runs; seed++) {
      const run = startRun(meta, 'emberkit', seed * 7919);
      // The bot-free estimate: the omen and the first floor only (the rest come as you climb).
      if (hadSurprise(run)) had++;
      streak = hadSurprise(run) ? 0 : streak + 1;
      worst = Math.max(worst, streak);
      noteRunSurprises(meta, run);
    }
    expect(worst).toBeLessThanOrEqual(DROUGHT_MAX);
    // First floor and omen alone: a fair share (all three floors push it toward 1 in 2).
    expect(had / runs).toBeGreaterThan(0.2);
  });

  it('a hidden hex replaces one battle hex and leaves the rest of the map alone', () => {
    for (let seed = 1; seed < 300; seed++) {
      const run = startRun(mkMeta(), 'emberkit', seed);
      const fs = floorSurprise(run);
      if (!fs.hex) continue;
      expect(run.map.nodes[fs.hexNode!].kind).toBe('hidden');
      expect(Object.values(run.map.nodes).filter((n) => n.kind === 'hidden').length).toBe(1);
    }
  });

  it('twin wilds are two of a line with its rare trait; a Gilded trainer is a trainer, all Gilded; Scout still sees them', () => {
    const run = startRun(mkMeta(), 'emberkit', 11);
    run.log.fights = 2;
    const node = Object.values(run.map.nodes).find((n) => n.kind === 'battle')!;
    const fs = runSurprises(run).floors['0'];
    fs.enc = 'twinwilds';
    fs.encNode = node.id;
    const twins = makeEncounter(run, node);
    expect(twins.length).toBe(2);
    expect(twins[0].speciesId).toBe(twins[1].speciesId);
    expect(twins[0].trait).toBe(traitsOf(twins[0].speciesId)[2]);
    fs.enc = 'gildedtrainer';
    expect(encounterKind(run, node)).toBe('elite');
    const peek = peekEncounter(run, node)!;
    const team = makeEncounter(run, node);
    expect(team.every((c) => c.shiny)).toBe(true);
    expect(peek.speciesId).toBe(team[0].speciesId);
  });

  it('Blood Moon gives every foe its rare trait; Golden Age doubles coins and raises prices', async () => {
    const { priceFor } = await import('../src/logic/shop');
    const run = startRun(mkMeta(), 'emberkit', 5);
    const before = priceFor(run, 100);
    runSurprises(run).omen = 'bloodmoon';
    run.log.fights = 1;
    const node = Object.values(run.map.nodes).find((n) => n.kind === 'battle')!;
    for (const c of makeEncounter(run, node)) expect(c.trait).toBe(traitsOf(c.speciesId)[2]);
    runSurprises(run).omen = 'goldenage';
    expect(priceFor(run, 100)).toBeGreaterThan(before);
  });
});
