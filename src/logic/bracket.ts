import type { Rng } from './rng';

/**
 * A single-elimination tournament bracket (battle royale finale): 2 to 8 players, randomly seeded,
 * with byes for the top seeds when the count isn't a power of two. Plain data, so the host can send
 * it to every player as is.
 */
export interface BracketMatch {
  /** Player ids in the two slots (null: not decided yet, or no one, for a bye). */
  a: string | null;
  b: string | null;
  /** Who won (set once played, or straight away for a bye). */
  winner?: string;
  /** One side was empty, so the other went through without playing. */
  bye?: boolean;
}

export interface Bracket {
  /** rounds[0] is the first round; the last round has the one final match. */
  rounds: BracketMatch[][];
}

/** Seed order for a bracket of `size` (a power of two): 1 v size, then the halves mirrored. */
function seedOrder(size: number): number[] {
  let order = [1];
  while (order.length < size) {
    const n = order.length * 2;
    order = order.flatMap((s) => [s, n + 1 - s]);
  }
  return order;
}

/** A fresh bracket for these players (at least 2), in random seed order. */
export function makeBracket(ids: string[], rng: Rng): Bracket {
  const players = rng.shuffle([...ids]);
  let size = 2;
  while (size < players.length) size *= 2;
  const slots = seedOrder(size).map((seed) => players[seed - 1] ?? null);
  const rounds: BracketMatch[][] = [];
  const first: BracketMatch[] = [];
  for (let i = 0; i < size; i += 2) first.push({ a: slots[i], b: slots[i + 1] });
  rounds.push(first);
  for (let n = size / 4; n >= 1; n /= 2) rounds.push(Array.from({ length: n }, () => ({ a: null, b: null })));
  const b: Bracket = { rounds };
  // Byes go straight through.
  first.forEach((m, i) => {
    if (m.a && !m.b) setWinner(b, 0, i, m.a, true);
    else if (m.b && !m.a) setWinner(b, 0, i, m.b, true);
  });
  return b;
}

/** Record a match result and move the winner into the next round. */
export function setWinner(b: Bracket, round: number, index: number, winner: string, bye = false) {
  const m = b.rounds[round]?.[index];
  if (!m || m.winner || (winner !== m.a && winner !== m.b)) return;
  m.winner = winner;
  if (bye) m.bye = true;
  const next = b.rounds[round + 1]?.[Math.floor(index / 2)];
  if (!next) return;
  if (index % 2 === 0) next.a = winner;
  else next.b = winner;
}

/** Matches with both players known and no result yet. */
export function readyMatches(b: Bracket): { round: number; index: number; m: BracketMatch }[] {
  const out: { round: number; index: number; m: BracketMatch }[] = [];
  b.rounds.forEach((r, round) => r.forEach((m, index) => m.a && m.b && !m.winner && out.push({ round, index, m })));
  return out;
}

/** The tournament winner, once the final is decided. */
export const champion = (b: Bracket): string | null => b.rounds[b.rounds.length - 1][0].winner ?? null;

/** Has this player lost a match (or is the champion decided and it isn't them)? */
export function knockedOut(b: Bracket, id: string): boolean {
  return b.rounds.some((r) => r.some((m) => m.winner && m.winner !== id && (m.a === id || m.b === id)));
}

/** "Final", "Semifinal", "Quarterfinal" or "Round 1". */
export function roundName(b: Bracket, round: number): string {
  const left = b.rounds.length - round;
  return left === 1 ? 'Final' : left === 2 ? 'Semifinal' : left === 3 ? 'Quarterfinal' : `Round ${round + 1}`;
}

/** Keep a bracket from the host to well-formed data about known players. */
export function cleanBracket(x: unknown, ids: Set<string>): Bracket | null {
  const raw = x as { rounds?: unknown } | null;
  if (!raw || !Array.isArray(raw.rounds) || raw.rounds.length < 1 || raw.rounds.length > 3) return null;
  const id = (v: unknown) => (typeof v === 'string' && ids.has(v) ? v : null);
  const rounds = raw.rounds.map((r: unknown) =>
    (Array.isArray(r) ? r : []).slice(0, 4).map((m: Partial<BracketMatch> | null) => ({
      a: id(m?.a),
      b: id(m?.b),
      ...(id(m?.winner) ? { winner: id(m?.winner)! } : {}),
      ...(m?.bye === true ? { bye: true } : {}),
    })),
  );
  return rounds.every((r) => r.length > 0) ? { rounds } : null;
}
