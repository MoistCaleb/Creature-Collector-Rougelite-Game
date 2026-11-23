import { camp } from './camp';
import { hashString } from './rng';
import type { Meta } from './run';

/**
 * Gilded Hunt milestones (2.0): one-time rewards for each new deepest Gilded Hunt floor (bestHunt).
 * Paid once, from your best floor, so a save that already went deep before 2.0 is paid on the first
 * check (camp, or the next hunt floor). Their titles live in logic/titles (earned from bestHunt).
 */

export interface HuntMilestone {
  /** The hunt floor to reach. */
  floor: number;
  embers?: number;
  /** The Gilded campfire (embers in its place if you already own it). */
  fire?: boolean;
  /** A Gilded starter offer at some starter picks (see gildedStarterOffer). */
  gildedStarter?: boolean;
  /** A camp decoration only the hunt gives (a CampItem id). */
  decor?: string;
  /** A title earned at this floor (defined in logic/titles). */
  title?: string;
}

/** The Gilded campfire's id and what you get instead if it's already yours. */
export const GILDED_FIRE = 'fire-gold';
export const GILDED_FIRE_EMBERS = 40;
/** The hunt's camp decoration. */
export const HUNT_DECOR = 'hunt-totem';

/** Listed milestones; past the last, every 3 floors pays LATE_EMBERS. */
export const HUNT_MILESTONES: HuntMilestone[] = [
  { floor: 3, embers: 25 },
  { floor: 5, fire: true, title: 'Deep Diver' },
  { floor: 7, gildedStarter: true },
  { floor: 10, embers: 100, decor: HUNT_DECOR },
  { floor: 12, embers: 150, title: 'Hunt Master' },
  { floor: 15, embers: 200 },
  { floor: 18, embers: 250, title: 'Abyss Diver' },
  { floor: 21, embers: 300 },
  { floor: 24, embers: 350 },
  { floor: 27, embers: 400 },
  { floor: 30, embers: 500, title: 'Endless Hunter' },
];
const LAST = HUNT_MILESTONES[HUNT_MILESTONES.length - 1].floor;
export const LATE_EMBERS = 500;

/** The milestone at this floor, if any (beyond floor 30: every 3 floors). */
export function huntMilestoneAt(floor: number): HuntMilestone | null {
  const listed = HUNT_MILESTONES.find((m) => m.floor === floor);
  if (listed) return listed;
  return floor > LAST && (floor - LAST) % 3 === 0 ? { floor, embers: LATE_EMBERS } : null;
}

/** The next milestone above your best floor. */
export function nextHuntMilestone(meta: Meta): HuntMilestone {
  const best = meta.bestHunt ?? 0;
  for (let f = best + 1; ; f++) {
    const m = huntMilestoneAt(f);
    if (m) return m;
  }
}

/** What a milestone gives, as short lines (for the announcement and lists). */
export function huntRewardLines(m: HuntMilestone, fireOwned = false): string[] {
  return [
    ...(m.embers ? [`+${m.embers} embers`] : []),
    ...(m.fire ? [fireOwned ? `+${GILDED_FIRE_EMBERS} embers (you already have the Gilded fire)` : 'The Gilded campfire'] : []),
    ...(m.gildedStarter ? ['Gilded starters: now and then, one of your three starters is offered Gilded'] : []),
    ...(m.decor ? ['A Gilded Hunt totem for your camp'] : []),
    ...(m.title ? [`Title: ${m.title}`] : []),
  ];
}

/** Has this save earned the Gilded starter offer? */
export const hasGildedStarters = (meta: Meta): boolean => HUNT_MILESTONES.some((m) => m.gildedStarter && (meta.huntPaid ?? 0) >= m.floor);

export interface PaidMilestone {
  floor: number;
  lines: string[];
}

/**
 * Pay every milestone up to your best floor that hasn't been paid (once each). Returns what was
 * paid, and queues it to be announced (takeHuntNews). Caller saves meta.
 */
export function payHuntMilestones(meta: Meta): PaidMilestone[] {
  const best = meta.bestHunt ?? 0;
  const paid = meta.huntPaid ?? 0;
  if (best <= paid) return [];
  const out: PaidMilestone[] = [];
  const c = camp(meta);
  for (let f = paid + 1; f <= best; f++) {
    const m = huntMilestoneAt(f);
    if (!m) continue;
    const fireOwned = !!m.fire && c.owned.includes(GILDED_FIRE);
    if (m.embers) c.embers += m.embers;
    if (m.fire) {
      if (fireOwned) c.embers += GILDED_FIRE_EMBERS;
      else {
        c.owned.push(GILDED_FIRE);
        c.fire = GILDED_FIRE;
      }
    }
    if (m.decor && !c.owned.includes(m.decor)) c.owned.push(m.decor);
    out.push({ floor: f, lines: huntRewardLines(m, fireOwned) });
  }
  meta.huntPaid = best;
  if (out.length) meta.huntNews = [...(meta.huntNews ?? []), ...out];
  return out;
}

/** Milestones paid but not yet announced (and clears them). Caller saves meta. */
export function takeHuntNews(meta: Meta): PaidMilestone[] {
  const news = meta.huntNews ?? [];
  meta.huntNews = [];
  return news;
}

/** The announcement text for paid milestones. */
export function huntNewsText(news: PaidMilestone[]): string {
  return news.map((n) => [`Gilded Hunt floor ${n.floor}!`, ...n.lines].join('\n')).join('\n\n');
}

/** One starter pick in this many offers a Gilded starter (once the floor 7 milestone is yours). */
export const GILDED_STARTER_IN = 5;

/**
 * The starter offered Gilded at this pick, if any: from your run count, so leaving and coming back
 * doesn't reroll it. Only lines you don't own Gilded yet. Normal runs only (the caller checks).
 */
export function gildedStarterOffer(meta: Meta, choices: string[]): string | null {
  if (!hasGildedStarters(meta)) return null;
  const h = hashString(`gilded-starter:${meta.runs}`);
  if (h % GILDED_STARTER_IN !== 0) return null;
  const open = choices.filter((id) => !(meta.shinyOwned ?? []).includes(id));
  return open.length ? open[(h >>> 4) % open.length] : null;
}
