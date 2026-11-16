/** Held items: each creature can carry one. Effects are applied in battle (logic/battle.ts) and XP (logic/run.ts). */

export type HeldId = 'band' | 'charm' | 'shell' | 'scarf' | 'claw' | 'lens' | 'fang' | 'barb' | 'berry' | 'sash' | 'egg';

export interface HeldDef {
  name: string;
  /** Pixel icon (see ui/icons.ts). */
  icon: import('../ui/icons').IconId;
  desc: string;
  /** Relative chance to show up. */
  weight: number;
}

export const HELD: Record<HeldId, HeldDef> = {
  band: { name: 'Power Band', icon: 'band', desc: 'Attacks deal 15% more damage', weight: 10 },
  charm: { name: 'Type Charm', icon: 'charm', desc: 'Moves of its own type deal 20% more damage', weight: 10 },
  shell: { name: 'Hard Shell', icon: 'shell', desc: 'Takes 15% less damage', weight: 10 },
  scarf: { name: 'Swift Scarf', icon: 'scarf', desc: '+25% speed', weight: 9 },
  claw: { name: 'Quick Claw', icon: 'claw', desc: '25% chance to act first', weight: 8 },
  lens: { name: 'Focus Lens', icon: 'lens', desc: 'Moves never miss', weight: 7 },
  fang: { name: 'Vampire Fang', icon: 'fang', desc: 'Heals 15% of damage it deals', weight: 8 },
  barb: { name: 'Barb Collar', icon: 'barb', desc: 'Attackers take 15% of the damage back', weight: 8 },
  berry: { name: 'Berry Pouch', icon: 'berry', desc: 'Heals 1/12 max HP each turn', weight: 9 },
  sash: { name: 'Last Stand Sash', icon: 'sash', desc: 'Once per battle, survives a knockout blow from full HP', weight: 6 },
  egg: { name: 'Lucky Egg', icon: 'egg', desc: 'Earns 40% more XP', weight: 7 },
};

export const HELD_IDS = Object.keys(HELD) as HeldId[];

export const heldName = (id: HeldId) => HELD[id].name;
