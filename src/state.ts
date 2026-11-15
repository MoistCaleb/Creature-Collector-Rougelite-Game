import type { Creature } from './logic/creature';
import { seeCreature, seeForm, seeMove } from './logic/dex';
import { loadMeta, saveMeta, saveRun, type Meta, type Run } from './logic/run';

/** Global game state shared between scenes. */
export const state: { meta: Meta; run: Run | null } = {
  meta: loadMeta(),
  run: null,
};

/** Dex helpers: record and persist only when something is new. */
export const dex = {
  creature(c: Creature, includeMoves = false) {
    if (seeCreature(state.meta.dex, c, includeMoves)) saveMeta(state.meta);
  },
  form(speciesId: string, stage: number) {
    if (seeForm(state.meta.dex, speciesId, stage)) saveMeta(state.meta);
  },
  move(id: string) {
    if (seeMove(state.meta.dex, id)) saveMeta(state.meta);
  },
};

/** Save the run in progress (call after anything changes it). */
export function persist() {
  if (state.run) saveRun(state.run);
}
