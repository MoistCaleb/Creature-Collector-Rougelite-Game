import { describe, expect, it } from 'vitest';
import { BALANCE } from '../src/data/balance';
import { emptyStats } from '../src/logic/achievements';
import { ELEMENTS, typeMultiplier, stabMultiplier, STRONG_AGAINST } from '../src/data/types';
import { branchiness, generateFloor, MIN_BRANCHINESS, reachable, ROUTE_LENGTHS, stepsToBoss } from '../src/logic/map';
import { Battle } from '../src/logic/battle';
import { learnset, addLevels, addXp, catchUpMultiplier, createCreature, evolve, levelCap, moveDef, prestige, recommendForget, resolvePending, stats } from '../src/logic/creature';
import { BOSSES } from '../src/data/trainers';
import { moveStyle } from '../src/data/moveStyle';
import type { Element } from '../src/data/types';
import { attackId, elementPool, MOVES } from '../src/data/moves';
import { DEFAULT_STARTERS } from '../src/data/species';
import { EVENTS, rollEvent } from '../src/logic/events';
import { allCreatures, rollStarterChoices, toggleFavorite, dailySeed, dailyStarters, recordDaily, buryFallen, equipHeld, stash, battleCoins, battleXp, clearFloor, grantXp, catchCreature, clearSavedRun, hasSavedRun, loadRun, saveRun, unlockedMaps, claimGuardian, makeEncounter, moveTo, neutralMatchup, noAdvantageOver, startRun, type Meta } from '../src/logic/run';
import { SPECIES_BY_ID } from '../src/data/species';
import { applyItem, pay, priceFor, rollShop, unusableReason } from '../src/logic/shop';
import { emptyDex, formName, seeCreature } from '../src/logic/dex';
import { Rng } from '../src/logic/rng';
import { SPECIES } from '../src/data/species';

