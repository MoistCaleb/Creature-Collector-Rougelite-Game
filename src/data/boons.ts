import type { Element } from './types';

/**
 * Boons (Hexbound 2.0): rule-bending perks for one run that stack into a build. Offered after
 * each guardian, on Boon hexes and in the Gilded Hunt (see logic/boons for offers and effects).
 */

export type BoonRarity = 'common' | 'rare' | 'mythic' | 'curse';

export interface BoonDef {
  id: string;
  name: string;
  rarity: BoonRarity;
  /** Element boons: they help Hexlings of this element. */
  element?: Element;
  desc: string;
  /** Curses: what it costs and what it gives (shown in red and green). */
  drawback?: string;
  reward?: string;
}

const B = (id: string, name: string, rarity: BoonRarity, desc: string, element?: Element): BoonDef => ({ id, name, rarity, desc, ...(element ? { element } : {}) });
const C = (id: string, name: string, drawback: string, reward: string): BoonDef => ({ id, name, rarity: 'curse', desc: `${drawback} ${reward}`, drawback, reward });

export const BOON_LIST: BoonDef[] = [
  // ------------------------------------------------------------ Fire (4)
  B('kindling', 'Kindling', 'common', 'Fire moves have +20% burn chance; burned foes take +20% from Fire moves.', 'Fire'),
  B('heatwave', 'Heat Wave', 'common', 'After a win, your Fire Hexlings heal 15% (30% if the sun was out).', 'Fire'),
  B('emberheart', 'Ember Heart', 'common', "Your Fire Hexlings can't be frozen and take 25% less from Water.", 'Fire'),
  B('wildfire', 'Wildfire', 'rare', "Burns you cause last 2 extra turns, and burned foes can't heal.", 'Fire'),
  // ------------------------------------------------------------ Frost (4)
  B('permafrost', 'Permafrost', 'common', 'Freezes you cause last 1 extra turn; frozen foes take +25%.', 'Frost'),
  B('hailguard', 'Hailguard', 'common', 'Your Frost Hexlings take 20% less from slower foes.', 'Frost'),
  B('brittle', 'Brittle', 'common', "Frost moves have a 30% chance to lower the foe's Defense.", 'Frost'),
  B('glacier', 'Glacier', 'rare', 'Your Frost Hexlings start each battle at +2 Defense.', 'Frost'),
  // ------------------------------------------------------------ Toxic (4)
  B('virulence', 'Virulence', 'common', 'Poison you cause deals double damage.', 'Toxic'),
  B('contagion', 'Contagion', 'common', 'Toxic moves have +25% poison chance, and your poison reaches Metal Hexlings.', 'Toxic'),
  B('venomsac', 'Venom Sac', 'common', 'Your Toxic Hexlings deal +25% to poisoned foes.', 'Toxic'),
  B('plaguebearer', 'Plague Bearer', 'rare', "The foe's first Hexling starts each battle poisoned.", 'Toxic'),
  // ------------------------------------------------------------ Spirit (4)
  B('haunting', 'Haunting', 'common', "When one of your Hexlings faints, its spirit hits the foe for 20% of the foe's max HP.", 'Spirit'),
  B('phantomstep', 'Phantom Step', 'common', 'Your Spirit Hexlings dodge the first attack aimed at them each battle.', 'Spirit'),
  B('soullink', 'Soul Link', 'common', 'When one of your Spirit Hexlings knocks out a foe, your team heals 10%.', 'Spirit'),
  B('possession', 'Possession', 'rare', 'Spirit moves have a 25% chance to confuse.', 'Spirit'),
  // ------------------------------------------------------------ Shadow (3)
  B('ambush', 'Ambush', 'common', 'Your first move each battle deals +50%.', 'Shadow'),
  B('nightfall', 'Nightfall', 'common', 'Your Shadow Hexlings gain +1 Speed when a foe faints; when one of yours faints, the next comes in at +1 Speed.', 'Shadow'),
  B('dread', 'Dread', 'rare', 'Foes facing one of your Shadow Hexlings deal 15% less.', 'Shadow'),
  // ------------------------------------------------------------ Nature (3)
  B('overgrowth', 'Overgrowth', 'common', 'Your Nature Hexlings heal 1/16 of their HP each turn.', 'Nature'),
  B('rootbound', 'Rootbound', 'common', "Foes can't lower your Nature Hexlings' stats.", 'Nature'),
  B('bloom', 'Bloom', 'rare', 'Rest hexes heal your whole team (bench too) to full.', 'Nature'),
  // ------------------------------------------------------------ Storm (3)
  B('staticfield', 'Static Field', 'common', 'Foes that hit one of your Storm Hexlings have a 20% chance to be paralyzed.', 'Storm'),
  B('tailwind', 'Tailwind', 'common', 'Your Storm Hexlings have +20% Speed.', 'Storm'),
  B('chainlightning', 'Chain Lightning', 'rare', 'Storm moves have a 20% chance to strike twice.', 'Storm'),
  // ------------------------------------------------------------ Water (3)
  B('undertow', 'Undertow', 'common', "Water moves lower the foe's Speed.", 'Water'),
  B('tidecall', 'Tidecall', 'common', 'After a win, your Water Hexlings get back the uses of their strongest move.', 'Water'),
  B('riptide', 'Riptide', 'rare', 'Water moves deal +30% to foes faster than the user.', 'Water'),
  // ------------------------------------------------------------ Earth (2)
  B('bedrock', 'Bedrock', 'common', 'The first hit each of your Hexlings takes in a battle is halved.', 'Earth'),
  B('quake', 'Fault Line', 'rare', "Earth moves ignore the foe's Defense boosts and Bulwark.", 'Earth'),
  // ------------------------------------------------------------ Dragon (2)
  B('hoard', 'Hoard', 'common', 'Dragon moves deal +5% per 100 coins you hold (up to +25%).', 'Dragon'),
  B('dragonpride', "Dragon's Pride", 'rare', 'All your Hexlings have +15% to every stat while your lead is a Dragon.', 'Dragon'),
  // ------------------------------------------------------------ Light (2)
  B('radiance', 'Radiance', 'common', "After a win, cure your team's status and heal everyone 10%.", 'Light'),
  B('halo', 'Halo', 'rare', "Your Light Hexlings take 15% less damage, and foes can't lower their stats.", 'Light'),
  // ------------------------------------------------------------ Metal (2)
  B('forged', 'Forged', 'common', 'Your Metal Hexlings gain +1 Defense each turn (up to +3).', 'Metal'),
  B('ironclad', 'Ironclad', 'rare', 'Your Metal Hexlings send back 15% of the damage they take.', 'Metal'),

  // ------------------------------------------------------------ General (14)
  B('packtactics', 'Pack Tactics', 'common', 'Your Hexlings deal +8% for each teammate that shares an element with them.'),
  B('glassmenagerie', 'Glass Menagerie', 'common', 'Your team holds at most 3, and they all have +40% Attack.'),
  B('rainbowsquad', 'Rainbow Squad', 'common', 'With 4 different elements on your team, everyone has +20% to every stat.'),
  B('lonechampion', 'Lone Champion', 'common', 'Your lead has +10% to every stat for each fainted or empty team slot.'),
  B('benchpress', 'Bench Press', 'common', 'Your bench gets full XP, and Hexlings you switch in enter at +1 Attack.'),
  B('lingering', 'Lingering', 'common', 'Statuses you cause last 2 extra turns.'),
  B('opportunist', 'Opportunist', 'common', 'Your Hexlings deal +30% to foes with a status.'),
  B('rampage', 'Rampage', 'common', 'Each knockout a Hexling lands without switching out gives it +15% damage for the battle.'),
  B('firststrike', 'First Strike', 'common', 'You always move first on the first turn of a battle.'),
  B('scavenger', 'Scavenger', 'common', 'Each catch heals your team 15%.'),
  B('prospector', 'Prospector', 'common', 'Battles pay +40% coins.'),
  B('haggler', "Haggler's Mark", 'common', 'One free reroll in every shop.'),
  B('fieldmedic', 'Field Medic', 'common', 'Potions heal 75%.'),
  B('pathfinder', 'Pathfinder', 'common', "See who's waiting on the battle hexes next to you, and every floor has an extra treasure hex."),

  // ------------------------------------------------------------ Mythic (5)
  B('echo', 'Echo', 'mythic', 'Your first move each battle hits twice.'),
  B('overflow', 'Overflow', 'mythic', 'Each knockout gives back that move’s use and +1 Attack for the battle.'),
  B('secondwind', 'Second Wind', 'mythic', 'Once per floor, a Hexling that would faint comes back at 30%.'),
  B('fusion', 'Elemental Fusion', 'mythic', "Every attack hits with whichever of its element or the user's elements works best."),
  B('pact', 'Pact', 'mythic', 'Everyone has 25% less max HP, but every offer after this is rare or mythic.'),

  // ------------------------------------------------------------ Curses (8)
  C('bloodprice', 'Blood Price', "Rest hexes don't heal anymore.", 'Take 2 boons now.'),
  C('fragile', 'Fragile', 'Your Hexlings have 20% less max HP.', 'Your next offer is all rare and mythic.'),
  C('bankrupt', 'Bankrupt', 'Lose all your coins.', 'Take a mythic boon now.'),
  C('hauntedfloor', 'Haunted Floor', 'Every battle on this floor is a trainer.', 'XP and coins +50% on this floor.'),
  C('shortfuse', 'Short Fuse', "You can't use potions for the rest of the run.", 'Everyone has +25% Attack.'),
  C('exiled', 'Exiled', "You can't catch on this floor.", 'Take 2 Prestige stars now (on your strongest Hexlings).'),
  C('marked', 'Marked', 'Guardians have +5 levels.', 'Every offer after a guardian has 4 choices.'),
  C('fogofwar', 'Fog of War', 'You only see the hexes right next to you.', 'Take 2 rare boons now.'),
];

export type BoonId = string;

export const BOONS: Record<BoonId, BoonDef> = Object.fromEntries(BOON_LIST.map((b) => [b.id, b]));

/** Rarity colours (cards, chips and icons). */
export const BOON_COLOR: Record<BoonRarity, number> = { common: 0x4a6fa8, rare: 0x8a4ac0, mythic: 0xd4a017, curse: 0xb03040 };

export const isBoon = (id: unknown): id is BoonId => typeof id === 'string' && id in BOONS;
