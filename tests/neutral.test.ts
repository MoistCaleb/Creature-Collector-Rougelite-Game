import { describe, expect, it } from 'vitest';
import { Battle } from '../src/logic/battle';
import { createCreature, extraMoves, NEUTRAL_LINES } from '../src/logic/creature';
import { BULWARK_ID, maxUses, MOVES, moveSummary, NEUTRAL, NEUTRAL_IDS, tollDamage, TOLL_TURNS } from '../src/data/moves';
import { moveStyle } from '../src/data/moveStyle';
import { SPECIES_BY_ID } from '../src/data/species';
import { traitOf } from '../src/data/traits';
import { Rng } from '../src/logic/rng';

const N = (k: keyof typeof NEUTRAL) => NEUTRAL[k].id;

/** One on one at Lv 30, each with the moves given (and a bench Hexling each, for switching). */
function pair(pMoves: string[], eMoves: string[], seed = 3, pId = 'pebblin', eId = 'emberkit') {
  const p = createCreature(pId, 30);
  p.moves = pMoves.map((id) => ({ id, tier: 1 }));
  const p2 = createCreature('frostling', 30);
  const e = createCreature(eId, 30);
  e.moves = eMoves.map((id) => ({ id, tier: 1 }));
  const e2 = createCreature('puddlet', 30);
  return new Battle([p, p2], [e, e2], new Rng(seed));
}
const move = (i = 0) => ({ kind: 'move' as const, index: i });
const said = (ev: { kind: string; text?: string }[], re: RegExp) => ev.some((x) => x.kind === 'text' && re.test(x.text!));