describe('types', () => {
  it('each element is strong vs 3 and weak to 3', () => {
    for (const e of ELEMENTS) {
      expect(STRONG_AGAINST[e]).toHaveLength(3);
      expect(STRONG_AGAINST[e]).not.toContain(e);
      const weakTo = ELEMENTS.filter((a) => STRONG_AGAINST[a].includes(e));
      expect(weakTo).toHaveLength(3);
    }
  });
  it('every element has at least 4 creature families', () => {
    for (const e of ELEMENTS) expect(SPECIES.filter((s) => s.types.includes(e)).length).toBeGreaterThanOrEqual(4);
  });
  it('stacks dual types and counts pure types once', () => {
    expect(typeMultiplier('Water', ['Fire', 'Earth'])).toBeCloseTo(2.25);
    expect(typeMultiplier('Water', ['Fire', 'Fire'])).toBeCloseTo(1.5);
    expect(typeMultiplier('Nature', ['Water', 'Fire'])).toBeCloseTo(1.005, 2);
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
        expect(branchiness(m)).toBeGreaterThanOrEqual(MIN_BRANCHINESS);
        // Every route into the boss passes the pre-boss row: shops on floor 1, rests later.
        const preBoss = Object.values(m.nodes).filter((n) => n.next.includes(m.bossId));
        for (const n of preBoss) expect(n.kind).toBe(f === 0 ? 'shop' : 'heal');
      }
    }
  });

  it('every route to the boss has the same length', () => {
    for (let seed = 1; seed < 100; seed++) {
      for (let f = 0; f < 3; f++) {
        const m = generateFloor(f, 'Fire', seed);
        // Every move climbs exactly one row, so every route is as long as the start's distance.
        for (const n of Object.values(m.nodes))
          for (const nx of n.next) expect(stepsToBoss(m, nx)).toBe(stepsToBoss(m, n.id) - 1);
        expect(stepsToBoss(m, m.startId)).toBe(ROUTE_LENGTHS[f]);
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
  it('catch-up XP tapers as the gap closes and is capped at x2', () => {
    expect(catchUpMultiplier(1, 11)).toBeCloseTo(1.8);
    expect(catchUpMultiplier(10, 11)).toBeCloseTo(1.08);
    expect(catchUpMultiplier(11, 11)).toBe(1);
    expect(catchUpMultiplier(1, 80)).toBe(2);
  });
  it('a creature that sat out never earns more XP than the one that fought', () => {
    const run = startRun(
      { unlockedStarters: ['emberkit'], unlockedPassives: [], equippedPassive: null, runs: 0, wins: 0, dex: emptyDex(), coinsSpent: 0, bossesDefeated: 0, clearedMaps: [], lastMap: 'wildlands', stats: emptyStats(), achievements: [], newAchievements: [] },
      'emberkit',
      1,
    );
    run.team[0].level = 40;
    const sitter = createCreature('mossling', 1);
    run.team.push(sitter);
    const res = grantXp(run, 500, [run.team[0].uid]);
    expect(res[1].xp).toBeLessThanOrEqual(res[0].xp);
  });
  it('levels reach 100 only at the final evolution stage', () => {
    expect(levelCap({ stage: 0, stars: 0 })).toBe(30);
    expect(levelCap({ stage: 1, stars: 0 })).toBe(65);
    expect(levelCap({ stage: 2, stars: 0 })).toBe(100);
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
    bossesDefeated: 0,
    clearedMaps: [],
    lastMap: 'wildlands', stats: emptyStats(), achievements: [], newAchievements: [],
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
    expect(run.meta.unlockedPassives).toContain('haggler'); // Big Spender achievement
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
    bossesDefeated: 0,
    clearedMaps: [],
    lastMap: 'wildlands', stats: emptyStats(), achievements: [], newAchievements: [],
  });
  it('first catch of a species arrives prestiged; repeats do not', () => {
    const run = startRun(mkMeta(), 'emberkit', 5);
    const wild = createCreature('mossling', 4);
    const a = catchCreature(run, wild)!;
    expect(a.bonus).toBe('species');
    expect(a.c.stars).toBe(1);
    expect(a.c.level).toBe(4); // joins at the level it was in battle
    const b = catchCreature(run, wild)!;
    expect(b.bonus).toBe(null);
    expect(b.c.stars).toBe(0);
  });
  it('after the Dex is complete, the bonus goes per element, once per run', () => {
    const meta = mkMeta();
    meta.dex.caught = SPECIES.map((s) => s.id);
    const run = startRun(meta, 'emberkit', 8);
    const fw = catchCreature(run, createCreature('steamle', 3))!; // Fire/Water
    expect(fw.bonus).toBe('type');
    expect(fw.c.stars).toBe(1);
    const we = catchCreature(run, createCreature('coralite', 3))!; // Water/Earth: Earth is still fresh
    expect(we.bonus).toBe('type');
    expect(we.newlyClaimed).toEqual(['Earth']);
    expect(catchCreature(run, createCreature('emberkit', 3))!.bonus).toBe(null); // Fire/Fire: fire used
    expect(catchCreature(run, createCreature('magmole', 3))!.bonus).toBe(null); // Fire/Earth: both used
    expect(catchCreature(run, createCreature('rimehawk', 3))!.bonus).toBe('type'); // Frost/Storm: fresh
    const next = startRun(meta, 'emberkit', 9);
    expect(next.claimedTypes).toEqual([]); // resets each run
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

describe('early fairness', () => {
  const mkMeta = (): Meta => ({
    unlockedStarters: [...SPECIES.map((s) => s.id)],
    unlockedPassives: [],
    equippedPassive: null,
    runs: 0,
    wins: 0,
    dex: emptyDex(),
    coinsSpent: 0,
    bossesDefeated: 0,
    clearedMaps: [],
    lastMap: 'wildlands', stats: emptyStats(), achievements: [], newAchievements: [],
  });
  it('first battle is neutral both ways', () => {
    for (const starter of SPECIES) {
      for (let seed = 1; seed <= 25; seed++) {
        const run = startRun(mkMeta(), starter.id, seed * 31 + starter.id.length);
        const lead = SPECIES_BY_ID[starter.id].types;
        const first = run.map.nodes[run.map.nodes[run.currentId].next[0]];
        moveTo(run, first.id);
        const neutralExists = SPECIES.some((o) => neutralMatchup(o, lead));
        for (const e of makeEncounter(run, first)) {
          const sp = SPECIES_BY_ID[e.speciesId];
          expect(noAdvantageOver(sp, lead)).toBe(true); // never super effective on you
          if (neutralExists) expect(neutralMatchup(sp, lead)).toBe(true);
        }
      }
    }
  });
});

describe('roster and move variety', () => {
  it('has ~120 families: 4 pure per element and every name unique', () => {
    expect(SPECIES.length).toBeGreaterThanOrEqual(115);
    for (const e of ELEMENTS) expect(SPECIES.filter((s) => s.types[0] === e && s.types[1] === e).length).toBeGreaterThanOrEqual(4);
    const names = SPECIES.flatMap((s) => s.names);
    expect(new Set(names).size).toBe(names.length);
    const ids = SPECIES.map((s) => s.id);
    expect(new Set(ids).size).toBe(ids.length);
  });
  it('every element has a 10-move pool and every family a signature it learns', () => {
    for (const e of ELEMENTS) expect(elementPool(e)).toHaveLength(10);
    for (const s of SPECIES) {
      expect(MOVES[s.signature].signature).toBe(s.id);
      expect(learnset(s).map((l) => l.id)).toContain(s.signature);
    }
  });
  it('families of the same element learn different mixes', () => {
    for (const e of ELEMENTS) {
      const pures = SPECIES.filter((s) => s.types[0] === e && s.types[1] === e);
      const sets = new Set(pures.map((s) => learnset(s).map((l) => l.id).filter((id) => !id.startsWith('sig:')).join(',')));
      expect(sets.size).toBeGreaterThan(1);
    }
  });
});

describe('move mechanics', () => {
  const duel = (pMove: string, eMove = 'Earth:0', pLvl = 20, eLvl = 20) => {
    const p = createCreature('emberkit', pLvl);
    p.moves = [{ id: pMove, tier: 1 }];
    const e = createCreature('pebblin', eLvl);
    e.moves = [{ id: eMove, tier: 1 }];
    return new Battle([p], [e], new Rng(5));
  };
  it('priority moves go first even when slower', () => {
    const b = duel('Fire:sp0', 'Earth:0');
    b.e.c.level = 60; // much faster
    const ev = b.takeTurn({ kind: 'move', index: 0 });
    const firstAttack = ev.find((x) => x.kind === 'attack') as { side: string };
    expect(firstAttack.side).toBe('player');
  });
  it('multi-hit, drain, recoil and heal all apply', () => {
    const multi = duel('Frost:sp2').takeTurn({ kind: 'move', index: 0 });
    expect(multi.filter((x) => x.kind === 'damage' && x.side === 'enemy').length).toBeGreaterThanOrEqual(2);
    const b = duel('Fire:sp1');
    const hp0 = b.p.c.hp;
    b.takeTurn({ kind: 'move', index: 0 });
    expect(b.p.c.hp).toBeLessThan(hp0); // recoil (and enemy hit)
    const h = duel('Nature:extra', 'Earth:0', 20, 1);
    h.p.c.hp = 10;
    h.takeTurn({ kind: 'move', index: 0 });
    expect(h.p.c.hp).toBeGreaterThan(10);
  });
});

describe('double knockout', () => {
  it('counts as a loss when your last creature falls to recoil on the final blow', () => {
    const p = createCreature('emberkit', 30);
    p.moves = [{ id: 'Fire:sp1', tier: 1 }]; // heavy recoil move
    p.hp = 1;
    const e = createCreature('pebblin', 1);
    e.moves = [{ id: 'Earth:0', tier: 1 }];
    e.hp = 1;
    const b = new Battle([p], [e], new Rng(1));
    for (let i = 0; i < 10 && b.outcome() === 'ongoing'; i++) b.takeTurn({ kind: 'move', index: 0 });
    if (p.hp === 0) expect(b.outcome()).toBe('lose');
  });
});

describe('saving runs, maps and events', () => {
  const store: Record<string, string> = {};
  (globalThis as unknown as { localStorage: Storage }).localStorage = {
    getItem: (k: string) => store[k] ?? null,
    setItem: (k: string, v: string) => void (store[k] = v),
    removeItem: (k: string) => void delete store[k],
  } as Storage;
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
    lastMap: 'wildlands', stats: emptyStats(), achievements: [], newAchievements: [],
  });
  it('a saved run reloads identically, including the RNG', () => {
    const meta = mkMeta();
    const run = startRun(meta, 'emberkit', 99, 'volcanic');
    run.coins = 77;
    run.team[0].hp = 5;
    saveRun(run);
    const back = loadRun(meta)!;
    expect(back.coins).toBe(77);
    expect(back.team[0].hp).toBe(5);
    expect(back.biomes).toEqual(['Fire', 'Earth', 'Dragon']);
    expect(back.rng.next()).toBe(run.rng.next());
    clearSavedRun();
    expect(hasSavedRun()).toBe(false);
  });
  it('maps unlock with boss kills', () => {
    const meta = mkMeta();
    expect(unlockedMaps(meta).map((m) => m.id)).toEqual(['wildlands', 'verdant']);
    meta.bossesDefeated = 20; // bosses alone don't unlock maps
    expect(unlockedMaps(meta).map((m) => m.id)).toEqual(['wildlands', 'verdant']);
    meta.wins = 2;
    expect(unlockedMaps(meta).map((m) => m.id)).toContain('volcanic');
  });
  it('every event option runs without errors and does what it says', () => {
    for (const ev of EVENTS) {
      for (const o of ev.options) {
        const run = startRun(mkMeta(), 'emberkit', 3);
        run.coins = 500;
        run.evoStones = 1;
        addLevels(run.team[0], 20);
        run.team[0].hp = Math.round(run.team[0].hp * 0.8);
        run.bench.push(createCreature('mossling', 3));
        if (o.blocked?.(run)) throw new Error(`${ev.id}: ${o.label} blocked`);
        const target = o.target ? allCreatures(run).find((c) => o.eligible?.(run, c) ?? true) : undefined;
        if (o.target && !target) throw new Error(`${ev.id}: ${o.label} has no eligible creature`);
        const res = o.run(run, target);
        expect(res.text.length).toBeGreaterThan(0);
        for (const c of allCreatures(run)) expect(c.hp).toBeGreaterThan(0);
      }
    }
    const run = startRun(mkMeta(), 'emberkit', 4);
    run.coins = 100;
    const egg = EVENTS.find((e) => e.id === 'egg')!;
    egg.options[0].run(run);
    expect(run.team.length).toBe(2);
  });
  it('events do not repeat until every one has been seen', () => {
    const run = startRun(mkMeta(), 'emberkit', 5);
    const ids = EVENTS.map(() => rollEvent(run).id);
    expect(new Set(ids).size).toBe(EVENTS.length);
  });
  it('the stone circle trades a bench creature for a star', () => {
    const run = startRun(mkMeta(), 'emberkit', 6);
    const benched = createCreature('mossling', 3);
    run.bench.push(benched);
    EVENTS.find((e) => e.id === 'circle')!.options[0].run(run, benched);
    expect(run.bench).not.toContain(benched);
    expect(run.team[0].stars).toBe(1);
  });
});

describe('starting moves', () => {
  it('no creature starts with a heavy or multi-hit special', () => {
    for (const sp of SPECIES) {
      const c = createCreature(sp.id, 1);
      for (const m of c.moves) {
        expect(MOVES[m.id].recoil ?? 0).toBe(0);
        expect(MOVES[m.id].hits ?? 1).toBe(1);
      }
    }
  });
});

describe('passive unlocks', () => {
  const fresh = (): Meta => ({ unlockedStarters: [...DEFAULT_STARTERS], unlockedPassives: ['mentor'], equippedPassive: null, runs: 0, wins: 0, dex: emptyDex(), coinsSpent: 0, bossesDefeated: 0, clearedMaps: [], lastMap: 'wildlands', stats: emptyStats(), achievements: [], newAchievements: [] });
  it('come from achievements, earnable without winning', () => {
    const meta = fresh();
    const run = startRun(meta, 'emberkit', 2);
    clearFloor(run);
    clearFloor(run);
    expect(meta.unlockedPassives).toEqual(['mentor']); // bosses alone unlock nothing
    for (let i = 0; i < 10; i++) catchCreature(run, createCreature('mossling', 2)) && run.bench.splice(0) && run.team.splice(1);
    expect(meta.unlockedPassives).toContain('scout'); // Collector: 10 catches, no win needed
    expect(meta.newAchievements).toContain('collector');
    expect(clearFloor(run)).toBe(true);
    expect(meta.unlockedPassives).toContain('champion');
  });
  it('new passives take effect at run start', () => {
    const meta = fresh();
    meta.unlockedPassives.push('champion', 'evolutionist');
    meta.equippedPassive = 'champion';
    expect(startRun(meta, 'emberkit', 1).team[0].level).toBe(10);
    meta.equippedPassive = 'evolutionist';
    expect(startRun(meta, 'emberkit', 1).evoStones).toBe(1);
  });
});

describe('starter unlocks', () => {
  it('catching a species unlocks it as a starter immediately; bosses do not', () => {
    const meta: Meta = { unlockedStarters: [...DEFAULT_STARTERS], unlockedPassives: ['mentor'], equippedPassive: null, runs: 0, wins: 0, dex: emptyDex(), coinsSpent: 0, bossesDefeated: 0, clearedMaps: [], lastMap: 'wildlands', stats: emptyStats(), achievements: [], newAchievements: [] };
    const run = startRun(meta, 'emberkit', 8);
    clearFloor(run);
    expect(meta.unlockedStarters).toEqual(DEFAULT_STARTERS);
    catchCreature(run, createCreature('gloomkit', 3));
    expect(meta.unlockedStarters).toContain('gloomkit');
  });
});

describe('more passives', () => {
  const fresh = (): Meta => ({ unlockedStarters: [...DEFAULT_STARTERS], unlockedPassives: ['mentor'], equippedPassive: null, runs: 0, wins: 0, dex: emptyDex(), coinsSpent: 0, bossesDefeated: 0, clearedMaps: [], lastMap: 'wildlands', stats: emptyStats(), achievements: [], newAchievements: [] });
  it('every passive except Mentor has exactly one achievement', async () => {
    const { ACHIEVEMENTS } = await import('../src/logic/achievements');
    const { PASSIVES } = await import('../src/logic/run');
    for (const id of Object.keys(PASSIVES)) {
      const n = ACHIEVEMENTS.filter((a) => a.passive === id).length;
      expect(n).toBe(id === 'mentor' ? 0 : 1);
    }
  });
  it('coin purse, bodyguard and lucky odds work', async () => {
    const { promoteBench, luckyOdds } = await import('../src/logic/run');
    const meta = fresh();
    meta.equippedPassive = 'coinpurse';
    expect(startRun(meta, 'emberkit', 1).coins).toBe(50);
    meta.equippedPassive = 'bodyguard';
    const run = startRun(meta, 'emberkit', 1);
    const b = createCreature('mossling', 5);
    b.hp = 1;
    run.bench.push(b);
    run.team[0].hp = 0;
    expect(promoteBench(run)).toBe(true);
    expect(run.team[0].hp).toBe(stats(run.team[0]).hp);
    expect(meta.stats.wipes).toBe(1);
    run.passive = 'lucky';
    expect(luckyOdds(run)).toBe(0.75);
  });
});

describe('bosses and trainers', () => {
  const mk = (id: string, level = 30) => {
    const c = createCreature(id, level);
    c.hp = stats(c).hp;
    return c;
  };
  const anyOf = (el: Element) => SPECIES.find((s) => s.types[0] === el && s.types[1] === el)!.id;

  it('has a boss for every element', () => {
    for (const el of ELEMENTS) expect(BOSSES[el].element).toBe(el);
  });

  it('miasma poisons and whiteout slows creatures as they enter', () => {
    const b = new Battle([mk(anyOf('Water'))], [mk(anyOf('Toxic'))], new Rng(1), { rule: 'miasma' });
    b.start();
    expect(b.p.status).toBe('poison');
    const w = new Battle([mk(anyOf('Water'))], [mk(anyOf('Frost'))], new Rng(1), { rule: 'whiteout' });
    w.start();
    expect(w.p.spdStage).toBe(-1);
  });

  it('pride buffs only the ace, bulwark buffs every boss creature', () => {
    const team = () => [mk(anyOf('Dragon')), mk(anyOf('Dragon'))];
    const p = new Battle([mk(anyOf('Water'))], team(), new Rng(1), { rule: 'pride' });
    p.start();
    expect(p.e.atkStage).toBe(0);
    const bw = new Battle([mk(anyOf('Water'))], team(), new Rng(1), { rule: 'bulwark' });
    bw.start();
    expect(bw.e.defStage).toBe(1);
  });

  it('thorns hurt the attacker and scorch spares Fire types', () => {
    const me = mk(anyOf('Water'), 40);
    const t = new Battle([me], [mk(anyOf('Nature'), 40)], new Rng(3), { rule: 'thorns', enemyRandomness: 0 });
    const atk = me.moves.findIndex((m) => moveDef(m).kind === 'attack');
    const before = me.hp;
    t.takeTurn({ kind: 'move', index: atk });
    expect(me.hp).toBeLessThan(before);
    const scorched = (lead: string) => {
      const c = mk(lead, 40);
      const sc = new Battle([c], [mk(anyOf('Earth'), 40)], new Rng(3), { rule: 'scorch', ruleName: 'Scorched Ground' });
      const ev = sc.takeTurn({ kind: 'move', index: c.moves.findIndex((m) => moveDef(m).kind === 'attack') });
      return ev.some((e) => e.kind === 'text' && e.text.includes('is scorched'));
    };
    expect(scorched(anyOf('Water'))).toBe(true);
    expect(scorched(anyOf('Fire'))).toBe(false);
  });

  it('trainer battles pay far more than wild ones and boss teams match their element', () => {
    const foes = [mk(anyOf('Fire'), 20)];
    expect(Math.abs(battleXp(foes, 'elite', 0) - battleXp(foes, 'battle', 0) * 3)).toBeLessThanOrEqual(2);
    expect(battleCoins(foes, 'elite')).toBe(battleCoins(foes, 'battle') * 4);
    const run = startRun(mkMetaBoss(), SPECIES[0].id, 9);
    const boss = run.map.nodes[run.map.bossId];
    for (const e of makeEncounter(run, boss)) expect(SPECIES_BY_ID[e.speciesId].types).toContain(run.biomes[0]);
  });
});

function mkMetaBoss(): Meta {
  return {
    unlockedStarters: [], unlockedPassives: [], equippedPassive: null, runs: 0, wins: 0,
    dex: { forms: [], moves: [], elements: [], caught: [] }, coinsSpent: 0, bossesDefeated: 0, clearedMaps: [],
    lastMap: 'wildlands', stats: emptyStats(), achievements: [], newAchievements: [],
  };
}

describe('move animations match their names', () => {
  const styleOf = (name: string) => moveStyle(Object.values(MOVES).find((m) => m.name === name)!);
  it('picks the animation from the move name', () => {
    expect(styleOf('Venom Fang')).toBe('bite');
    expect(styleOf('Tsunami')).toBe('wave');
    expect(styleOf('Thunder Crash')).toBe('bolt');
    expect(styleOf('Wave Crash')).toBe('wave');
    expect(styleOf('Tusk Lance')).toBe('dash');
    expect(styleOf('Quake')).toBe('quake');
    expect(styleOf('Ember Pounce')).toBe('leap');
    expect(styleOf('Stone Skin')).toBe('shield');
    expect(styleOf('Photosynthesis')).toBe('mend');
  });
  it('gives nearly every move a named animation', () => {
    const generic = Object.values(MOVES).filter((m) => moveStyle(m) === 'element').map((m) => m.name);
    expect(generic.length).toBeLessThanOrEqual(3);
  });
  it('signature moves named like attacks are attacks', () => {
    for (const m of Object.values(MOVES)) {
      if (!m.signature) continue;
      if (/Cannon|Crush|Strike|Ray|Breath|Blast|Surge|Tunnel|Arc/.test(m.name)) expect(m.kind).toBe('attack');
    }
  });
});

describe('wild creatures are left at 1 HP to catch', () => {
  const mk = (id: string, level: number) => {
    const c = createCreature(id, level);
    c.hp = stats(c).hp;
    return c;
  };
  const atk = (c: ReturnType<typeof mk>) => c.moves.findIndex((m) => moveDef(m).kind === 'attack');

  it('stops the last wild creature at 1 HP and ends the battle', () => {
    const me = mk(SPECIES[0].id, 60);
    const wild = mk(SPECIES[5].id, 2);
    const b = new Battle([me], [wild], new Rng(4), { spareLast: true });
    for (let t = 0; t < 10 && b.outcome() === 'ongoing'; t++) b.takeTurn({ kind: 'move', index: atk(me) });
    expect(b.outcome()).toBe('win');
    expect(b.spared).toBe(true);
    expect(wild.hp).toBe(1);
  });

  it('only spares the last one: earlier wild creatures faint normally', () => {
    const me = mk(SPECIES[0].id, 60);
    const first = mk(SPECIES[5].id, 2);
    const second = mk(SPECIES[9].id, 2);
    const b = new Battle([me], [first, second], new Rng(4), { spareLast: true });
    for (let t = 0; t < 20 && b.outcome() === 'ongoing'; t++) b.takeTurn({ kind: 'move', index: atk(me) });
    expect(first.hp).toBe(0);
    expect(second.hp).toBe(1);
    expect(b.outcome()).toBe('win');
  });

  it('trainer and boss creatures still faint', () => {
    const me = mk(SPECIES[0].id, 60);
    const foe = mk(SPECIES[5].id, 2);
    const b = new Battle([me], [foe], new Rng(4));
    for (let t = 0; t < 10 && b.outcome() === 'ongoing'; t++) b.takeTurn({ kind: 'move', index: atk(me) });
    expect(foe.hp).toBe(0);
    expect(b.spared).toBe(false);
  });
});

describe('caught creatures keep their level and evolution', () => {
  const meta = (): Meta => ({
    unlockedStarters: [], unlockedPassives: [], equippedPassive: null, runs: 0, wins: 0,
    dex: { forms: [], moves: [], elements: [], caught: [] }, coinsSpent: 0, bossesDefeated: 0, clearedMaps: [],
    lastMap: 'wildlands', stats: emptyStats(), achievements: [], newAchievements: [],
  });
  it('joins at the same level, stage and moves, at partial HP', () => {
    const run = startRun(meta(), 'emberkit', 11);
    const wild = createCreature('frostling', 40, 1);
    wild.hp = 1;
    const { c } = catchCreature(run, wild)!;
    expect(c.level).toBe(40);
    expect(c.stage).toBe(1);
    expect(c.moves.map((m) => m.id)).toEqual(wild.moves.map((m) => m.id));
    expect(c.uid).not.toBe(wild.uid);
    expect(c.hp).toBe(Math.round(stats(c).hp * BALANCE.catchHp)); // still recovering from the fight
  });
  it('Scout adds 3 levels, never past the level cap', () => {
    const run = startRun({ ...meta(), equippedPassive: 'scout', unlockedPassives: ['scout'] }, 'emberkit', 12);
    run.passive = 'scout';
    expect(catchCreature(run, createCreature('frostling', 10))!.c.level).toBe(13);
    const capped = catchCreature(run, createCreature('frostling', 30))!.c; // stage 1 cap is 30
    expect(capped.level).toBe(levelCap(capped));
  });
});

describe('learn-move recommendation', () => {
  const buff = Object.values(MOVES).find((m) => m.kind === 'buff')!.id;
  it('suggests forgetting the weakest same-element attack for a stronger one', () => {
    const c = createCreature('emberkit', 30);
    c.moves = [{ id: attackId('Fire', 0), tier: 1 }, { id: attackId('Fire', 1), tier: 1 }, { id: attackId('Fire', 2), tier: 1 }, { id: buff, tier: 1 }];
    expect(recommendForget(c, attackId('Fire', 3))).toBe(0);
  });
  it('suggests not learning a move that is worse than everything', () => {
    const c = createCreature('emberkit', 30);
    c.moves = [{ id: attackId('Fire', 3), tier: 3 }, { id: attackId('Fire', 2), tier: 3 }, { id: attackId('Water', 3), tier: 3 }, { id: buff, tier: 3 }];
    expect(recommendForget(c, attackId('Fire', 0))).toBeNull();
  });
  it('never suggests dropping the only attack for a status move', () => {
    const c = createCreature('emberkit', 30);
    const buffs = Object.values(MOVES).filter((m) => m.kind === 'buff').map((m) => m.id);
    c.moves = [{ id: attackId('Fire', 0), tier: 1 }, { id: buffs[0], tier: 1 }, { id: buffs[1], tier: 1 }, { id: buffs[2], tier: 1 }];
    expect(recommendForget(c, buffs[3])).not.toBe(0);
  });
});

describe('held items', () => {
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
    lastMap: 'wildlands', stats: emptyStats(), achievements: [], newAchievements: [],
  });
  const fighter = (held?: import('../src/data/held').HeldId) => {
    const c = createCreature('emberkit', 30);
    c.held = held;
    return c;
  };
  const avgDamage = (atk?: import('../src/data/held').HeldId, def?: import('../src/data/held').HeldId) => {
    let total = 0;
    for (let s = 0; s < 40; s++) {
      const a = fighter(atk);
      const d = createCreature('mossling', 30);
      d.held = def;
      d.hp = 100000;
      const b = new Battle([a], [d], new Rng(s));
      const ev = b.takeTurn({ kind: 'move', index: 0 });
      total += ev.filter((e) => e.kind === 'damage' && e.side === 'enemy').reduce((n, e) => n + (e.kind === 'damage' ? e.amount : 0), 0);
    }
    return total;
  };
  it('Power Band hits harder and Hard Shell takes less', () => {
    const base = avgDamage();
    expect(avgDamage('band')).toBeGreaterThan(base * 1.08);
    expect(avgDamage(undefined, 'shell')).toBeLessThan(base * 0.92);
  });
  it('Last Stand Sash survives one knockout blow from full HP', () => {
    const p = createCreature('emberkit', 60);
    const e = createCreature('mossling', 2);
    e.held = 'sash';
    e.hp = stats(e).hp;
    const b = new Battle([p], [e], new Rng(2));
    const ev = b.takeTurn({ kind: 'move', index: 0 });
    expect(ev.some((x) => x.kind === 'text' && x.text.includes('Last Stand Sash'))).toBe(true);
    expect(e.hp).toBeGreaterThanOrEqual(0);
  });
  it('items move between the bag and creatures, and come back when a creature falls', () => {
    const run = startRun(mkMeta(), 'emberkit', 9);
    const c = run.team[0];
    stash(run, 'band');
    stash(run, 'egg');
    equipHeld(run, c, 'band');
    expect(c.held).toBe('band');
    equipHeld(run, c, 'egg');
    expect(c.held).toBe('egg');
    expect(run.bag).toEqual(['band']);
    c.hp = 0;
    buryFallen(run);
    expect(run.bag!.sort()).toEqual(['band', 'egg']);
  });
  it('Lucky Egg earns more XP', () => {
    const run = startRun(mkMeta(), 'emberkit', 10);
    const a = run.team[0];
    const b = createCreature('emberkit', a.level);
    run.team.push(b);
    b.held = 'egg';
    const res = grantXp(run, 100);
    expect(res[1].xp).toBeGreaterThan(res[0].xp);
  });
});

describe('heat', () => {
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
    lastMap: 'wildlands', stats: emptyStats(), achievements: [], newAchievements: [],
  });
  it('a run never starts above the unlocked heat', () => {
    const meta = mkMeta();
    meta.heat = 5;
    expect(startRun(meta, 'emberkit', 1).heat).toBe(0);
    meta.heatUnlocked = 3;
    expect(startRun(meta, 'emberkit', 1).heat).toBe(3);
  });
  it('winning at your top heat unlocks the next one', () => {
    const meta = mkMeta();
    const run = startRun(meta, 'emberkit', 2);
    run.floor = 2;
    expect(clearFloor(run)).toBe(true);
    expect(meta.heatUnlocked).toBe(1);
    const run2 = startRun(meta, 'emberkit', 3);
    run2.floor = 2;
    clearFloor(run2); // played at heat 0 again: no new unlock
    expect(meta.heatUnlocked).toBe(1);
  });
  it('heat raises enemy levels and prices', () => {
    const meta = mkMeta();
    meta.heatUnlocked = 8;
    const lv = (heat: number) => {
      meta.heat = heat;
      const run = startRun(meta, 'emberkit', 4);
      const node = Object.values(run.map.nodes).find((n) => n.kind === 'battle')!;
      return { level: makeEncounter(run, node)[0].level, price: rollShop(run).slots[0].price };
    };
    const cold = lv(0);
    const hot = lv(8);
    expect(hot.level).toBe(cold.level + 2);
    expect(hot.price).toBeGreaterThan(cold.price);
  });
});

