/**
 * Headless balance simulator: plays many full runs with a simple greedy policy.
 * Usage: npx vite-node scripts/simulate.ts [runs]
 */
import { BALANCE } from '../src/data/balance';
import { BOSSES } from '../src/data/trainers';
import { emptyStats } from '../src/logic/achievements';
import { TIER_POWER } from '../src/data/moves';
import { DEFAULT_STARTERS, SPECIES } from '../src/data/species';
import { stabMultiplier, typeMultiplier } from '../src/data/types';
import { Battle } from '../src/logic/battle';
import {
  addLevels, canEvolve, creatureTypes, evolve, healFraction, isAlive, levelCap, moveDef, stats,
} from '../src/logic/creature';
import {
  allCreatures, equipHeld, rollHeld, stash, battleCoins, battleXp, buryFallen, catchCreature, clearFloor, currentNode, grantXp, makeEncounter,
  moveTo, postBattleRecover, promoteBench, type Meta, type Run, startRun,
} from '../src/logic/run';
import { Rng } from '../src/logic/rng';
import { applyItem, eligibleTargets, pay, rollShop, unusableReason, type ItemId } from '../src/logic/shop';

if (process.env.BAL) Object.assign(BALANCE, JSON.parse(process.env.BAL));
const SMART = process.env.NAIVE ? false : true;
(globalThis as any).localStorage = { getItem: () => null, setItem: () => {} };

function bestMove(b: Battle): number {
  let best = 0, score = -1;
  b.p.c.moves.forEach((m, i) => {
    const d = moveDef(m);
    const s = d.power * TIER_POWER[m.tier] * typeMultiplier(d.element, creatureTypes(b.e.c)) * stabMultiplier(d.element, creatureTypes(b.p.c));
    if (s > score) { score = s; best = i; }
  });
  return best;
}

/** How good is creature c (attacking) vs enemy e: best move score / incoming threat. */
function matchup(c: import('../src/logic/creature').Creature, e: import('../src/logic/creature').Creature): number {
  const off = Math.max(...c.moves.map((m) => { const d = moveDef(m); return d.power * typeMultiplier(d.element, creatureTypes(e)) * stabMultiplier(d.element, creatureTypes(c)); }));
  const def = Math.max(...e.moves.map((m) => { const d = moveDef(m); return d.power * typeMultiplier(d.element, creatureTypes(c)) * stabMultiplier(d.element, creatureTypes(e)); }));
  return (off * stats(c).atk * (c.hp / stats(c).hp + 0.3)) / (def * stats(e).atk);
}

function bestSwitch(b: Battle): number {
  let best = -1, score = -1;
  b.player.forEach((x, i) => { if (isAlive(x.c)) { const s = matchup(x.c, b.e.c); if (s > score) { score = s; best = i; } } });
  return best;
}

let enemyLevels: number[] = [];
const bossLevels: number[][] = [[], [], []];
const nodesPerFloor: number[][] = [[], [], []];
function fight(run: Run, kind: 'battle' | 'elite' | 'boss'): 'win' | 'lose' {
  const enemies = makeEncounter(run, currentNode(run));
  enemyLevels = enemies.map((e) => e.level);
  const boss = kind === 'boss' ? BOSSES[run.map.biome] : null;
  const b = new Battle(run.team, enemies, run.rng, { enemyRandomness: kind === 'battle' ? 0.5 : kind === 'elite' ? 0.25 : 0.1, rule: boss?.rule, ruleName: boss?.ruleName });
  b.start();
  for (let t = 0; t < 500; t++) {
    const o = b.outcome();
    if (o === 'win' || o === 'lose') break;
    if (o === 'needSwitch') { b.forcedSwitch(bestSwitch(b)); continue; }
    const sw = bestSwitch(b);
    if (SMART && sw !== b.pActive && matchup(b.player[sw].c, b.e.c) > matchup(b.p.c, b.e.c) * 2) { b.takeTurn({ kind: 'swap', index: sw }); continue; }
    const evs = b.takeTurn({ kind: "move", index: bestMove(b) });
    if (process.env.TRACE) console.log("   ", evs.map((e: any) => e.text ?? `${e.kind}:${e.side}:${e.amount ?? ""}`).join(" | "));
  }
  const o = b.outcome();
  if (o === 'win') {
    buryFallen(run);
    postBattleRecover(run);
    const xp = battleXp(enemies, kind, run.floor);
    if (kind === 'battle' && allCreatures(run).length < 3 && run.rng.chance(0.35)) catchCreature(run, enemies[0]);
    else { grantXp(run, xp, [...b.fought]); run.coins += battleCoins(enemies, kind); }
    if (kind === 'elite') {
      run.evoStones++;
      // Trainer prize: a held item, handed to the first team member without one.
      const prize = rollHeld(run.rng);
      stash(run, prize);
      const free = run.team.find((c) => !c.held);
      if (free) equipHeld(run, free, prize);
    }
    if (kind !== 'battle') { run.coins += battleCoins(enemies, kind); grantXp(run, xp, [...b.fought]); }
    return 'win';
  }
  return 'lose';
}

