import { benchMax } from './workshop';
import { teamMax } from './boons';
import { rollTrait } from '../data/traits';
import { elementPool, MAX_TIER, MOVES } from '../data/moves';
import { HELD, heldName } from '../data/held';
import { SPECIES } from '../data/species';
import {
  addLevels,
  canPrestige,
  createCreature,
  creatureName,
  creatureTypes,
  healFraction,
  knows,
  levelCap,
  MAX_MOVES,
  stats,
  type Creature,
} from './creature';
import { allCreatures, earnCoins, eventRng, rollHeld, stash, unequipHeld, highestLevel, luckyOdds, teamTrait, prestigeTracked, registerJoin, releaseNote, rosterFull, type Run } from './run';
import { speciesWithElement } from '../data/species';

export interface EventResult {
  text: string;
  /** Start a fight after the event (ambush). */
  battle?: 'elite';
  /** A creature joined; the scene records it in the Dex. */
  joined?: Creature;
}

export interface EventOption {
  label: string;
  sub: (run: Run) => string;
  /** Needs the player to pick one of their creatures. */
  target?: boolean;
  /** Creatures this option can target (default: all). */
  eligible?: (run: Run, c: Creature) => boolean;
  /** Returns a reason if the option can't be taken right now. */
  blocked?: (run: Run) => string | null;
  run: (run: Run, target?: Creature) => EventResult;
}

export interface GameEvent {
  id: string;
  title: string;
  text: string;
  options: EventOption[];
  /** Text for the always-available "walk away" option. */
  leave?: string;
  /** What walking away costs, if anything. Returns the message. */
  onLeave?: (run: Run) => string;
}

const scale = (run: Run, base: number) => Math.round(base * (1 + run.floor));

function addCreature(run: Run, c: Creature) {
  if (run.team.length < teamMax(run)) run.team.push(c);
  else if (run.bench.length < benchMax(run)) run.bench.push(c);
  registerJoin(run, c);
}