describe('daily run', () => {
  const mkMeta = (): Meta => ({
    unlockedStarters: [...DEFAULT_STARTERS],
    unlockedPassives: [],
    equippedPassive: 'champion',
    runs: 0,
    wins: 0,
    dex: emptyDex(),
    coinsSpent: 0,
    bossesDefeated: 0,
    clearedMaps: [],
    lastMap: 'tidal', stats: emptyStats(), achievements: [], newAchievements: [],
    heatUnlocked: 4, heat: 4,
  });
  it('is the same for everyone on a given day, and differs between days', () => {
    expect(dailyStarters('2026-11-16')).toEqual(dailyStarters('2026-11-16'));
    expect(dailyStarters('2026-11-16')).not.toEqual(dailyStarters('2026-11-17'));
    const a = startRun(mkMeta(), dailyStarters('2026-11-16')[0], dailySeed('2026-11-16'), 'wildlands', '2026-11-16');
    const b = startRun(mkMeta(), dailyStarters('2026-11-16')[0], dailySeed('2026-11-16'), 'wildlands', '2026-11-16');
    expect(a.biomes).toEqual(b.biomes);
    expect(JSON.stringify(a.map)).toBe(JSON.stringify(b.map));
  });
  it('ignores passives, heat and the last map', () => {
    const meta = mkMeta();
    const run = startRun(meta, 'emberkit', dailySeed('2026-11-16'), 'wildlands', '2026-11-16');
    expect(run.passive).toBeNull();
    expect(run.heat).toBe(0);
    expect(run.team[0].level).toBe(BALANCE.starterLevel);
    expect(meta.lastMap).toBe('tidal');
  });
  it('keeps the best result of the day', () => {
    const meta = mkMeta();
    const run = startRun(meta, 'emberkit', dailySeed('2026-11-16'), 'wildlands', '2026-11-16');
    run.floor = 1;
    run.log.battlesWon = 9;
    expect(recordDaily(run, false)).toBe(true);
    const worse = startRun(meta, 'emberkit', dailySeed('2026-11-16'), 'wildlands', '2026-11-16');
    worse.log.battlesWon = 30;
    expect(recordDaily(worse, false)).toBe(false);
    expect(meta.daily!.best!.floor).toBe(1);
    expect(meta.daily!.attempts).toBe(2);
  });
});

