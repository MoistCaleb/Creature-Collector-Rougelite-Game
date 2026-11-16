import { faintVoice, voiceFor } from '../data/cries';
import { SPECIES_BY_ID } from '../data/species';
import { playVoice } from './sound';
import { buzz } from './haptics';

/** Play a creature's cry. `faint` plays the weak, fading version. */
export function cry(speciesId: string, stage: number, faint = false) {
  const sp = SPECIES_BY_ID[speciesId];
  if (!sp) return;
  const v = voiceFor(speciesId, sp.types, stage);
  playVoice(faint ? faintVoice(v) : v);
  if (!faint) buzz(12);
}
