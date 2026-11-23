import { beforeEach, describe, expect, it } from 'vitest';
import { LEGENDS } from '../src/data/legends';
import { SPECIES, SPECIES_BY_ID, DEFAULT_STARTERS } from '../src/data/species';
import { LEGEND_TRAITS, LINE_TRAITS, rollTrait, TRAITS, traitOf, traitsOf, traitValue, type TraitId } from '../src/data/traits';
import { emptyStats } from '../src/logic/achievements';
import { Battle } from '../src/logic/battle';
import { createCreature, evolve, setFloorCeiling, stats, type Creature } from '../src/logic/creature';
import { emptyDex, seeCreature, traitsFound } from '../src/logic/dex';
import { makeEncounter, peekEncounter, startRun, type Meta } from '../src/logic/run';
import { Rng } from '../src/logic/rng';
import { teamSynergy } from '../src/logic/synergy';
import { makeArenaCreature, validArenaTeam } from '../src/logic/arena';

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

/** A Hexling of this line with this trait (it must be one of the line's). */
function withTrait(id: string, trait: TraitId, level = 30, stage = 0): Creature {
  const c = createCreature(id, level, stage);
  expect(traitsOf(id)).toContain(trait);
  c.trait = trait;
  return c;
}

/** One attack from `p` (its move 0) at `e`; the enemy just takes it. */
function hit(p: Creature, e: Creature, move: string, seed = 5): { b: Battle; dealt: number } {
  p.moves = [{ id: move, tier: 1 }];
  e.moves = [{ id: 'Neutral:warp', tier: 1 }];
  const b = new Battle([p], [e], new Rng(seed), { permadeath: false });
  b.start();
  const before = e.hp;
  b.takeDuelTurn({ kind: 'move', index: 0 }, { kind: 'potion', index: 0, heal: 0 });
  return { b, dealt: before - e.hp };
}

describe('trait data', () => {
  it('every line has two commons and a rare, all real traits; rare-only ones are only ever rare', () => {
    for (const sp of SPECIES) {
      const set = LINE_TRAITS[sp.id];
      expect(set, sp.id).toBeDefined();
      expect(new Set(set).size).toBe(3);
      for (const t of set) expect(TRAITS[t], `${sp.id} ${t}`).toBeDefined();
      for (const t of set.slice(0, 2)) expect(TRAITS[t].rareOnly, `${sp.id} ${t}`).toBeFalsy();
    }
    for (const l of LEGENDS) expect(traitsOf(l.id)).toEqual([LEGEND_TRAITS[l.id]]);
  });

  it('absorbers only ever soak an element the line is weak to', async () => {
    const { typeMultiplier } = await import('../src/data/types');
    for (const sp of SPECIES)
      for (const t of LINE_TRAITS[sp.id]) {
        const el = TRAITS[t].absorb;
        if (el) expect(typeMultiplier(el, sp.types), `${sp.id} ${t}`).toBeGreaterThan(1);
      }
  });

  it('rolls are seeded and keep the 42.5 / 42.5 / 15 split', () => {
    expect(rollTrait('emberkit', 'abc')).toBe(rollTrait('emberkit', 'abc'));
    const n = 20000;
    const counts = [0, 0, 0];
    for (let i = 0; i < n; i++) counts[LINE_TRAITS.emberkit.indexOf(rollTrait('emberkit', `k${i}`)!)]++;
    expect(counts[0] / n).toBeCloseTo(0.425, 1);
    expect(counts[1] / n).toBeCloseTo(0.425, 1);
    expect(counts[2] / n).toBeCloseTo(0.15, 1);
  });

  it('evolving keeps the trait, and the final form uses the stronger number', () => {
    const c = withTrait('emberkit', 'eager', 40);
    expect(traitValue(c, 'eager')).toBe(0.25);
    evolve(c);
    evolve(c);
    expect(c.stage).toBe(2);
    expect(traitOf(c)).toBe('eager');
    expect(traitValue(c, 'eager')).toBe(0.4);
  });

  it('older saves (no trait yet) get a valid one that stays the same', () => {
    const c = createCreature('molet', 10);
    delete c.trait;
    const t = traitOf(c);
    expect(traitsOf('molet')).toContain(t);
    expect(traitOf(c)).toBe(t);
    // A trait that isn't the line's is ignored.
    c.trait = 'gilded';
    expect(traitsOf('molet')).toContain(traitOf(c));
  });
});