describe('potions', () => {
  it('a potion in battle heals the chosen creature and the enemy still acts', () => {
    const p = createCreature('emberkit', 20);
    p.hp = 10;
    const e = createCreature('mossling', 20);
    const b = new Battle([p], [e], new Rng(4));
    const ev = b.takeTurn({ kind: 'potion', index: 0, heal: 0.5 });
    expect(ev.some((x) => x.kind === 'heal' && x.side === 'player')).toBe(true);
    expect(ev.some((x) => x.kind === 'attack' && x.side === 'enemy')).toBe(true);
  });
  it('shop potions go into the pouch, which holds five', () => {
    const run = startRun(
      { unlockedStarters: ['emberkit'], unlockedPassives: [], equippedPassive: null, runs: 0, wins: 0, dex: emptyDex(), coinsSpent: 0, bossesDefeated: 0, clearedMaps: [], lastMap: 'wildlands', stats: emptyStats(), achievements: [], newAchievements: [] },
      'emberkit',
      1,
    );
    const slot = { item: 'potion' as const, price: 0, sold: false };
    for (let i = 0; i < 5; i++) applyItem(run, slot);
    expect(run.potions).toBe(5);
    expect(unusableReason(run, slot)).toMatch(/full/);
  });
});

describe('pixel icons', () => {
  it('every icon grid fits its canvas and uses palette colors', async () => {
    const { iconProblems } = await import('../src/ui/icons');
    expect(iconProblems()).toEqual([]);
  });
});

