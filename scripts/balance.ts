import { attackEl } from '../src/data/moves';
/**
 * Balance report: a bot plays thousands of full runs headlessly and writes what it found to
 * docs/BALANCE_REPORT.md: win rates by Heat, every starter at Heat 0, which guardians and guardian
 * rules end runs, how deep the Gilded Hunt goes, and each weekly twist.
 *
 * Usage: npx vite-node scripts/balance.ts [scale]
 *   scale multiplies the number of runs (default 1, about 12,000 runs; 0.2 for a quick look).
 *   RULES_ONLY=1 runs about 8,000 Heat 4-8 runs and prints only the guardian rule loss rates.
 *
 * The bot is a decent player, not a great one: it picks the strongest move by type and power,
 * switches out of bad matchups, drinks potions when low, rests when hurt, buys useful items and
 * evolves when it can. It never reads events and catches only to fill a thin team. Treat its
 * numbers as relative (this starter vs that one, Heat 3 vs Heat 4), not as human win rates.
 */
import { writeFileSync } from 'node:fs';
import { BALANCE } from '../src/data/balance';
import { synergyMults } from '../src/logic/synergy';
import { BOSSES, guardianRules, RULES, type BossRule } from '../src/data/trainers';
import { TIER_POWER } from '../src/data/moves';
import { SPECIES, SPECIES_BY_ID } from '../src/data/species';
import { stabMultiplier, typeMultiplier, type Element } from '../src/data/types';
import { Battle } from '../src/logic/battle';
import { GLASS_MULT } from '../src/logic/run';
import { emptyStats } from '../src/logic/achievements';
import {
  addLevels, canPrestige, creatureTypes, evolve, healFraction, hasUses, isAlive, moveDef, prestige, readyToEvolve, restoreUses, sharesType, stats, usesLeft,
  type Creature,
} from '../src/logic/creature';
import {
  allCreatures, battleCoins, battleXp, buryFallen, catchCreature, clearFloor, currentNode, equipHeld, fillTeamFromBench, grantXp, makeEncounter, moveTo,
  postBattleRecover, potionHeal, promoteBench, rollHeld, startHunt, startRun, startWeekly, stash, TWIST_ORDER, TWISTS, usePotion, weeklyInfo, type Meta, type Run, type TwistId,
} from '../src/logic/run';
import { Rng } from '../src/logic/rng';
import { applyItem, eligibleTargets, pay, rollShop, unusableReason, type ItemId } from '../src/logic/shop';
import { emptyDex } from '../src/logic/dex';
import { BOONS } from '../src/data/boons';
import { floorCurse, hasBoon, openOffer, skipOffer, takeBoon } from '../src/logic/boons';
import { isRareTrait, setTraitsEnabled, silenceTrait, traitOf, TRAITS, type TraitId } from '../src/data/traits';

(globalThis as unknown as { localStorage: unknown }).localStorage = { getItem: () => null, setItem: () => {}, removeItem: () => {} };

// ---------------------------------------------------------------- the bot

function moveScore(b: Battle, i: number): number {
  const m = b.p.c.moves[i];
  if (!hasUses(m)) return -1;
  const d = moveDef(m);
  const eff = d.kind === 'attack' ? typeMultiplier(attackEl(d), creatureTypes(b.e.c)) : 1;
  let s = d.power * TIER_POWER[m.tier] * eff * stabMultiplier(d.element, creatureTypes(b.p.c));
  // Save limited moves unless they hit hard or the foe is low.
  if (Number.isFinite(usesLeft(m)) && eff <= 1 && b.e.c.hp / stats(b.e.c).hp >= 0.35) s *= 0.75;
  return s;
}

function bestMove(b: Battle): number {
  let best = 0;
  let score = -1;
  b.p.c.moves.forEach((_, i) => {
    const s = moveScore(b, i);
    if (s > score) [best, score] = [i, s];
  });
  return best;
}

/** How well c (attacking) does against e: its best hit over e's best hit back. */
function matchup(c: Creature, e: Creature): number {
  const off = Math.max(...c.moves.map((m) => { const d = moveDef(m); return d.kind !== 'attack' ? 0 : d.power * typeMultiplier(attackEl(d), creatureTypes(e)) * stabMultiplier(attackEl(d), creatureTypes(c)); }));
  const def = Math.max(...e.moves.map((m) => { const d = moveDef(m); return d.kind !== 'attack' ? 0 : d.power * typeMultiplier(attackEl(d), creatureTypes(c)) * stabMultiplier(attackEl(d), creatureTypes(e)); }));
  return (off * stats(c).atk * (c.hp / stats(c).hp + 0.3)) / (def * stats(e).atk);
}

