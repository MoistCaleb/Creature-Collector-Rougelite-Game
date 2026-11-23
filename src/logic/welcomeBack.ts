import { camp } from './camp';
import type { Meta } from './run';

/**
 * Welcome-back embers (2.0): a one-time gift for saves from before 2.0, from the progress they
 * already made, so veterans don't start the Workshop from zero. Worked out when the old save is
 * first loaded (`noteWelcomeBack` in loadMeta) and paid on the next camp visit (`payWelcomeBack`).
 */

/** Embers for each past run won. */
export const WELCOME_PER_WIN = 10;
/** Embers for each past run that wasn't a win. */
export const WELCOME_PER_RUN = 2;
/** The most a save can get: one full Workshop branch (a quarter of the Workshop). */
export const WELCOME_CAP = 1250;

export interface WelcomeBack {
  embers: number;
  wins: number;
  runs: number;
  paid: boolean;
}

/** The gift for this much past progress. */
export function welcomeGift(wins: number, runs: number): number {
  const w = Math.max(0, wins);
  const lost = Math.max(0, runs - w);
  return Math.min(WELCOME_CAP, w * WELCOME_PER_WIN + lost * WELCOME_PER_RUN);
}

/**
 * On load: a save with no welcome record is from before 2.0, so it gets the gift for what it has
 * done (once; new saves start with an empty, already-paid record).
 */
export function noteWelcomeBack(meta: Meta) {
  if (meta.welcome) return;
  meta.welcome = { embers: welcomeGift(meta.wins, meta.runs), wins: meta.wins, runs: meta.runs, paid: false };
}

/** A new save: nothing to welcome back. */
export const freshWelcome = (): WelcomeBack => ({ embers: 0, wins: 0, runs: 0, paid: true });

/** Pay the gift (once). Returns it if it was paid just now, or null. */
export function payWelcomeBack(meta: Meta): WelcomeBack | null {
  const w = meta.welcome;
  if (!w || w.paid) return null;
  w.paid = true;
  if (!w.embers) return null;
  camp(meta).embers += w.embers;
  return w;
}

/** The welcome message. */
export function welcomeText(w: WelcomeBack): string {
  const runs = w.runs - w.wins;
  const parts = [`${w.wins} win${w.wins === 1 ? '' : 's'}`, ...(runs > 0 ? [`${runs} other run${runs === 1 ? '' : 's'}`] : [])];
  return `For your ${parts.join(' and ')} so far, the camp gives you ${w.embers} embers${w.embers >= WELCOME_CAP ? ' (the most it gives)' : ''}.\n\nSpend them in the Workshop on lasting upgrades, or on decorations at the Ember stall. Every run pays more embers from now on, win or lose.`;
}