describe('team synergy', () => {
  it('two or more creatures sharing an element boost that stat for the team', async () => {
    const { teamSynergy, synergyMults } = await import('../src/logic/synergy');
    const fire = SPECIES.filter((s) => s.types[0] === 'Fire' && s.types[1] === 'Fire');
    const team = [createCreature(fire[0].id, 5), createCreature(fire[1].id, 5)];
    expect(teamSynergy(team)).toEqual([{ element: 'Fire', count: 2, stat: 'atk', bonus: 0.06 }]);
    team.push(createCreature(fire[2].id, 5));
    expect(synergyMults(team).atk).toBeCloseTo(1.12);
    expect(synergyMults(team, 2).atk).toBeCloseTo(1.24);
    expect(teamSynergy([createCreature(fire[0].id, 5)])).toEqual([]);
  });
  it('synergy makes your attacks hit harder', () => {
    let plain = 0;
    let boosted = 0;
    for (let s = 0; s < 30; s++) {
      for (const syn of [undefined, { atk: 1.2, def: 1, spd: 1 }]) {
        const d = createCreature('mossling', 30);
        d.hp = 100000;
        const b = new Battle([createCreature('emberkit', 30)], [d], new Rng(s), { synergy: syn });
        const dmg = b.takeTurn({ kind: 'move', index: 0 }).reduce((n, e) => n + (e.kind === 'damage' && e.side === 'enemy' ? e.amount : 0), 0);
        if (syn) boosted += dmg;
        else plain += dmg;
      }
    }
    expect(boosted).toBeGreaterThan(plain * 1.1);
  });
  it('Tempered creatures shrug off burn and poison', () => {
    const p = createCreature('mossling', 20);
    const e = createCreature('emberkit', 20);
    const b = new Battle([p], [e], new Rng(1), { rule: 'miasma', ruleName: 'Miasma', playerStatusImmune: ['burn', 'poison'] });
    b.start();
    expect(b.p.status).toBeNull();
  });
});

