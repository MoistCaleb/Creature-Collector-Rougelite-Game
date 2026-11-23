import { beforeEach, describe, expect, it } from 'vitest';
import { BOON_LIST, BOONS } from '../src/data/boons';
import { DEFAULT_STARTERS } from '../src/data/species';
import { emptyStats } from '../src/logic/achievements';
import { Battle } from '../src/logic/battle';
import { guardianBoonLevels, hasBoon, openOffer, rollOffer, runBoons, takeBoon, teamMax } from '../src/logic/boons';
import { createCreature, setFloorCeiling, stats, type Creature } from '../src/logic/creature';
import { emptyDex } from '../src/logic/dex';
import { generateFloor } from '../src/logic/map';
import { Rng } from '../src/logic/rng';
import { startRun, type Meta } from '../src/logic/run';
import { silenceTrait, traitsOf } from '../src/data/traits';

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

/** A Hexling with a trait that does nothing in a plain fight (so traits don't muddy the numbers). */
function mon(id: string, level = 30): Creature {
  const c = createCreature(id, level);
  const calm = (['scout', 'lucky', 'catcher', 'treasure', 'forager', 'mentor', 'gilded', 'kindred', 'healtouch'] as const).find((t) => traitsOf(id).includes(t));
  if (calm) c.trait = calm;
  else silenceTrait(c);
  return c;
}

/** One attack (move 0) from `p` at `e`, with these boons on the player's side. */
function hit(p: Creature, e: Creature, move: string, boons: string[], seed = 5) {
  p.moves = [{ id: move, tier: 1 }];
  e.moves = [{ id: 'Neutral:warp', tier: 1 }];
  const b = new Battle([p], [e], new Rng(seed), { permadeath: false, boons: { player: boons, enemy: [] } });
  const ev = b.start();
  const before = e.hp;
  ev.push(...b.takeDuelTurn({ kind: 'move', index: 0 }, { kind: 'potion', index: 0, heal: 0 }));
  // Only the attack's own hits (not a burn tick after it).
  const hits = ev.filter((x) => x.kind === 'damage' && x.side === 'enemy' && x.mult !== undefined).reduce((t, x) => t + (x as { amount: number }).amount, 0);
  void before;
  return { b, dealt: hits, ev };
}

describe('boon data', () => {
  it('63 boons: 36 element ones (more for the weaker elements), 14 general, 5 mythic, 8 curses', () => {
    expect(BOON_LIST.length).toBe(63);
    const count = (f: (b: (typeof BOON_LIST)[number]) => boolean) => BOON_LIST.filter(f).length;
    expect(count((b) => !!b.element)).toBe(36);
    expect(count((b) => !b.element && b.rarity === 'common')).toBe(14);
    expect(count((b) => b.rarity === 'mythic')).toBe(5);
    expect(count((b) => b.rarity === 'curse')).toBe(8);
    const per = (el: string) => count((b) => b.element === el);
    for (const el of ['Fire', 'Frost', 'Toxic', 'Spirit']) expect(per(el)).toBe(4);
    for (const el of ['Earth', 'Dragon', 'Light', 'Metal']) expect(per(el)).toBe(2);
    for (const b of BOON_LIST.filter((x) => x.rarity === 'curse')) expect(b.drawback && b.reward).toBeTruthy();
    expect(new Set(BOON_LIST.map((b) => b.id)).size).toBe(63);
  });
});