function bestSwitch(b: Battle): number {
  let best = -1;
  let score = -1;
  b.player.forEach((x, i) => {
    if (!isAlive(x.c)) return;
    const s = matchup(x.c, b.e.c);
    if (s > score) [best, score] = [i, s];
  });
  return best;
}

type Kind = 'battle' | 'elite' | 'boss';
interface FightResult {
  won: boolean;
  boss?: Element;
  rules: BossRule[];
}

function fight(run: Run, kind: Kind): FightResult {
  const enemies = makeEncounter(run, currentNode(run));
  // TRAIT_SIDES=player / foe: only that side's traits count (to see each side's share).
  if (process.env.TRAIT_SIDES === 'player') enemies.forEach(silenceTrait);
  if (process.env.TRAIT_SIDES === 'foe') allCreatures(run).forEach(silenceTrait);
  const boss = kind === 'boss' ? BOSSES[run.map.biome] : null;
  const rules = boss ? guardianRules(boss, run.heat ?? 0, run.seed, run.floor) : [];
  const b = new Battle(run.team, enemies, run.rng, {
    playerDamageMult: (run.passive === 'drill' ? 1.1 : 1) * (run.twist === 'glass' ? GLASS_MULT : 1),
    enemyDamageMult: run.twist === 'glass' ? GLASS_MULT : 1,
    enemyRandomness: BALANCE.enemyRandomness[kind],
    rules: rules.map((r) => ({ rule: r.rule, name: r.name })),
    synergy: synergyMults(run.team, run.passive === 'harmonist' ? 2 : 1),
    enemySynergy: boss ? synergyMults(enemies) : undefined,
    playerStatusMult: run.passive === 'afflicter' ? 2 : 1,
    playerStatusImmune: run.passive === 'tempered' ? ['burn', 'poison'] : [],
    enemyTactics: kind === 'battle' ? undefined : { potions: kind === 'boss' ? BALANCE.bossPotions : BALANCE.trainerPotions, name: boss?.name ?? 'Trainer' },
    boons: { player: run.boons?.held ?? [], enemy: [] },
    coins: run.coins,
    secondWind: () => {
      const rb = run.boons;
      if (!rb || rb.windFloor === run.floor) return false;
      rb.windFloor = run.floor;
      return true;
    },
  });
  b.start();
  for (let t = 0; t < 500; t++) {
    const o = b.outcome();
    if (o === 'win' || o === 'lose') break;
    if (o === 'needSwitch') {
      b.forcedSwitch(bestSwitch(b));
      continue;
    }
    // Drink a potion when the active Hexling is low and the potion would matter.
    if ((run.potions ?? 0) > 0 && !hasBoon(run, 'shortfuse') && b.p.c.hp / stats(b.p.c).hp < 0.3 && matchup(b.p.c, b.e.c) > 0.6) {
      run.potions = (run.potions ?? 0) - 1;
      b.takeTurn({ kind: 'potion', index: b.pActive, heal: potionHeal(run) });
      continue;
    }
    const sw = bestSwitch(b);
    if (sw !== b.pActive && matchup(b.player[sw].c, b.e.c) > matchup(b.p.c, b.e.c) * 2) {
      b.takeTurn({ kind: 'swap', index: sw });
      continue;
    }
    b.takeTurn({ kind: 'move', index: bestMove(b) });
  }
  const won = b.outcome() === 'win';
  const res: FightResult = { won, boss: boss ? run.map.biome : undefined, rules: rules.map((r) => r.rule) };
  if (!won) return res;
  if (buryFallen(run).length) fillTeamFromBench(run);
  postBattleRecover(run, { won: true, sun: b.weather === 'sun' });
  for (;;) {
    const low = run.team.find((c) => c.hp > 0 && c.hp / stats(c).hp < 0.5);
    if (!low || !usePotion(run, low)) break;
  }
  const xp = battleXp(enemies, kind, run.floor);
  if (kind === 'battle' && allCreatures(run).length < 3 && run.rng.chance(0.35)) catchCreature(run, enemies[0]);
  else {
    grantXp(run, xp, [...b.fought]);
    run.coins += Math.round(battleCoins(enemies, kind, run.heat ?? 0, run.twist ?? null) * (hasBoon(run, 'prospector') ? 1.4 : 1));
  }
  if (kind === 'battle' && run.rng.chance(BALANCE.stoneDropChance[run.floor] ?? 0)) run.evoStones++;
  if (kind === 'elite') {
    if (run.rng.chance(BALANCE.eliteStoneChance)) run.evoStones++;
    const prize = rollHeld(run.rng);
    stash(run, prize);
    const free = run.team.find((c) => !c.held);
    if (free) equipHeld(run, free, prize);
  }
  return res;
}