describe('boss synergy and status length', () => {
  it('enemy synergy toughens the enemy side', () => {
    let plain = 0;
    let tough = 0;
    for (let s = 0; s < 30; s++) {
      for (const syn of [undefined, { atk: 1, def: 1.2, spd: 1 }]) {
        const d = createCreature('mossling', 30);
        d.hp = 100000;
        const b = new Battle([createCreature('emberkit', 30)], [d], new Rng(s), { enemySynergy: syn });
        const dmg = b.takeTurn({ kind: 'move', index: 0 }).reduce((n, e) => n + (e.kind === 'damage' && e.side === 'enemy' ? e.amount : 0), 0);
        if (syn) tough += dmg;
        else plain += dmg;
      }
    }
    expect(tough).toBeLessThan(plain * 0.92);
  });
  it('statuses last 3 to 5 turns', async () => {
    const { STATUS } = await import('../src/data/status');
    for (const def of Object.values(STATUS)) expect(def.turns).toEqual([3, 5]);
  });
});

describe('lasting statuses', () => {
  it('a status carries into the next battle and its timer keeps counting', () => {
    const p = createCreature('mossling', 20);
    p.status = { id: 'poison', turns: 3 };
    const e = createCreature('emberkit', 5);
    e.hp = 100000;
    const b = new Battle([p], [e], new Rng(3));
    expect(b.p.status).toBe('poison');
    b.takeTurn({ kind: 'move', index: 0 });
    expect(p.status?.turns).toBe(2);
    b.takeTurn({ kind: 'move', index: 0 });
    b.takeTurn({ kind: 'move', index: 0 });
    expect(p.status).toBeUndefined();
  });
  it('switching out no longer cures; a potion does', () => {
    const a = createCreature('mossling', 20);
    const c2 = createCreature('mossling', 20);
    a.status = { id: 'burn', turns: 5 };
    const e = createCreature('emberkit', 5);
    const b = new Battle([a, c2], [e], new Rng(3));
    b.takeTurn({ kind: 'swap', index: 1 });
    expect(a.status?.id).toBe('burn');
    b.takeTurn({ kind: 'potion', index: 0, heal: 0.5 });
    expect(a.status).toBeUndefined();
  });
});