export const EVENTS: GameEvent[] = [
  {
    id: 'bargain',
    title: 'Blood Bargain',
    text: 'A hooded merchant offers coins for a taste of your Hexlings’ vitality.',
    options: [
      {
        label: 'Offer vitality',
        sub: (run) => `One Hexling loses 30% max HP · gain ◉ ${scale(run, 40)}`,
        target: true,
        eligible: (_r, c) => c.hp > stats(c).hp * 0.35,
        run: (run, c) => {
          c!.hp = Math.max(1, c!.hp - Math.ceil(stats(c!).hp * 0.3));
          earnCoins(run, scale(run, 40));
          return { text: `${creatureName(c!)} feels weaker. You pocket ◉ ${scale(run, 40)}.` };
        },
      },
    ],
  },
  {
    id: 'egg',
    title: 'Mysterious Egg',
    text: 'A warm, speckled egg sits in an abandoned nest. A trader nearby wants coins for it.',
    options: [
      {
        label: 'Buy the egg',
        sub: (run) => `◉ ${scale(run, 45)} · a random Hexling hatches at half your top level`,
        blocked: (run) => (run.coins < scale(run, 45) ? 'Not enough coins' : rosterFull(run) ? 'Your party is full' : null),
        run: (run) => {
          run.coins -= scale(run, 45);
          const c = createCreature(eventRng(run).pick(SPECIES).id, Math.max(1, Math.round(highestLevel(run) * 0.5)));
          addCreature(run, c);
          return { text: `It hatched into ${creatureName(c)} (Lv ${c.level})!`, joined: c };
        },
      },
    ],
  },
  {
    id: 'gambler',
    title: 'The Gambler',
    text: '"Double or nothing, friend?" A grinning Hexling flips a coin.',
    options: [
      {
        label: 'Bet',
        sub: (run) => `Wager ◉ ${scale(run, 30)}: ${luckyOdds(run) * 100}% to double it`,
        blocked: (run) => (run.coins < scale(run, 30) ? 'Not enough coins' : null),
        run: (run) => {
          const bet = scale(run, 30);
          if (eventRng(run).chance(luckyOdds(run))) {
            earnCoins(run, bet);
            return { text: `Heads! You win ◉ ${bet}.` };
          }
          run.coins -= bet;
          return { text: `Tails. You lose ◉ ${bet}.` };
        },
      },
    ],
  },
  {
    id: 'dummy',
    title: 'Training Dummy',
    text: 'A battered training post, still standing. It hits back.',
    options: [
      {
        label: 'Train hard',
        sub: () => 'One Hexling gains 2 levels but takes 20% damage',
        target: true,
        eligible: (_r, c) => c.level < levelCap(c),
        run: (_run, c) => {
          const n = addLevels(c!, 2);
          c!.hp = Math.max(1, c!.hp - Math.ceil(stats(c!).hp * 0.2));
          return { text: `${creatureName(c!)} gained ${n} level${n === 1 ? '' : 's'} (Lv ${c!.level}), bruised but stronger.` };
        },
      },
    ],
  },
  {
    id: 'tome',
    title: 'Ancient Tome',
    text: 'Pages of forgotten techniques, still legible.',
    options: [
      {
        label: 'Study it',
        sub: () => 'One Hexling learns a new move from its elements',
        target: true,
        eligible: (_r, c) => tomeMoves(c).length > 0,
        run: (run, c) => {
          const id = eventRng(run).pick(tomeMoves(c!));
          if (c!.moves.length < MAX_MOVES) c!.moves.push({ id, tier: 1 });
          else if (!c!.pendingMoves.includes(id)) c!.pendingMoves.push(id);
          return { text: `${creatureName(c!)} studies ${MOVES[id].name}.` };
        },
      },
    ],
  },
  {
    id: 'spring',
    title: 'Healing Spring',
    text: 'Clear water bubbles up from the rocks.',
    options: [
      {
        label: 'Everyone drinks',
        sub: () => 'All Hexlings heal 40%',
        run: (run) => {
          for (const c of allCreatures(run)) healFraction(c, 0.4);
          return { text: 'Your Hexlings feel refreshed.' };
        },
      },
      {
        label: 'Bathe one',
        sub: () => 'One Hexling heals fully',
        target: true,
        eligible: (_r, c) => c.hp < stats(c).hp,
        run: (_run, c) => {
          healFraction(c!, 1);
          return { text: `${creatureName(c!)} is fully healed.` };
        },
      },
    ],
  },
  {
    id: 'ambush',
    title: 'Ambush!',
    text: 'A trainer leaps from the shadows, team at the ready.',
    leave: 'Flee (team loses 15% HP)',
    options: [
      {
        label: 'Fight',
        sub: () => 'Trainer battle · big XP, coins and an Evolution Stone',
        run: () => ({ text: 'Battle!', battle: 'elite' }),
      },
    ],
  },
  {
    id: 'shrine',
    title: 'Shrine of Fate',
    text: 'An old shrine hums. Offerings here are answered, one way or another.',
    options: [
      {
        label: 'Pray',
        sub: (run) => `One Hexling: ${luckyOdds(run) * 100}% gain ★, otherwise lose 40% HP`,
        target: true,
        eligible: (_r, c) => canPrestige(c),
        run: (run, c) => {
          if (eventRng(run).chance(luckyOdds(run))) {
            const lv = c!.level;
            prestigeTracked(run, c!);
            return { text: `The shrine glows. ${creatureName(c!)} is now ${'★'.repeat(c!.stars)}!${releaseNote(c!, lv)}` };
          }
          c!.hp = Math.max(1, c!.hp - Math.ceil(stats(c!).hp * 0.4));
          return { text: `The shrine lashes out. ${creatureName(c!)} is hurt.` };
        },
      },
    ],
  },
  {
    id: 'hatchling',
    title: 'Lost Hatchling',
    text: 'A wounded young Hexling from these lands huddles alone.',
    options: [
      {
        label: 'Nurse it back',
        sub: (run) => `◉ ${scale(run, 20)} for medicine · it joins at Lv 1`,
        blocked: (run) => (run.coins < scale(run, 20) ? 'Not enough coins' : rosterFull(run) ? 'Your party is full' : null),
        run: (run) => {
          run.coins -= scale(run, 20);
          const c = createCreature(eventRng(run).pick(speciesWithElement(run.biomes[run.floor])).id, 1);
          addCreature(run, c);
          return { text: `${creatureName(c)} joins you, eyes bright.`, joined: c };
        },
      },
    ],
  },
  {
    id: 'idol',
    title: 'Cursed Idol',
    text: 'A gemstone idol glitters on an altar. The air around it feels wrong.',
    options: [
      {
        label: 'Take it',
        sub: () => 'Gain an Evolution Stone · every Hexling loses 20% HP',
        run: (run) => {
          run.evoStones += 1;
          for (const c of allCreatures(run)) c.hp = Math.max(1, c.hp - Math.ceil(stats(c).hp * 0.2));
          return { text: 'You pry out an Evolution Stone ◆. A chill runs through your team.' };
        },
      },
    ],
  },
  {
    id: 'forge',
    title: 'Wandering Smith',
    text: 'A smith with a portable forge offers to temper a technique. The heat is brutal.',
    options: [
      {
        label: 'Temper a move',
        sub: () => 'One Hexling: a random move gains a tier · it loses 25% HP',
        target: true,
        eligible: (_r, c) => c.moves.some((m) => m.tier < MAX_TIER) && c.hp > stats(c).hp * 0.3,
        run: (run, c) => {
          const m = eventRng(run).pick(c!.moves.filter((x) => x.tier < MAX_TIER));
          m.tier += 1;
          c!.hp = Math.max(1, c!.hp - Math.ceil(stats(c!).hp * 0.25));
          return { text: `${creatureName(c!)}'s ${MOVES[m.id].name} is now tier ${m.tier}. It's scorched but proud.` };
        },
      },
    ],
  },
  {
    id: 'mentor',
    title: 'Retired Champion',
    text: '"I can teach one of yours what took me a lifetime. For a fee."',
    options: [
      {
        label: 'Take a lesson',
        sub: (run) => `◉ ${scale(run, 25)} · one Hexling closes half the gap to your strongest (+2 at least)`,
        target: true,
        eligible: (_r, c) => c.level < levelCap(c),
        blocked: (run) => (run.coins < scale(run, 25) ? 'Not enough coins' : null),
        run: (run, c) => {
          run.coins -= scale(run, 25);
          const n = addLevels(c!, Math.max(2, Math.round((highestLevel(run) - c!.level) / 2)));
          return { text: `${creatureName(c!)} gained ${n} level${n === 1 ? '' : 's'} (Lv ${c!.level}).` };
        },
      },
    ],
  },
  {
    id: 'circle',
    title: 'Stone Circle',
    text: 'Standing stones that answer sacrifice with power. Your bench watches, uneasy.',
    options: [
      {
        label: 'Offer a bench Hexling',
        sub: (run) => {
          const t = circleTarget(run);
          return t ? `It leaves for good · ${creatureName(t)} gains ★` : 'Nobody on your team can gain ★';
        },
        target: true,
        eligible: (run, c) => run.bench.includes(c) && !!circleTarget(run),
        run: (run, c) => {
          const t = circleTarget(run)!;
          unequipHeld(run, c!);
          run.bench = run.bench.filter((x) => x !== c);
          const lv = t.level;
          prestigeTracked(run, t);
          return { text: `${creatureName(c!)} walks into the stones and is gone. ${creatureName(t)} rises to ${'★'.repeat(t.stars)}.${releaseNote(t, lv)}` };
        },
      },
    ],
  },
  {
    id: 'rival',
    title: 'Cocky Rival',
    text: '"Bet you can’t beat me. Here, take some coins so it’s fair."',
    options: [
      {
        label: 'Accept the challenge',
        sub: (run) => `Take ◉ ${scale(run, 20)} now, then a trainer battle`,
        run: (run) => {
          earnCoins(run, scale(run, 20));
          return { text: 'Battle!', battle: 'elite' };
        },
      },
    ],
  },
  {
    id: 'trader',
    title: 'Hexling Trader',
    text: 'A trader swaps Hexlings sight unseen. Yours for one of theirs, a little stronger.',
    options: [
      {
        label: 'Trade',
        sub: () => 'Swap one Hexling for a random one: same form, +2 levels, full HP',
        target: true,
        run: (run, c) => {
          const pick = eventRng(run).pick(SPECIES.filter((sp) => sp.id !== c!.speciesId));
          const n = createCreature(pick.id, Math.min(c!.level + 2, 99), c!.stage);
          n.trait = rollTrait(n.speciesId, `${run.seed}:trade:${c!.uid}`);
          n.level = Math.min(n.level, levelCap(n));
          n.hp = stats(n).hp;
          unequipHeld(run, c!);
          const swap = (list: Creature[]) => list.map((x) => (x === c ? n : x));
          run.team = swap(run.team);
          run.bench = swap(run.bench);
          registerJoin(run, n);
          return { text: `${creatureName(c!)} leaves with the trader. ${creatureName(n)} (Lv ${n.level}) joins you!`, joined: n };
        },
      },
    ],
  },
  {
    id: 'meteor',
    title: 'Fallen Star',
    text: 'A glowing stone, still warm from the sky. Its power comes at a price.',
    options: [
      {
        label: 'Touch it',
        sub: () => 'One Hexling gains ★ and heals fully · it loses 3 levels',
        target: true,
        eligible: (_r, c) => canPrestige(c) && c.level > 3,
        run: (run, c) => {
          prestigeTracked(run, c!);
          c!.level -= 3;
          c!.xp = 0;
          healFraction(c!, 1);
          return { text: `${creatureName(c!)} glows ${'★'.repeat(c!.stars)}, but feels younger (Lv ${c!.level}).` };
        },
      },
    ],
  },
  {
    id: 'collector',
    title: 'Stone Collector',
    text: 'An eccentric hoards Evolution Stones. Buying or selling, always haggling.',
    options: [
      {
        label: 'Sell a stone',
        sub: (run) => `◆ −1 · gain ◉ ${scale(run, 50)}`,
        blocked: (run) => (run.evoStones < 1 ? 'You have no stones' : null),
        run: (run) => {
          run.evoStones -= 1;
          earnCoins(run, scale(run, 50));
          return { text: `Sold for ◉ ${scale(run, 50)}.` };
        },
      },
      {
        label: 'Buy a stone',
        sub: (run) => `◉ ${scale(run, 75)} · ◆ +1`,
        blocked: (run) => (run.coins < scale(run, 75) ? 'Not enough coins' : null),
        run: (run) => {
          run.coins -= scale(run, 75);
          run.evoStones += 1;
          return { text: 'You pocket an Evolution Stone ◆.' };
        },
      },
    ],
  },
  {
    id: 'feast',
    title: 'Roadside Feast',
    text: 'A cook offers a hot meal. There’s only so much to go around.',
    options: [
      {
        label: 'Feed the team',
        sub: (run) => `◉ ${scale(run, 15)} · team heals fully (bench gets nothing)`,
        blocked: (run) => (run.coins < scale(run, 15) ? 'Not enough coins' : null),
        run: (run) => {
          run.coins -= scale(run, 15);
          for (const c of run.team) healFraction(c, 1);
          return { text: 'Your team eats well and feels fantastic.' };
        },
      },
      {
        label: 'Share with everyone',
        sub: () => 'Free · everyone heals 25%',
        run: (run) => {
          for (const c of allCreatures(run)) healFraction(c, 0.25);
          return { text: 'Everyone gets a little.' };
        },
      },
    ],
  },
  {
    id: 'dojo',
    title: 'Sparring Dojo',
    text: 'Students spar in a clearing and invite your team to join. They don’t pull punches.',
    options: [
      {
        label: 'Spar',
        sub: () => 'Every team Hexling gains 1 level · each loses 25% HP',
        run: (run) => {
          for (const c of run.team) {
            addLevels(c, 1);
            c.hp = Math.max(1, c.hp - Math.ceil(stats(c).hp * 0.25));
          }
          return { text: 'Your team comes back bruised, and a little sharper.' };
        },
      },
    ],
  },
  {
    id: 'thief',
    title: 'Pickpocket!',
    text: 'A sly Hexling snatches your coin pouch and bolts into the brush.',
    leave: 'Let it go',
    onLeave: (run) => {
      const lost = Math.min(run.coins, scale(run, 15));
      run.coins -= lost;
      return lost ? `It gets away with ◉ ${lost}.` : 'Your pouch was empty anyway.';
    },
    options: [
      {
        label: 'Give chase',
        sub: (run) => `${luckyOdds(run) * 100}%: catch it and keep ◉ ${scale(run, 25)} it stole from others · else your lead Hexling is hurt 30%`,
        run: (run) => {
          if (eventRng(run).chance(luckyOdds(run))) {
            earnCoins(run, scale(run, 25));
            return { text: `You corner it. It drops your pouch, and someone else’s: ◉ +${scale(run, 25)}.` };
          }
          const c = run.team[0];
          c.hp = Math.max(1, c.hp - Math.ceil(stats(c).hp * 0.3));
          return { text: `It leads ${creatureName(c)} into a thorn bush and escapes.` };
        },
      },
    ],
  },
  {
    id: 'well',
    title: 'Wishing Well',
    text: 'Coins glint at the bottom of a deep, old well.',
    options: [
      {
        label: 'Make a wish',
        sub: (run) => `◉ ${scale(run, 12)} · ${Math.round(luckyOdds(run) * 50)}% for an Evolution Stone`,
        blocked: (run) => (run.coins < scale(run, 12) ? 'Not enough coins' : null),
        run: (run) => {
          run.coins -= scale(run, 12);
          if (eventRng(run).chance(luckyOdds(run) * 0.5)) {
            run.evoStones += 1;
            return { text: 'Something rises from the water: an Evolution Stone ◆!' };
          }
          return { text: 'Plop. Nothing happens.' };
        },
      },
    ],
  },
  {
    id: 'daycare',
    title: 'Hexling Daycare',
    text: 'A kindly keeper trains Hexlings left in their care, for a price.',
    options: [
      {
        label: 'Leave a bench Hexling',
        sub: (run) => `◉ ${scale(run, 30)} · one bench Hexling catches up to your strongest (Lv ${highestLevel(run)})`,
        target: true,
        eligible: (run, c) => run.bench.includes(c) && c.level < Math.min(highestLevel(run), levelCap(c)),
        blocked: (run) => (run.coins < scale(run, 30) ? 'Not enough coins' : null),
        run: (run, c) => {
          run.coins -= scale(run, 30);
          const n = addLevels(c!, highestLevel(run) - c!.level);
          return { text: `${creatureName(c!)} comes back ${n} level${n === 1 ? '' : 's'} stronger (Lv ${c!.level}).` };
        },
      },
    ],
  },
  {
    id: 'peddler',
    title: 'Trinket Peddler',
    text: 'A peddler rattles a sack of odds and ends. "Something useful in here, I promise."',
    options: [
      {
        label: 'Buy a mystery trinket',
        sub: (run) => `◉ ${scale(run, 25)} · a random held item`,
        blocked: (run) => (run.coins < scale(run, 25) ? 'Not enough coins' : null),
        run: (run) => {
          run.coins -= scale(run, 25);
          const id = rollHeld(eventRng(run));
          stash(run, id);
          return { text: `You pull out ${heldName(id)}: ${HELD[id].desc.toLowerCase()}. It's in your bag.` };
        },
      },
    ],
  },
];

