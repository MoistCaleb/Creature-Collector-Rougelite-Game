import { describe, expect, it } from 'vitest';
import { ELEMENTS, typeMultiplier, stabMultiplier, STRONG_AGAINST } from '../src/data/types';
import { branchiness, generateFloor, reachable } from '../src/logic/map';
import { Battle } from '../src/logic/battle';
import { addLevels, addXp, catchUpMultiplier, createCreature, evolve, levelCap, prestige, resolvePending, stats } from '../src/logic/creature';
import { MOVES } from '../src/data/moves';
import { DEFAULT_STARTERS } from '../src/data/species';
import { catchCreature, claimGuardian, startRun, type Meta } from '../src/logic/run';
import { applyItem, pay, priceFor, rollShop } from '../src/logic/shop';
import { emptyDex, formName, seeCreature } from '../src/logic/dex';
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
        expect(branchiness(m)).toBeGreaterThanOrEqual(1.7);
        // Every route into the boss passes the pre-boss row: shops on floor 1, rests later.
        const preBoss = Object.values(m.nodes).filter((n) => n.next.includes(m.bossId));
        for (const n of preBoss) expect(n.kind).toBe(f === 0 ? 'shop' : 'heal');
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
  it('learns moves as it levels, queueing extras when full', () => {
    const c = createCreature('steamle', 1);
    expect(c.moves).toHaveLength(2);
    addXp(c, 1e6);
    expect(c.moves).toHaveLength(4);
    expect(c.pendingMoves.length).toBeGreaterThan(0);
  });
  it('never has duplicate moves through leveling, learning and evolving', () => {
    const rng = new Rng(7);
    for (const sp of SPECIES) {
      for (let trial = 0; trial < 20; trial++) {
        const c = createCreature(sp.id, rng.int(1, 30), rng.int(0, 2));
        for (let step = 0; step < 12; step++) {
          if (rng.chance(0.3)) evolve(c);
          else if (rng.chance(0.3)) prestige(c);
          else addLevels(c, rng.int(1, 6));
          while (c.pendingMoves.length) {
            resolvePending(c, c.pendingMoves[0], rng.chance(0.7) ? rng.int(0, c.moves.length - 1) : null);
          }
          const ids = c.moves.map((m) => m.id);
          expect(new Set(ids).size).toBe(ids.length);
          expect(ids.length).toBeLessThanOrEqual(4);
        }
      }
    }
  });
  it('catch-up XP tapers as the gap closes', () => {
    expect(catchUpMultiplier(1, 11)).toBe(3.5);
    expect(catchUpMultiplier(10, 11)).toBe(1.25);
    expect(catchUpMultiplier(11, 11)).toBe(1);
  });
});

describe('dex', () => {
  it('hides evolutions until seen', () => {
    const d = emptyDex();
    expect(formName(d, 'emberkit', 1)).toBe('???');
    seeCreature(d, createCreature('emberkit', 20, 1), true);
    expect(formName(d, 'emberkit', 1)).toBe('Blazefang');
    expect(d.elements).toContain('Fire');
    expect(d.moves.length).toBeGreaterThan(0);
  });
});

describe('battle', () => {
  it('status moves change stat stages', () => {
    const p = createCreature('emberkit', 10);
    p.moves = [{ id: 'Fire:buff', tier: 1 }, { id: 'Fire:debuff', tier: 3 }];
    const e = createCreature('pebblin', 1);
    e.moves = [{ id: 'Earth:0', tier: 1 }];
    const b = new Battle([p], [e], new Rng(3));
    b.takeTurn({ kind: 'move', index: 0 });
    expect(b.p.atkStage).toBe(2);
    for (let i = 0; i < 5 && b.outcome() === 'ongoing'; i++) b.takeTurn({ kind: 'move', index: 1 });
    expect(b.e.defStage).toBeLessThan(0);
    expect(b.e.defStage).toBeGreaterThanOrEqual(-4);
    expect(MOVES['Fire:debuff'].kind).toBe('debuff');
  });
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

describe('shop', () => {
  const mkMeta = (): Meta => ({
    unlockedStarters: [...DEFAULT_STARTERS],
    unlockedPassives: [],
    equippedPassive: null,
    runs: 0,
    wins: 0,
    dex: emptyDex(),
    coinsSpent: 0,
  });
  it('stocks 5 distinct items with floor-scaled, haggler-discounted prices', () => {
    const run = startRun(mkMeta(), 'emberkit', 11);
    const shop = rollShop(run);
    expect(new Set(shop.slots.map((s) => s.item)).size).toBe(5);
    const f1 = priceFor(run, 100);
    run.floor = 2;
    expect(priceFor(run, 100)).toBeGreaterThan(f1);
    run.passive = 'haggler';
    expect(priceFor(run, 100)).toBeLessThan(priceFor({ ...run, passive: null }, 100));
  });
  it('charges coins, unlocks Haggler, and applies items', () => {
    const run = startRun(mkMeta(), 'emberkit', 12);
    run.coins = 1000;
    pay(run, 600);
    expect(run.coins).toBe(400);
    expect(run.meta.unlockedPassives).toContain('haggler');
    const lvl = run.team[0].level;
    applyItem(run, { item: 'manual', price: 0, sold: false }, run.team[0]);
    expect(run.team[0].level).toBe(lvl + 2);
    applyItem(run, { item: 'stone', price: 0, sold: false });
    expect(run.evoStones).toBe(1);
  });
});

describe('acquiring creatures', () => {
  const mkMeta = (): Meta => ({
    unlockedStarters: [...DEFAULT_STARTERS],
    unlockedPassives: [],
    equippedPassive: null,
    runs: 0,
    wins: 0,
    dex: emptyDex(),
    coinsSpent: 0,
  });
  it('first catch of a species arrives prestiged; repeats do not', () => {
    const run = startRun(mkMeta(), 'emberkit', 5);
    const wild = createCreature('mossling', 4);
    const a = catchCreature(run, wild)!;
    expect(a.firstCatch).toBe(true);
    expect(a.c.stars).toBe(1);
    expect(a.c.level).toBe(1);
    const b = catchCreature(run, wild)!;
    expect(b.firstCatch).toBe(false);
    expect(b.c.stars).toBe(0);
  });
  it('claimed guardians join at Lv 1 in their evolved form', () => {
    const run = startRun(mkMeta(), 'emberkit', 6);
    const boss = createCreature('cragice', 20, 1);
    const c = claimGuardian(run, boss)!;
    expect(c.level).toBe(1);
    expect(c.stage).toBe(1);
    expect(levelCap(c)).toBeGreaterThan(12);
  });
  it('pre-boss shops always stock healing, even after rerolls', () => {
    const run = startRun(mkMeta(), 'emberkit', 7);
    let shop = rollShop(run, 0, ['potion', 'restore']);
    for (let i = 0; i < 5; i++) {
      const items = shop.slots.map((s) => s.item);
      expect(items).toContain('potion');
      expect(items).toContain('restore');
      shop = rollShop(run, shop.rerolls + 1, shop.guaranteed);
    }
  });
});
