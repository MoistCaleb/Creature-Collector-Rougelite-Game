import { hashString } from '../logic/rng';
import { registerSignature, type SignatureKind } from './moves';
import type { Element, TypePair } from './types';

export interface BaseStats {
  hp: number;
  atk: number;
  def: number;
  spd: number;
}

export interface Species {
  id: string;
  names: [string, string, string]; // per evolution stage
  types: TypePair;
  base: BaseStats;
  signature: string; // move id
}

/** Pick a signature's mechanic from the words in its name so the effect matches it. */
const NAME_KINDS: [RegExp, SignatureKind][] = [
  [/Pounce|Dive|Step|Dash|Kick|Peck|Sting|Ambush|Talon|Strike|Tunnel/, 'ambush'],
  [/Claw|Fang|Bite|Reap|Guillotine|Verdict|Blade|Saber|Lance|Tusk|Rend/, 'finisher'],
  [/Crash|Slam|Fist|Fall|Quake|Fury|Roar|Hammer|Eruption|Burst$|Firestorm|Overcharge|Cannon|Crush|Blast/, 'overdrive'],
  [/Barrage|Flurry|Spores|Shards|Storm|Swarm|Gale|Cyclone|Monsoon|Pollen|Petal|Dust|Breath|Surge/, 'frenzy'],
  [/Ray|Arc|Gear|Flame|Beam/, 'dualstrike'],
  [/Siphon|Tongue|Gulp|Devour|Drain|Mycelium|Leech|Soul|Bog|Kelp|Snare|Bind|Web|Coil/, 'sap'],
  [/Howl|Glare|Curse|Haunt|Wail|Dazzle|Hex|Pestilence|Nightshade|Lure|Chill|Touch|Whiteout/, 'curse'],
  [/Will|Shell|Guard|Core|Bloom|Fortress|Lantern/, 'fortress'],
];

/** Names that match nothing above get an attacking mechanic (never a heal or a debuff). */
const ATTACK_KINDS: SignatureKind[] = ['dualstrike', 'finisher', 'frenzy', 'sap', 'ambush', 'overdrive'];
function kindFromName(name: string): SignatureKind | undefined {
  for (const [re, k] of NAME_KINDS) if (re.test(name)) return k;
  return undefined;
}

/**
 * f(id, 'Base/Middle/Final', type1, type2, hp, atk, def, spd, 'Signature move name', signatureKind?)
 * Signature kind is chosen from the species id unless given.
 */
function f(
  id: string,
  names: string,
  t1: Element,
  t2: Element,
  hp: number,
  atk: number,
  def: number,
  spd: number,
  sigName: string,
  kind?: SignatureKind,
): Species {
  const n = names.split('/') as [string, string, string];
  const k = kind ?? kindFromName(sigName) ?? ATTACK_KINDS[hashString(id + ':sig') % ATTACK_KINDS.length];
  const sig = registerSignature(id, sigName, t1, k);
  return { id, names: n, types: [t1, t2], base: { hp, atk, def, spd }, signature: sig.id };
}

