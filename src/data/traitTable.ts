import type { Element } from './types';

/**
 * Traits (Hexbound 2.0): each line has three, two common and one rare (◆). A Hexling rolls one when
 * it's created and keeps it through evolution; its final form uses the stronger number (v[1]).
 * Generated from the signed-off review table (docs/2.0-traits.md).
 */

export type TraitId =
  | 'heavy'
  | 'technician'
  | 'adaptable'
  | 'berserk'
  | 'predator'
  | 'eager'
  | 'overload'
  | 'piercing'
  | 'thickhide'
  | 'steadfast'
  | 'regenerator'
  | 'resilient'
  | 'scaled'
  | 'roughskin'
  | 'unshakable'
  | 'ironwill'
  | 'quickstart'
  | 'momentum'
  | 'slipstream'
  | 'latebloomer'
  | 'patient'
  | 'hitandrun'
  | 'touch'
  | 'purifier'
  | 'guts'
  | 'mirror'
  | 'leech'
  | 'ethereal'
  | 'cheer'
  | 'healtouch'
  | 'avenger'
  | 'mentor'
  | 'kindred'
  | 'lucky'
  | 'catcher'
  | 'forager'
  | 'scout'
  | 'treasure'
  | 'steady'
  | 'magmaskin'
  | 'frostaura'
  | 'staticcoat'
  | 'toxicspines'
  | 'tidalgrace'
  | 'rooted'
  | 'nightstalker'
  | 'sunseeker'
  | 'rainrider'
  | 'sandshroud'
  | 'secondskin'
  | 'wildcard'
  | 'gilded'
  | 'ab_Fire'
  | 'ab_Water'
  | 'ab_Nature'
  | 'ab_Earth'
  | 'ab_Storm'
  | 'ab_Frost'
  | 'ab_Metal'
  | 'ab_Toxic'
  | 'ab_Shadow'
  | 'ab_Light'
  | 'ab_Spirit'
  | 'ab_Dragon'
  | 'daybreak'
  | 'tidalcrown'
  | 'eclipse'
  | 'bulwarkcore'
  | 'carnivore'
  | 'whiteoutveil';

export type TraitKind = 'Hitter' | 'Tank' | 'Tempo' | 'Status' | 'Team' | 'Run' | 'Element' | 'Absorber' | 'Rare' | 'Legendary';

export interface TraitDef {
  id: TraitId;
  name: string;
  kind: TraitKind;
  /** What it does, and what the final form's version does. */
  text: string;
  finalText: string;
  /** The number it works with: [normal, final form]. */
  v: [number, number];
  /** Only ever a line's rare trait. */
  rareOnly?: boolean;
  /** Absorbers: hits of this element heal instead. */
  absorb?: Element;
}

