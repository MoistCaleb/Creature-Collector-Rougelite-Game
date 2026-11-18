import { attackId, elementPool, MOVES, teamMoveId } from '../data/moves';
import { ELEMENTS } from '../data/types';
import { SPECIES, SPECIES_BY_ID } from '../data/species';
import { TRAINER_CLASSES, TRAINER_NAMES } from '../data/trainers';
import { createCreature, learnset, MAX_MOVES, teamElement, type Creature } from './creature';
import { hasSeenForm } from './dex';
import { Rng } from './rng';
import type { Meta } from './run';

/**
 * The Battle Arena: raw battling at a fixed level. Build a team from creatures you've caught (any
 * form you've seen, moves of your choice), everyone at Lv 50 with no stars or items, then climb a
 * ladder of computer opponents. Also the "fair team" rules multiplayer duels use.
 */
export const ARENA_LEVEL = 50;
export const ARENA_ROUNDS = 5;
export const ARENA_TEAM = 4;

export interface ArenaPick {
  speciesId: string;
  stage: number;
  moves: string[];
  /** Bring it in its shiny colours (only for species you've caught shiny). */
  shiny?: boolean;
}

/** Have you caught (or claimed) this species shiny? Then it can be brought shiny. */
export function ownsShiny(meta: Meta, speciesId: string): boolean {
  return (meta.shinyOwned ?? []).includes(speciesId);
}

/** Species you can bring: everything you've caught, plus your starters. */
export function arenaRoster(meta: Meta): string[] {
  const have = new Set([...meta.dex.caught, ...meta.unlockedStarters]);
  return SPECIES.filter((s) => have.has(s.id)).map((s) => s.id);
}

/** Forms of a species you can bring: the base form, and any evolution you've seen. */
export function arenaForms(meta: Meta, speciesId: string): number[] {
  return [0, 1, 2].filter((st) => st === 0 || hasSeenForm(meta.dex, speciesId, st));
}

/**
 * Moves this form can know at Lv 50: everything in its learnset up to Lv 50, with line attacks
 * shifted up a rank per evolution (as they are when a creature evolves).
 */
export function arenaMovePool(speciesId: string, stage: number): string[] {
  const out: string[] = [];
  for (const e of learnset(SPECIES_BY_ID[speciesId])) {
    if (e.level > ARENA_LEVEL) continue;
    const d = MOVES[e.id];
    const id = d.kind === 'attack' && d.rank >= 0 ? attackId(d.element, Math.min(3, d.rank + stage)) : e.id;
    if (!out.includes(id)) out.push(id);
  }
  // Every line gets its team move by Lv 26.
  const team = teamMoveId(teamElement(SPECIES_BY_ID[speciesId]));
  if (!out.includes(team)) out.push(team);
  // Evolved forms keep the lower ranks they grew out of, too.
  for (const e of learnset(SPECIES_BY_ID[speciesId])) {
    const d = MOVES[e.id];
    if (e.level > ARENA_LEVEL || d.kind !== 'attack' || d.rank < 0) continue;
    for (let r = d.rank; r < Math.min(3, d.rank + stage); r++) {
      const id = attackId(d.element, r);
      if (!out.includes(id)) out.push(id);
    }
  }
  return out;
}

/** Moves any Hexling could pick up from a land during a run (an element's shared moves, team moves aside). */
const LAND_LEARNABLE = new Set(ELEMENTS.flatMap((el) => elementPool(el).filter((id) => !MOVES[id].team)));
export const landLearnable = (id: string) => LAND_LEARNABLE.has(id);

/**
 * Moves a species can only bring through your saved loadouts: ones it picked up on a run (from the
 * land) that its own learnset doesn't have. They're never offered otherwise.
 */
export function loadoutOnlyMoves(meta: Meta, speciesId: string, stage: number): string[] {
  const pool = arenaMovePool(speciesId, stage);
  const out: string[] = [];
  for (const l of loadoutsFor(meta, speciesId)) for (const id of l.moves) if (landLearnable(id) && !pool.includes(id) && !out.includes(id)) out.push(id);
  return out;
}

