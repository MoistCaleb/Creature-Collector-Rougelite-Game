import { BALANCE } from '../data/balance';
import { HELD, heldName, type HeldId } from '../data/held';
import { heatRules } from '../data/heat';
import { MAX_TIER } from '../data/moves';
import { speciesWithElement } from '../data/species';
import {
  addLevels,
  canPrestige,
  createCreature,
  healFraction,
  levelCap,
  restoreUses,
  stats,
  type Creature,
} from './creature';
import { checkAchievements } from './achievements';
import { allCreatures, maxPotions, BENCH_MAX, highestLevel, prestigeTracked, releaseNote, rollHeld, stash, trackStat, rosterFull, saveMeta, TEAM_MAX, type Run } from './run';

export type ItemId = 'potion' | 'restore' | 'manual' | 'scroll' | 'stone' | 'sigil' | 'recruit' | 'held';

/** What the buyer has to pick after paying. */
export type Target = 'none' | 'creature' | 'move';

export interface ItemDef {
  name: string;
  desc: string;
  basePrice: number;
  weight: number;
  target: Target;
}

export const ITEMS: Record<ItemId, ItemDef> = {
  potion: { name: 'Potion', desc: 'Carry it · heals 50% and cures status, even mid-battle', basePrice: 15, weight: 10, target: 'none' },
  restore: { name: 'Full Restore', desc: 'Heal every Hexling to full, cure statuses and restore move uses', basePrice: 70, weight: 6, target: 'none' },
  manual: { name: 'Training Manual', desc: 'One Hexling gains 2 levels', basePrice: 45, weight: 9, target: 'creature' },
  scroll: { name: 'Skill Scroll', desc: 'Upgrade one move a tier', basePrice: 55, weight: 8, target: 'move' },
  stone: { name: 'Evolution Stone', desc: 'Evolve a Hexling that has reached Lv 30 (or 65 for its final form)', basePrice: 120, weight: 5, target: 'none' },
  sigil: { name: 'Prestige Sigil', desc: 'Prestige a Hexling, no sacrifice', basePrice: 150, weight: 3, target: 'creature' },
  recruit: { name: 'Recruit', desc: 'A Hexling joins your party', basePrice: 80, weight: 6, target: 'none' },
  held: { name: 'Held item', desc: 'Give it to a Hexling from the Team screen', basePrice: 60, weight: 7, target: 'none' },
};

/** Display name of a slot (held items show which item). */
export function slotName(slot: { item: ItemId; held?: HeldId }): string {
  return slot.item === 'held' && slot.held ? heldName(slot.held) : ITEMS[slot.item].name;
}

/** Pixel icon for a slot, if it has one. */
export function slotGlyph(slot: { item: ItemId; held?: HeldId }): import('../ui/icons').IconId | undefined {
  if (slot.item === 'held' && slot.held) return HELD[slot.held].icon;
  const map: Partial<Record<ItemId, import('../ui/icons').IconId>> = { potion: 'potion', restore: 'cross', stone: 'gem', sigil: 'star', manual: 'arrowUp', scroll: 'sparkle' };
  return map[slot.item];
}

/** Description of a slot. */
export function slotDesc(slot: { item: ItemId; held?: HeldId }): string {
  return slot.item === 'held' && slot.held ? `${HELD[slot.held].desc} · equip from the Team screen` : ITEMS[slot.item].desc;
}

export interface ShopSlot {
  item: ItemId;
  price: number;
  sold: boolean;
  /** For recruits: the creature on offer (rolled up front so rerolls can't be dodged). */
  recruit?: Creature;
  /** For held items: which one. */
  held?: HeldId;
}

export interface Shop {
  slots: ShopSlot[];
  rerolls: number;
  /** Items this shop always stocks (kept through rerolls). */
  guaranteed: ItemId[];
}

export function priceFor(run: Run, base: number): number {
  const floorMult = 1 + BALANCE.shopFloorMarkup * run.floor;
  const discount = run.passive === 'haggler' ? 0.75 : 1;
  return Math.max(1, Math.round((base * floorMult * discount * heatRules(run.heat ?? 0).priceMult) / 5) * 5);
}

export function rerollPrice(run: Run, shop: Shop): number {
  return priceFor(run, 10 + shop.rerolls * 10);
}