describe('boon offers', () => {
  it('are seeded, follow the slot rules and never repeat a boon you hold', () => {
    for (let seed = 1; seed < 40; seed++) {
      const run = startRun(mkMeta(), 'emberkit', seed);
      const a = rollOffer(run, 'x');
      expect(rollOffer(run, 'x')).toEqual(a);
      expect(a.length).toBe(run.surprises?.omen === 'bloodmoon' ? 4 : 3);
      // Slot 1: an element boon for an element on your team.
      expect(BOONS[a[0]].element).toBe('Fire');
      // Slot 2 is never a curse; slot 3 sometimes is.
      expect(BOONS[a[1]].rarity).not.toBe('curse');
      runBoons(run).held.push(...a.filter((id) => BOONS[id].rarity !== 'curse'));
      for (const id of rollOffer(run, 'y')) expect(runBoons(run).held).not.toContain(id);
    }
  });

  it('a curse costs you and pays you: Bankrupt empties your coins and offers mythics', () => {
    const run = startRun(mkMeta(), 'emberkit', 3);
    run.coins = 250;
    runBoons(run).offer = { ids: ['bankrupt'], picks: 1, mode: 'normal', tag: 't' };
    takeBoon(run, 'bankrupt');
    expect(run.coins).toBe(0);
    expect(runBoons(run).offer!.mode).toBe('mythic');
    for (const id of runBoons(run).offer!.ids) expect(['mythic', 'rare']).toContain(BOONS[id].rarity);
  });

  it('Pact cuts max HP and turns later offers rare; Blood Price lets you take two', () => {
    const run = startRun(mkMeta(), 'emberkit', 4);
    const max = stats(run.team[0]).hp;
    runBoons(run).offer = { ids: ['pact', 'bloodprice'], picks: 1, mode: 'normal', tag: 't' };
    takeBoon(run, 'pact');
    expect(stats(run.team[0]).hp).toBeLessThan(max * 0.8);
    expect(openOffer(run, 'g')!.mode).toBe('rare');
    runBoons(run).offer = { ids: ['bloodprice'], picks: 1, mode: 'normal', tag: 't' };
    takeBoon(run, 'bloodprice');
    expect(runBoons(run).offer!.picks).toBe(2);
    expect(hasBoon(run, 'bloodprice')).toBe(true);
  });

  it('guardians gain a level per boon held (curses aside), +5 when Marked; Glass Menagerie keeps 3', () => {
    const run = startRun(mkMeta(), 'emberkit', 5);
    runBoons(run).held.push('kindling', 'prospector', 'bloodprice');
    expect(guardianBoonLevels(run)).toBe(2);
    runBoons(run).held.push('marked');
    expect(guardianBoonLevels(run)).toBe(7);
    expect(teamMax(run)).toBe(4);
    runBoons(run).offer = { ids: ['glassmenagerie'], picks: 1, mode: 'normal', tag: 't' };
    takeBoon(run, 'glassmenagerie');
    expect(teamMax(run)).toBe(3);
  });

  it('about half the floors have a Boon hex', () => {
    let floors = 0;
    let withHex = 0;
    for (let seed = 1; seed < 120; seed++)
      for (let f = 0; f < 3; f++) {
        floors++;
        const m = generateFloor(f, 'Fire', seed * 7919);
        const n = Object.values(m.nodes).filter((x) => x.kind === 'boon').length;
        expect(n).toBeLessThanOrEqual(1);
        withHex += n;
      }
    expect(withHex / floors).toBeGreaterThan(0.3);
    expect(withHex / floors).toBeLessThan(0.7);
  });
});

describe('boons in battle', () => {
  it('Glass Menagerie: +40% damage', () => {
    const plain = hit(mon('emberkit'), mon('pebblin', 60), 'Fire:2', []).dealt;
    const glass = hit(mon('emberkit'), mon('pebblin', 60), 'Fire:2', ['glassmenagerie']).dealt;
    expect(glass / plain).toBeCloseTo(1.4, 1);
  });

  it('Bedrock halves the first hit your Hexling takes', () => {
    const p = mon('pebblin', 30);
    const e = mon('emberkit', 30);
    const mk = (boons: string[]) => {
      const a = mon('pebblin', 30);
      const b = mon('emberkit', 30);
      a.moves = [{ id: 'Neutral:warp', tier: 1 }];
      b.moves = [{ id: 'Water:2', tier: 1 }];
      const bt = new Battle([a], [b], new Rng(7), { permadeath: false, boons: { player: boons, enemy: [] } });
      bt.start();
      const before = a.hp;
      bt.takeDuelTurn({ kind: 'potion', index: 0, heal: 0 }, { kind: 'move', index: 0 });
      return before - a.hp;
    };
    void p;
    void e;
    expect(mk(['bedrock']) / mk([])).toBeCloseTo(0.5, 1);
  });

  it('Phantom Step dodges the first attack on a Spirit Hexling, and the callout fires', () => {
    const { dealt, ev } = hit(mon('emberkit'), mon('wispling', 40), 'Fire:2', [], 3);
    expect(dealt).toBeGreaterThan(0);
    const a = mon('wispling', 40);
    const b = mon('emberkit', 30);
    a.moves = [{ id: 'Neutral:warp', tier: 1 }];
    b.moves = [{ id: 'Fire:2', tier: 1 }];
    const bt = new Battle([a], [b], new Rng(3), { permadeath: false, boons: { player: ['phantomstep'], enemy: [] } });
    bt.start();
    const before = a.hp;
    const ev2 = bt.takeDuelTurn({ kind: 'potion', index: 0, heal: 0 }, { kind: 'move', index: 0 });
    expect(a.hp).toBe(before);
    expect(ev2.some((x) => x.kind === 'boon' && x.id === 'phantomstep')).toBe(true);
    void ev;
  });

  it('Plague Bearer poisons the foe at the start; Second Wind brings one back once', () => {
    const b = new Battle([mon('emberkit')], [mon('pebblin')], new Rng(1), { boons: { player: ['plaguebearer'], enemy: [] } });
    b.start();
    expect(b.e.status).toBe('poison');
    const weak = mon('emberkit', 5);
    const big = mon('puddlet', 90);
    weak.moves = [{ id: 'Neutral:warp', tier: 1 }];
    big.moves = [{ id: 'Water:2', tier: 1 }];
    let asked = 0;
    const w = new Battle([weak], [big], new Rng(2), { permadeath: false, boons: { player: ['secondwind'], enemy: [] }, secondWind: () => (asked++, true) });
    w.start();
    w.takeDuelTurn({ kind: 'potion', index: 0, heal: 0 }, { kind: 'move', index: 0 });
    expect(asked).toBe(1);
    expect(weak.hp).toBe(Math.round(stats(weak).hp * 0.3));
  });
});