describe('statuses off the field', () => {
  it('benched and waiting creatures keep taking status damage and their timers run, but never faint from it', () => {
    const active = createCreature('mossling', 20);
    const waiting = createCreature('mossling', 20);
    const benched = createCreature('mossling', 20);
    waiting.status = { id: 'poison', turns: 2 };
    benched.status = { id: 'burn', turns: 9 };
    benched.hp = 2;
    const e = createCreature('emberkit', 5);
    e.hp = 100000;
    const b = new Battle([active, waiting], [e], new Rng(3), { reserve: [benched] });
    const before = waiting.hp;
    b.takeTurn({ kind: 'move', index: 0 });
    expect(waiting.hp).toBeLessThan(before);
    expect(waiting.status?.turns).toBe(1);
    b.takeTurn({ kind: 'move', index: 0 });
    expect(waiting.status).toBeUndefined();
    expect(benched.hp).toBe(1);
    expect(benched.status?.turns).toBe(7);
  });
});

describe('creature cries', () => {
  it('every form has its own deterministic cry, and evolutions are deeper and longer', async () => {
    const { voiceFor, voiceLength, faintVoice } = await import('../src/data/cries');
    const sigs = new Set<string>();
    for (const sp of SPECIES) {
      const v0 = voiceFor(sp.id, sp.types, 0);
      expect(voiceFor(sp.id, sp.types, 0)).toEqual(v0);
      const v2 = voiceFor(sp.id, sp.types, 2);
      expect(v2.syllables[0].f[0]).toBeLessThan(v0.syllables[0].f[0]);
      expect(voiceLength(v2)).toBeGreaterThan(voiceLength(v0));
      expect(voiceLength(faintVoice(v0))).toBeGreaterThan(voiceLength(v0));
      sigs.add(JSON.stringify(v0.syllables));
    }
    expect(sigs.size).toBe(SPECIES.length);
  });
});

