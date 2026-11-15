import { loadMeta, type Meta, type Run } from './logic/run';

/** Global game state shared between scenes. */
export const state: { meta: Meta; run: Run | null } = {
  meta: loadMeta(),
  run: null,
};