export const TRAITS: Record<TraitId, TraitDef> = {
  heavy: { id: 'heavy', name: "Heavy Hitter", kind: 'Hitter', text: "Moves of 70+ power deal +15%", finalText: "+25%", v: [0.15, 0.25] },
  technician: { id: 'technician', name: "Technician", kind: 'Hitter', text: "Moves of 45 power or less deal +25%", finalText: "+40%", v: [0.25, 0.4] },
  adaptable: { id: 'adaptable', name: "Adaptable", kind: 'Hitter', text: "Moves of its own element deal +10%", finalText: "+18%", v: [0.1, 0.18] },
  berserk: { id: 'berserk', name: "Berserk", kind: 'Hitter', text: "+20% Attack below half HP", finalText: "+30%", v: [0.2, 0.3] },
  predator: { id: 'predator', name: "Predator", kind: 'Hitter', text: "+15% damage to foes below half HP", finalText: "+25%", v: [0.15, 0.25] },
  eager: { id: 'eager', name: "Eager", kind: 'Hitter', text: "Its first move each battle deals +25%", finalText: "+40%", v: [0.25, 0.4] },
  overload: { id: 'overload', name: "Overload", kind: 'Hitter', text: "+8% damage per turn in battle (up to +24%)", finalText: "+10% per turn (up to +30%)", v: [0.08, 0.1] },
  piercing: { id: 'piercing', name: "Piercing", kind: 'Hitter', text: "Resisted hits deal \u00d70.8 instead of \u00d70.67", finalText: "\u00d70.9", v: [0.8, 0.9] },
  thickhide: { id: 'thickhide', name: "Thick Hide", kind: 'Tank', text: "Takes \u221212% from super-effective hits", finalText: "\u221220%", v: [0.12, 0.2] },
  steadfast: { id: 'steadfast', name: "Steadfast", kind: 'Tank', text: "Once per battle, survives a knockout blow at 1 HP if it was above 80% HP", finalText: "above 60% HP", v: [0.8, 0.6] },
  regenerator: { id: 'regenerator', name: "Regenerator", kind: 'Tank', text: "Heals 15% when switched out", finalText: "25%", v: [0.15, 0.25] },
  resilient: { id: 'resilient', name: "Resilient", kind: 'Tank', text: "Statuses on it last half as long", finalText: "a third as long", v: [0.5, 0.34] },
  scaled: { id: 'scaled', name: "Scaled", kind: 'Tank', text: "Takes \u221215% from faster foes", finalText: "\u221225%", v: [0.15, 0.25] },
  roughskin: { id: 'roughskin', name: "Rough Skin", kind: 'Tank', text: "Foes that hit it lose 1/16 of their max HP", finalText: "1/10", v: [0.0625, 0.1] },
  unshakable: { id: 'unshakable', name: "Unshakable", kind: 'Tank', text: "Foes can\u2019t lower its Attack", finalText: "can\u2019t lower any of its stats", v: [1, 2] },
  ironwill: { id: 'ironwill', name: "Iron Will", kind: 'Tank', text: "+1 Defense the first time it drops below half HP", finalText: "+2 Defense", v: [1, 2] },
  quickstart: { id: 'quickstart', name: "Quick Start", kind: 'Tempo', text: "+1 Speed for its first 2 turns", finalText: "+2 Speed", v: [1, 2] },
  momentum: { id: 'momentum', name: "Momentum", kind: 'Tempo', text: "+1 Speed each time it knocks out a foe", finalText: "+1 Speed and +1 Attack", v: [1, 2] },
  slipstream: { id: 'slipstream', name: "Slipstream", kind: 'Tempo', text: "Moves first while below 1/4 HP", finalText: "below 1/3 HP", v: [0.25, 0.34] },
  latebloomer: { id: 'latebloomer', name: "Late Bloomer", kind: 'Tempo', text: "+1 Attack every 3 turns in battle", finalText: "+1 Attack and Defense every 2 turns", v: [3, 2] },
  patient: { id: 'patient', name: "Patient", kind: 'Tempo', text: "+20% damage when it moves second", finalText: "+30%", v: [0.2, 0.3] },
  hitandrun: { id: 'hitandrun', name: "Hit and Run", kind: 'Tempo', text: "+1 Speed after it lands a super-effective hit", finalText: "+1 Speed and +1 Attack", v: [1, 2] },
  touch: { id: 'touch', name: "Element Touch", kind: 'Status', text: "10% chance its hits cause a status that fits its element (burn, poison, paralysis, freeze, sleep or confusion)", finalText: "18%", v: [0.1, 0.18] },
  purifier: { id: 'purifier', name: "Purifier", kind: 'Status', text: "20% chance each turn to shake off its status", finalText: "35%", v: [0.2, 0.35] },
  guts: { id: 'guts', name: "Guts", kind: 'Status', text: "+20% damage while it has a status", finalText: "+30%", v: [0.2, 0.3] },
  mirror: { id: 'mirror', name: "Mirror", kind: 'Status', text: "50% chance a foe that gives it a status gets the same one", finalText: "always", v: [0.5, 1] },
  leech: { id: 'leech', name: "Leech", kind: 'Status', text: "Heals 6% of the damage it deals", finalText: "12%", v: [0.06, 0.12] },
  ethereal: { id: 'ethereal', name: "Ethereal", kind: 'Status', text: "10% chance to slip through a hit unharmed", finalText: "15%", v: [0.1, 0.15] },
  cheer: { id: 'cheer', name: "Cheerleader", kind: 'Team', text: "While benched, your active Hexling deals +4%", finalText: "+7%", v: [0.04, 0.07] },
  healtouch: { id: 'healtouch', name: "Healer's Touch", kind: 'Team', text: "After a win, your team heals 4%", finalText: "7%", v: [0.04, 0.07] },
  avenger: { id: 'avenger', name: "Avenger", kind: 'Team', text: "+20% damage the turn after an ally faints", finalText: "+35%", v: [0.2, 0.35] },
  mentor: { id: 'mentor', name: "Mentor's Aura", kind: 'Team', text: "Benched Hexlings get +15% XP", finalText: "+25%", v: [0.15, 0.25] },
  kindred: { id: 'kindred', name: "Kindred", kind: 'Team', text: "Counts twice for team element synergy", finalText: "three times", v: [2, 3] },
  lucky: { id: 'lucky', name: "Lucky", kind: 'Team', text: "+10% coins from battles it fights in", finalText: "+20%", v: [0.1, 0.2] },
  catcher: { id: 'catcher', name: "Catcher", kind: 'Run', text: "While it leads, Hexlings you catch join +1 level", finalText: "+2 levels", v: [1, 2] },
  forager: { id: 'forager', name: "Forager", kind: 'Run', text: "Heals 6% after each battle", finalText: "10%", v: [0.06, 0.1] },
  scout: { id: 'scout', name: "Scout", kind: 'Run', text: "Shows what\u2019s on the next hex", finalText: "the next two hexes", v: [1, 2] },
  treasure: { id: 'treasure', name: "Treasure Nose", kind: 'Run', text: "Chests sometimes (50%) offer a third choice", finalText: "always", v: [0.5, 1] },
  steady: { id: 'steady', name: "Steady", kind: 'Run', text: "Can\u2019t miss while at full HP", finalText: "while above half HP", v: [1, 0.5] },
  magmaskin: { id: 'magmaskin', name: "Magma Skin", kind: 'Element', text: "15% chance foes that hit it are burned", finalText: "25%", v: [0.15, 0.25] },
  frostaura: { id: 'frostaura', name: "Frostbite Aura", kind: 'Element', text: "15% chance foes that hit it lose 1 Speed", finalText: "25%", v: [0.15, 0.25] },
  staticcoat: { id: 'staticcoat', name: "Static Coat", kind: 'Element', text: "15% chance foes that hit it are paralyzed", finalText: "25%", v: [0.15, 0.25] },
  toxicspines: { id: 'toxicspines', name: "Toxic Spines", kind: 'Element', text: "15% chance foes that hit it are poisoned", finalText: "25%", v: [0.15, 0.25] },
  tidalgrace: { id: 'tidalgrace', name: "Tidal Grace", kind: 'Element', text: "Heals 5% when it uses a Water move", finalText: "8%", v: [0.05, 0.08] },
  rooted: { id: 'rooted', name: "Rooted", kind: 'Element', text: "Heals 4% at the end of each turn", finalText: "6%", v: [0.04, 0.06] },
  nightstalker: { id: 'nightstalker', name: "Night Stalker", kind: 'Element', text: "Night falls for the battle when it enters; +1 Speed at night", finalText: "+1 Speed and +10% damage at night", v: [0, 0.1] },
  sunseeker: { id: 'sunseeker', name: "Sunseeker", kind: 'Element', text: "Brings 2 turns of sun when it enters; +15% Attack in sun", finalText: "3 turns; +25%", v: [0.15, 0.25] },
  rainrider: { id: 'rainrider', name: "Rain Rider", kind: 'Element', text: "Brings 2 turns of rain when it enters; +1 Speed in rain", finalText: "3 turns; +2 Speed", v: [1, 2] },
  sandshroud: { id: 'sandshroud', name: "Sand Shroud", kind: 'Element', text: "Brings 2 turns of dust when it enters; takes \u221215% in dust", finalText: "3 turns; \u221225%", v: [0.15, 0.25] },
  secondskin: { id: 'secondskin', name: "Second Skin", kind: 'Rare', text: "Once per battle, survives a knockout blow at 1 HP from any HP", finalText: "and heals 15% when it does", v: [0, 0.15], rareOnly: true },
  wildcard: { id: 'wildcard', name: "Wildcard", kind: 'Rare', text: "Its signature move takes whichever element hits the target hardest", finalText: "and +10% power", v: [0, 0.1], rareOnly: true },
  gilded: { id: 'gilded', name: "Gilded Charm", kind: 'Rare', text: "Gilded Hexlings turn up a little more often", finalText: "more often", v: [1, 2], rareOnly: true },
  ab_Fire: { id: 'ab_Fire', name: "Ember Eater", kind: 'Absorber', text: "Fire hits heal it 15% instead of hurting", finalText: "25%", v: [0.15, 0.25], absorb: 'Fire' },
  ab_Water: { id: 'ab_Water', name: "Sponge", kind: 'Absorber', text: "Water hits heal it 15% instead of hurting", finalText: "25%", v: [0.15, 0.25], absorb: 'Water' },
  ab_Nature: { id: 'ab_Nature', name: "Sap Drinker", kind: 'Absorber', text: "Nature hits heal it 15% instead of hurting", finalText: "25%", v: [0.15, 0.25], absorb: 'Nature' },
  ab_Earth: { id: 'ab_Earth', name: "Ground Sink", kind: 'Absorber', text: "Earth hits heal it 15% instead of hurting", finalText: "25%", v: [0.15, 0.25], absorb: 'Earth' },
  ab_Storm: { id: 'ab_Storm', name: "Lightning Rod", kind: 'Absorber', text: "Storm hits heal it 15% instead of hurting", finalText: "25%", v: [0.15, 0.25], absorb: 'Storm' },
  ab_Frost: { id: 'ab_Frost', name: "Snowmelt", kind: 'Absorber', text: "Frost hits heal it 15% instead of hurting", finalText: "25%", v: [0.15, 0.25], absorb: 'Frost' },
  ab_Metal: { id: 'ab_Metal', name: "Magnet Core", kind: 'Absorber', text: "Metal hits heal it 15% instead of hurting", finalText: "25%", v: [0.15, 0.25], absorb: 'Metal' },
  ab_Toxic: { id: 'ab_Toxic', name: "Iron Gut", kind: 'Absorber', text: "Toxic hits heal it 15% instead of hurting", finalText: "25%", v: [0.15, 0.25], absorb: 'Toxic' },
  ab_Shadow: { id: 'ab_Shadow', name: "Shade Drinker", kind: 'Absorber', text: "Shadow hits heal it 15% instead of hurting", finalText: "25%", v: [0.15, 0.25], absorb: 'Shadow' },
  ab_Light: { id: 'ab_Light', name: "Sun Soaker", kind: 'Absorber', text: "Light hits heal it 15% instead of hurting", finalText: "25%", v: [0.15, 0.25], absorb: 'Light' },
  ab_Spirit: { id: 'ab_Spirit', name: "Soul Catcher", kind: 'Absorber', text: "Spirit hits heal it 15% instead of hurting", finalText: "25%", v: [0.15, 0.25], absorb: 'Spirit' },
  ab_Dragon: { id: 'ab_Dragon', name: "Wyrm Eater", kind: 'Absorber', text: "Dragon hits heal it 15% instead of hurting", finalText: "25%", v: [0.15, 0.25], absorb: 'Dragon' },
  daybreak: { id: 'daybreak', name: "Daybreak", kind: 'Legendary', text: "Sets 5 turns of sun when it enters", finalText: "5 turns", v: [3, 5], rareOnly: true },
  tidalcrown: { id: 'tidalcrown', name: "Tidal Crown", kind: 'Legendary', text: "Sets 5 turns of rain when it enters", finalText: "5 turns", v: [3, 5], rareOnly: true },
  eclipse: { id: 'eclipse', name: "Eclipse", kind: 'Legendary', text: "When it enters, night falls and the foe loses 1 Speed and 1 Attack", finalText: "and 1 Attack", v: [1, 2], rareOnly: true },
  bulwarkcore: { id: 'bulwarkcore', name: "Bulwark Core", kind: 'Legendary', text: "Takes \u221220% damage for its first 3 turns in battle", finalText: "first 3 turns", v: [2, 3], rareOnly: true },
  carnivore: { id: 'carnivore', name: "Carnivore", kind: 'Legendary', text: "Heals 35% when it knocks out a foe", finalText: "35%", v: [0.25, 0.35], rareOnly: true },
  whiteoutveil: { id: 'whiteoutveil', name: "Whiteout Veil", kind: 'Legendary', text: "Sets 5 turns of hail when it enters; foes miss more often in hail", finalText: "5 turns", v: [3, 5], rareOnly: true },
};