export const EVENT_BY_ID: Record<string, GameEvent> = Object.fromEntries(EVENTS.map((e) => [e.id, e]));

/** Moves from a creature's elements it doesn't know yet (no signatures). */
export function tomeMoves(c: Creature): string[] {
  const [a, b] = creatureTypes(c);
  const pool = a === b ? elementPool(a) : [...elementPool(a), ...elementPool(b)];
  return pool.filter((id) => !knows(c, id) && !c.pendingMoves.includes(id) && MOVES[id].rank <= 1);
}

/** The team creature that would gain ★ at the Stone Circle: the highest level one that can. */
function circleTarget(run: Run): Creature | null {
  const ok = run.team.filter(canPrestige);
  return ok.length ? ok.reduce((a, b) => (b.level > a.level ? b : a)) : null;
}

/** A random event, avoiding ones already seen this run until all have been. */
export function rollEvent(run: Run): GameEvent {
  const seen = run.eventsSeen ?? [];
  let pool = EVENTS.filter((e) => !seen.includes(e.id));
  if (!pool.length) pool = EVENTS;
  const ev = eventRng(run).pick(pool);
  run.eventsSeen = [...(pool === EVENTS ? [] : seen), ev.id];
  return ev;
}

/** The cost of walking away (only Ambush has one). */
export function leaveEvent(run: Run, ev: GameEvent): string {
  if (ev.onLeave) return ev.onLeave(run);
  if (ev.id === 'ambush') {
    for (const c of run.team) c.hp = Math.max(1, c.hp - Math.ceil(stats(c).hp * 0.15));
    return 'You escape, but not unscathed.';
  }
  return 'You move on.';
}