interface RunResult {
  won: boolean;
  /** The starter's trait (2.0). */
  trait?: string;
  /** Boons it ended with (2.0). */
  boons?: string[];
  /** Floor index the run ended on (0-2; 3 for a win). */
  floor: number;
  endedBy?: string;
  /** Guardian fights: element, rules, and whether that fight was won. */
  bossFights: FightResult[];
  /** Gilded Hunt: deepest floor reached (when hunting). */
  huntDepth?: number;
}

function blankMeta(heat: number): Meta {
  return {
    unlockedStarters: SPECIES.map((s) => s.id),
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
    heat,
    heatUnlocked: heat,
  };
}

function play(opts: { seed: number; starter: string; heat?: number; hunt?: boolean; weekly?: string }): RunResult {
  const meta = blankMeta(opts.heat ?? 0);
  const run = opts.weekly ? startWeekly(meta, opts.weekly, opts.starter) : startRun(meta, opts.starter, opts.seed, 'wildlands');
  if (!opts.weekly) run.heat = opts.heat ?? 0;
  const bossFights: FightResult[] = [];
  const trait = traitOf(run.team[0]);
  const done = (r: Omit<RunResult, 'bossFights'>): RunResult => {
    for (const id of run.boons?.held ?? []) {
      const t = (boonTally[id] ??= { runs: 0, wins: 0 });
      t.runs++;
      if (r.won) t.wins++;
    }
    return { ...r, bossFights, trait, boons: [...(run.boons?.held ?? [])] };
  };
  const maxSteps = opts.hunt ? 4000 : 600;
  for (let step = 0; step < maxSteps; step++) {
    const node = currentNode(run);
    let nextId: string;
    if (run.bossPending) nextId = run.currentId;
    else {
      const opts2 = node.next.map((id) => run.map.nodes[id]);
      const hurt = run.team.reduce((s, c) => s + c.hp / stats(c).hp, 0) / run.team.length < 0.5;
      const heal = opts2.find((n) => n.kind === 'heal');
      const safe = opts2.filter((n) => n.kind !== 'elite');
      nextId = (hurt && heal ? heal : hurt && safe.length ? run.rng.pick(safe) : run.rng.pick(opts2)).id;
      moveTo(run, nextId);
    }
    const n = run.map.nodes[nextId];
    for (const c of allCreatures(run)) if (run.evoStones > 0 && readyToEvolve(c)) {
      run.evoStones--;
      evolve(c);
    }
    botBoons(run);
    switch (n.kind) {
      case 'boon':
        openOffer(run, `hex${run.floor}:${n.id}`);
        botBoons(run);
        break;
      case 'battle':
      case 'elite':
      case 'boss': {
        const r = fight(run, n.kind === 'battle' && floorCurse(run, 'hauntedfloor') ? 'elite' : n.kind);
        if (n.kind === 'boss') bossFights.push(r);
        if (!r.won) {
          if (!promoteBench(run)) {
            const where = n.kind === 'boss' ? `Guardian (${r.boss})` : n.kind === 'elite' ? 'Trainer' : 'Wild battle';
            return done({ won: false, floor: run.floor, endedBy: where, huntDepth: run.hunt?.depth });
          }
          if (n.kind === 'boss') run.bossPending = true;
          break;
        }
        if (n.kind === 'boss') {
          run.bossPending = false;
          const evo = allCreatures(run).filter(readyToEvolve).sort((a, b) => b.level - a.level)[0];
          if (evo) evolve(evo);
          // Otherwise the two-Hexling prestige boon, on the two highest-level teammates.
          else run.team.filter(canPrestige).sort((a, b) => b.level - a.level).slice(0, 2).forEach((c) => prestige(c));
          if (clearFloor(run)) {
            if (!opts.hunt) return done({ won: true, floor: 3 });
            startHunt(run);
          }
          if (run.hunt && run.hunt.depth > 40) return done({ won: true, floor: 3, huntDepth: run.hunt.depth });
        }
        break;
      }
      case 'heal':
        allCreatures(run).forEach((c) => {
          healFraction(c, 0.5);
          restoreUses(c);
        });
        break;
      case 'treasure':
        run.coins += 30 * (1 + Math.min(run.floor, 2));
        break;
      case 'prestige': {
        const target = allCreatures(run).filter((t) => canPrestige(t) && run.bench.some((b) => b !== t && sharesType(b, t))).sort((a, b) => b.level - a.level)[0];
        if (!target) break;
        const sac = run.bench.filter((b) => b !== target && sharesType(b, target)).sort((a, b) => a.level - b.level)[0];
        run.bench = run.bench.filter((b) => b !== sac);
        prestige(target);
        break;
      }
      case 'shop': {
        const shop = rollShop(run, 0, []);
        const prio: ItemId[] = ['restore', 'stone', 'sigil', 'manual', 'scroll', 'potion', 'recruit'];
        for (const id of prio) {
          const sl = shop.slots.find((x) => x.item === id && !x.sold);
          if (!sl || run.coins < sl.price || unusableReason(run, sl)) continue;
          if (id === 'restore' && run.team.every((c) => c.hp / stats(c).hp > 0.6)) continue;
          const tgt = eligibleTargets(run, id).sort((a, b) => b.level - a.level)[0];
          const mi = tgt ? tgt.moves.findIndex((m) => m.tier < 3) : -1;
          pay(run, sl.price);
          sl.sold = true;
          applyItem(run, sl, tgt, mi >= 0 ? mi : undefined);
        }
        break;
      }
      case 'levelup':
        allCreatures(run).forEach((c) => addLevels(c, BALANCE.levelUpTeam[Math.min(run.floor, 2)]));
        break;
      case 'skill': {
        const m = run.team[0].moves.find((x) => x.tier < 3);
        if (m) m.tier++;
        break;
      }
    }
    // Strongest four fight; the rest wait on the bench.
    const all = allCreatures(run).sort((a, b) => b.level - a.level);
    run.team = all.slice(0, 4);
    run.bench = all.slice(4);
  }
  return done({ won: !!run.hunt, floor: run.floor, endedBy: 'Out of steps', huntDepth: run.hunt?.depth });
}