describe('trait effects in battle', () => {
  it('an absorber turns a hit of its element into healing', () => {
    const e = withTrait('frostling', 'ab_Fire');
    e.hp = Math.round(stats(e).hp / 2);
    const { b, dealt } = hit(withTrait('emberkit', 'hitandrun'), e, 'Fire:2');
    expect(dealt).toBeLessThan(0);
    expect(b.e.c.hp).toBeGreaterThan(stats(e).hp / 2);
  });

  it('the AI never aims an attack an absorber would soak up, and trainers swap in someone who can hurt it', () => {
    // Its Fire attack would be its best pick on type alone; the Earth one is the only one that hurts.
    const me = withTrait('frostling', 'ab_Fire');
    me.moves = [{ id: 'Fire:2', tier: 1 }];
    const foe = withTrait('emberkit', 'hitandrun');
    foe.moves = [{ id: 'Fire:2', tier: 2 }, { id: 'Earth:0', tier: 1 }];
    const b = new Battle([me], [foe], new Rng(3), { permadeath: false });
    b.start();
    expect(b.bestMove('enemy')).toBe(1);
    // Auto-battle (your side) skips it too.
    const mine = withTrait('emberkit', 'hitandrun');
    mine.moves = [{ id: 'Fire:2', tier: 2 }, { id: 'Earth:0', tier: 1 }];
    const b2 = new Battle([mine], [withTrait('frostling', 'ab_Fire')], new Rng(3), { permadeath: false });
    b2.start();
    expect(b2.bestMove('player')).toBe(1);
    // A trainer whose only attacks are soaked up calls in a teammate that can hurt you.
    const only = withTrait('emberkit', 'hitandrun');
    only.moves = [{ id: 'Fire:2', tier: 1 }];
    const helper = createCreature('pebblin', 30);
    helper.moves = [{ id: 'Earth:2', tier: 1 }];
    const me2 = withTrait('frostling', 'ab_Fire');
    me2.moves = [{ id: 'Neutral:warp', tier: 1 }];
    const b3 = new Battle([me2], [only, helper], new Rng(3), { permadeath: false, enemyTactics: { potions: 0 } });
    b3.start();
    for (let i = 0; i < 4 && b3.eActive === 0; i++) b3.takeTurn({ kind: 'move', index: 0 });
    expect(b3.eActive).toBe(1);
  });

  it('fatigue: after 30 turns damage doubles and healing halves, so an absorber stalemate ends', () => {
    const one = (turns: number) => {
      const p = withTrait('emberkit', 'hitandrun', 40);
      const e = withTrait('frostling', 'ab_Fire', 40);
      p.moves = [{ id: 'Earth:0', tier: 1 }];
      e.moves = [{ id: 'Neutral:warp', tier: 1 }];
      const b = new Battle([p], [e], new Rng(5), { permadeath: false });
      b.start();
      (b as unknown as { turnNo: number }).turnNo = turns;
      const before = e.hp;
      const ev = b.takeDuelTurn({ kind: 'move', index: 0 }, { kind: 'potion', index: 0, heal: 0.5 });
      return { b, dealt: before - e.hp, ev };
    };
    const fresh = one(0);
    expect(fresh.b.fatigued).toBe(false);
    const late = one(30);
    expect(late.b.fatigued).toBe(true);
    expect(late.ev.some((x) => x.kind === 'text' && x.text.includes('Fatigue sets in'))).toBe(true);
    expect(one(31).ev.some((x) => x.kind === 'text' && x.text.includes('Fatigue sets in'))).toBe(false);
    // Same seed, same hit: twice the damage.
    expect(late.dealt).toBe(fresh.dealt * 2);
    // Healing (an absorbed hit) is halved.
    const soak = (turns: number) => {
      const e = withTrait('frostling', 'ab_Fire', 40);
      e.hp = Math.round(stats(e).hp / 2);
      const start = e.hp;
      const p = withTrait('emberkit', 'hitandrun', 40);
      p.moves = [{ id: 'Fire:2', tier: 1 }];
      e.moves = [{ id: 'Neutral:warp', tier: 1 }];
      const b = new Battle([p], [e], new Rng(5), { permadeath: false });
      b.start();
      (b as unknown as { turnNo: number }).turnNo = turns;
      b.takeDuelTurn({ kind: 'move', index: 0 }, { kind: 'potion', index: 0, heal: 0 });
      return e.hp - start;
    };
    expect(soak(30)).toBe(Math.ceil(soak(0) / 2));
  });

  it('Thick Hide softens super-effective hits', () => {
    const plain = hit(withTrait('puddlet', 'rainrider'), withTrait('magmole', 'magmaskin', 70), 'Water:2', 9).dealt;
    const hide = hit(withTrait('puddlet', 'rainrider'), withTrait('magmole', 'thickhide', 70), 'Water:2', 9).dealt;
    expect(hide).toBeLessThan(plain);
    expect(hide / plain).toBeCloseTo(0.88, 1);
  });

  it('Technician powers up weak multi-hit moves', () => {
    const sig = SPECIES_BY_ID.pebblin.signature;
    const plain = hit(withTrait('pebblin', 'roughskin'), withTrait('zapling', 'quickstart', 60), sig, 4).dealt;
    const tech = hit(withTrait('pebblin', 'technician'), withTrait('zapling', 'quickstart', 60), sig, 4).dealt;
    expect(tech / plain).toBeGreaterThan(1.15);
  });

  it('Steadfast hangs on at 1 HP from a knockout blow when healthy', () => {
    const big = createCreature('emberkit', 99, 2);
    const e = withTrait('lavapup', 'steadfast', 5);
    const { b } = hit(big, e, 'Water:2');
    expect(b.e.c.hp).toBe(1);
  });

  it('weather traits bring their weather and Night Stalker brings night', () => {
    const sun = new Battle([createCreature('emberkit', 20)], [withTrait('cinderwisp', 'sunseeker', 20)], new Rng(1));
    sun.start();
    expect(sun.weather).toBe('sun');
    expect(sun.weatherLeft).toBe(2);
    const night = new Battle([withTrait('gnarlet', 'nightstalker', 20)], [createCreature('emberkit', 20)], new Rng(1));
    night.start();
    expect(night.night).toBe(true);
  });

  it('Unshakable keeps its Attack from being lowered by the foe', () => {
    const b = new Battle([withTrait('sproutle', 'unshakable', 20)], [createCreature('emberkit', 20)], new Rng(1));
    b.start();
    (b as unknown as { bump: (...a: unknown[]) => void }).bump(b.p, 'player', 'atk', -1, [], true);
    expect(b.p.atkStage).toBe(0);
    (b as unknown as { bump: (...a: unknown[]) => void }).bump(b.p, 'player', 'def', -1, [], true);
    expect(b.p.defStage).toBe(-1);
  });
});