describe('boons online', () => {
  it('both phones compute the same duel with each side\'s boons', async () => {
    const { duelBattle } = await import('../src/net/duel');
    const team = (ids: string[]) => ids.map((id) => {
      const c = createCreature(id, 40, 1);
      c.trait = undefined;
      return c;
    });
    const info = {
      seed: 99, hostName: 'A', guestName: 'B', hostTeam: [], guestTeam: [],
      hostCreatures: team(['emberkit', 'wispling']), guestCreatures: team(['puddlet', 'frostling']),
      hostBoons: ['ambush', 'haunting', 'kindling'], guestBoons: ['bedrock', 'phantomstep', 'undertow', 'not-a-boon'],
    };
    const h = duelBattle(info, 'host');
    const g = duelBattle(info, 'guest');
    h.start();
    g.start();
    for (let t = 0; t < 6 && h.outcome() === 'ongoing'; t++) {
      h.takeDuelTurn({ kind: 'move', index: 0 }, { kind: 'move', index: 0 });
      g.takeDuelTurn({ kind: 'move', index: 0 }, { kind: 'move', index: 0 });
      expect(h.player.map((x) => x.c.hp)).toEqual(g.enemy.map((x) => x.c.hp));
      expect(h.enemy.map((x) => x.c.hp)).toEqual(g.player.map((x) => x.c.hp));
    }
  });
});

describe('showing what triggered', () => {
  it('a trait that fires queues its callout; a damage change says why', () => {
    let checked = 0;
    for (let seed = 1; seed < 20 && checked < 3; seed++) {
      const a = mon('emberkit', 30);
      const b = createCreature('shardlet', 30);
      b.trait = 'roughskin';
      a.moves = [{ id: 'Fire:2', tier: 1 }];
      b.moves = [{ id: 'Neutral:warp', tier: 1 }];
      const bt = new Battle([a], [b], new Rng(seed), { permadeath: false, boons: { player: ['opportunist'], enemy: [] } });
      bt.start();
      bt.e.status = 'poison';
      bt.e.statusTurns = 0;
      const ev = bt.takeDuelTurn({ kind: 'move', index: 0 }, { kind: 'move', index: 0 });
      const hit = ev.find((x) => x.kind === 'damage' && x.side === 'enemy' && x.mult !== undefined);
      if (!hit || hit.kind !== 'damage') continue; // missed
      checked++;
      expect(hit.why).toContain('+30% Opportunist');
      const t = ev.findIndex((x) => x.kind === 'trait' && x.side === 'enemy' && x.id === 'roughskin');
      expect(t).toBeGreaterThan(-1);
      // The callout comes before the line it explains.
      const line = ev.findIndex((x) => x.kind === 'text' && x.text.includes('Rough Skin'));
      expect(line).toBeGreaterThan(t);
    }
    expect(checked).toBeGreaterThan(0);
  });

  it('a status a trait might cause only calls it out when it lands', () => {
    const a = mon('pebblin', 30);
    const b = createCreature('magmole', 30);
    b.trait = 'magmaskin';
    a.moves = [{ id: 'Earth:2', tier: 1 }];
    b.moves = [{ id: 'Neutral:warp', tier: 1 }];
    let burns = 0;
    for (let seed = 1; seed < 40; seed++) {
      const x = { ...a, hp: stats(a).hp };
      const y = { ...b, uid: b.uid + seed, hp: stats(b).hp };
      const bt = new Battle([x], [y], new Rng(seed), { permadeath: false });
      bt.start();
      const ev = bt.takeDuelTurn({ kind: 'move', index: 0 }, { kind: 'move', index: 0 });
      const called = ev.some((e) => e.kind === 'trait' && e.id === 'magmaskin');
      const burned = ev.some((e) => e.kind === 'text' && e.text.includes('Magma Skin'));
      expect(called).toBe(burned);
      if (burned) burns++;
    }
    expect(burns).toBeGreaterThan(0);
  });
});