/** Everything this form can bring in the team builder: its learnset, plus moves from your saved loadouts. */
export const legalArenaMoves = (meta: Meta, speciesId: string, stage: number): string[] => [
  ...arenaMovePool(speciesId, stage),
  ...loadoutOnlyMoves(meta, speciesId, stage),
];

/** The moves this form would naturally know at Lv 50 (a sensible default pick). */
export function defaultArenaMoves(speciesId: string, stage: number): string[] {
  const pool = arenaMovePool(speciesId, stage);
  const natural = createCreature(speciesId, ARENA_LEVEL, stage).moves.map((m) => m.id).filter((id) => pool.includes(id));
  return natural.slice(0, MAX_MOVES);
}

/** Build the battle-ready creature for a pick: Lv 50 (or `level`), no stars, no item, full HP and uses. */
export function makeArenaCreature(p: ArenaPick, opts: { level?: number } = {}): Creature {
  // (An options object, so passing this straight to .map() can't turn the index into a level.)
  const level = typeof opts === 'object' && opts.level ? opts.level : ARENA_LEVEL;
  const c = createCreature(p.speciesId, level, p.stage);
  const pool = arenaMovePool(p.speciesId, p.stage);
  // Picks are checked against your loadouts when built (validArenaTeam); land moves pass here so an
  // online opponent's loadout moves come through too.
  const moves = p.moves.filter((id) => pool.includes(id) || landLearnable(id)).slice(0, MAX_MOVES);
  c.moves = (moves.length ? moves : defaultArenaMoves(p.speciesId, p.stage)).map((id) => ({ id, tier: 1 }));
  c.pendingMoves = [];
  c.learnIndex = learnset(SPECIES_BY_ID[p.speciesId]).length;
  if (p.shiny) c.shiny = true;
  return c;
}

/** Keep only picks that are still valid for this player (caught species, seen forms, legal moves). */
export function validArenaTeam(meta: Meta, picks: ArenaPick[] | undefined): ArenaPick[] {
  const roster = arenaRoster(meta);
  return (picks ?? [])
    .filter((p) => p && roster.includes(p.speciesId) && arenaForms(meta, p.speciesId).includes(p.stage))
    .map((p) => {
      const legal = legalArenaMoves(meta, p.speciesId, p.stage);
      const moves = (p.moves ?? []).filter((id) => legal.includes(id)).slice(0, MAX_MOVES);
      // No legal moves left: fall back to the ones it would naturally know.
      const shiny = p.shiny && ownsShiny(meta, p.speciesId) ? true : undefined;
      return { speciesId: p.speciesId, stage: p.stage, moves: moves.length ? moves : defaultArenaMoves(p.speciesId, p.stage), ...(shiny ? { shiny } : {}) };
    })
    .slice(0, ARENA_TEAM);
}

export interface ArenaOpponent {
  name: string;
  team: Creature[];
  /** Chance it picks a random move instead of its best. */
  randomness: number;
}

/**
 * Ladder opponents grow tougher each round: more creatures, more evolved, upgraded moves and
 * sharper play. Seeded so a ladder is fixed once started.
 */
export function arenaOpponent(round: number, seed: number): ArenaOpponent {
  const rng = new Rng(seed + round * 7919);
  const count = round === 0 ? 3 : 4;
  const stage = round < 2 ? 1 : 2;
  const team: Creature[] = [];
  const pool = [...SPECIES];
  for (let i = 0; i < count; i++) {
    const sp = pool.splice(rng.int(0, pool.length - 1), 1)[0];
    const c = createCreature(sp.id, ARENA_LEVEL, stage);
    if (round >= 3) for (const m of c.moves) m.tier = round >= 4 ? 3 : 2;
    team.push(c);
  }
  const title = round === ARENA_ROUNDS - 1 ? 'Arena Champion' : rng.pick(TRAINER_CLASSES);
  return { name: `${title} ${rng.pick(TRAINER_NAMES)}`, team, randomness: [0.35, 0.25, 0.15, 0.05, 0][round] ?? 0 };
}

