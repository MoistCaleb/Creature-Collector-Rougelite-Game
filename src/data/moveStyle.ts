import type { MoveDef } from './moves';

/**
 * Which animation a move plays, chosen from the words in its name ("Venom Fang" bites,
 * "Tsunami" sweeps a wave across). Kept free of Phaser so tests can check every move.
 */

export type Style =
  | 'bite' | 'claw' | 'slash' | 'guillotine' | 'whip' | 'bind' | 'drain' | 'quake' | 'burrow'
  | 'geyser' | 'pillar' | 'wave' | 'vortex' | 'rain' | 'breath' | 'beam' | 'cannon' | 'gaze'
  | 'roar' | 'bolt' | 'zap' | 'lob' | 'volley' | 'cloud' | 'curse' | 'burst' | 'flash' | 'leap'
  | 'dash' | 'smash' | 'element'
  // status (on the user)
  | 'shield' | 'gather' | 'swirl' | 'fade' | 'mend';

/** First match wins. Order matters: specific words before general ones. */
const RULES: [RegExp, Style][] = [
  // body attacks that are really something else
  [/\b(meteor hammer|wrecking ball|glacier fall|peak crash)\b/, 'smash'],
  [/\b(burrow|tunnel|drill)\b/, 'burrow'],
  [/\b(frostbite|bite|fang|jaw|devour|gulp|chomp|maw)\b/, 'bite'],
  [/\b(quake|rumble|seismic|tremor|landslide|avalanche)\b/, 'quake'],
  [/\b(tusk|horn|antler|dash|rush|step|peck|slide)\b/, 'dash'],
  [/\b(bullet)\b/, 'volley'],
  [/\b(thunderclap|overcharge|thunder|lightning|bolt|shock)\b/, 'bolt'],
  [/\b(overgrowth)\b/, 'bind'],
  [/\b(sunsoak)\b/, 'pillar'],
  [/\b(black flame)\b/, 'breath'],
  [/\b(draconic fury)\b/, 'burst'],
  [/\b(soak)\b/, 'lob'],
  [/\b(magnetize|polarity)\b/, 'zap'],
  [/\b(dive|pounce|leap)\b/, 'leap'],
  [/\b(guillotine|verdict)\b/, 'guillotine'],
  [/\b(claw|talon|rend|reap|scythe)\b/, 'claw'],
  [/\b(slash|blade|saber|cut|edge)\b/, 'slash'],
  [/\b(lash|whip|tongue|snap|barb)\b/, 'whip'],
  [/\b(siphon|sip|leech|drain|absorb)\b/, 'drain'],
  [/\b(bind|root|tangle|snare|web|shackle|coil|kelp|constrict|crush|grind)\b/, 'bind'],
  [/\b(geyser|eruption|lava burst|inferno|firestorm|ash geyser)\b/, 'geyser'],
  [/\b(zenith|aurora|halo strike|solar flare|sunburst|dawn strike|holy)\b/, 'pillar'],
  [/\b(tsunami|wave|tide|torrent|flood|surge|undertow|riptide|splash)\b/, 'wave'],
  [/\b(maelstrom|cyclone|vortex|whirl|turbine|tempest|gale|gust|sirocco|dance)\b/, 'vortex'],
  [/\b(blizzard|hail|hailstones|storm|rain|monsoon|cataclysm|fall)\b/, 'rain'],
  [/\b(cannon)\b/, 'cannon'],
  [/\b(glare|gaze|dazzle|lure)\b/, 'gaze'],
  [/\b(beam|ray|lance|laser|pulse|beacon|glint)\b/, 'beam'],
  [/\b(roar|howl|wail|scream|terrify|spook|clap)\b/, 'roar'],
  [/\b(zap|arc|static|spark|volt|plasma)\b/, 'zap'],
  [/\b(breath|spray|jet|fumes|blast|scorch|flamethrower|steam)\b/, 'breath'],
  [/\b(bomb|sludge|glob|ooze|acid|bile|spit|mud)\b/, 'lob'],
  [/\b(shard|shards|needle|volley|barrage|seed|shot|dart|stones|pebble|bullet|flurry|pearl|coral|toss)\b/, 'volley'],
  [/\b(spore|spores|pollen|dust|cloud|powder|miasma|pestilence|plague|nightshade|rot|mycelium|ash|soak|chill)\b/, 'cloud'],
  [/\b(curse|hex|haunt|phantom|soul|wisp|mask|grave|verdict|commune|frozen)\b/, 'curse'],
  [/\b(flash|blinding|whiteout|eclipse)\b/, 'flash'],
  [/\b(burst|nova|explosion|flare|bloom)\b/, 'burst'],
  [/\b(slam|bash|punch|fist|kick|peck|touch|strike|step|rush|dash|tackle|charge|hammer|ball|smash|stomp|horn|tusk|antler|phase|crash)\b/, 'dash'],
];

const STATUS_RULES: [RegExp, Style][] = [
  [/\b(armor|skin|shell|coat|reinforce|will|veil|mirror|plate|bulwark)\b/, 'shield'],
  [/\b(warp)\b/, 'swirl'],
  [/\b(vanish|lurk|step)\b/, 'fade'],
  [/\b(dance|tailwind|turbine|gear)\b/, 'swirl'],
  [/\b(roar|howl)\b/, 'roar'],
  [/\b(charge|focus|overclock|kindle|stoking|hoard|polarity|magnetize|rod|core|sunsoak|commune|halo|bless|roar|rumble)\b/, 'gather'],
];

export function moveStyle(def: MoveDef): Style {
  const name = def.name.toLowerCase();
  // Speed attacks: a Blitz darts in, a Crush comes down heavy.
  if (def.speedPower) return def.speedPower === 'fast' ? 'dash' : 'smash';
  if (def.kind === 'heal') {
    for (const [re, s] of STATUS_RULES) if (re.test(name) && s === 'shield') return 'shield';
    return 'mend';
  }
  if (def.kind === 'buff') {
    for (const [re, s] of STATUS_RULES) if (re.test(name)) return s;
    return 'gather';
  }
  for (const [re, s] of RULES) if (re.test(name)) return s;
  if (def.kind === 'debuff') return 'curse';
  return 'element';
}