/**
 * The bot's boon picks: boons for its team's elements first, then general ones, then mythics;
 * curses only when they pay a mythic or two boons. BOONS=off skips every offer (for comparison).
 */
const boonTally: Record<string, { runs: number; wins: number }> = {};
function botBoons(run: Run) {
  for (let guard = 0; guard < 8 && run.boons?.offer; guard++) {
    const offer = run.boons.offer;
    if (process.env.BOONS === 'off') {
      skipOffer(run);
      continue;
    }
    const els = new Set(allCreatures(run).flatMap((c) => creatureTypes(c)));
    const score = (id: string) => {
      const b = BOONS[id];
      if (b.rarity === 'curse') return id === 'bankrupt' || id === 'bloodprice' ? 1 : -1;
      if (b.rarity === 'mythic') return id === 'pact' ? 0.5 : 3;
      if (b.element) return els.has(b.element) ? 2.5 : 0.2;
      return 2;
    };
    const best = [...offer.ids].sort((a, b) => score(b) - score(a))[0];
    if (!best || score(best) < 0) skipOffer(run);
    else takeBoon(run, best);
  }
}

// ---------------------------------------------------------------- the report

const scale = Number(process.argv[2] ?? 1);
const N = (n: number) => Math.max(4, Math.round(n * scale));
const ids = SPECIES.map((s) => s.id);
const pct = (a: number, b: number) => (b ? `${Math.round((a / b) * 100)}%` : '—');
const t0 = Date.now();
const out: string[] = [];
const line = (s = '') => out.push(s);
let seedN = 1;
const nextSeed = () => (seedN++ * 2654435761) >>> 0;
const pickStarter = (seed: number) => ids[seed % ids.length];

// Guardian and rule tallies, from every run below.
const bossTally: Record<string, { fights: number; lost: number }> = {};
const ruleTally: Record<string, { fights: number; lost: number }> = {};
const tally = (r: RunResult, heat: number) => {
  for (const f of r.bossFights) {
    const b = (bossTally[f.boss!] ??= { fights: 0, lost: 0 });
    b.fights++;
    if (!f.won) b.lost++;
    // Extra rules only (the guardian's own rule is counted with the guardian).
    if (heat >= 4) for (const rule of f.rules.slice(1)) {
      const t = (ruleTally[rule] ??= { fights: 0, lost: 0 });
      t.fights++;
      if (!f.won) t.lost++;
    }
  }
};