function simulate(seed: number): { floor: number; won: boolean; diedAt?: string } {
  const meta: Meta = { unlockedStarters: [...DEFAULT_STARTERS], unlockedPassives: [], equippedPassive: null, runs: 0, wins: 0, dex: { forms: [], moves: [], elements: [], caught: [] }, coinsSpent: 0, bossesDefeated: 0, clearedMaps: [], lastMap: 'wildlands', stats: emptyStats(), achievements: [], newAchievements: [] };
  meta.dex.caught = process.env.VET ? SPECIES.map((s) => s.id) : [];
  const rng = new Rng(seed);
  const run = startRun(meta, rng.pick(DEFAULT_STARTERS), seed);
  for (let step = 0; step < 600; step++) {
    const node = currentNode(run);
    let nextId: string;
    if (run.bossPending) nextId = run.currentId;
    else {
      const opts = node.next.map((id) => run.map.nodes[id]);
      const hurt = run.team.reduce((s, c) => s + c.hp / stats(c).hp, 0) / run.team.length < 0.5;
      const heal = opts.find((n) => n.kind === 'heal');
      const safe = opts.filter((n) => n.kind !== 'elite');
      nextId = (hurt && heal ? heal : hurt && safe.length ? run.rng.pick(safe) : run.rng.pick(opts)).id;
      moveTo(run, nextId);
    }
    const n = run.map.nodes[nextId];
    if (process.env.TRACE) console.log(`F${run.floor + 1} ${n.kind.padEnd(8)} p=${n.progress.toFixed(2)} team=${run.team.map((c) => `${c.speciesId}:L${c.level}:${c.hp}/${stats(c).hp}`).join(' ')} bench=${run.bench.length}`);
    // use stones
    for (const c of allCreatures(run)) if (run.evoStones > 0 && canEvolve(c) && c.level >= levelCap(c)) { run.evoStones--; evolve(c); }
    switch (n.kind) {
      case 'battle': case 'elite': case 'boss': {
        const lastTeam = run.team.map((c) => c.level).join('/');
        if (n.kind === 'boss' && !run.bossPending) bossLevels[run.floor].push(Math.max(...run.team.map((c) => c.level)));
        const r = fight(run, n.kind);
        if (r === 'lose') {
          if (!promoteBench(run)) return { floor: run.floor, won: false, diedAt: `${n.kind}@${n.progress.toFixed(1)} L${Math.max(...enemyLevels)}vs${lastTeam}` };
          if (n.kind === 'boss') run.bossPending = true;
          break;
        }
        if (n.kind === 'boss') {
          run.bossPending = false;
          const evo = allCreatures(run).filter(canEvolve).sort((a, b) => b.level - a.level)[0];
          if (evo) evolve(evo); else allCreatures(run).forEach((c) => healFraction(c, 1));
          nodesPerFloor[run.floor].push(run.visited.length);
          if (clearFloor(run)) return { floor: 3, won: true };
        }
        break;
      }
      case 'heal': allCreatures(run).forEach((c) => healFraction(c, 0.5)); break;
      case 'treasure': run.coins += 30 * (1 + run.floor); break;
      case 'event': break;
      case 'shop': {
        // Greedy: buy whatever helps most that we can afford, in priority order.
        const pre = run.floor === 0 && n.next.includes(run.map.bossId);
        const shop = rollShop(run, 0, pre ? ['potion', 'restore'] : []);
        if (process.env.SHOPLOG && pre) console.log('preboss coins', run.coins, 'hp', run.team.map((c) => `${c.hp}/${stats(c).hp}`).join(' '));
        const prio: ItemId[] = ['restore', 'stone', 'sigil', 'manual', 'scroll', 'potion', 'recruit'];
        for (const id of prio) {
          const sl = shop.slots.find((x) => x.item === id && !x.sold);
          if (!sl || run.coins < sl.price || unusableReason(run, sl)) continue;
          if (id === 'restore' && run.team.every((c) => c.hp / stats(c).hp > 0.6)) continue;
          const tgt = eligibleTargets(run, id).sort((a, b) => b.level - a.level)[0];
          const mi = tgt ? tgt.moves.findIndex((m) => m.tier < 3) : -1;
          pay(run, sl.price); sl.sold = true;
          applyItem(run, sl, tgt, mi >= 0 ? mi : undefined);
        }
        break;
      }
      case 'levelup': allCreatures(run).forEach((c) => addLevels(c, BALANCE.levelUpTeam[run.floor])); break;
      case 'skill': { const c = run.team[0]; const m = c.moves.find((m) => m.tier < 3); if (m) m.tier++; break; }
    }
    // move team/bench: keep strongest 4 in team
    const all = allCreatures(run).sort((a, b) => b.level - a.level);
    run.team = all.slice(0, 4); run.bench = all.slice(4);
  }
  return { floor: run.floor, won: false, diedAt: 'stuck' };
}

const N = Number(process.argv[2] ?? 500);
const floors = [0, 0, 0, 0];
const deaths: Record<string, number> = {};
let wins = 0;
for (let i = 1; i <= N; i++) {
  const r = simulate(i * 7919);
  floors[r.floor]++;
  if (r.won) wins++;
  else { const k = process.env.DETAIL ? `F${r.floor + 1} ${r.diedAt}` : `F${r.floor + 1} ${r.diedAt!.split('@')[0]}`; deaths[k] = (deaths[k] ?? 0) + 1; }
}
console.log(`runs ${N}  wins ${wins} (${((wins / N) * 100).toFixed(1)}%)`);
console.log('ended on floor:', floors.slice(0, 3).map((n, i) => `F${i + 1}: ${n}`).join('  '));
const med = (a: number[]) => (a.length ? [...a].sort((x, y) => x - y)[Math.floor(a.length / 2)] : 0);
const pct = (a: number[], q: number) => (a.length ? [...a].sort((x, y) => x - y)[Math.floor(a.length * q)] : 0);
console.log('top level arriving at boss (p25 / median / p75):', bossLevels.map((a, i) => `F${i + 1}: ${pct(a, 0.25)}/${med(a)}/${pct(a, 0.75)} (n=${a.length})`).join('  '));
console.log('median nodes walked per floor:', nodesPerFloor.map((a, i) => `F${i + 1}: ${med(a)}`).join('  '));
console.log('deaths:', Object.entries(deaths).sort((a, b) => b[1] - a[1]).map(([k, v]) => `${k}=${v}`).join('  '));
