import { hashString } from '../logic/rng';
import type { Element } from './types';

/**
 * What people say: trainers before a fight, guardians' taunts, your rival, the shopkeeper and
 * the researcher. Picked from a key (a hash), so the same moment always gets the same line and
 * the run's random rolls are untouched.
 */
export const pickLine = (lines: readonly string[], key: string): string => lines[hashString(key) % lines.length];

/** Trainers, as the fight starts. */
export const TRAINER_LINES = [
  'I’ve been waiting all day for a real challenge!',
  'My team’s been itching for a fight. Don’t disappoint them.',
  'You look tough. Good. I don’t like easy wins.',
  'Every Hexling on this floor knows my name. Now you will too.',
  'Turn back while you can! ...No? Fine, let’s go!',
  'I trained here for three seasons for a moment like this.',
  'Your Hexlings look tired. Mine aren’t.',
  'Win or lose, I’ll learn something. Will you?',
  'I don’t let anyone pass without a battle. House rules.',
  'Ooh, a challenger! Don’t blink.',
  'You’re heading for the guardian? You’ll have to go through me first.',
  'Let’s make this one worth remembering.',
  'I bet my lunch on this battle. Please lose.',
  'Quiet, everyone. This is going to be good.',
];

/** Guardians, as the fight starts (their quote shows on the guardian card before it). */
export const GUARDIAN_TAUNTS: Record<Element, string[]> = {
  Fire: ['Let’s see if your resolve burns as hot as mine.', 'This floor is my forge. You’re the metal.'],
  Frost: ['Cold patience wins every war.', 'Every step you take here, the ice grows thicker.'],
  Nature: ['Roots run deeper than you know.', 'You trampled my garden all the way here. Now I prune.'],
  Earth: ['Mountains don’t move. Neither will I.', 'You’ll break before this stone does.'],
  Storm: ['Hear that? That’s the sky choosing a side.', 'Lightning never asks permission.'],
  Water: ['The tide always comes back. Always.', 'Swim, if you can.'],
  Metal: ['Every gear in this place answers to me.', 'Your team has flaws. I can see every one.'],
  Toxic: ['Breathe deep. It only stings a little.', 'You’ve been walking through my mist for a while now.'],
  Shadow: ['You never saw me. You never will.', 'The dark here has teeth.'],
  Light: ['Look at me. Can you even see past the glare?', 'Radiance this bright leaves no room for doubt.'],
  Spirit: ['So many have come before you. They stayed.', 'Hush. The spirits are watching.'],
  Dragon: ['Kneel, or be made to.', 'I have outlived every challenger. I’ll outlive you.'],
};

// ---------------------------------------------------------------- your rival

/** Before each floor's rival battle. `{ace}` is their lead Hexling. */
export const RIVAL_HELLO: string[][] = [
  ['Hey! I picked {ace} just to beat you. Let’s see who’s better!', 'Took you long enough! {ace} and I are ready.'],
  ['{ace} and I have been training since last floor. Don’t hold back!', 'Still standing? Me too. Round two!'],
  ['This is it. Beat me here and nothing on this floor can stop you.', 'One last time, before the guardian. Give it everything!'],
];
/** When they meet you again after you went around them last floor. */
export const RIVAL_SKIPPED = 'You walked right past me last floor! Not this time.';
/** After you beat them. */
export const RIVAL_LOST = [
  'Hmph. Lucky. I’ll be stronger on the next floor!',
  '...You’re getting strong. So am I. See you up ahead.',
  'Go on, then. Show the guardian what you showed me.',
];

// ---------------------------------------------------------------- the shopkeeper

export const SHOPKEEPER = 'Mori';
export interface ShopMood {
  floor: number;
  coins: number;
  /** Share of the team's health left (0-1). */
  health: number;
  /** The guardian is a step or two away. */
  bossNear: boolean;
  /** Shops already visited this run. */
  visits: number;
}

/** What the shopkeeper says, by how your run is going. */
export function shopLine(m: ShopMood, key: string): string {
  if (m.visits === 0) return pickLine(['Welcome, welcome! First time at Mori’s? Everything’s fresh.', 'A new face! Have a look around, take your time.'], key);
  if (m.health < 0.4) return pickLine(['Back again? You look rough. Potions are on the left.', 'Oof. Your team’s seen better days. I won’t judge, I’ll sell.'], key);
  if (m.bossNear) return pickLine(['The guardian’s just up ahead. Stock up, friend.', 'Last stop before the guardian. I’d buy something, if I were you.'], key);
  if (m.coins >= 200) return pickLine(['Look at that coin pouch! Let’s lighten it a little.', 'Big spender! I saved the good stuff for you.'], key);
  if (m.coins < 40) return pickLine(['Window shopping today? That’s fine, it’s free.', 'Coins a bit short? Win a few battles and come back.'], key);
  if (m.floor >= 2) return pickLine(['You made it all the way up here? Not many do.', 'Prices are higher up here. So are the stakes.'], key);
  return pickLine(['Good to see you again! Same deal as always.', 'Back for more? I like a regular.', 'Fresh stock this morning. Have a look.'], key);
}

// ---------------------------------------------------------------- the researcher

export const RESEARCHER = 'Professor Alder';
