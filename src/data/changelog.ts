/** The game's version, shown on the title screen and in Credits. Bump it (and add an entry) per release. */
export const APP_VERSION = '1.1';

export interface ChangelogEntry {
  version: string;
  title: string;
  items: string[];
}

/** Newest first. The What's new popup shows every entry newer than the last version you saw. */
export const CHANGELOG: ChangelogEntry[] = [
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