// Focused check of the extra guardian rules: many Heat 4-8 runs, then just the rule table.
if (process.env.RULES_ONLY) {
  const own: Record<string, { fights: number; lost: number }> = {};
  for (let heat = 4; heat <= 8; heat++)
    for (let i = 0; i < N(1600); i++) {
      const seed = nextSeed();
      const r = play({ seed, starter: pickStarter(seed), heat });
      tally(r, heat);
      for (const f of r.bossFights) {
        const t = (own[f.rules[0]] ??= { fights: 0, lost: 0 });
        t.fights++;
        if (!f.won) t.lost++;
      }
    }
  const show = (title: string, tab: Record<string, { fights: number; lost: number }>) => {
    console.log(title);
    Object.entries(tab)
      .sort((a, b) => b[1].lost / b[1].fights - a[1].lost / a[1].fights)
      .forEach(([rule, t]) => console.log(`  ${RULES[rule as BossRule].name.padEnd(16)} ${String(t.fights).padStart(5)}  ${pct(t.lost, t.fights)}`));
  };
  show('Extra rules (Heat 4-8):', ruleTally);
  show("Guardians' own rules (Heat 4-8):", own);
  process.exit(0);
}

// Boons (2.0): the same Heat 0 seeds played with boons skipped, then taken.
if (process.env.BOONS_ONLY) {
  const n = N(3000);
  const seeds = Array.from({ length: n }, () => nextSeed());
  process.env.BOONS = 'off';
  const off = seeds.map((seed) => play({ seed, starter: pickStarter(seed), heat: 0 }));
  process.env.BOONS = 'on';
  for (const k of Object.keys(boonTally)) delete boonTally[k];
  const on = seeds.map((seed) => play({ seed, starter: pickStarter(seed), heat: 0 }));
  const wr = (xs: RunResult[]) => xs.filter((r) => r.won).length / Math.max(1, xs.length);
  const o: string[] = [];
  o.push('# Boons balance report', '', `Generated by \`BOONS_ONLY=1 npx vite-node scripts/balance.ts\` on ${new Date().toISOString().slice(0, 10)}: ${n} Heat 0 runs skipping every boon, then the same seeds taking them (traits on both times; ${Math.round((Date.now() - t0) / 1000)} s). The bot takes boons for its elements first, then general ones and mythics; curses only for a mythic or two boons.`, '');
  o.push(`**Overall:** ${pct(off.filter((r) => r.won).length, n)} without boons → **${pct(on.filter((r) => r.won).length, n)}** with boons. Average boons held at the end: ${(on.reduce((t, r) => t + (r.boons?.length ?? 0), 0) / n).toFixed(1)}.`, '');
  o.push('## By starter element', '', '| Element | Runs | Without | With | Change |', '|---|---|---|---|---|');
  const els = [...new Set(SPECIES.map((sp) => sp.types[0]))];
  const rows = els.map((el) => {
    const idx = seeds.map((_, i) => i).filter((i) => SPECIES_BY_ID[pickStarter(seeds[i])].types[0] === el);
    return { el, runs: idx.length, a: wr(idx.map((i) => off[i])), b: wr(idx.map((i) => on[i])) };
  }).sort((x, y) => y.b - x.b);
  for (const r of rows) o.push(`| ${r.el} | ${r.runs} | ${Math.round(r.a * 100)}% | ${Math.round(r.b * 100)}% | ${r.b >= r.a ? '+' : '−'}${Math.abs(Math.round((r.b - r.a) * 100))} |`);
  o.push('', '## By boon', '', 'Win rate of runs that ended holding each boon (15+ runs). Boons picked late (after floor 2) only count for the last floor, so read these loosely.', '', '| Boon | Kind | Runs | Win rate |', '|---|---|---|---|');
  Object.entries(boonTally).filter(([, t]) => t.runs >= 15).sort((a, b) => b[1].wins / b[1].runs - a[1].wins / a[1].runs)
    .forEach(([id, t]) => o.push(`| ${BOONS[id].name} | ${BOONS[id].element ?? BOONS[id].rarity} | ${t.runs} | ${pct(t.wins, t.runs)} |`));
  writeFileSync('docs/BOONS_REPORT.md', o.join('\n'));
  console.log(o.slice(0, 24).join('\n'));
  process.exit(0);
}