// ---------------------------------------------------------------- saved teams

export const MAX_SAVED_TEAMS = 6;

export interface SavedTeam {
  name: string;
  picks: ArenaPick[];
}

/** All saved teams (moving an old single Arena team into the list the first time). */
export function savedTeams(meta: Meta): SavedTeam[] {
  if (!meta.arenaTeams?.length) {
    meta.arenaTeams = [{ name: 'Team 1', picks: meta.arenaTeam ?? [] }];
    meta.arenaTeamIndex = 0;
  }
  return meta.arenaTeams;
}

export function activeTeamIndex(meta: Meta): number {
  const n = savedTeams(meta).length;
  return Math.max(0, Math.min(n - 1, meta.arenaTeamIndex ?? 0));
}

/** The team the Arena ladder uses (still-valid picks only). */
export function activeTeam(meta: Meta): ArenaPick[] {
  return validArenaTeam(meta, savedTeams(meta)[activeTeamIndex(meta)].picks);
}

/** A name that isn't taken yet: "Team 2", "Team 3"... */
export function nextTeamName(meta: Meta): string {
  const names = new Set(savedTeams(meta).map((t) => t.name));
  for (let i = 1; ; i++) if (!names.has(`Team ${i}`)) return `Team ${i}`;
}

// ---------------------------------------------------------------- saved loadouts

export const MAX_LOADOUTS = 40;

/** A creature saved at the end of a run: its form and moves, reusable in the team builder. */
export interface SavedLoadout {
  id: string;
  speciesId: string;
  stage: number;
  moves: string[];
  /** Where it came from, e.g. "Win · Wildlands". */
  label: string;
  /** It was shiny. */
  shiny?: boolean;
}

/** Save a run creature's loadout (newest first; the oldest drop off past the limit). */
export function saveLoadout(meta: Meta, c: Creature, label: string): SavedLoadout {
  const l: SavedLoadout = {
    id: `${Date.now().toString(36)}${Math.floor(Math.random() * 1e6).toString(36)}`,
    speciesId: c.speciesId,
    stage: c.stage,
    moves: c.moves.map((m) => m.id),
    label,
    ...(c.shiny ? { shiny: true } : {}),
  };
  meta.loadouts = [l, ...(meta.loadouts ?? [])].slice(0, MAX_LOADOUTS);
  return l;
}

/** Is this exact loadout (species, form, moves) already saved? */
export function hasLoadout(meta: Meta, c: Creature): boolean {
  const key = c.moves.map((m) => m.id).join(',');
  return (meta.loadouts ?? []).some((l) => l.speciesId === c.speciesId && l.stage === c.stage && l.moves.join(',') === key);
}

export function loadoutsFor(meta: Meta, speciesId: string): SavedLoadout[] {
  return (meta.loadouts ?? []).filter((l) => l.speciesId === speciesId);
}

/**
 * A loadout as an Arena pick: its form (or the closest one you've seen), and its moves that are
 * legal there (topped up with defaults if none are).
 */
export function applyLoadout(meta: Meta, l: SavedLoadout): ArenaPick {
  const forms = arenaForms(meta, l.speciesId);
  const stage = forms.includes(l.stage) ? l.stage : Math.max(...forms.filter((f) => f <= l.stage), 0);
  const pool = legalArenaMoves(meta, l.speciesId, stage);
  const moves = l.moves.filter((id) => pool.includes(id)).slice(0, MAX_MOVES);
  const shiny = l.shiny && ownsShiny(meta, l.speciesId);
  return { speciesId: l.speciesId, stage, moves: moves.length ? moves : defaultArenaMoves(l.speciesId, stage), ...(shiny ? { shiny: true } : {}) };
}