describe('favorite line', () => {
  const meta = (): Meta => ({
    unlockedStarters: ['emberkit', 'frostling', 'sproutle', 'pebblin', 'zapling', 'puddlet'],
    unlockedPassives: [],
    equippedPassive: null,
    runs: 0,
    wins: 0,
    dex: emptyDex(),
    coinsSpent: 0,
    bossesDefeated: 0,
    clearedMaps: [],
    lastMap: 'wildlands', stats: emptyStats(), achievements: [], newAchievements: [],
  });
  it('the favorite is always one of three different starter choices', () => {
    const m = meta();
    expect(toggleFavorite(m, 'puddlet')).toBe(true);
    for (let s = 1; s <= 40; s++) {
      const picks = rollStarterChoices(m, new Rng(s));
      expect(picks).toHaveLength(3);
      expect(picks).toContain('puddlet');
      expect(new Set(picks).size).toBe(3);
    }
  });
  it('only unlocked lines can be favorites, and tapping again clears it', () => {
    const m = meta();
    expect(toggleFavorite(m, 'drakelet')).toBe(false);
    expect(m.favorite).toBeUndefined();
    toggleFavorite(m, 'emberkit');
    toggleFavorite(m, 'emberkit');
    expect(m.favorite).toBeUndefined();
  });
});