// Traits (2.0): the same Heat 0 seeds played with traits off, then on.
if (process.env.TRAITS_ONLY) {
  const n = N(3000);
  const seeds = Array.from({ length: n }, () => nextSeed());
  const off: RunResult[] = [];
  const on: RunResult[] = [];
  setTraitsEnabled(false);
  for (const seed of seeds) off.push(play({ seed, starter: pickStarter(seed), heat: 0 }));
  setTraitsEnabled(true);
  for (const seed of seeds) on.push(play({ seed, starter: pickStarter(seed), heat: 0 }));
  const wr = (xs: RunResult[]) => xs.filter((r) => r.won).length / Math.max(1, xs.length);
  const o: string[] = [];
  o.push('# Traits balance report', '', `Generated by \`TRAITS_ONLY=1 npx vite-node scripts/balance.ts\` on ${new Date().toISOString().slice(0, 10)}: ${n} Heat 0 runs with traits off, then the same seeds with traits on (${Math.round((Date.now() - t0) / 1000)} s). Starter picked from all ${ids.length} lines.`, '');
  o.push(`**Overall:** ${pct(off.filter((r) => r.won).length, n)} without traits → **${pct(on.filter((r) => r.won).length, n)}** with traits.`, '');
  o.push('## By starter element', '', '| Element | Runs | Without | With | Change |', '|---|---|---|---|---|');
  const els = [...new Set(SPECIES.map((s) => s.types[0]))];
  const elRows = els.map((el) => {
    const idx = seeds.map((s, i) => i).filter((i) => SPECIES_BY_ID[pickStarter(seeds[i])].types[0] === el);
    const a = wr(idx.map((i) => off[i]));
    const b = wr(idx.map((i) => on[i]));
    return { el, runs: idx.length, a, b };
  }).sort((x, y) => x.a - y.a);
  for (const r of elRows) o.push(`| ${r.el} | ${r.runs} | ${Math.round(r.a * 100)}% | ${Math.round(r.b * 100)}% | ${r.b >= r.a ? '+' : '−'}${Math.abs(Math.round((r.b - r.a) * 100))} |`);
  o.push('');
  // By the starter's own trait: its win rate with it vs the same seeds without traits.
  const by: Record<string, { runs: number; with: number; without: number }> = {};
  on.forEach((r, i) => {
    if (!r.trait) return;
    const t = (by[r.trait] ??= { runs: 0, with: 0, without: 0 });
    t.runs++;
    if (r.won) t.with++;
    if (off[i].won) t.without++;
  });
  const rows = Object.entries(by).filter(([, t]) => t.runs >= 15).map(([id, t]) => ({ id, ...t, lift: (t.with - t.without) / t.runs })).sort((a, b) => b.lift - a.lift);
  const tr = (r: (typeof rows)[number]) => `| ${TRAITS[r.id as TraitId].name} | ${TRAITS[r.id as TraitId].kind} | ${r.runs} | ${pct(r.without, r.runs)} | ${pct(r.with, r.runs)} | ${r.lift >= 0 ? '+' : '−'}${Math.abs(Math.round(r.lift * 100))} |`;
  o.push('## By the starter\'s trait', '', 'Each trait with 15+ runs: the same seeds without traits, then with (so the lift is the trait plus the foes\' traits). Small samples are noisy.', '');
  o.push('| Trait | Kind | Runs | Without | With | Lift |', '|---|---|---|---|---|---|');
  rows.forEach((r) => o.push(tr(r)));
  o.push('');
  const rare = on.filter((r, i) => r.trait && isRareTrait(pickStarter(seeds[i]), r.trait as TraitId));
  const common = on.filter((r, i) => r.trait && !isRareTrait(pickStarter(seeds[i]), r.trait as TraitId));
  o.push(`**Rare (◆) vs common:** rare-trait starters won ${pct(rare.filter((r) => r.won).length, rare.length)} (${rare.length} runs), common ${pct(common.filter((r) => r.won).length, common.length)} (${common.length} runs).`, '');
  writeFileSync('docs/TRAITS_REPORT.md', o.join('\n'));
  console.log(o.join('\n'));
  process.exit(0);
}

// 1. Heat.
const byHeat: { heat: number; runs: number; wins: number; ends: Record<string, number>; floors: number[] }[] = [];
for (let heat = 0; heat <= 8; heat++) {
  const row = { heat, runs: N(400), wins: 0, ends: {} as Record<string, number>, floors: [0, 0, 0, 0] };
  for (let i = 0; i < row.runs; i++) {
    const seed = nextSeed();
    const r = play({ seed, starter: pickStarter(seed), heat });
    tally(r, heat);
    row.floors[r.floor]++;
    if (r.won) row.wins++;
    else {
      const k = `F${r.floor + 1} ${r.endedBy!.startsWith('Guardian') ? 'Guardian' : r.endedBy}`;
      row.ends[k] = (row.ends[k] ?? 0) + 1;
    }
  }
  byHeat.push(row);
  process.stderr.write(`heat ${heat} done\n`);
}

// 2. Starters at Heat 0.
const byStarter: { id: string; runs: number; wins: number; floorSum: number }[] = [];
for (const id of ids) {
  const row = { id, runs: N(40), wins: 0, floorSum: 0 };
  for (let i = 0; i < row.runs; i++) {
    const r = play({ seed: nextSeed(), starter: id, heat: 0 });
    tally(r, 0);
    if (r.won) row.wins++;
    row.floorSum += r.floor;
  }
  byStarter.push(row);
}
process.stderr.write('starters done\n');

