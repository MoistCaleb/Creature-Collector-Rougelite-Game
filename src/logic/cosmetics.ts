import { AURAS, BACKS, HATS, LOOK_PARTS, SHOES, TOPS, type TrainerLook } from '../data/trainerLook';
import { lockedBy as gildedLock, gildedCount } from './gilded';
import type { Meta } from './run';
import { earnedTitles, hasTitle, TITLE_BY_NAME, type TitleDef } from './titles';

/**
 * Cosmetics that trainer titles unlock: earn the title, wear the item. (Gilded milestone outfits
 * unlock through logic/gilded.) Never worn by NPC trainers.
 */
export interface Cosmetic {
  key: keyof TrainerLook;
  value: number;
  /** "Hat: Flame crown". */
  name: string;
}

const item = (key: keyof TrainerLook, names: readonly string[], name: string): Cosmetic => {
  const value = names.indexOf(name);
  if (value < 0) throw new Error(`No ${key} named ${name}`);
  const label = LOOK_PARTS.find((p) => p.key === key)!.label;
  return { key, value, name: `${label}: ${name}` };
};
const hat = (n: string) => item('hat', HATS, n);
const top = (n: string) => item('top', TOPS, n);
const shoes = (n: string) => item('shoes', SHOES, n);
const aura = (n: string) => item('aura', AURAS, n);
const back = (n: string) => item('back', BACKS, n);

/** What each title unlocks. */
export const TITLE_REWARDS: Record<string, Cosmetic[]> = {
  // Common
  Rookie: [hat('Viking helm')],
  Pathfinder: [shoes('Cloud steps')],
  Wrangler: [back('Dragon tail')],
  'Treasure Hound': [back('Jetpack')],
  // Rare
  Champion: [back('Angel wings')],
  'Guardian Breaker': [back('Greatsword')],
  'Field Researcher': [hat('Wizard hat')],
  'Arena Ace': [top('Mech suit')],
  Duelist: [aura('Storm')],
  // Epic
  Heatseeker: [hat('Flame crown'), aura('Inferno')],
  Unbroken: [hat('Storm cloud')],
  Cartographer: [shoes('Rocket boots')],
  'Deep Diver': [aura('Frost')],
  'Weekly Victor': [back('Fairy wings'), aura('Toxic')],
  'Royale Victor': [back('Victory banner')],
  Rival: [back('Demon wings'), aura('Shadow')],
  // Legendary
  'Inferno Walker': [back('Phoenix wings')],
  'Living Legend': [top('Dragon armor'), hat('Dragon helm')],
  'Hexlidex Master': [hat('Third eye'), aura('Starfall')],
  'Grand Duelist': [back('Mech arms')],
  'Royale Champion': [aura('Regal')],
  // Mythic
  Unstoppable: [aura('Rainbow'), hat('Astral halo')],
  Hexbound: [top('Void cloak'), aura('Void')],
  'Battle Monarch': [hat('Monarch crown'), top('Royal mantle')],
};

/** The title that unlocks this look option, if a title does. */
export function rewardTitle(key: keyof TrainerLook, value: number): TitleDef | null {
  for (const [name, items] of Object.entries(TITLE_REWARDS)) if (items.some((c) => c.key === key && c.value === value)) return TITLE_BY_NAME[name];
  return null;
}

export interface Lock {
  /** Short, for the option's cell. */
  short: string;
  /** For the message when you tap it. */
  long: string;
  /** The title that unlocks it (title rewards). */
  title?: TitleDef;
}

/** Why this look option is locked for you (null: you can wear it). */
export function lockOf(meta: Meta, key: keyof TrainerLook, value: number): Lock | null {
  const t = rewardTitle(key, value);
  if (t) {
    if (hasTitle(meta, t)) return null;
    const [have, need] = t.progress(meta);
    return {
      short: t.name,
      long: `A reward for the title “${t.name}”.\n\n${t.desc} (${Math.min(have, need)}/${need})`,
      title: t,
    };
  }
  const m = gildedLock(meta, key, value);
  if (!m) return null;
  return {
    short: `✦ ${m.count} Gilded`,
    long: `A Gilded milestone reward: own ${m.count} Gilded species to wear it (you have ${gildedCount(meta)}).\n\nCatch a Gilded Hexling in any form to own its whole line.`,
  };
}

/** The rewards line for a title ("Unlocks Flame crown, Inferno aura"), or ''. */
export function rewardText(title: string): string {
  const items = TITLE_REWARDS[title] ?? [];
  return items.length ? `Unlocks ${items.map((c) => c.name.replace(/^Aura: (.*)$/, '$1 aura').replace(/^[^:]+: /, '')).join(', ')}` : '';
}

/** What new titles unlock, as one line ("Flame crown, Inferno aura"), or ''. */
export const unlocksOf = (ts: TitleDef[]): string =>
  ts
    .map((t) => rewardText(t.name).replace(/^Unlocks /, ''))
    .filter(Boolean)
    .join(', ');

/** A paragraph announcing new titles and what they unlock (empty when there are none). */
export function titleNews(ts: TitleDef[]): string {
  if (!ts.length) return '';
  const u = unlocksOf(ts);
  return `\n\nNew title${ts.length > 1 ? 's' : ''}: ${ts.map((t) => t.name).join(', ')}!${u ? `\nUnlocked: ${u}` : ''}`;
}

// ---------------------------------------------------------------- what's new to you

export const itemId = (key: keyof TrainerLook, value: number) => `${key}:${value}`;

/** Every reward option (past the free ones) you can wear now. */
export function unlockedExtras(meta: Meta): { key: keyof TrainerLook; value: number }[] {
  const out: { key: keyof TrainerLook; value: number }[] = [];
  for (const p of LOOK_PARTS) for (let v = p.free ?? p.names.length; v < p.names.length; v++) if (!lockOf(meta, p.key, v)) out.push({ key: p.key, value: v });
  return out;
}

/** Unlocked gear you haven't looked at yet in the editor. */
export const newItems = (meta: Meta) => unlockedExtras(meta).filter((i) => !(meta.seenItems ?? []).includes(itemId(i.key, i.value)));

/** Earned titles you haven't looked at yet on the Titles screen. */
export const newTitles = (meta: Meta) => earnedTitles(meta).filter((t) => !(meta.seenTitles ?? []).includes(t));

/** Mark gear (by itemId) or titles as seen. Returns true if anything changed (caller saves). */
export function markSeen(meta: Meta, kind: 'seenItems' | 'seenTitles', ids: string[]): boolean {
  const seen = new Set(meta[kind] ?? []);
  const fresh = ids.filter((id) => !seen.has(id));
  if (!fresh.length) return false;
  meta[kind] = [...seen, ...fresh];
  return true;
}
