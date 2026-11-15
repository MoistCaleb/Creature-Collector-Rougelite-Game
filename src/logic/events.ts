import { elementPool, MOVES } from '../data/moves';
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
  prestige,
  stats,
  type Creature,
} from './creature';
import { allCreatures, BENCH_MAX, highestLevel, registerJoin, rosterFull, TEAM_MAX, type Run } from './run';
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
}

const scale = (run: Run, base: number) => Math.round(base * (1 + run.floor));

function addCreature(run: Run, c: Creature) {
  if (run.team.length < TEAM_MAX) run.team.push(c);
  else if (run.bench.length < BENCH_MAX) run.bench.push(c);
  registerJoin(run, c);
}

export const EVENTS: GameEvent[] = [
  {
    id: 'bargain',
    title: 'Blood Bargain',
    text: 'A hooded merchant offers coins for a taste of your creatures’ vitality.',
    options: [
      {
        label: 'Offer vitality',
        sub: (run) => `One creature loses 30% max HP · gain ◉ ${scale(run, 40)}`,
        target: true,
        eligible: (_r, c) => c.hp > stats(c).hp * 0.35,
        run: (run, c) => {
          c!.hp = Math.max(1, c!.hp - Math.ceil(stats(c!).hp * 0.3));
          run.coins += scale(run, 40);
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
        sub: (run) => `◉ ${scale(run, 45)} · a random creature hatches at half your top level`,
        blocked: (run) => (run.coins < scale(run, 45) ? 'Not enough coins' : rosterFull(run) ? 'Your party is full' : null),
        run: (run) => {
          run.coins -= scale(run, 45);
          const c = createCreature(run.rng.pick(SPECIES).id, Math.max(1, Math.round(highestLevel(run) * 0.5)));
          addCreature(run, c);
          return { text: `It hatched into ${creatureName(c)} (Lv ${c.level})!`, joined: c };
        },
      },
    ],
  },
  {
    id: 'gambler',
    title: 'The Gambler',
    text: '"Double or nothing, friend?" A grinning creature flips a coin.',
    options: [
      {
        label: 'Bet',
        sub: (run) => `Wager ◉ ${scale(run, 30)}: 50% to double it`,
        blocked: (run) => (run.coins < scale(run, 30) ? 'Not enough coins' : null),
        run: (run) => {
          const bet = scale(run, 30);
          if (run.rng.chance(0.5)) {
            run.coins += bet;
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
        sub: () => 'One creature gains 2 levels but takes 20% damage',
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
        sub: () => 'One creature learns a new move from its elements',
        target: true,
        eligible: (_r, c) => tomeMoves(c).length > 0,
        run: (run, c) => {
          const id = run.rng.pick(tomeMoves(c!));
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
        sub: () => 'All creatures heal 40%',
        run: (run) => {
          for (const c of allCreatures(run)) healFraction(c, 0.4);
          return { text: 'Your creatures feel refreshed.' };
        },
      },
      {
        label: 'Bathe one',
        sub: () => 'One creature heals fully',
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
        sub: () => 'Elite battle · win an Evolution Stone',
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
        sub: () => 'One creature: 50% gain ★, 50% lose 40% HP',
        target: true,
        eligible: (_r, c) => canPrestige(c),
        run: (run, c) => {
          if (run.rng.chance(0.5)) {
            prestige(c!);
            return { text: `The shrine glows. ${creatureName(c!)} is now ${'★'.repeat(c!.stars)}!` };
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
    text: 'A wounded young creature from these lands huddles alone.',
    options: [
      {
        label: 'Nurse it back',
        sub: (run) => `◉ ${scale(run, 20)} for medicine · it joins at Lv 1`,
        blocked: (run) => (run.coins < scale(run, 20) ? 'Not enough coins' : rosterFull(run) ? 'Your party is full' : null),
        run: (run) => {
          run.coins -= scale(run, 20);
          const c = createCreature(run.rng.pick(speciesWithElement(run.biomes[run.floor])).id, 1);
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
        sub: () => 'Gain an Evolution Stone · every creature loses 20% HP',
        run: (run) => {
          run.evoStones += 1;
          for (const c of allCreatures(run)) c.hp = Math.max(1, c.hp - Math.ceil(stats(c).hp * 0.2));
          return { text: 'You pry out an Evolution Stone ◆. A chill runs through your team.' };
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

export function rollEvent(run: Run): GameEvent {
  return run.rng.pick(EVENTS);
}

/** The cost of walking away (only Ambush has one). */
export function leaveEvent(run: Run, ev: GameEvent): string {
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
}

export function rollTreasure(run: Run): TreasureOffer {
  const items: import('./shop').ItemId[] = ['potion', 'manual', 'scroll', 'stone', 'restore', 'sigil'];
  const coins = scale(run, 30) + run.rng.int(0, 15);
  return { coins: Math.round(coins * (run.passive === 'explorer' ? 1.5 : 1)), item: run.rng.pick(items) };
}
