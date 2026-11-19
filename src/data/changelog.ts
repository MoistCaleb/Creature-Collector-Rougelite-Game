/** The game's version, shown on the title screen and in Credits. Bump it (and add an entry) per release. */
export const APP_VERSION = '1.19';

export interface ChangelogEntry {
  version: string;
  title: string;
  items: string[];
}

/** Newest first. The What's new popup shows every entry newer than the last version you saw. */
export const CHANGELOG: ChangelogEntry[] = [
  {
    version: '1.19',
    title: 'Online tournament',
    items: [
      'Play with a friend now has an online Tournament for 3 to 8 players: everyone’s active Lv 50 Arena team goes straight into a knockout bracket, no stage race.',
      'The host starts it from the lobby, next to Battle royale. Everyone is fully healed before each match, and you can watch the rest of the bracket once you’re out.',
      'Winning one counts as a tournament win (Bracket Buster, Grand Champion) and an online win.',
    ],
  },
  {
    version: '1.18',
    title: 'Arena tournament',
    items: [
      'New in the Battle Arena: Tournament. You and 7 computer trainers in a knockout bracket (Quarterfinal, Semifinal, Final), the same bracket as the battle royale.',
      'Your team is fully healed before every match. The other trainers range from beginners to an Arena Champion, and their matches play out on the bracket while you watch (or skip ahead).',
      'A tournament is saved as you go, so you can close the game and resume it from the Arena.',
      'New titles: Bracket Buster (win a tournament, Rare) and Grand Champion (win 5, Epic). Tournaments won now shows in Records.',
    ],
  },
  {
    version: '1.17',
    title: 'Royal rewards',
    items: [
      'Fixed: pressing one map hex and letting go over another (the map still gliding from a trackpad scroll) no longer moves you to the other hex. Every tap now needs to start and end on the same thing.',
      'New battle royale titles: Royale Victor (win with 4+ players, Epic), Royale Champion (6+, Legendary) and Battle Monarch (8 players, Mythic).',
      'They unlock a Victory banner (Back), the Regal aura, and the Monarch crown with a Royal mantle, each with its own sparkle.',
      'Royal mantle: a cleaner look, a crimson robe open over a gold-trimmed tunic with a gold chain and hem.',
      'Victory banner: now a tall crimson standard with a gold border and star, hanging beside your head.',
    ],
  },
  {
    version: '1.16',
    title: 'Neutral moves and speed attacks',
    items: [
      'The first Neutral moves. Bulwark: goes first and blocks attacks for the turn, but only 1 time in 4 if used again right after it held (4 uses). The bulkiest lines learn it at Lv 30.',
      'Time Warp: for 5 turns the slower Hexling moves first; use it again to end it early (5 uses). Slow Metal, Light, Shadow and Spirit lines (and bulky Spirit ones) learn it at Lv 34.',
      'Speed attacks: the fastest lines learn a Blitz (stronger the faster they are than the foe) and the slowest a Crush (stronger the slower they are), at Lv 16. Pow 40 to 130.',
      'Hexlings past those levels are offered them on their next level-up, and they show in the team builder for the lines that learn them.',
    ],
  },
  {
    version: '1.15',
    title: 'Move Relearn',
    items: [
      'New shop item, Move Relearn: swap one of a Hexling\u2019s moves for any move it would naturally know by now (including ones it forgot).',
      'Forgetting a move now asks you to confirm first, so the wrong one can\u2019t slip away.',
    ],
  },
  {
    version: '1.14',
    title: 'Your run is safe',
    items: [
      'Playing online (stage battles, battle royales) no longer erases the run you had saved. Online runs are never saved over it.',
    ],
  },
  {
    version: '1.13',
    title: 'Battle royale',
    items: [
      'Battle royale: 3 to 8 players join one host\u2019s code and race the same stage. Everyone with a team left at the boss goes into a tournament bracket, and the winner of the final is champion.',
      'The bracket screen shows every match as it plays out; your own matches start by themselves.',
      'Stage battles end right away when the other player\u2019s team is wiped out: the win is yours.',
    ],
  },
  {
    version: '1.12',
    title: 'Steadier online play',
    items: [
      'Duels and stage battles try more ways to link two devices, including relays over TCP for networks that block the usual route (office and school Wi-Fi, some phone carriers).',
      'If the code is found but the devices can\u2019t link, it now says so (with tips) instead of \u201cNo answer\u201d.',
      'Greatsword: the front view now matches the back.',
    ],
  },
  {
    version: '1.11',
    title: 'Scrolling and battle info',
    items: [
      'A foe\u2019s stats panel shows only the moves it has used in this battle.',
      'Mouse wheel and trackpad scrolling in the Bag and team builder; screens no longer scroll behind popups.',
      'Dragging a list and letting go over a button no longer presses it.',
    ],
  },
  {
    version: '1.10',
    title: 'Fortress fix',
    items: [
      'What\u2019s new (Settings \u203a Credits) now scrolls through every update back to 1.0.',
      'Heal-and-guard signature moves (Molten Core, Iron Will, Lotus Bloom, Mirror Shell, Frost Bloom, Ash Bloom) now raise your own Defense. They were raising the foe\u2019s by mistake.',
    ],
  },
  {
    version: '1.9',
    title: 'Upgrade fix',
    items: [
      'Stone Skin and Roar of Kings: their top upgrade now removes the drawback (+4 is the most any stat can rise, so it no longer claims +5).',
    ],
  },
  {
    version: '1.8',
    title: 'Calmer team screen',
    items: [
      'Tapping Hexlings on the team screen just shows them: nothing moves around.',
      'To swap places (team \u2194 bench too), tap Order Hexlings, then tap two Hexlings. Tap Done ordering when finished.',
    ],
  },
  {
    version: '1.7',
    title: 'Land moves',
    items: [
      'Now and then, a Hexling learns a move from the land you’re on (a Water move in the Water lands...) in place of its usual next move. That usual move isn’t offered.',
      'Land moves come with your saved loadouts: in the team builder they’re only available through a loadout that has them.',
      'Guardian reward: Prestige two (choose two Hexlings to gain a star) replaces Team prestige.',
      'A claimed guardian keeps its prestige stars.',
    ],
  },
  {
    version: '1.6',
    title: 'Fewer, stronger conditions',
    items: [
      'Far fewer attacks inflict a condition: one to three per element (e.g. Ember and Scorch burn; Flame Lash, Inferno and Blaze Rush no longer do). Signature moves named for a condition keep theirs.',
      'The ones that still do land it more often: burn 25%, poison 30%, paralysis 25%, freeze 15%, sleep 20%, confusion 25%.',
      'Multi-hit moves roll a smaller chance on each hit (about 39% over three hits for Static Burst and Spore Burst).',
    ],
  },
  {
    version: '1.5',
    title: 'Battle info',
    items: [
      'Tap a Hexling\u2019s panel in battle to see its stats, stat changes (up to ±4 steps), condition, held item and moves (a foe\u2019s once you\u2019ve seen them).',
      'Multi-hit moves roll their condition on every hit (Static Burst, Spore Burst, Hailstones).',
      'The Prestige Altar explains how it works, and warns you before you step on one with nothing to sacrifice.',
      'Mac, PC and sideways screens: two-column choices, and fixes for overlapping text on several screens.',
    ],
  },
  {
    version: '1.4',
    title: 'Smarter auto-battle',
    items: [
      'Auto-battle switches out of bad matchups to a teammate that does much better.',
      'It drinks a Potion when your Hexling is low or stuck asleep, frozen or badly hurt by a burn or poison (not when the foe is about to go down).',
      'When a Hexling faints, it sends in your best answer itself.',
      'Your trainer turns to face you while celebrating a win.',
    ],
  },
  {
    version: '1.3',
    title: 'Polish',
    items: [
      'NEW tags on gear and titles you haven’t looked at yet.',
      'Putting on gear sparkles on your trainer, and “Shuffle + gear” mixes in what you’ve unlocked.',
      'Win a battle and your trainer celebrates with a flare of their aura’s color (lose online and your opponent does).',
      'The online lobby shows your opponent’s trainer, gear and effects included.',
      'Cut-ins show a slash of the trainer’s aura color behind their name.',
      'Gear from behind now covers your back the way it should; the cloak, mech suit, dragon armor and dragon helm cover more.',
    ],
  },
  {
    version: '1.2',
    title: 'Legendary gear',
    items: [
      '27 new cosmetics, unlocked by trainer titles, many with live effects.',
      'New Back slot: Angel, Demon, Fairy and Phoenix wings, a Jetpack, a Greatsword, a Dragon tail and Mech arms.',
      'Hats: Flame crown, Storm cloud, Dragon helm, Wizard hat, Viking helm, Third eye, Astral halo. Tops: Dragon armor, Void cloak, Mech suit. Shoes: Rocket boots, Cloud steps.',
      'Animated auras: Inferno, Frost, Storm, Shadow, Toxic, Starfall, Rainbow and Void, shown in battle, on the map and to your opponent online.',
      'The Titles screen shows what each title unlocks.',
      'Stage battles: your opponent’s title shows over their token on the map.',
    ],
  },
  {
    version: '1.1',
    title: 'Trainer titles',
    items: [
      '25 trainer titles to earn, from Common to Mythic: win streaks, high Heat, every map, the Hexlidex, the Arena, weeklies, online wins and more.',
      'Each tier has its own look: Rare glows blue, Epic shimmers violet, Legendary pulses gold with sparkles, Mythic shifts through the rainbow.',
      'Your opponent sees your title, with its effect, in the online lobby, the battle cut-in and on the battlefield.',
      'See every title and how close you are: Edit trainer › your name › Titles.',
    ],
  },
  {
    version: '1.0',
    title: 'Hexbound 1.0',
    items: [
      'Your trainer now stands on the map where you are and hops to each new hex, with your lead Hexling following along.',
      'Hexlidex: search Hexlings (filter to Caught or Gilded) and moves (filter to Attacks or Status).',
      'Stage battles: your opponent and their lead Hexling show on your map, grayed out, moving as they move.',
      'Weekly challenge: one fixed run a week with a twist rule, the same for everyone.',
      'Gilded milestones: collect Gilded species to unlock trainer titles and gilded outfits.',
      'Save transfer: copy a save code to move your progress to another device (Settings).',
      'Reduce motion: tone down screen shake, flashes and zooms (Settings).',
      'Credits, and this What’s new list.',
      'The installed app now tells you when a new version is ready.',
      'Balance: Heat 1 enemies are 1/1/2 levels higher (was 1/2/3); 12 of the weakest starters got sturdier.',
      'Fire: sturdier Hexlings, Cauterize (a draining hit) and Heat Haze (+2 Defense) replace Stoking Claw and Fire Dance.',
      'Guardian rules: Thornwall recoil 15% → 10%; Overclock stops at +3 Attack.',
    ],
  },
  {
    version: '0.9',
    title: 'Gilded Hexlings',
    items: [
      'Gilded Hexlings: rare golden Hexlings with a reveal, an aura and flashy attacks.',
      'Catch one and the whole line can start runs Gilded, and join your Arena and online teams.',
      'Gilded Hunt: an endless climb after a win, with Gilded Hexlings everywhere.',
      'Manga cut-ins before trainer, guardian, Arena and online battles.',
      'More guardian rules: 2 at Heat 4-7 and 3 at Heat 8.',
    ],
  },
  {
    version: '0.8',
    title: 'Settings and records',
    items: [
      'Settings, first-time tips, How to play, the element chart and the Records screen.',
      'More music: every land, battle and screen has its own tunes.',
      'Daily run starters bring passives that suit them.',
    ],
  },
];

/** Compare "1.0" and "0.9" style versions. */
export function versionNewer(a: string, b: string): boolean {
  const pa = a.split('.').map(Number);
  const pb = b.split('.').map(Number);
  for (let i = 0; i < Math.max(pa.length, pb.length); i++) {
    const x = pa[i] ?? 0;
    const y = pb[i] ?? 0;
    if (x !== y) return x > y;
  }
  return false;
}

/** Entries newer than the version last seen (all of them if none was seen). */
export function changesSince(seen: string | null): ChangelogEntry[] {
  return seen ? CHANGELOG.filter((e) => versionNewer(e.version, seen)) : CHANGELOG;
}