describe('traits on runs and in the Arena', () => {
  it('Kindred counts twice toward team synergy', () => {
    const a = withTrait('cogling', 'kindred');
    const plain = createCreature('boltkit', 5);
    expect(teamSynergy([a, plain]).find((s) => s.element === 'Metal')!.count).toBe(3);
  });

  it("Scout's peek matches the encounter you then meet", () => {
    for (let seed = 1; seed < 25; seed++) {
      const run = startRun(mkMeta(), 'emberkit', seed);
      run.log.fights = 1;
      for (const n of Object.values(run.map.nodes)) {
        if (n.kind !== 'battle' && n.kind !== 'elite') continue;
        const peek = peekEncounter(run, n)!;
        const foes = makeEncounter(run, n);
        expect(peek.speciesId).toBe(foes[0].speciesId);
        expect(peek.count).toBe(foes.length);
      }
    }
  });

  it('your own Hexlings mark their trait found; the Arena only lets you bring found traits', () => {
    const meta = mkMeta();
    meta.unlockedStarters = ['emberkit'];
    const c = withTrait('emberkit', 'hitandrun');
    seeCreature(meta.dex, c, true);
    expect(traitsFound(meta.dex, 'emberkit')).toEqual(['hitandrun']);
    const team = validArenaTeam(meta, [{ speciesId: 'emberkit', stage: 0, moves: [], trait: 'secondskin' }]);
    expect(team[0].trait).toBe('hitandrun');
    expect(makeArenaCreature(team[0]).trait).toBe('hitandrun');
  });
});