// 3. Gilded Hunt (after a Heat 0 win).
const hunts: number[] = [];
for (let tries = 0; hunts.length < N(150) && tries < N(150) * 8; tries++) {
  const seed = nextSeed();
  const r = play({ seed, starter: pickStarter(seed), heat: 0, hunt: true });
  if (r.huntDepth) hunts.push(r.huntDepth);
}
process.stderr.write('hunt done\n');

// 4. Weekly twists.
const byTwist: { twist: TwistId; runs: number; wins: number }[] = [];
for (const twist of TWIST_ORDER) {
  const row = { twist, runs: N(300), wins: 0 };
  // Several weeks with this twist, so it isn't one week's starters.
  const weeks: string[] = [];
  for (let d = Date.parse('2026-01-05T00:00:00Z'); weeks.length < 8; d += 7 * 86400000) {
    const w = new Date(d).toISOString().slice(0, 10);
    if (weeklyInfo(w).twist === twist) weeks.push(w);
  }
  for (let i = 0; i < row.runs; i++) {
    const w = weeklyInfo(weeks[i % weeks.length]);
    const r = play({ seed: nextSeed(), starter: w.starters[i % 3], weekly: w.week });
    if (r.won) row.wins++;
  }
  byTwist.push(row);
}
process.stderr.write('weekly done\n');

// ---------------------------------------------------------------- write it up

const totalRuns = byHeat.reduce((t, r) => t + r.runs, 0) + byStarter.reduce((t, r) => t + r.runs, 0) + byTwist.reduce((t, r) => t + r.runs, 0);
line('# Balance report');
line();
line(`Generated by \`scripts/balance.ts\` on ${new Date().toISOString().slice(0, 10)}: a bot played ${totalRuns.toLocaleString()} runs (plus Gilded Hunts) in ${Math.round((Date.now() - t0) / 1000)} s.`);
line();
line('The bot plays decently but simply: best move by type and power, switches out of bad matchups, potions when low, rests when hurt, buys useful items. It ignores events and rarely catches. **Read the numbers as relative** (this starter vs that one, Heat 3 vs Heat 4). A thoughtful player wins more often than the bot.');
line();
line('Re-run: `npx vite-node scripts/balance.ts` (add `0.2` for a quick pass).');
line();

line('## Win rate by Heat');
line();
line('Random starter from all 120, Wildlands map.');
line();
line('| Heat | Runs | Win rate | Reached floor 2 | Reached floor 3 | Most common end |');
line('|---|---|---|---|---|---|');
for (const r of byHeat) {
  const reached2 = r.runs - r.floors[0];
  const reached3 = r.runs - r.floors[0] - r.floors[1];
  const top = Object.entries(r.ends).sort((a, b) => b[1] - a[1])[0];
  line(`| ${r.heat} | ${r.runs} | **${pct(r.wins, r.runs)}** | ${pct(reached2, r.runs)} | ${pct(reached3, r.runs)} | ${top ? `${top[0]} (${pct(top[1], r.runs)})` : '—'} |`);
}
line();
{
  const drops = byHeat.slice(1).map((r, i) => ({ heat: r.heat, drop: byHeat[i].wins / byHeat[i].runs - r.wins / r.runs }));
  const big = drops.sort((a, b) => b.drop - a.drop)[0];
  const flat = drops.filter((d) => d.drop < 0.01).map((d) => d.heat);
  line(`Biggest single step: **Heat ${big.heat}** (−${Math.round(big.drop * 100)} points).${flat.length ? ` Steps that barely change anything for the bot: Heat ${flat.join(', ')}.` : ''}`);
  line();
}

line('## Where runs end');
line();
line('| Heat | ' + ['F1 Wild battle', 'F1 Trainer', 'F1 Guardian', 'F2 Wild battle', 'F2 Trainer', 'F2 Guardian', 'F3 Wild battle', 'F3 Trainer', 'F3 Guardian'].join(' | ') + ' |');
line('|---|' + '---|'.repeat(9));
for (const r of byHeat) {
  const cols = ['F1 Wild battle', 'F1 Trainer', 'F1 Guardian', 'F2 Wild battle', 'F2 Trainer', 'F2 Guardian', 'F3 Wild battle', 'F3 Trainer', 'F3 Guardian'].map((k) => pct(r.ends[k] ?? 0, r.runs));
  line(`| ${r.heat} | ${cols.join(' | ')} |`);
}
line();