export const SPECIES: Species[] = [
  // ------------------------------------------------------------ Fire
  f('emberkit', 'Emberkit/Blazefang/Infernox', 'Fire', 'Fire', 59, 70, 47, 65, 'Ember Pounce'),
  f('cinderpup', 'Cinderpup/Scorchound/Pyreberus', 'Fire', 'Fire', 64, 72, 50, 60, 'Hearth Howl'),
  f('flicklet', 'Flicklet/Candlewick/Wickerpyre', 'Fire', 'Fire', 60, 68, 50, 76, 'Wick Flare'),
  f('magmite', 'Magmite/Lavalurk/Calderath', 'Fire', 'Fire', 74, 64, 64, 38, 'Molten Core'),
  // ------------------------------------------------------------ Frost
  f('frostling', 'Frostling/Glacimaw/Hailwyrm', 'Frost', 'Frost', 60, 60, 60, 55, 'Glacial Gale'),
  f('snowmote', 'Snowmote/Driftling/Avalanx', 'Frost', 'Frost', 58, 58, 56, 66, 'Whiteout'),
  f('icebuck', 'Icebuck/Glaciantler/Rimestag', 'Frost', 'Frost', 64, 70, 54, 56, 'Antler Frost'),
  f('shiverfin', 'Shiverfin/Floepike/Glacieel', 'Frost', 'Frost', 60, 66, 50, 64, 'Shiver Bite'),
  // ------------------------------------------------------------ Nature
  f('sproutle', 'Sproutle/Thornback/Elderoot', 'Nature', 'Nature', 70, 55, 65, 45, 'Root Bind'),
  f('mosskit', 'Mosskit/Fernlynx/Thicketfang', 'Nature', 'Nature', 56, 68, 48, 68, 'Bramble Pounce'),
  f('beetlet', 'Beetlet/Leafhorn/Canopix', 'Nature', 'Nature', 64, 66, 66, 40, 'Horn Harvest'),
  f('budlet', 'Budlet/Bloomtail/Floravore', 'Nature', 'Nature', 62, 60, 56, 58, 'Petal Storm'),
  // ------------------------------------------------------------ Earth
  f('pebblin', 'Pebblin/Bouldrake/Titanox', 'Earth', 'Earth', 75, 60, 75, 30, 'Pebble Barrage'),
  f('molet', 'Molet/Tunnelclaw/Quakemole', 'Earth', 'Earth', 64, 70, 58, 48, 'Burrow Strike'),
  f('dustbun', 'Dustbun/Sandhare/Duneleaper', 'Earth', 'Earth', 60, 66, 52, 72, 'Sandstorm Kick'),
  f('golemite', 'Golemite/Rubblord/Monolith', 'Earth', 'Earth', 80, 66, 80, 22, 'Avalanche Fist'),
  // ------------------------------------------------------------ Storm
  f('zapling', 'Zapling/Voltwing/Thundraxis', 'Storm', 'Storm', 56, 67, 46, 80, 'Overcharge'),
  f('staticat', 'Staticat/Voltlynx/Fulminx', 'Storm', 'Storm', 54, 70, 42, 76, 'Static Pounce'),
  f('gustling', 'Gustling/Galewing/Cyclonarch', 'Storm', 'Storm', 60, 66, 50, 74, 'Cyclone'),
  f('sparkbug', 'Sparkbug/Arcbeetle/Voltsaber', 'Storm', 'Storm', 60, 68, 58, 52, 'Arc Saber'),
  // ------------------------------------------------------------ Water
  f('puddlet', 'Puddlet/Tidalfin/Leviaroc', 'Water', 'Water', 65, 58, 60, 52, 'Torrent'),
  f('tidepup', 'Tidepup/Surfseal/Abyssleo', 'Water', 'Water', 68, 64, 56, 50, 'Wave Crash'),
  f('jellet', 'Jellet/Driftjelly/Medusurge', 'Water', 'Water', 66, 64, 64, 54, 'Sting Tide'),
  f('shellop', 'Shellop/Clampshell/Pearlord', 'Water', 'Water', 66, 56, 78, 32, 'Pearl Cannon'),
  // ------------------------------------------------------------ Metal
  f('cogling', 'Cogling/Rivetusk/Ironmaw', 'Metal', 'Metal', 70, 60, 82, 28, 'Iron Will'),
  f('boltkit', 'Boltkit/Gearhound/Cogwolf', 'Metal', 'Metal', 60, 70, 62, 54, 'Gear Fang'),
  f('mitebot', 'Mitebot/Platebeetle/Titanmite', 'Metal', 'Metal', 68, 62, 80, 30, 'Plate Crush'),
  f('edgelet', 'Edgelet/Scythrex/Guillotor', 'Metal', 'Metal', 54, 78, 56, 60, 'Steel Guillotine'),
  // ------------------------------------------------------------ Toxic
  f('sludgit', 'Sludgit/Venomire/Blightmaw', 'Toxic', 'Toxic', 64, 62, 58, 52, 'Sludge Surge'),
  f('toadlet', 'Toadlet/Venotoad/Bilegrog', 'Toxic', 'Toxic', 70, 62, 60, 44, 'Bile Tongue'),
  f('stingit', 'Stingit/Venospid/Arachnox', 'Toxic', 'Toxic', 54, 70, 48, 70, 'Venom Web'),
  f('oozel', 'Oozel/Sludgeworm/Rotwyrm', 'Toxic', 'Toxic', 72, 58, 64, 40, 'Ooze Flood'),
  // ------------------------------------------------------------ Shadow
  f('gloomkit', 'Gloomkit/Duskfang/Nightreaver', 'Shadow', 'Shadow', 62, 72, 52, 74, 'Dusk Pounce'),
  f('mothlet', 'Mothlet/Duskwing/Eclipsara', 'Shadow', 'Shadow', 56, 64, 48, 72, 'Eclipse Dust'),
  f('murkpup', 'Murkpup/Gloomhound/Umbracerb', 'Shadow', 'Shadow', 60, 74, 50, 62, 'Night Howl'),
  f('creepet', 'Creepet/Lurkspider/Widowmaw', 'Shadow', 'Shadow', 58, 68, 54, 64, 'Shadow Web'),
  // ------------------------------------------------------------ Light
  f('glimmer', 'Glimmer/Radiantail/Solarch', 'Light', 'Light', 60, 62, 55, 63, 'Dazzle'),
  f('lumbug', 'Lumbug/Lanternfly/Beaconix', 'Light', 'Light', 58, 60, 58, 64, 'Beacon Pulse'),
  f('prismkit', 'Prismkit/Shimmerfox/Auroralynx', 'Light', 'Light', 56, 68, 48, 72, 'Prism Pounce'),
  f('dawnling', 'Dawnling/Solflare/Helionox', 'Light', 'Light', 66, 66, 60, 50, 'Sunburst'),
  // ------------------------------------------------------------ Spirit
  f('wispling', 'Wispling/Spectrail/Revenarch', 'Spirit', 'Spirit', 56, 60, 62, 62, 'Wisp Lure'),
  f('boolet', 'Boolet/Phantomine/Wraithking', 'Spirit', 'Spirit', 58, 68, 52, 64, 'Soul Rend'),
  f('lampling', 'Lampling/Candlghast/Soulbeacon', 'Spirit', 'Spirit', 60, 62, 58, 58, 'Soul Lantern'),
  f('maskit', 'Maskit/Mummask/Phantomask', 'Spirit', 'Spirit', 62, 58, 66, 52, 'Mask Curse'),
  // ------------------------------------------------------------ Dragon
  f('drakelet', 'Drakelet/Scalewyrm/Dracolord', 'Dragon', 'Dragon', 66, 76, 58, 50, 'Draconic Fury'),
  f('wyrmlet', 'Wyrmlet/Coilwyrm/Ouroborax', 'Dragon', 'Dragon', 70, 70, 62, 44, 'Coil Crush'),
  f('draclet', 'Draclet/Fangdrake/Wyvernox', 'Dragon', 'Dragon', 60, 78, 50, 62, 'Wyvern Dive'),
  f('hatchwyrm', 'Hatchwyrm/Scaleguard/Elderwyrm', 'Dragon', 'Dragon', 74, 68, 70, 36, 'Elder Roar'),

  // ------------------------------------------------------------ Dual: Fire/Earth
  f('magmole', 'Magmole/Lavaburrow/Calderock', 'Fire', 'Earth', 69, 65, 62, 40, 'Magma Burrow'),
  f('lavapup', 'Lavapup/Magmhound/Volcanox', 'Fire', 'Earth', 72, 74, 62, 46, 'Lava Burst'),
  f('ashtoad', 'Ashtoad/Basaltoad/Cratergrog', 'Earth', 'Fire', 76, 62, 68, 34, 'Ash Geyser'),
  // Fire/Dragon
  f('pyrling', 'Pyrling/Scorchwing/Infernadrake', 'Fire', 'Dragon', 62, 74, 50, 60, 'Pyre Breath'),
  f('kindrake', 'Kindrake/Blazewyrm/Solardrake', 'Dragon', 'Fire', 68, 74, 56, 52, 'Solar Roar'),
  f('scaldlet', 'Scaldlet/Scaldwing/Scaldrax', 'Fire', 'Dragon', 60, 70, 52, 66, 'Ash Dive'),
  // Fire/Shadow
  f('ashcat', 'Ashcat/Smoldershade/Hellprowl', 'Shadow', 'Fire', 58, 72, 46, 68, 'Ash Claw'),
  f('hexkit', 'Hexkit/Hexflare/Hellmage', 'Fire', 'Shadow', 60, 70, 48, 66, 'Hexfire'),
  f('dimember', 'Dimember/Gloomflame/Abyssblaze', 'Shadow', 'Fire', 64, 68, 54, 58, 'Black Flame'),
  // Fire/Storm
  f('sparkfox', 'Sparkfox/Pyrovolt/Plasmane', 'Fire', 'Storm', 60, 72, 48, 73, 'Spark Fang'),
  f('blazejay', 'Blazejay/Thunderjay/Stormphoenix', 'Storm', 'Fire', 58, 68, 46, 74, 'Firestorm'),
  f('plasmite', 'Plasmite/Arcflare/Plasmagon', 'Fire', 'Storm', 62, 74, 50, 62, 'Plasma Lance'),
  // Water/Frost
  f('slushpup', 'Slushpup/Floetusk/Glaciorca', 'Frost', 'Water', 68, 58, 62, 47, 'Slush Pounce'),
  f('penglet', 'Penglet/Floepeng/Glacipeng', 'Water', 'Frost', 64, 62, 58, 54, 'Ice Slide'),
  f('narwee', 'Narwee/Narwhalance/Tuskwhale', 'Water', 'Frost', 72, 68, 56, 44, 'Tusk Lance'),
  // Water/Nature
  f('mossling', 'Mossling/Marshtoad/Bogmaw', 'Nature', 'Water', 72, 54, 62, 47, 'Bog Tongue'),
  f('lilyfrog', 'Lilyfrog/Lotoad/Lotuslord', 'Water', 'Nature', 66, 58, 60, 56, 'Lotus Bloom'),
  f('kelpling', 'Kelpling/Kelpserpent/Kelpwyrm', 'Nature', 'Water', 68, 62, 58, 50, 'Kelp Snare'),
  // Water/Dragon
  f('rippling', 'Rippling/Serpentide/Leviathorn', 'Water', 'Dragon', 68, 66, 58, 48, 'Riptide Coil'),
  f('eddylet', 'Eddylet/Tidewyrm/Maelstrax', 'Dragon', 'Water', 66, 70, 56, 52, 'Maelstrom'),
  f('mistlet', 'Mistlet/Fogwyrm/Monsoondrake', 'Water', 'Dragon', 62, 66, 54, 60, 'Monsoon'),
  // Water/Toxic
  f('bogmite', 'Bogmite/Sludgeray/Miasmaw', 'Toxic', 'Water', 66, 60, 60, 46, 'Bog Bite'),
  f('stingrae', 'Stingrae/Venoray/Mantaroth', 'Water', 'Toxic', 60, 66, 52, 62, 'Barb Lash'),
  f('blobble', 'Blobble/Sludgefish/Abyssgulp', 'Toxic', 'Water', 76, 60, 62, 34, 'Gulp'),
  // Nature/Earth
  f('burrowbud', 'Burrowbud/Rootmole/Grovelord', 'Nature', 'Earth', 70, 60, 68, 37, 'Root Tunnel'),
  f('stumpling', 'Stumpling/Logbear/Oakengard', 'Earth', 'Nature', 78, 72, 72, 28, 'Timber Slam'),
  f('truffkin', 'Truffkin/Mushlug/Fungalith', 'Nature', 'Earth', 70, 58, 66, 40, 'Spore Quake'),
  // Nature/Toxic
  f('sporebud', 'Sporebud/Blightbloom/Rotgrove', 'Toxic', 'Nature', 68, 58, 62, 42, 'Rot Spores'),
  f('shroomlet', 'Shroomlet/Mycotoad/Mycelord', 'Nature', 'Toxic', 66, 60, 62, 46, 'Mycelium'),
  f('pitchling', 'Pitchling/Pitchmaw/Carnivora', 'Nature', 'Toxic', 64, 70, 54, 46, 'Devour'),
  // Nature/Storm
  f('pollenix', 'Pollenix/Buzzbloom/Hivequeen', 'Nature', 'Storm', 55, 62, 48, 70, 'Pollen Storm'),
  f('buzzlet', 'Buzzlet/Thunderbee/Tempestwasp', 'Storm', 'Nature', 52, 68, 44, 76, 'Thunder Sting'),
  f('sproutbolt', 'Sproutbolt/Voltvine/Stormtree', 'Nature', 'Storm', 66, 62, 60, 48, 'Lightning Rod'),
  // Earth/Metal
  f('oreback', 'Oreback/Ironhide/Bastionox', 'Metal', 'Earth', 74, 58, 80, 28, 'Ore Crush'),
  f('drillmole', 'Drillmole/Augerclaw/Tunnelking', 'Earth', 'Metal', 62, 72, 62, 46, 'Drill Dive'),
  f('ferrock', 'Ferrock/Ironstone/Adamantor', 'Metal', 'Earth', 78, 64, 82, 22, 'Adamant Slam'),
  // Earth/Dragon
  f('dunedrake', 'Dunedrake/Quakewyrm/Terradrax', 'Earth', 'Dragon', 72, 70, 66, 32, 'Dune Breath'),
  f('sandling', 'Sandling/Dunewyrm/Siroccon', 'Dragon', 'Earth', 62, 70, 56, 56, 'Sirocco'),
  f('craglet', 'Craglet/Cragwyrm/Everpeak', 'Earth', 'Dragon', 76, 72, 70, 26, 'Peak Crash'),
  // Storm/Metal
  f('voltcog', 'Voltcog/Dynamaul/Teslarch', 'Metal', 'Storm', 58, 66, 60, 56, 'Volt Gear'),
  f('magnetite', 'Magnetite/Magnetron/Polarix', 'Metal', 'Storm', 62, 64, 66, 48, 'Polarity'),
  f('whirlbot', 'Whirlbot/Turbinox/Dynamo', 'Storm', 'Metal', 62, 68, 58, 62, 'Turbine'),
  // Storm/Frost
  f('rimehawk', 'Rimehawk/Galeclaw/Blizzaroc', 'Frost', 'Storm', 52, 66, 45, 72, 'Rime Talon'),
  f('snowpip', 'Snowpip/Sleetwing/Blizzarox', 'Storm', 'Frost', 52, 64, 44, 76, 'Sleet Dive'),
  f('cryospark', 'Cryospark/Glaciarc/Frostvolt', 'Frost', 'Storm', 60, 68, 52, 58, 'Cryo Arc'),
  // Shadow/Spirit
  f('shadewisp', 'Shadewisp/Gloomwraith/Umbrage', 'Shadow', 'Spirit', 52, 70, 46, 68, 'Shade Touch'),
  f('wailet', 'Wailet/Banshade/Dirgewraith', 'Spirit', 'Shadow', 56, 66, 50, 66, 'Wail'),
  f('grimlet', 'Grimlet/Grimshade/Reaperion', 'Shadow', 'Spirit', 58, 76, 48, 60, 'Reap'),
  // Shadow/Toxic
  f('murkling', 'Murkling/Venomshade/Plagueborne', 'Toxic', 'Shadow', 54, 68, 46, 66, 'Murk Fang'),
  f('belladot', 'Belladot/Nightshade/Deathcap', 'Toxic', 'Shadow', 62, 64, 56, 54, 'Deadly Nightshade'),
  f('plaguerat', 'Plaguerat/Pestfang/Blightking', 'Shadow', 'Toxic', 60, 70, 52, 68, 'Pestilence'),
  // Light/Spirit
  f('halofly', 'Halofly/Seraphyx/Sanctaur', 'Light', 'Spirit', 60, 60, 60, 60, 'Halo Strike'),
  f('cherublet', 'Cherublet/Virtuon/Thronis', 'Light', 'Spirit', 64, 64, 62, 52, 'Final Verdict'),
  f('lumenwisp', 'Lumenwisp/Lumenshade/Lumenarch', 'Spirit', 'Light', 58, 62, 56, 66, 'Lumen Ray'),
  // Light/Storm
  f('flashfinch', 'Flashfinch/Prismhawk/Auroros', 'Light', 'Storm', 50, 66, 42, 78, 'Flash Peck'),
  f('aurorabit', 'Aurorabit/Aurorahare/Aurorelix', 'Light', 'Storm', 60, 68, 50, 72, 'Aurora Strike'),
  f('flashkit', 'Flashkit/Brightbolt/Zenithawk', 'Storm', 'Light', 54, 70, 46, 72, 'Zenith Strike'),
  // Light/Metal
  f('gleamshell', 'Gleamshell/Mirrorback/Prismaton', 'Light', 'Metal', 66, 56, 76, 34, 'Mirror Shell'),
  f('glintmite', 'Glintmite/Mirrormite/Prismcarab', 'Metal', 'Light', 62, 62, 70, 42, 'Reflect Beam'),
  f('squirelet', 'Squirelet/Knightron/Paladinus', 'Light', 'Metal', 68, 70, 68, 36, 'Holy Blade'),
  // Frost/Spirit
  f('chillwisp', 'Chillwisp/Frostshade/Banshrime', 'Spirit', 'Frost', 56, 64, 56, 62, 'Chill Touch'),
  f('yukilet', 'Yukilet/Yukishade/Yukiwraith', 'Frost', 'Spirit', 58, 64, 54, 64, 'Frozen Soul'),
  f('rimeghost', 'Rimeghost/Glacighast/Permaspecter', 'Spirit', 'Frost', 62, 62, 60, 54, 'Grave Chill'),
  // Frost/Earth
  f('cragice', 'Cragice/Permafang/Tundrosaur', 'Frost', 'Earth', 68, 64, 66, 37, 'Permafrost Bite'),
  f('woollet', 'Woollet/Mammoss/Mastodire', 'Earth', 'Frost', 80, 70, 64, 26, 'Tusk Quake'),
  f('slablet', 'Slablet/Glaciolith/Icecap', 'Frost', 'Earth', 74, 60, 74, 30, 'Glacier Fall'),
  // ------------------------------------------------------------ Dual singles
  f('steamle', 'Steamle/Geyserp/Vaporeign', 'Fire', 'Water', 62, 62, 57, 55, 'Steam Blast'),
  f('shalebeak', 'Shalebeak/Cliffrider/Stormspire', 'Earth', 'Storm', 60, 66, 55, 54, 'Shale Peck'),
  f('coralite', 'Coralite/Reefguard/Atollith', 'Water', 'Earth', 70, 55, 72, 38, 'Coral Shards'),
  f('frostfern', 'Frostfern/Iceblossom/Winterbloom', 'Frost', 'Nature', 62, 60, 58, 55, 'Frost Bloom'),
  f('cinderwisp', 'Cinderwisp/Ashveil/Pyrewraith', 'Fire', 'Nature', 58, 68, 50, 65, 'Ash Bloom'),
  f('gildwing', 'Gildwing/Sunwyrm/Aurumdrake', 'Light', 'Dragon', 64, 70, 58, 54, 'Golden Breath'),
  // ------------------------------------------------------------ 2.0: 66 new lines (see docs/2.0-new-lines.md)
  // Metal
  f('forgepup', 'Forgepup/Smeltwolf/Crucibane', 'Metal', 'Fire', 66, 72, 58, 48, 'Slag Fang'),
  f('rivetfin', 'Rivetfin/Hullshark/Dreadnaut', 'Metal', 'Water', 62, 74, 60, 48, 'Torpedo Dive'),
  f('gearbud', 'Gearbud/Cogbloom/Clockroot', 'Metal', 'Nature', 70, 56, 70, 48, 'Clockwork Bloom'),
  f('coldcog', 'Coldcog/Frostforge/Cryomech', 'Metal', 'Frost', 64, 64, 68, 48, 'Cryo Cannon'),
  f('rustbug', 'Rustbug/Corrodite/Ruinmech', 'Metal', 'Toxic', 62, 66, 64, 52, 'Acid Sting'),
  f('nightcog', 'Nightcog/Shadowgear/Umbratron', 'Metal', 'Shadow', 58, 72, 56, 58, 'Night Strike'),
  f('alloylet', 'Alloylet/Chromewyrm/Mechadrake', 'Metal', 'Dragon', 66, 70, 62, 46, 'Chrome Breath'),
  // Toxic
  f('smoglet', 'Smoglet/Fumehound/Smogtyrant', 'Toxic', 'Fire', 62, 70, 56, 56, 'Fume Breath'),
  f('tarlet', 'Tarlet/Tarback/Tarmageddon', 'Toxic', 'Earth', 72, 62, 68, 42, 'Tar Bind'),
  f('fizzlet', 'Fizzlet/Acidarc/Toxicyclone', 'Toxic', 'Storm', 58, 66, 54, 66, 'Acid Arc'),
  f('gelicle', 'Gelicle/Frostrot/Cryoblight', 'Toxic', 'Frost', 64, 64, 62, 54, 'Frostbite Fang'),
  f('neonewt', 'Neonewt/Glowtoxin/Radiantox', 'Toxic', 'Light', 60, 66, 56, 62, 'Neon Glare'),
  f('spooklet', 'Spooklet/Sporeshade/Pallmancer', 'Toxic', 'Spirit', 60, 64, 58, 62, 'Haunt Spores'),
  f('hisslet', 'Hisslet/Venomdrake/Basilisk', 'Toxic', 'Dragon', 62, 74, 56, 52, 'Basilisk Glare'),
  // Shadow
  f('inklet', 'Inklet/Inkshade/Abyssquid', 'Shadow', 'Water', 60, 68, 56, 60, 'Ink Snare'),
  f('nightbud', 'Nightbud/Thornshade/Gravethorn', 'Shadow', 'Nature', 64, 66, 62, 52, 'Thorn Curse'),
  f('gravelet', 'Gravelet/Tombmole/Cryptlord', 'Shadow', 'Earth', 70, 66, 66, 42, 'Grave Crush'),
  f('crowlet', 'Crowlet/Duskcrow/Stormraven', 'Shadow', 'Storm', 56, 70, 52, 66, 'Raven Dive'),
  f('chilkit', 'Chilkit/Nightfrost/Hoarfang', 'Shadow', 'Frost', 58, 70, 54, 62, 'Hoarfrost Claw'),
  f('twilit', 'Twilit/Duskmirror/Penumbrax', 'Shadow', 'Light', 60, 68, 56, 60, 'Twilight Ray'),
  f('duskhatch', 'Duskhatch/Noxdrake/Voidrex', 'Shadow', 'Dragon', 64, 74, 56, 50, 'Void Rend'),
  // Spirit
  f('flickghost', 'Flickghost/Pyregeist/Pyrelich', 'Spirit', 'Fire', 58, 70, 54, 62, 'Geist Beam'),
  f('siplet', 'Siplet/Sirenwail/Shipwrath', 'Spirit', 'Water', 60, 64, 58, 62, 'Siren Wail'),
  f('sprigghost', 'Sprigghost/Dryadwisp/Elderdryad', 'Spirit', 'Nature', 64, 60, 64, 56, 'Soul Bloom'),
  f('totemkin', 'Totemkin/Totemshade/Monumentor', 'Spirit', 'Earth', 72, 60, 70, 42, 'Totem Slam'),
  f('breezeling', 'Breezeling/Galegeist/Tempestwraith', 'Spirit', 'Storm', 56, 66, 52, 70, 'Gale Wail'),
  f('helmlet', 'Helmlet/Hollowhelm/Phantarmor', 'Spirit', 'Metal', 66, 66, 68, 44, 'Hollow Guard'),
  f('bonelet', 'Bonelet/Bonedrake/Ossiwyrm', 'Spirit', 'Dragon', 62, 72, 58, 52, 'Bone Breath'),
  // Light
  f('sunpup', 'Sunpup/Sunhound/Solarion', 'Light', 'Fire', 62, 70, 52, 56, 'Sunburst Pounce'),
  f('shinefin', 'Shinefin/Glintray/Radiaray', 'Light', 'Water', 60, 62, 56, 62, 'Glint Ray'),
  f('sunsprout', 'Sunsprout/Sunbloom/Heliotree', 'Light', 'Nature', 66, 58, 64, 52, 'Sunpetal Storm'),
  f('quartzlet', 'Quartzlet/Crystalback/Geodeus', 'Light', 'Earth', 70, 60, 70, 40, 'Crystal Shards'),
  f('twinklet', 'Twinklet/Starfrost/Northstar', 'Light', 'Frost', 58, 64, 54, 64, 'Starfall Crash'),
  f('shinepup', 'Shinepup/Brightmane/Luminaire', 'Light', 'Light', 62, 66, 56, 56, 'Bright Fang'),
  // Dragon
  f('vinelet', 'Vinelet/Vinewyrm/Verdragon', 'Dragon', 'Nature', 66, 66, 60, 52, 'Vine Coil'),
  f('sparkhatch', 'Sparkhatch/Stormdrake/Thunderwyrm', 'Dragon', 'Storm', 60, 72, 54, 58, 'Thunder Roar'),
  f('rimehatch', 'Rimehatch/Rimedrake/Hoarwyrm', 'Dragon', 'Frost', 64, 70, 60, 50, 'Rime Breath'),
  f('hornling', 'Hornling/Hornwyrm/Dracohorn', 'Dragon', 'Dragon', 66, 72, 60, 46, 'Horn Roar'),
  f('glidelet', 'Glidelet/Skywyrm/Aetherdrake', 'Dragon', 'Dragon', 60, 68, 54, 62, 'Sky Dive'),
  f('jadelet', 'Jadelet/Jadewyrm/Celestiwyrm', 'Dragon', 'Spirit', 64, 66, 60, 54, 'Jade Soul'),
  // Frost
  f('thawlet', 'Thawlet/Frostflame/Cryoblaze', 'Frost', 'Fire', 60, 70, 54, 56, 'Frostflame Arc'),
  f('snowlet', 'Snowlet/Snowl/Blizzowl', 'Frost', 'Frost', 58, 64, 54, 64, 'Snow Talon'),
  f('yetling', 'Yetling/Yetibrute/Yetimaul', 'Frost', 'Frost', 72, 70, 58, 40, 'Yeti Slam'),
  f('icemite', 'Icemite/Frostspinner/Rimewidow', 'Frost', 'Toxic', 58, 66, 56, 60, 'Frost Web'),
  f('shardlet', 'Shardlet/Shardwyrm/Crystadrake', 'Frost', 'Dragon', 62, 68, 58, 52, 'Ice Shards'),
  // Fire
  f('sallet', 'Sallet/Salamandra/Pyrosaur', 'Fire', 'Fire', 60, 68, 52, 56, 'Salamander Dash'),
  f('emberchick', 'Emberchick/Flamehawk/Pyrohawk', 'Fire', 'Fire', 56, 68, 50, 62, 'Flame Peck'),
  f('smithlet', 'Smithlet/Anvilbrute/Forgemaster', 'Fire', 'Metal', 66, 70, 62, 38, 'Anvil Hammer'),
  f('brimlet', 'Brimlet/Sulfurion/Brimstone', 'Fire', 'Toxic', 60, 66, 54, 56, 'Sulfur Burst'),
  f('torchlet', 'Torchlet/Brandknight/Pyreknight', 'Fire', 'Light', 62, 68, 56, 50, 'Torch Blade'),
  // Water
  f('squalllet', 'Squalllet/Squallfin/Tempestide', 'Water', 'Storm', 60, 66, 54, 60, 'Squall Surge'),
  f('ottlet', 'Ottlet/Streamotter/Rivermarch', 'Water', 'Water', 62, 64, 56, 58, 'Torrent Dive'),
  f('pinchlet', 'Pinchlet/Crabber/Kingcrab', 'Water', 'Water', 68, 66, 66, 40, 'Pincer Crush'),
  f('bubblit', 'Bubblit/Foamshade/Undertow', 'Water', 'Spirit', 60, 62, 56, 62, 'Undertow Drain'),
  f('divebot', 'Divebot/Hydrohull/Depthmech', 'Water', 'Metal', 64, 66, 64, 46, 'Depth Cannon'),
  // Nature
  f('acornet', 'Acornet/Acornbrute/Oakenfist', 'Nature', 'Nature', 70, 64, 64, 42, 'Acorn Barrage'),
  f('larvlet', 'Larvlet/Cocoonix/Lunamoth', 'Nature', 'Nature', 60, 64, 54, 62, 'Luna Dust'),
  f('fernling', 'Fernling/Ferndrake/Junglewyrm', 'Nature', 'Dragon', 64, 68, 58, 50, 'Jungle Fang'),
  f('gnarlet', 'Gnarlet/Gnarlwood/Witchbark', 'Nature', 'Shadow', 66, 64, 64, 46, 'Hex Bramble'),
  // Storm
  f('cloudlet', 'Cloudlet/Nimbuster/Cumulord', 'Storm', 'Storm', 62, 62, 56, 60, 'Cloud Burst'),
  f('ramlet', 'Ramlet/Thunderram/Stormhorn', 'Storm', 'Storm', 64, 68, 56, 52, 'Ram Crash'),
  f('zapeel', 'Zapeel/Volteel/Thundereel', 'Storm', 'Water', 58, 68, 52, 62, 'Volt Coil'),
  f('waspark', 'Waspark/Stingvolt/Hornetron', 'Storm', 'Toxic', 56, 68, 50, 66, 'Volt Sting'),
  // Earth
  f('dillokin', 'Dillokin/Armadoll/Bouldillo', 'Earth', 'Earth', 70, 60, 72, 38, 'Roll Crash'),
  f('rhinlet', 'Rhinlet/Hornboulder/Rhinocrag', 'Earth', 'Earth', 70, 70, 64, 36, 'Rhino Slam'),
  f('stalaglet', 'Stalaglet/Stalagloom/Cavernlord', 'Earth', 'Shadow', 70, 64, 66, 40, 'Gloom Quake'),
];

export const SPECIES_BY_ID: Record<string, Species> = Object.fromEntries(SPECIES.map((s) => [s.id, s]));

/** Starter pool available on a fresh save. More unlock by beating bosses. */
export const DEFAULT_STARTERS = ['emberkit', 'frostling', 'sproutle', 'pebblin', 'zapling', 'puddlet'];

export function speciesWithElement(el: Element): Species[] {
  return SPECIES.filter((s) => s.types.includes(el));
}
