/** The game's version, shown on the title screen and in Credits. Bump it (and add an entry) per release. */
export const APP_VERSION = '1.43';

export interface ChangelogEntry {
  version: string;
  title: string;
  items: string[];
}

/** Newest first. The What's new popup shows every entry newer than the last version you saw. */
export const CHANGELOG: ChangelogEntry[] = [
  {
    version: '1.43',
    title: 'Limit Breakers on reroll',
    items: ['Limit Breakers sell out again once bought, but every shop reroll on Gilded Hunt floor 6+ brings a fresh one.'],
  },
  {
    version: '1.42',
    title: 'Limit Breakers restock',
    items: ['Limit Breakers no longer sell out: buy as many as your coins allow, on one Hexling or spread across your team.'],
  },
  {
    version: '1.41',
    title: 'Limit Breaker',
    items: ['From Gilded Hunt floor 6, every shop stocks a Limit Breaker: +5 to one Hexling’s level cap, as many times as you can afford. XP your Hexling stored at its cap turns into levels right away, so a strong team can keep climbing.'],
  },
  {
    version: '1.40',
    title: 'Host joins the fight',
    items: [
      'Fixed: in a battle royale, when the host was the last to finish the stage, their first bracket match could start behind the bracket screen, leaving the host stuck watching it.',
      'The title screen now shows your run W/L and your current consecutive wins.',
    ],
  },
  {
    version: '1.39',
    title: 'Invites that land',
    items: [
      'Fixed: tapping Join on a friend’s invite (or any button on a pop-up card) could also tap whatever was behind it in the game, sending you somewhere else instead of into their lobby.',
      'An invite that arrives while you’re in another online lobby or game now has a Leave and join button, instead of telling you to leave first and type the code.',
    ],
  },
  {
    version: '1.38',
    title: 'The big stage',
    items: ['The online waiting theme is now a showdown anthem instead of something creepy: war drums, driving strings, brass stabs, a choir and a huge hit every few bars.'],
  },
  {
    version: '1.37',
    title: 'Something stirs',
    items: ['A new eerie theme plays while you wait online: in the duel lobby, on the map once your part of a stage battle or battle royale is done, and on the battle royale bracket. A slow heartbeat, a low throbbing drone and a far-off chime.'],
  },
  {
    version: '1.36',
    title: 'Steadier legendaries',
    items: ['Roaming legendaries now only hop 1 or 2 hexes each time you move, instead of jumping anywhere on the floor, so you can actually chase one down.'],
  },
  {
    version: '1.35',
    title: 'Stadium from the field',
    items: ['The online battle stadium is now seen from the same low angle as every other battle: the arena floor stretches away to the stands, the fans get smaller toward the back rows, and both Hexlings stand on stone battle pads.'],
  },
  {
    version: '1.34',
    title: 'Stadium battles',
    items: [
      'Online battles (duels, stage battle finals, battle royale and tournament matches, and watching them) now happen in a stadium packed with fans who roar for big hits, knockouts and the winning blow.',
      'Run time: the end screen shows how long your run took (active play only: the clock stops when you leave the app). Your fastest win is in Records and has its own leaderboard.',
      'Iron Will now heals survivors 55% after wins (was 70%).',
    ],
  },
  {
    version: '1.33',
    title: 'Fairer online races',
    items: [
      'Stage battles and battle royales are now truly the same for everyone: each hex has the same wild Hexlings, trainers, shop stock, events and drops for every player, whatever order you play in.',
      'Each starter in a stage battle or battle royale comes with a random passive: the same for every player, different every race.',
      'Finished your stage early (or your team fell)? You stay on the map and watch everyone still climbing, until the final duel or the bracket begins.',
      'Daily runs benefit too: everyone meets the same Hexlings on each hex.',
    ],
  },
  {
    version: '1.32',
    title: 'A smarter Hexlidex',
    items: [
      'Open any Hexling in the Hexlidex to see where to find it (its lands and the maps that have them) and its matchups: what it’s weak to, resists and is immune to.',
      'Your record with each line: times caught, runs on your team, run wins, MVPs and best level.',
      'Shortcuts: add a Hexling to your camp crew or your Battle Arena team right from its page.',
      'Completion rewards: embers for catching 10%, 25%, 50%, 75% and all of the Hexlidex, and for every line of each element. Claim them from the top of the Hexlings list.',
    ],
  },
  {
    version: '1.31',
    title: 'Bonds you can see',
    items: [
      'At camp, your Hexlings’ forms now follow your bond: each one starts in its first form, the first camp heart evolves it to its middle form, the second to its final form, and the third makes it glow (and it still starts your runs with a bond heart).',
    ],
  },
  {
    version: '1.30',
    title: 'Camp crew search',
    items: ['Choosing who stays at camp now lists your most used Hexling lines first (with how many runs), and you can search by name.'],
  },
  {
    version: '1.29',
    title: 'A cozier camp',
    items: [
      'Camp is full of life from day one: trees, bushes and rocks, a dirt clearing and path, your bedroll and pack, log seats, a woodpile and a pot bubbling by the fire.',
      'Smoke drifts up, fireflies come out after dark (butterflies by day), and wild Hexlings wander past now and then.',
    ],
  },
  {
    version: '1.28',
    title: 'Camp comes alive',
    items: [
      'Every run now starts at camp (not dailies or weeklies). Take one thing for the road: coins, potions, a trinket, an Evolution Stone, a shop coupon or a bond heart for your starter.',
      'Visitors drop by: Professor Alder tells you if a legendary is roaming the map ahead and what lands are coming, Mori sees you off, and your rival sizes you up.',
      'Three daily challenges (easy, medium and hard) from Mori, Alder and your rival. Finish them for embers, and spend embers at the Ember stall on decorations and new fire colours.',
      'Choose who stays at camp (Camp crew) and pet, feed and play with them each day to build a bond. With a full bond, that Hexling starts your runs with a bond heart. Bonds show in the Hexlidex and Records.',
      'Your camp grows as you play: tents, banners for maps won, lanterns for Heat, a Hexlidex board, a gilded shrine, statues of legendaries, and a bigger fire.',
      'Friends who are online sit by your fire with their favourite Hexling (or their last starter).',
    ],
  },
  {
    version: '1.27',
    title: 'Friend codes',
    items: [
      'Friends are now added by friend code only (like HEX-4K9P2), not by username, since usernames show on the leaderboards. Find your code at the top of the Friends screen and tap it to copy.',
      'Codes work however they’re typed: hex 4k9p2, 4K9P2 or HEX-4K9P2.',
    ],
  },
  {
    version: '1.26',
    title: 'Leaderboards',
    items: [
      'All-time Top 10 leaderboards: runs won, best win streak, highest Heat, Hexlidex forms, Hexlings caught, battles won, guardians beaten, gilded and legendaries caught, deepest Gilded Hunt, tournaments, online wins, titles and coins earned.',
      'Find them under Records › Top 10. See everyone, or just you and your friends, and where you stand if you’re not in the top 10 yet.',
      'Your best ever counts, so a fresh save never knocks you down. Ties go to whoever got there first.',
      'Signed in with a trainer name, you’re on the boards automatically. Rather not be? Hide yourself at the bottom of the board.',
    ],
  },
  {
    version: '1.25',
    title: 'Friends',
    items: [
      'Friends: your trainer name is your username, and you get a friend code (like HEX-4K9P2). Add friends by either one; they get a request to accept. Find it on the title screen, under Play online, or at camp.',
      'Trainer names are now 3 to 16 letters, numbers, spaces, _ - or ., and signed in, no two players share one. Renaming your trainer renames your username too.',
      'See who’s online and what they’re up to (in a run, in the Arena, in an online lobby...), with their trainer and title.',
      'Invite a friend in one tap: choose what to play, and they get a pop-up wherever they are in the game. Join takes them straight into your lobby, no code to type. Hosting already? Invite more friends from the lobby.',
      'Remove or block anyone any time. There’s no public player list: people can only find you by your exact username or friend code.',
    ],
  },
  {
    version: '1.24',
    title: 'Accounts',
    items: [
      'Accounts: sign in with your email (Settings › Account & saves). You get a sign-in code by email, no password, and your progress saves to your account and follows you to any device.',
      'The game still saves on your device, so it plays the same offline, and catches your account up when you’re back online.',
      'Already have progress on another device? Choose "Start from a save code" when you make your account, and it moves in.',
      'If this device and your account both have new progress, the game asks which to keep, and keeps the other as a backup you can restore.',
      'Save codes still work, signed in or not. You can sign out or delete your account any time.',
    ],
  },
  {
    version: '1.23',
    title: 'Familiar faces',
    items: [
      'Your rival: every run has one, with a lead Hexling picked to have the edge on your starter. They wait on one trainer hex a floor (marked RIVAL on the map), with a team that grows from 2 to 4 Hexlings as their ace evolves. Beat them for an extra Evolution Stone, or go around them, but they’ll remember.',
      'Trainers, your rival and the guardians now say something as the fight starts.',
      'Mori the shopkeeper chats while you shop, and notices how your run is going.',
      'Professor Alder turns up on some event hexes with a hint: Hexlings around here you haven’t caught, when your lead can evolve, how your Hexlidex is coming along, or a legendary nearby.',
      'Camp: rest between runs by the campfire, with your trainer and the Hexlings who finished your last run (tap them), your trophies, and signposts to a new run, the Arena, the Hexlidex and Records. The end of a run brings you here, and the flame button on the title screen does too. It’s just for looks: nothing carries into a run.',
    ],
  },
  {
    version: '1.22',
    title: 'A living world',
    items: [
      'The map comes alive: wild Hexlings of the land roam the hexes, hopping from hex to hex along the paths. They nap, look around, keep off the hexes you can move to, and scatter a hex or two away when your trainer lands close by. Tap one and it squeaks.',
      'Birds and cloud shadows cross the map, and rest and treasure hexes glimmer.',
      'Day and night follow your clock: dawn, dusk and a starry night with fireflies. At night, Shadow and Spirit Hexlings come out in every land.',
      'Holidays dress up the map for the day itself: New Year fireworks, Valentine’s hearts, St Patrick’s clovers, Halloween bats and jack-o’-lanterns, and winter snow with lights. Turn it all off in Settings (Day, night & holidays).',
      'Natures: every Hexling you meet on a run has one (Brave, Timid, Hearty...), a small lean of +10% to one stat and −10% to another. See it on the Team screen and in battle stats.',
      'Bond: each battle a Hexling wins with you brings you closer. At 3, 8 and 15 wins it earns a heart (♥), and each heart gives it a better chance to hang on at 1 HP from a knockout blow, once a battle.',
      'Your lead Hexling reacts on the map: a happy hop after a win, worn out when hurt, uneasy with the guardian a step away. Tap it for a cry and its hearts.',
      'Weather: four rare moves change the battle’s weather for 5 turns. Scorching Sky (sun: Fire +30%, Water −30%), Downpour (rain: Water +30%, Fire −30%), Dust Storm (Earth +30%, wears down all but Earth and Metal) and Hail Front (Frost +30%, wears down all but Frost). Only two lines learn each one, at Lv 28.',
      'Roaming legendaries: Solmane, Tidecrown and Umbrawyrm wander floors 2 and 3 now and then. Their silhouette shows on a battle hex ahead and moves as you do. Meet one and it flees after 4 turns, but keeps the damage you did. Wear it down to catch it: it joins that run, fills its Hexlidex entry (#121-123, counted toward the Hexlidex) and can be brought to Arena battles, tournaments and online Arena duels from then on. Legendaries are never starters. They don’t roam daily, weekly or online runs.',
    ],
  },
  {
    version: '1.21',
    title: 'Potions everywhere, pick your mode',
    items: [
      'Potions in the Battle Arena: the ladder and the tournament each give you 5 potions for the whole run (50% heal, cures status).',
      'Potions online: 3 per battle in Arena duels, 5 for a whole online tournament, and in stage battles and battle royales you bring the potions you finished the stage with (they carry through the bracket).',
      'Play online: the host now chooses the game (Arena duel, Stage battle, Battle royale or Tournament) before getting a code, and the session sticks to it. Everyone who joins sees which game it is and waits for the host to start.',
      'Arena duels and stage battles take 2 players; battle royales and tournaments 3 to 8 (the host’s code stays on screen until you start).',
      'The Battle Arena no longer has its own "Play with a friend" button: use Play online on the title screen.',
      'Battle royale map: every other racer now shows on your map (grayed out, with their name and lead Hexling), hopping along as they move, so you can see where everyone is. They leave the map when they reach the boss or wipe out.',
    ],
  },
  {
    version: '1.20',
    title: 'Spectating',
    items: [
      'Online tournament and battle royale brackets: tap a live match (it has a pulsing WATCH tag) to watch it as it happens, move by move.',
      'Anyone not in a match can watch: knocked out, waiting for the next round, or without a team. Use the menu to stop watching, or it takes you back to the bracket when the match ends.',
      'If your own next match is ready while you watch, it starts straight away.',
    ],
  },
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