line('## Starters (Heat 0)');
line();
const sorted = [...byStarter].sort((a, b) => b.wins / b.runs - a.wins / a.runs || b.floorSum - a.floorSum);
const avgWin = byStarter.reduce((t, r) => t + r.wins / r.runs, 0) / byStarter.length;
line(`${byStarter.length} starters × ${byStarter[0].runs} runs each. Average win rate **${Math.round(avgWin * 100)}%**. With ${byStarter[0].runs} runs per starter, differences under about ${Math.round(200 * Math.sqrt((avgWin * (1 - avgWin)) / byStarter[0].runs))} points are noise.`);
line();
const starterRow = (r: (typeof byStarter)[number]) => {
  const sp = SPECIES_BY_ID[r.id];
  return `| ${sp.names[0]} | ${[...new Set(sp.types)].join('/')} | ${pct(r.wins, r.runs)} | ${(r.floorSum / r.runs + 1).toFixed(1)} |`;
};
line('**Strongest 12**');
line();
line('| Starter | Elements | Win rate | Avg floor |');
line('|---|---|---|---|');
sorted.slice(0, 12).forEach((r) => line(starterRow(r)));
line();
line('**Weakest 12**');
line();
line('| Starter | Elements | Win rate | Avg floor |');
line('|---|---|---|---|');
sorted.slice(-12).reverse().forEach((r) => line(starterRow(r)));
line();
{
  // By element: average over starters that have it.
  const els: Record<string, number[]> = {};
  for (const r of byStarter) for (const t of new Set(SPECIES_BY_ID[r.id].types)) (els[t] ??= []).push(r.wins / r.runs);
  line('**By element** (average win rate of starters with that element)');
  line();
  line('| Element | Starters | Win rate |');
  line('|---|---|---|');
  Object.entries(els)
    .map(([e, a]) => [e, a.length, a.reduce((x, y) => x + y, 0) / a.length] as const)
    .sort((a, b) => b[2] - a[2])
    .forEach(([e, n, w]) => line(`| ${e} | ${n} | ${Math.round(w * 100)}% |`));
  line();
}

line('## Guardians');
line();
line('Every guardian fight from every run above. "Lost" counts each wipe, including ones the bench recovered from.');
line();
line('| Guardian | Element | Rule | Fights | Lost |');
line('|---|---|---|---|---|');
Object.entries(bossTally)
  .sort((a, b) => b[1].lost / b[1].fights - a[1].lost / a[1].fights)
  .forEach(([el, t]) => {
    const b = BOSSES[el as Element];
    line(`| ${b.name} | ${el} | ${b.ruleName} | ${t.fights} | **${pct(t.lost, t.fights)}** |`);
  });
line();

line('## Extra guardian rules (Heat 4+)');
line();
line('How often a guardian fight is lost when this rule is one of the extra rules. Compare with the other rules: the guardian and Heat vary evenly between them.');
line();
line('| Rule | Fights | Lost |');
line('|---|---|---|');
Object.entries(ruleTally)
  .sort((a, b) => b[1].lost / b[1].fights - a[1].lost / a[1].fights)
  .forEach(([rule, t]) => line(`| ${RULES[rule as BossRule].name} | ${t.fights} | **${pct(t.lost, t.fights)}** |`));
line();

line('## Gilded Hunt');
line();
if (hunts.length) {
  const s = [...hunts].sort((a, b) => a - b);
  const q = (p: number) => s[Math.min(s.length - 1, Math.floor(s.length * p))];
  line(`${hunts.length} hunts, each started right after a Heat 0 win. The deepest floor reached:`);
  line();
  line(`- Median **floor ${q(0.5)}**, top quarter floor ${q(0.75)}+, best 1 in 10 floor ${q(0.9)}+, deepest ${s[s.length - 1]}.`);
  const counts: Record<number, number> = {};
  for (const d of s) counts[d] = (counts[d] ?? 0) + 1;
  line(`- Spread: ${Object.entries(counts).map(([d, c]) => `F${d}: ${c}`).join(' · ')}`);
} else line('No hunts finished (the bot never won a run to start one).');
line();

line('## Weekly twists');
line();
line('Each twist over 8 different weeks (their own starters and passives), Heat 0.');
line();
line('| Twist | Runs | Win rate | vs Heat 0 |');
line('|---|---|---|---|');
const base = byHeat[0].wins / byHeat[0].runs;
for (const r of byTwist) {
  const w = r.wins / r.runs;
  line(`| ${TWISTS[r.twist].name} | ${r.runs} | **${pct(r.wins, r.runs)}** | ${w >= base ? '+' : '−'}${Math.abs(Math.round((w - base) * 100))} points |`);
}
line();

writeFileSync('docs/BALANCE_REPORT.md', out.join('\n'));
process.stderr.write(`wrote docs/BALANCE_REPORT.md in ${Math.round((Date.now() - t0) / 1000)} s\n`);