// ---------------------------------------------------------------- treasure

export interface TreasureOffer {
  coins: number;
  item: import('./shop').ItemId;
  held?: import('../data/held').HeldId;
  /** Treasure Nose: a third choice. */
  extra?: { item: import('./shop').ItemId; held?: import('../data/held').HeldId };
}

export function rollTreasure(run: Run): TreasureOffer {
  const items: import('./shop').ItemId[] = ['potion', 'manual', 'scroll', 'stone', 'restore', 'sigil', 'held', 'held'];
  const coins = scale(run, 30) + eventRng(run).int(0, 15);
  const item = eventRng(run).pick(items);
  const offer: TreasureOffer = {
    coins: Math.round(coins * (run.passive === 'explorer' ? 1.5 : 1)),
    item,
    ...(item === 'held' ? { held: rollHeld(eventRng(run)) } : {}),
  };
  // Treasure Nose: sometimes (final form: always) a third thing to choose from.
  const nose = teamTrait(run.team, 'treasure');
  if (nose && eventRng(run).chance(nose)) {
    const extra = eventRng(run).pick(items.filter((i) => i !== item || i === 'held'));
    offer.extra = { item: extra, ...(extra === 'held' ? { held: rollHeld(eventRng(run)) } : {}) };
  }
  return offer;
}