describe('Neutral moves that bend the battle', () => {
  it('every one has a summary, uses, a style and lines that learn it', () => {
    for (const id of NEUTRAL_IDS) {
      const d = MOVES[id];
      expect(d.element).toBe('Neutral');
      expect(moveSummary(d, 1).length).toBeGreaterThan(5);
      expect(maxUses(d)).toBeGreaterThan(0);
      expect(moveStyle(d)).toBeTruthy();
    }
    const taught = new Set(Object.values(NEUTRAL_LINES).flat().map(([n]) => NEUTRAL[n].id));
    for (const id of NEUTRAL_IDS) expect(taught.has(id)).toBe(true);
    for (const sp of Object.keys(NEUTRAL_LINES)) {
      expect(SPECIES_BY_ID[sp]).toBeTruthy();
      for (const [n] of NEUTRAL_LINES[sp]) expect(extraMoves(SPECIES_BY_ID[sp]).some((e) => e.id === NEUTRAL[n].id)).toBe(true);
    }
  });

  it('Jeer: the foe can only attack for a few turns', () => {
    const b = pair([N('jeer'), 'Earth:0'], ['Fire:buff', 'Fire:0']);
    b.takeDuelTurn(move(0), move(1));
    expect(b.e.jeer).toBeGreaterThan(0);
    const ev = b.takeDuelTurn(move(1), move(0));
    expect(said(ev, /too riled up to use/)).toBe(true);
    expect(b.e.atkStage).toBe(0);
    for (let i = 0; i < 4; i++) b.takeDuelTurn(move(1), move(1));
    expect(b.e.jeer).toBe(0);
  });

  it('Echo: the foe repeats its last move, and fails on a foe that has not moved', () => {
    const b = pair([N('echo'), 'Earth:0'], ['Fire:buff', 'Fire:0']);
    // Pebblin is slower: Emberkit boosts first, then gets caught in the Echo.
    b.takeDuelTurn(move(0), move(0));
    expect(b.e.echo).toBeGreaterThan(0);
    const ev = b.takeDuelTurn(move(1), move(1));
    expect(said(ev, /caught in the Echo/)).toBe(true);
    expect(ev.filter((x) => x.kind === 'attack' && x.side === 'enemy').map((x) => (x as { moveId: string }).moveId)).toEqual(['Fire:buff']);
    const fresh = pair([N('echo')], ['Fire:0'], 3, 'zapling');
    const ev2 = fresh.takeDuelTurn(move(0), move(0));
    expect(said(ev2, /hasn't used a move yet/)).toBe(true);
  });

  it('Mirror Veil goes first and bounces a Hinder move back', () => {
    const b = pair([N('veil')], ['Fire:debuff']);
    const ev = b.takeDuelTurn(move(0), move(0));
    expect((ev.find((x) => x.kind === 'attack') as { side: string }).side).toBe('player');
    expect(said(ev, /bounced it back/)).toBe(true);
    expect(b.p.defStage).toBe(0);
    expect(b.e.defStage).toBeLessThan(0);
    // ...and a bounced Jeer riles the one who used it.
    const b2 = pair([N('veil')], [N('jeer')]);
    b2.takeDuelTurn(move(0), move(0));
    expect(b2.e.jeer).toBeGreaterThan(0);
    expect(b2.p.jeer ?? 0).toBe(0);
  });

  it('Bulwark blocks the foe-aimed ones', () => {
    const b = pair([BULWARK_ID], [N('toll')]);
    b.takeDuelTurn(move(0), move(0));
    expect(b.p.toll ?? 0).toBe(0);
  });

  it('Switcheroo swaps stat changes', () => {
    const b = pair([N('swap')], ['Fire:0']);
    b.e.atkStage = 3;
    b.p.defStage = -1;
    b.takeDuelTurn(move(0), move(0));
    expect(b.p.atkStage).toBe(3);
    expect(b.e.defStage).toBe(-1);
    expect(b.e.atkStage).toBe(0);
  });

  it('Smokescreen clears stats, weather and Time Warp', () => {
    const b = pair([N('smoke')], ['Fire:0']);
    b.e.atkStage = 2;
    b.p.spdStage = -2;
    b.setWeather('sun', 4);
    b.warp = 4;
    const ev = b.takeDuelTurn(move(0), move(0));
    expect(b.e.atkStage).toBe(0);
    expect(b.p.spdStage).toBe(0);
    expect(b.weather).toBeNull();
    expect(b.warp).toBe(0);
    expect(ev.some((x) => x.kind === 'weather' && x.id === null)).toBe(true);
  });

  it('Toll rings after its countdown, unless the foe switches out', () => {
    const b = pair([N('toll'), 'Earth:buff'], ['Fire:buff']);
    b.takeDuelTurn(move(0), move(0));
    const hp = b.e.c.hp;
    let rang = false;
    for (let i = 0; i < TOLL_TURNS - 1; i++) rang = said(b.takeDuelTurn(move(1), move(0)), /toll rings/) || rang;
    expect(rang).toBe(true);
    expect(hp - b.e.c.hp).toBeGreaterThan(0);
    // Switching out leaves it behind.
    const b2 = pair([N('toll'), 'Earth:0'], ['Fire:buff']);
    b2.takeDuelTurn(move(0), move(0));
    b2.takeDuelTurn(move(1), { kind: 'swap', index: 1 });
    b2.takeDuelTurn(move(1), { kind: 'swap', index: 0 });
    expect(b2.e.toll ?? 0).toBe(0);
    expect(tollDamage(1)).toBeCloseTo(0.35);
  });

  it('Snare: no switching out, and Speed falls', () => {
    const b = pair([N('snare'), 'Earth:0'], ['Fire:0']);
    b.takeDuelTurn(move(0), move(0));
    expect(b.e.snare).toBeGreaterThan(0);
    expect(b.e.spdStage).toBe(-1);
    expect(b.canEnemySwapTo(1)).toBe(false);
    const ev = b.takeDuelTurn(move(1), { kind: 'swap', index: 1 });
    expect(b.eActive).toBe(0);
    expect(ev.some((x) => x.kind === 'enemySend')).toBe(false);
    // On your side too.
    const b2 = pair(['Earth:0'], [N('snare')]);
    b2.takeDuelTurn(move(0), move(0));
    expect(b2.canSwapTo(1)).toBe(false);
  });

  it('Hush silences the trait for a while, even on the bench', () => {
    const b = pair([N('hush'), 'Earth:0'], ['Fire:0']);
    expect(traitOf(b.e.c)).toBeTruthy();
    b.takeDuelTurn(move(0), move(0));
    const left = b.e.hush!;
    expect(left).toBeGreaterThan(0);
    b.takeDuelTurn(move(1), { kind: 'swap', index: 1 });
    expect(b.enemy[0].hush).toBe(left - 1);
  });

  it('Turn of Day flips night and day, and night ends the sun', () => {
    const b = pair([N('daynight')], ['Fire:0']);
    b.setWeather('sun', 4);
    const ev = b.takeDuelTurn(move(0), move(0));
    expect(b.night).toBe(true);
    expect(b.weather).toBeNull();
    expect(said(ev, /night falls over the battle\.$/)).toBe(true);
    const ev2 = b.takeDuelTurn(move(0), move(0));
    expect(b.night).toBe(false);
    expect(b.dawn).toBe(true);
    expect(said(ev2, /Dawn breaks over the battle\.$/)).toBe(true);
  });

  it('the effects survive a save and reload', () => {
    const b = pair([N('jeer'), N('snare')], ['Fire:buff', 'Fire:0']);
    b.takeDuelTurn(move(0), move(0));
    b.takeDuelTurn(move(1), move(1));
    const s = JSON.parse(JSON.stringify(b.saveState()));
    const b2 = pair([N('jeer'), N('snare')], ['Fire:buff', 'Fire:0']);
    b2.restoreState(s);
    expect(b2.e.jeer).toBe(b.e.jeer);
    expect(b2.e.snare).toBe(b.e.snare);
  });

  it('the AI uses them when they fit', () => {
    // A foe that boosted: Switcheroo steals it.
    const b = pair([N('swap'), 'Frost:0'], ['Fire:0']);
    b.e.atkStage = 3;
    expect(b.bestMove('player')).toBe(0);
    // Jeered: it only picks attacks.
    const j = pair(['Fire:buff', 'Earth:0'], ['Fire:0'], 3, 'emberkit');
    j.p.jeer = 2;
    expect(j.bestMove('player')).toBe(1);
  });
});
