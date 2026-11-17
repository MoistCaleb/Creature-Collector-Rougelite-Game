import type { Element } from './types';

/** A rule a floor boss bends the battle with. Implemented in logic/battle.ts. */
export type BossRule =
  | 'scorch' // end of turn: your active creature takes 1/16 max HP (Fire types are immune)
  | 'riptide' // switching in costs your creature 1/8 max HP
  | 'thorns' // hitting a boss creature hurts the attacker for 15% of the damage
  | 'bulwark' // boss creatures enter with +1 Defense
  | 'tailwind' // the boss always moves first (priority moves still win)
  | 'whiteout' // your creatures enter with -1 Speed
  | 'miasma' // your creatures are poisoned when they enter
  | 'overclock' // end of turn: the boss's active creature gains +1 Attack
  | 'sanctuary' // end of turn: the boss's active creature heals 1/12 max HP
  | 'dread' // your creatures enter with -1 Attack
  | 'curse' // a fainting boss creature curses your active one for 1/5 max HP
  | 'pride'; // the boss's ace enters with +1 Attack and +1 Speed

export interface BossDef {
  element: Element;
  name: string;
  title: string;
  quote: string;
  /** Second element for the boss's ace, when such a creature exists. */
  partner: Element;
  rule: BossRule;
  ruleName: string;
  ruleDesc: string;
}

/** One floor guardian per element; a floor's biome picks its boss. */
export const BOSSES: Record<Element, BossDef> = {
  Fire: {
    element: 'Fire', name: 'Ignis', title: 'the Kiln Warden', partner: 'Earth',
    quote: 'Everything here burns. Even you.',
    rule: 'scorch', ruleName: 'Scorched Ground', ruleDesc: 'Your active Hexling takes damage every turn unless it is Fire type.',
  },
  Frost: {
    element: 'Frost', name: 'Hela', title: 'Queen of the Whiteout', partner: 'Water',
    quote: 'Slow down. Stay a while. Forever.',
    rule: 'whiteout', ruleName: 'Whiteout', ruleDesc: 'Your Hexlings lose 1 Speed whenever they enter battle.',
  },
  Nature: {
    element: 'Nature', name: 'Bramble', title: 'the Thornmother', partner: 'Toxic',
    quote: 'Touch my children and you will bleed.',
    rule: 'thorns', ruleName: 'Thornwall', ruleDesc: 'Your attacks on her Hexlings hurt you for 15% of the damage dealt.',
  },
  Earth: {
    element: 'Earth', name: 'Gorran', title: 'the Unmoved', partner: 'Metal',
    quote: 'Mountains do not fall. Neither do I.',
    rule: 'bulwark', ruleName: 'Bulwark', ruleDesc: 'His Hexlings enter battle with +1 Defense.',
  },
  Storm: {
    element: 'Storm', name: 'Volta', title: 'the Living Gale', partner: 'Light',
    quote: 'You will never see me coming.',
    rule: 'tailwind', ruleName: 'Tailwind', ruleDesc: 'Her Hexlings always strike first, unless you use a priority move.',
  },
  Water: {
    element: 'Water', name: 'Maren', title: 'Keeper of the Undertow', partner: 'Frost',
    quote: 'Every retreat costs something down here.',
    rule: 'riptide', ruleName: 'Riptide', ruleDesc: 'Each Hexling you send in takes 1/8 of its HP as damage.',
  },
  Metal: {
    element: 'Metal', name: 'Forge', title: 'the Iron Engine', partner: 'Storm',
    quote: 'Every turn I grow stronger. Can you keep up?',
    rule: 'overclock', ruleName: 'Overclock', ruleDesc: 'His active Hexling gains +1 Attack at the end of every turn.',
  },
  Toxic: {
    element: 'Toxic', name: 'Morva', title: 'the Plague Bloom', partner: 'Shadow',
    quote: 'Breathe deep, little ones.',
    rule: 'miasma', ruleName: 'Miasma', ruleDesc: 'Your Hexlings are poisoned whenever they enter battle.',
  },
  Shadow: {
    element: 'Shadow', name: 'Nyx', title: 'the Eclipse', partner: 'Spirit',
    quote: 'In the dark, your courage fails.',
    rule: 'dread', ruleName: 'Dread', ruleDesc: 'Your Hexlings lose 1 Attack whenever they enter battle.',
  },
  Light: {
    element: 'Light', name: 'Solenne', title: 'the Radiant', partner: 'Spirit',
    quote: 'The light mends all who serve it.',
    rule: 'sanctuary', ruleName: 'Sanctuary', ruleDesc: 'Her active Hexling heals at the end of every turn.',
  },
  Spirit: {
    element: 'Spirit', name: 'Wraithe', title: 'the Hollow King', partner: 'Shadow',
    quote: 'Strike me down. I will take you with me.',
    rule: 'curse', ruleName: 'Death Curse', ruleDesc: 'When one of his Hexlings faints, your active Hexling takes heavy damage.',
  },
  Dragon: {
    element: 'Dragon', name: 'Vharos', title: 'the Last Wyrm', partner: 'Fire',
    quote: 'Kneel, or be ash.',
    rule: 'pride', ruleName: "Dragon's Pride", ruleDesc: 'His ace enters battle with +1 Attack and +1 Speed.',
  },
};

// ---------------------------------------------------------------- trainers (elite battles)

export const TRAINER_CLASSES = ['Ace Trainer', 'Veteran', 'Beast Tamer', 'Ranger', 'Duelist', 'Collector', 'Champion Hopeful', 'Drifter'];
export const TRAINER_NAMES = [
  'Rhea', 'Corin', 'Juno', 'Talon', 'Mira', 'Dax', 'Sable', 'Wren', 'Orrin', 'Kestrel',
  'Lyra', 'Bram', 'Petra', 'Silas', 'Nova', 'Quill', 'Rook', 'Isolde', 'Fenn', 'Zara',
];

/** A trainer's display name, e.g. "Ace Trainer Rhea". */
export function trainerName(pick: <T>(xs: readonly T[]) => T): string {
  return `${pick(TRAINER_CLASSES)} ${pick(TRAINER_NAMES)}`;
}