/** Each line's traits: [common, common, rare]. */
export const LINE_TRAITS: Record<string, [TraitId, TraitId, TraitId]> = {
  emberkit: ['eager', 'hitandrun', 'secondskin'],
  cinderpup: ['cheer', 'avenger', 'ab_Water'],
  flicklet: ['touch', 'quickstart', 'wildcard'],
  magmite: ['magmaskin', 'latebloomer', 'ab_Earth'],
  magmole: ['magmaskin', 'thickhide', 'ab_Water'],
  lavapup: ['heavy', 'berserk', 'steadfast'],
  pyrling: ['adaptable', 'thickhide', 'momentum'],
  scaldlet: ['touch', 'overload', 'steadfast'],
  hexkit: ['touch', 'thickhide', 'mirror'],
  sparkfox: ['quickstart', 'hitandrun', 'ab_Water'],
  plasmite: ['overload', 'piercing', 'steadfast'],
  steamle: ['tidalgrace', 'rainrider', 'ab_Storm'],
  cinderwisp: ['sunseeker', 'leech', 'ab_Fire'],
  sallet: ['eager', 'magmaskin', 'ab_Water'],
  emberchick: ['quickstart', 'sunseeker', 'steadfast'],
  smithlet: ['heavy', 'ironwill', 'ab_Water'],
  brimlet: ['toxicspines', 'magmaskin', 'ab_Earth'],
  torchlet: ['ironwill', 'steady', 'ab_Water'],
  frostling: ['frostaura', 'technician', 'ab_Fire'],
  snowmote: ['touch', 'ab_Metal', 'slipstream'],
  icebuck: ['heavy', 'frostaura', 'steadfast'],
  shiverfin: ['predator', 'hitandrun', 'ab_Fire'],
  slushpup: ['rainrider', 'thickhide', 'ab_Metal'],
  rimehawk: ['quickstart', 'staticcoat', 'ab_Fire'],
  cryospark: ['overload', 'touch', 'steadfast'],
  yukilet: ['ethereal', 'mirror', 'ab_Fire'],
  cragice: ['roughskin', 'ironwill', 'ab_Metal'],
  slablet: ['thickhide', 'sandshroud', 'secondskin'],
  frostfern: ['regenerator', 'frostaura', 'ab_Fire'],
  thawlet: ['touch', 'adaptable', 'ab_Metal'],
  snowlet: ['steady', 'ab_Metal', 'nightstalker'],
  yetling: ['heavy', 'berserk', 'ab_Fire'],
  icemite: ['toxicspines', 'frostaura', 'ab_Metal'],
  shardlet: ['piercing', 'roughskin', 'steadfast'],
  sproutle: ['regenerator', 'unshakable', 'healtouch'],
  mosskit: ['predator', 'hitandrun', 'rooted'],
  beetlet: ['heavy', 'latebloomer', 'ab_Fire'],
  budlet: ['technician', 'sunseeker', 'catcher'],
  mossling: ['rooted', 'tidalgrace', 'leech'],
  kelpling: ['leech', 'rainrider', 'ab_Toxic'],
  burrowbud: ['rooted', 'roughskin', 'ab_Frost'],
  truffkin: ['forager', 'treasure', 'lucky'],
  shroomlet: ['touch', 'purifier', 'leech'],
  pitchling: ['leech', 'predator', 'secondskin'],
  pollenix: ['cheer', 'mentor', 'healtouch'],
  sproutbolt: ['staticcoat', 'rooted', 'overload'],
  acornet: ['technician', 'roughskin', 'forager'],
  larvlet: ['forager', 'resilient', 'latebloomer'],
  fernling: ['adaptable', 'rooted', 'ab_Frost'],
  gnarlet: ['mirror', 'nightstalker', 'ab_Fire'],
  pebblin: ['technician', 'roughskin', 'unshakable'],
  molet: ['eager', 'scout', 'treasure'],
  dustbun: ['quickstart', 'sandshroud', 'hitandrun'],
  golemite: ['ironwill', 'heavy', 'secondskin'],
  ashtoad: ['magmaskin', 'latebloomer', 'guts'],
  stumpling: ['rooted', 'unshakable', 'regenerator'],
  drillmole: ['piercing', 'scout', 'eager'],
  dunedrake: ['sandshroud', 'berserk', 'scaled'],
  craglet: ['roughskin', 'patient', 'steadfast'],
  woollet: ['forager', 'thickhide', 'mentor'],
  shalebeak: ['quickstart', 'steady', 'staticcoat'],
  dillokin: ['roughskin', 'resilient', 'ironwill'],
  rhinlet: ['heavy', 'eager', 'unshakable'],
  stalaglet: ['nightstalker', 'patient', 'roughskin'],
  zapling: ['quickstart', 'staticcoat', 'ab_Earth'],
  staticat: ['staticcoat', 'predator', 'momentum'],
  gustling: ['technician', 'slipstream', 'scout'],
  sparkbug: ['overload', 'touch', 'ab_Nature'],
  blazejay: ['hitandrun', 'sunseeker', 'quickstart'],
  buzzlet: ['touch', 'predator', 'mentor'],
  whirlbot: ['overload', 'ironwill', 'piercing'],
  snowpip: ['frostaura', 'quickstart', 'rainrider'],
  flashkit: ['eager', 'steady', 'wildcard'],
  cloudlet: ['rainrider', 'regenerator', 'healtouch'],
  ramlet: ['heavy', 'momentum', 'unshakable'],
  zapeel: ['staticcoat', 'rainrider', 'leech'],
  waspark: ['toxicspines', 'eager', 'predator'],
  puddlet: ['tidalgrace', 'rainrider', 'ab_Storm'],
  tidepup: ['hitandrun', 'cheer', 'avenger'],
  jellet: ['toxicspines', 'regenerator', 'mirror'],
  shellop: ['thickhide', 'ironwill', 'secondskin'],
  penglet: ['quickstart', 'frostaura', 'lucky'],
  narwee: ['piercing', 'heavy', 'ab_Storm'],
  lilyfrog: ['rooted', 'tidalgrace', 'healtouch'],
  rippling: ['adaptable', 'rainrider', 'scaled'],
  mistlet: ['slipstream', 'ethereal', 'mirror'],
  stingrae: ['toxicspines', 'predator', 'ab_Storm'],
  coralite: ['roughskin', 'unshakable', 'ab_Nature'],
  squalllet: ['rainrider', 'staticcoat', 'momentum'],
  ottlet: ['hitandrun', 'lucky', 'forager'],
  pinchlet: ['heavy', 'thickhide', 'roughskin'],
  bubblit: ['ethereal', 'purifier', 'ab_Shadow'],
  divebot: ['ironwill', 'steady', 'ab_Storm'],
  cogling: ['overload', 'ironwill', 'kindred'],
  boltkit: ['quickstart', 'momentum', 'ab_Storm'],
  mitebot: ['heavy', 'roughskin', 'unshakable'],
  edgelet: ['predator', 'piercing', 'hitandrun'],
  oreback: ['thickhide', 'latebloomer', 'forager'],
  ferrock: ['heavy', 'ironwill', 'steadfast'],
  voltcog: ['staticcoat', 'overload', 'cheer'],
  magnetite: ['ab_Storm', 'patient', 'mirror'],
  glintmite: ['steady', 'piercing', 'gilded'],
  forgepup: ['magmaskin', 'eager', 'ab_Fire'],
  rivetfin: ['predator', 'rainrider', 'ab_Storm'],
  gearbud: ['rooted', 'overload', 'ab_Fire'],
  coldcog: ['frostaura', 'ironwill', 'ab_Fire'],
  rustbug: ['toxicspines', 'resilient', 'ab_Fire'],
  nightcog: ['nightstalker', 'eager', 'slipstream'],
  alloylet: ['scaled', 'heavy', 'unshakable'],
  sludgit: ['toxicspines', 'regenerator', 'ab_Water'],
  toadlet: ['leech', 'touch', 'ab_Earth'],
  stingit: ['touch', 'predator', 'steadfast'],
  oozel: ['resilient', 'leech', 'ab_Metal'],
  bogmite: ['toxicspines', 'rainrider', 'ab_Metal'],
  blobble: ['regenerator', 'thickhide', 'secondskin'],
  sporebud: ['touch', 'rooted', 'ab_Fire'],
  murkling: ['nightstalker', 'toxicspines', 'ab_Earth'],
  belladot: ['mirror', 'touch', 'steadfast'],
  smoglet: ['magmaskin', 'thickhide', 'ab_Earth'],
  tarlet: ['roughskin', 'unshakable', 'ab_Water'],
  fizzlet: ['staticcoat', 'toxicspines', 'ab_Earth'],
  gelicle: ['frostaura', 'regenerator', 'ab_Metal'],
  neonewt: ['touch', 'quickstart', 'ab_Metal'],
  spooklet: ['ethereal', 'touch', 'steadfast'],
  hisslet: ['predator', 'thickhide', 'steadfast'],
  gloomkit: ['nightstalker', 'eager', 'hitandrun'],
  mothlet: ['mirror', 'ethereal', 'ab_Light'],
  murkpup: ['avenger', 'predator', 'ab_Spirit'],
  creepet: ['patient', 'predator', 'slipstream'],
  ashcat: ['nightstalker', 'magmaskin', 'eager'],
  dimember: ['touch', 'slipstream', 'ab_Dragon'],
  shadewisp: ['ethereal', 'nightstalker', 'ab_Shadow'],
  grimlet: ['predator', 'steady', 'ab_Spirit'],
  plaguerat: ['toxicspines', 'lucky', 'forager'],
  inklet: ['slipstream', 'mirror', 'ab_Light'],
  nightbud: ['rooted', 'nightstalker', 'roughskin'],
  gravelet: ['thickhide', 'patient', 'ab_Dragon'],
  crowlet: ['quickstart', 'nightstalker', 'scout'],
  chilkit: ['frostaura', 'predator', 'ab_Light'],
  twilit: ['mirror', 'steady', 'ab_Spirit'],
  duskhatch: ['berserk', 'nightstalker', 'ab_Dragon'],
  glimmer: ['steady', 'cheer', 'sunseeker'],
  lumbug: ['scout', 'healtouch', 'treasure'],
  prismkit: ['adaptable', 'quickstart', 'wildcard'],
  dawnling: ['sunseeker', 'eager', 'healtouch'],
  halofly: ['healtouch', 'purifier', 'ethereal'],
  cherublet: ['cheer', 'mentor', 'healtouch'],
  flashfinch: ['quickstart', 'hitandrun', 'steady'],
  aurorabit: ['lucky', 'quickstart', 'gilded'],
  gleamshell: ['mirror', 'ironwill', 'thickhide'],
  squirelet: ['avenger', 'steady', 'unshakable'],
  gildwing: ['lucky', 'adaptable', 'gilded'],
  sunpup: ['sunseeker', 'eager', 'cheer'],
  shinefin: ['tidalgrace', 'steady', 'healtouch'],
  sunsprout: ['sunseeker', 'rooted', 'forager'],
  quartzlet: ['roughskin', 'piercing', 'mirror'],
  twinklet: ['touch', 'quickstart', 'lucky'],
  shinepup: ['cheer', 'eager', 'avenger'],
  wispling: ['ethereal', 'slipstream', 'ab_Shadow'],
  boolet: ['mirror', 'touch', 'ab_Toxic'],
  lampling: ['mentor', 'healtouch', 'ab_Storm'],
  maskit: ['mirror', 'adaptable', 'steadfast'],
  wailet: ['touch', 'nightstalker', 'ab_Spirit'],
  lumenwisp: ['healtouch', 'ethereal', 'ab_Shadow'],
  chillwisp: ['frostaura', 'ethereal', 'ab_Metal'],
  rimeghost: ['touch', 'slipstream', 'ab_Fire'],
  flickghost: ['magmaskin', 'ethereal', 'ab_Shadow'],
  siplet: ['touch', 'rainrider', 'ab_Storm'],
  sprigghost: ['rooted', 'healtouch', 'ab_Toxic'],
  totemkin: ['unshakable', 'ironwill', 'ab_Water'],
  breezeling: ['quickstart', 'slipstream', 'ab_Toxic'],
  helmlet: ['ironwill', 'thickhide', 'ab_Storm'],
  bonelet: ['berserk', 'ethereal', 'ab_Toxic'],
  drakelet: ['adaptable', 'berserk', 'scaled'],
  wyrmlet: ['scaled', 'latebloomer', 'momentum'],
  draclet: ['hitandrun', 'eager', 'predator'],
  hatchwyrm: ['latebloomer', 'thickhide', 'unshakable'],
  kindrake: ['magmaskin', 'heavy', 'adaptable'],
  eddylet: ['rainrider', 'tidalgrace', 'scaled'],
  sandling: ['sandshroud', 'roughskin', 'patient'],
  vinelet: ['rooted', 'leech', 'latebloomer'],
  sparkhatch: ['staticcoat', 'quickstart', 'overload'],
  rimehatch: ['frostaura', 'heavy', 'scaled'],
  hornling: ['heavy', 'unshakable', 'berserk'],
  glidelet: ['quickstart', 'hitandrun', 'slipstream'],
  jadelet: ['leech', 'ethereal', 'lucky'],
};

/** The legendaries' one-of-a-kind traits. */
export const LEGEND_TRAITS: Record<string, TraitId> = {
  solmane: 'daybreak',
  tidecrown: 'tidalcrown',
  umbrawyrm: 'eclipse',
  ironvault: 'bulwarkcore',
  thornmaw: 'carnivore',
  rimeveil: 'whiteoutveil',
};