export function rollShop(run: Run, rerolls = 0, guaranteed: ItemId[] = []): Shop {
  const ids = Object.keys(ITEMS) as ItemId[];
  const chosen: ItemId[] = [...guaranteed];
  while (chosen.length < 5) {
    const weights: Partial<Record<ItemId, number>> = {};
    for (const id of ids) if (!chosen.includes(id)) weights[id] = ITEMS[id].weight;
    chosen.push(run.rng.weighted(weights));
  }
  const slots: ShopSlot[] = chosen.map((item) => {
    const slot: ShopSlot = { item, price: priceFor(run, ITEMS[item].basePrice), sold: false };
    if (item === 'recruit') {
      const pool = speciesWithElement(run.biomes[run.floor]);
      const level = Math.max(1, Math.round(highestLevel(run) * 0.6));
      slot.recruit = createCreature(run.rng.pick(pool).id, level);
    }
    if (item === 'held') slot.held = rollHeld(run.rng);
    return slot;
  });
  return { slots, rerolls, guaranteed };
}

export function canAfford(run: Run, price: number): boolean {
  return run.coins >= price;
}

/** Creatures this item can be used on (empty = item usable without a target, or unusable). */
export function eligibleTargets(run: Run, item: ItemId): Creature[] {
  const all = allCreatures(run);
  switch (item) {
    case 'manual':
      return all.filter((c) => c.level < levelCap(c));
    case 'scroll':
      return all.filter((c) => c.moves.some((m) => m.tier < MAX_TIER));
    case 'sigil':
      return all.filter(canPrestige);
    default:
      return [];
  }
}

/** Whether buying this would do anything right now. Returns a reason if not. */
export function unusableReason(run: Run, slot: ShopSlot): string | null {
  const def = ITEMS[slot.item];
  if (def.target !== 'none' && eligibleTargets(run, slot.item).length === 0) return 'No Hexling can use this';
  if (slot.item === 'restore' && allCreatures(run).every((c) => c.hp >= stats(c).hp && !c.status)) return 'Everyone is healthy';
  if (slot.item === 'recruit' && rosterFull(run)) return 'Your party is full';
  if (slot.item === 'potion' && (run.potions ?? 0) >= maxPotions(run)) return `Your pouch is full (${maxPotions(run)} potions)`;
  return null;
}

/** Take payment. Call once the purchase is confirmed (target chosen). */
export function pay(run: Run, price: number) {
  run.coins -= price;
  run.meta.coinsSpent += price;
  checkAchievements(run.meta);
  saveMeta(run.meta);
}

/** Applies an item. `target` is the chosen creature; `moveIndex` the chosen move for scrolls. Returns a result line. */
export function applyItem(run: Run, slot: ShopSlot, target?: Creature, moveIndex?: number): string {
  switch (slot.item) {
    case 'potion':
      run.potions = (run.potions ?? 0) + 1;
      return `Potion added to your pouch (${run.potions}/${maxPotions(run)}). Use it from the battle screen or the Team screen.`;
    case 'restore':
      for (const c of allCreatures(run)) {
        healFraction(c, 1);
        restoreUses(c);
      }
      return 'Everyone is fully healed and every move is restored.';
    case 'manual': {
      const n = addLevels(target!, 2);
      return `Gained ${n} level${n === 1 ? '' : 's'} (now Lv ${target!.level}).`;
    }
    case 'scroll':
      target!.moves[moveIndex!].tier += 1;
      trackStat(run, 'skillUps');
      return `Move upgraded to tier ${target!.moves[moveIndex!].tier}.`;
    case 'stone':
      run.evoStones += 1;
      return 'Evolution Stone added. Use it from the Team screen on a Hexling at Lv 30 (or 65 for its final form).';
    case 'sigil':
      const lv = target!.level;
      prestigeTracked(run, target!);
      return `Prestiged to ${'★'.repeat(target!.stars)}.${releaseNote(target!, lv)}`;
    case 'held':
      stash(run, slot.held ?? rollHeld(run.rng));
      return 'Added to your bag. Give it to a Hexling from the Team screen.';
    case 'recruit': {
      const c = slot.recruit!;
      if (run.team.length < TEAM_MAX) run.team.push(c);
      else if (run.bench.length < BENCH_MAX) run.bench.push(c);
      return `Joined your ${run.team.includes(c) ? 'team' : 'bench'}.`;
    }
  }
}
