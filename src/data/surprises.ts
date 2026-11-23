/**
 * Rare surprises (Hexbound 2.0): things you might not see for ten runs. Rolled from the run's seed
 * (logic/surprises), so seeded runs and online races give everyone the same ones.
 */

export type SurpriseKind = 'omen' | 'floor' | 'elder' | 'hex' | 'encounter';

export interface SurpriseDef {
  id: string;
  kind: SurpriseKind;
  name: string;
  /** What it does (shown once found). */
  desc: string;
  /** A vague hint for the Hexlidex before you've found it. */
  hint: string;
}

const S = (id: string, kind: SurpriseKind, name: string, desc: string, hint: string): SurpriseDef => ({ id, kind, name, desc, hint });

export const SURPRISE_LIST: SurpriseDef[] = [
  // ------------------------------------------------------------ omens (whole run, announced at the start)
  S('bloodmoon', 'omen', 'Blood Moon', 'Every foe has its rare ◆ trait, and every boon offer has 4 choices.', 'A red sky, some nights.'),
  S('goldenage', 'omen', 'Golden Age', 'Battles pay double coins, but prices are 50% higher.', 'Some runs, money flows.'),
  S('wildsurge', 'omen', 'Wild Surge', 'Wild Hexlings are 3 levels higher, and the ones you catch join 2 levels higher.', 'The wilds grow restless.'),
  S('starfall', 'omen', 'Starfall', 'Every floor has a Boon hex.', 'Stars fall on lucky runs.'),
  // ------------------------------------------------------------ rare floors
  S('grove', 'floor', 'Gilded Grove', 'A golden floor: Gilded Hexlings turn up 5 times as often.', 'A floor that shines.'),
  S('eclipse', 'floor', 'Eclipse', 'Night lasts the whole floor: only Shadow and Spirit Hexlings, and every battle is at night.', 'A floor where the sun never rises.'),
  S('stormfront', 'floor', 'Storm Front', 'Every battle on this floor starts in wild weather.', 'A floor where the sky is never calm.'),
  S('mirror', 'floor', 'Mirror Floor', "The wild Hexlings are your own team's lines.", 'A floor that looks back at you.'),
  S('ruins', 'floor', 'Ancient Ruins', 'A legendary is sure to roam, relic chests stand among the ruins, and a stone titan guards the top (an Elder).', 'A floor older than the rest.'),
  S('shattered', 'floor', 'Shattered Floor', "Two lands at once: wild Hexlings come from both, and the guardian's team mixes them.", 'A floor split in two.'),
  // ------------------------------------------------------------ elder guardians
  S('elder', 'elder', 'Elder guardian', 'A rare, older guardian: 2 levels higher, an extra rule, and every Hexling with its rare ◆ trait. Beat it for a mythic boon offer.', 'Some guardians are older than others.'),
  // ------------------------------------------------------------ hidden hexes
  S('well', 'hex', 'Wishing Well', 'Toss in coins for a random result: nothing, coins back, a boon or a mythic boon.', 'A hex that grants wishes, sometimes.'),
  S('altar', 'hex', 'Cursed Altar', 'Give up a Hexling or half your coins for a mythic boon.', 'A dark stone that asks for a price.'),
  S('hiddenshop', 'hex', 'Hidden Shop', 'A secret stall that sells boons.', 'Someone sells more than items, if you can find them.'),
  S('hatchery', 'hex', 'Hatchery', "An egg that hatches after 5 battles into a line you haven't caught, always with its rare ◆ trait.", 'A warm nest, left alone.'),
  S('fossil', 'hex', 'Fossil Site', 'Dig up one of three fossils and bring back an ancient form: a rare amber-stone version of its line, kept in the Hexlidex like Gilded.', 'Old bones in the rock.'),
  S('dojo', 'hex', 'Dojo', 'Three trainer battles in a row with no healing between. Win them all for a boon and a Limit Breaker.', 'A place to test yourself, three times over.'),
  // ------------------------------------------------------------ rare encounters
  S('gildedtrainer', 'encounter', 'Gilded trainer', 'A trainer whose whole team is Gilded.', 'A trainer who shines.'),
  S('twinwilds', 'encounter', 'Twin wilds', 'Two wild Hexlings of the same line, both with their rare ◆ trait.', 'Sometimes they come in pairs.'),
  S('caravan', 'encounter', 'Travelling caravan', 'A seven-item shop on wheels, with one thing free.', 'Wheels on the road, now and then.'),
  S('ghost', 'encounter', "A friend's ghost", "A trainer fielding a friend's last winning team, with their name and look. Beat it for a souvenir.", 'Someone you know left a trace.'),
  S('echo', 'encounter', 'Echo of yourself', 'A trainer fielding your last winning team, at this floor\u2019s level.', 'You may meet someone familiar.'),
];

export const SURPRISES: Record<string, SurpriseDef> = Object.fromEntries(SURPRISE_LIST.map((s) => [s.id, s]));
