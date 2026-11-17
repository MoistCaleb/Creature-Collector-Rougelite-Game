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
  | 'pride' // the boss's ace enters with +1 Attack and +1 Speed
  // Extra rules: no guardian has these as its own; they come in on top at Heat 4+.
  | 'brittle' // your creatures enter with -1 Defense
  | 'fog' // your moves are 15% less accurate
  | 'keeneye' // the boss's moves never miss
  | 'leech' // end of turn: your active creature loses 1/16 max HP and the boss's heals that much
  | 'vengeance' // after one of the boss's creatures faints, the next enters with +1 Attack
  | 'static' // your creatures may be paralysed when they enter (35%)
  | 'ironhide' // super-effective hits on the boss's creatures are weaker (x1.25 instead of x1.5)
  | 'secondwind'; // once each, a boss creature that drops below 1/3 HP heals 35%

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

/** Every rule's name and what it does (said of any guardian, for extra rules). */
export const RULES: Record<BossRule, { name: string; desc: string }> = {
  scorch: { name: 'Scorched Ground', desc: 'Your active Hexling takes damage every turn unless it is Fire type.' },
  riptide: { name: 'Riptide', desc: 'Each Hexling you send in takes 1/8 of its HP as damage.' },
  thorns: { name: 'Thornwall', desc: 'Your attacks on their Hexlings hurt you for 15% of the damage dealt.' },
  bulwark: { name: 'Bulwark', desc: 'Their Hexlings enter battle with +1 Defense.' },
  tailwind: { name: 'Tailwind', desc: 'Their Hexlings always strike first, unless you use a priority move.' },
  whiteout: { name: 'Whiteout', desc: 'Your Hexlings lose 1 Speed whenever they enter battle.' },
  miasma: { name: 'Miasma', desc: 'Your Hexlings are poisoned whenever they enter battle.' },
  overclock: { name: 'Overclock', desc: 'Their active Hexling gains +1 Attack at the end of every turn.' },
  sanctuary: { name: 'Sanctuary', desc: 'Their active Hexling heals at the end of every turn.' },
  dread: { name: 'Dread', desc: 'Your Hexlings lose 1 Attack whenever they enter battle.' },
  curse: { name: 'Death Curse', desc: 'When one of their Hexlings faints, your active Hexling takes heavy damage.' },
  pride: { name: "Dragon's Pride", desc: 'Their ace enters battle with +1 Attack and +1 Speed.' },
  brittle: { name: 'Brittle Air', desc: 'Your Hexlings lose 1 Defense whenever they enter battle.' },
  fog: { name: 'Thick Fog', desc: 'Your moves are 15% less accurate.' },
  keeneye: { name: 'Keen Eye', desc: 'Their moves never miss.' },
  leech: { name: 'Leech Field', desc: 'Every turn your active Hexling loses 1/16 of its HP, and their active Hexling heals that much.' },
  vengeance: { name: 'Vengeance', desc: 'When one of their Hexlings faints, the next one enters with +1 Attack.' },
  static: { name: 'Static Field', desc: 'Your Hexlings may be paralysed when they enter battle (35%).' },
  ironhide: { name: 'Ironhide', desc: 'Your super-effective hits on their Hexlings are weaker (×1.25 instead of ×1.5).' },
  secondwind: { name: 'Second Wind', desc: 'Once each, their Hexlings heal 35% when they drop below a third of their HP.' },
};

/** Levels a guardian loses for each extra rule it brings (Heat 4+), to keep the fight fair. */
export const EXTRA_RULE_LEVELS = 2;

/** How many extra rules guardians bring at this Heat: one from Heat 4, two at Heat 8. */
export const extraRuleCount = (heat: number) => (heat >= 8 ? 2 : heat >= 4 ? 1 : 0);

/**
 * A guardian's rules for this fight: its own, plus extra ones at Heat 4+ (picked by the run's seed
 * and floor, so a reload brings the same ones). Its own rule comes first.
 */
export function guardianRules(boss: BossDef, heat: number, seed: number, floor: number): { rule: BossRule; name: string; desc: string }[] {
  const own = { rule: boss.rule, name: boss.ruleName, desc: boss.ruleDesc };
  const n = extraRuleCount(heat);
  if (!n) return [own];
  const pool = (Object.keys(RULES) as BossRule[]).filter((r) => r !== boss.rule && r !== 'pride');
  let h = (seed ^ (floor * 2654435761)) >>> 0;
  const out = [own];
  for (let i = 0; i < n && pool.length; i++) {
    h = (Math.imul(h ^ (h >>> 15), 2246822507) + 0x9e3779b9) >>> 0;
    const r = pool.splice(h % pool.length, 1)[0];
    out.push({ rule: r, ...RULES[r] });
  }
  return out;
}
