import { Battle } from './battle';
import { champion, knockedOut, makeBracket, readyMatches, setWinner, type Bracket } from './bracket';
import { arenaOpponent, makeArenaCreature, type ArenaPick } from './arena';
import { stats, type Creature } from './creature';
import { Rng } from './rng';

/**
 * Arena tournament: you and 7 computer trainers in a single-elimination bracket (the same bracket
 * the battle royale finale uses). You play your own matches; the others are simulated.
 */
export const TOURNEY_SIZE = 8;
/** Your id in the bracket. */
export const YOU = 'you';

export interface TourneyTrainer {
  id: string;
  name: string;
  /** Computer trainers' teams (empty for you: your saved team is built fresh for each match). */
  team: Creature[];
  randomness: number;
  potions: number;
}

export interface Tournament {
  seed: number;
  bracket: Bracket;
  trainers: TourneyTrainer[];
  /** Your team, fixed when the tournament starts. */
  picks: ArenaPick[];
  /** The win has been counted (titles and records). */
  counted?: boolean;
}

/** Ladder strength (0 easiest to 4 toughest) of each computer trainer: a mixed field. */
const FIELD = [1, 1, 2, 2, 3, 3, 4];

export function newTournament(picks: ArenaPick[], seed: number): Tournament {
  const rng = new Rng(seed);
  const trainers: TourneyTrainer[] = [{ id: YOU, name: 'You', team: [], randomness: 0, potions: 0 }];
  // Every trainer gets their own first name.
  const first = (name: string) => name.split(' ').pop()!;
  const names = new Set<string>();
  FIELD.forEach((strength, i) => {
    let o = arenaOpponent(strength, seed + i * 104729);
    for (let k = 1; names.has(first(o.name)) && k < 40; k++) o = arenaOpponent(strength, seed + i * 104729 + k * 31);
    names.add(first(o.name));
    trainers.push({ id: `cpu${i + 1}`, name: o.name, team: o.team, randomness: o.randomness, potions: strength >= 4 ? 2 : strength >= 2 ? 1 : 0 });
  });
  return { seed, bracket: makeBracket(trainers.map((t) => t.id), rng), trainers, picks };
}

export const trainerOf = (t: Tournament, id: string | null): TourneyTrainer | undefined => t.trainers.find((x) => x.id === id);

/** A full-health copy of a trainer's team for one match. */
export function teamFor(t: Tournament, id: string): Creature[] {
  if (id === YOU) return t.picks.map((p) => makeArenaCreature(p));
  return (trainerOf(t, id)?.team ?? []).map((c) => {
    const copy: Creature = structuredClone(c);
    copy.hp = stats(copy).hp;
    delete copy.status;
    for (const m of copy.moves) m.used = 0;
    return copy;
  });
}

/** Your unplayed match: its round and index (null once you're out or have won). */
export function myMatch(t: Tournament): { round: number; index: number } | null {
  const b = t.bracket;
  if (knockedOut(b, YOU) || champion(b)) return null;
  for (let round = 0; round < b.rounds.length; round++) {
    const index = b.rounds[round].findIndex((m) => (m.a === YOU || m.b === YOU) && !m.winner);
    if (index >= 0) return { round, index };
  }
  return null;
}

/**
 * The next computer-only match to play out: one from a round before yours (so the rest of your
 * round waits until you've fought), or any once you're out.
 */
export function nextCpuMatch(t: Tournament): { round: number; index: number } | null {
  const mine = myMatch(t);
  const limit = mine ? mine.round : Infinity;
  const m = readyMatches(t.bracket).find((x) => x.round < limit && x.m.a !== YOU && x.m.b !== YOU);
  return m ? { round: m.round, index: m.index } : null;
}

/** Play a computer-vs-computer match to the end and record the winner. Returns the winner's id. */
export function playCpuMatch(t: Tournament, round: number, index: number): string {
  const m = t.bracket.rounds[round][index];
  const a = trainerOf(t, m.a)!;
  const b = trainerOf(t, m.b)!;
  const winner = simulate(t, a, b, t.seed + round * 1009 + index * 17) ? a.id : b.id;
  setWinner(t.bracket, round, index, winner);
  return winner;
}

/** Record your own match. */
export function recordMine(t: Tournament, won: boolean) {
  const mine = myMatch(t);
  if (!mine) return;
  const m = t.bracket.rounds[mine.round][mine.index];
  const opp = m.a === YOU ? m.b : m.a;
  if (!opp) return;
  setWinner(t.bracket, mine.round, mine.index, won ? YOU : opp);
}

/** Does `a` beat `b`? Both sides battle as auto-battle would, `b` as a computer trainer. */
function simulate(t: Tournament, a: TourneyTrainer, b: TourneyTrainer, seed: number): boolean {
  const rng = new Rng(seed);
  const battle = new Battle(teamFor(t, a.id), teamFor(t, b.id), rng, {
    permadeath: false,
    enemyRandomness: b.randomness,
    enemyTactics: { potions: b.potions, name: b.name },
  });
  battle.start();
  let potions = a.potions;
  for (let turn = 0; turn < 300; turn++) {
    const o = battle.outcome();
    if (o === 'win') return true;
    if (o === 'lose') return false;
    if (o === 'needSwitch') {
      battle.forcedSwitch(battle.bestPlayerAnswer());
      continue;
    }
    const plan = battle.autoPlan(potions);
    if (plan?.kind === 'potion') {
      potions--;
      battle.takeTurn({ kind: 'potion', index: battle.pActive, heal: 0.5 });
    } else if (plan?.kind === 'swap') battle.takeTurn({ kind: 'swap', index: plan.index });
    else {
      const moves = battle.p.c.moves;
      const index = rng.chance(a.randomness) && moves.length ? rng.int(0, moves.length - 1) : battle.bestMove('player');
      battle.takeTurn({ kind: 'move', index });
    }
  }
  // A stalemate: the side with more health left goes through.
  const left = (cs: Creature[]) => cs.reduce((s, c) => s + Math.max(0, c.hp) / stats(c).hp, 0);
  return left(battle.player.map((x) => x.c)) >= left(battle.enemy.map((x) => x.c));
}
