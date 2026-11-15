import { describe, expect, it } from 'vitest';
import { ELEMENTS, typeMultiplier, stabMultiplier, STRONG_AGAINST } from '../src/data/types';
import { generateFloor, reachable } from '../src/logic/map';
import { Battle } from '../src/logic/battle';
import { addXp, catchUpMultiplier, createCreature, evolve, levelCap, prestige, stats } from '../src/logic/creature';
import { Rng } from '../src/logic/rng';
import { SPECIES } from '../src/data/species';

describe('types', () => {
  it('each element is strong vs 2 and weak vs 2', () => {
    for (const e of ELEMENTS) {
      expect(STRONG_AGAINST[e]).toHaveLength(2);
      const weakTo = ELEMENTS.filter((a) => STRONG_AGAINST[a].includes(e));
      expect(weakTo).toHaveLength(2);
    }
  });
  it('stacks dual types and counts pure types once', () => {
    expect(typeMultiplier('Water', ['Fire', 'Frost'])).toBeCloseTo(2.25);
    expect(typeMultiplier('Water', ['Fire', 'Fire'])).toBeCloseTo(1.5);
    expect(typeMultiplier('Water', ['Fire', 'Earth'])).toBeCloseTo(1.005, 2);
  });
  it('gives pure types a bigger same-type bonus', () => {
    expect(stabMultiplier('Fire', ['Fire', 'Fire'])).toBe(1.5);
    expect(stabMultiplier('Fire', ['Fire', 'Water'])).toBe(1.25);
    expect(stabMultiplier('Storm', ['Fire', 'Water'])).toBe(1);
  });
});

describe('map', () => {
  it('generates connected floors where every node reaches the boss', () => {
    for (let seed = 1; seed < 200; seed++) {
      for (let f = 0; f < 3; f++) {
        const m = generateFloor(f, 'Fire', seed);
        const r = reachable(m);
        expect(r.has(m.bossId)).toBe(true);
        expect(m.nodes[m.startId].next.length).toBeGreaterThanOrEqual(2);
        for (const n of Object.values(m.nodes)) {
          if (n.kind !== 'boss') expect(n.next.length).toBeGreaterThan(0);
          for (const nx of n.next) expect(m.nodes[nx].y).toBeLessThan(n.y); // always forward
        }
      }
    }
  });
});

describe('creature growth', () => {
  it('respects level cap, and prestige/evolve raise it', () => {
    const c = createCreature('emberkit', 1);
    addXp(c, 1e6);
    expect(c.level).toBe(levelCap(c));
    const cap0 = levelCap(c);
    prestige(c);
    expect(levelCap(c)).toBeGreaterThan(cap0);
    const before = stats(c).atk;
    evolve(c);
    expect(stats(c).atk).toBeGreaterThan(before);
    expect(c.stage).toBe(1);
  });
  it('learns moves as it levels', () => {
    const c = createCreature('steamle', 1);
    expect(c.moves).toHaveLength(2);
    addXp(c, 1e6);
    expect(c.moves).toHaveLength(4);
  });
  it('catch-up XP tapers as the gap closes', () => {
    expect(catchUpMultiplier(1, 11)).toBe(3.5);
    expect(catchUpMultiplier(10, 11)).toBe(1.25);
    expect(catchUpMultiplier(11, 11)).toBe(1);
  });
});

describe('battle', () => {
  it('always terminates with a winner', () => {
    const rng = new Rng(42);
    for (let i = 0; i < 100; i++) {
      const p = [createCreature(rng.pick(SPECIES).id, 8), createCreature(rng.pick(SPECIES).id, 8)];
      const e = [createCreature(rng.pick(SPECIES).id, 8)];
      const b = new Battle(p, e, rng);
      let turns = 0;
      while (b.outcome() !== 'win' && b.outcome() !== 'lose' && turns < 200) {
        if (b.outcome() === 'needSwitch') {
          b.forcedSwitch(b.player.findIndex((x) => x.c.hp > 0));
          continue;
        }
        b.takeTurn({ kind: 'move', index: rng.int(0, b.p.c.moves.length - 1) });
        turns++;
      }
      expect(['win', 'lose']).toContain(b.outcome());
    }
  });
});
