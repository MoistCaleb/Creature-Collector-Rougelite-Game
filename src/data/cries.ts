import { hashString, Rng } from '../logic/rng';
import type { Element } from './types';

/**
 * Every species has its own cry, generated from its id like its sprite. The element sets the
 * flavor (Water warbles, Storm crackles, Earth growls...), the seed picks pitch, rhythm and melody,
 * and evolved forms sound like deeper, longer versions of the same call.
 */

export interface Syllable {
  /** Pitch at the start, middle and end (Hz). */
  f: [number, number, number];
  dur: number;
  /** Silence before the next syllable. */
  gap: number;
}

export interface Voice {
  syllables: Syllable[];
  wave: OscillatorType;
  /** Tone-shaping filter. */
  filter: { type: BiquadFilterType; freq: number; q: number };
  vibrato: { rate: number; depth: number } | null;
  /** Breath / crackle / growl layered on top. */
  noise: { type: BiquadFilterType; freq: number; vol: number } | null;
  /** A second voice a fifth above (bright, choral). */
  harmony: boolean;
  /** An octave below, for big final forms. */
  sub: boolean;
  vol: number;
}

interface Flavor {
  wave: OscillatorType;
  pitch: number;
  filter: Voice['filter'];
  vibrato?: Voice['vibrato'];
  noise?: Voice['noise'];
  harmony?: boolean;
}

const FLAVOR: Record<Element, Flavor> = {
  Fire: { wave: 'sawtooth', pitch: 1, filter: { type: 'lowpass', freq: 2400, q: 2 }, noise: { type: 'highpass', freq: 4200, vol: 0.05 } },
  Water: { wave: 'sine', pitch: 1, filter: { type: 'lowpass', freq: 3000, q: 1 }, vibrato: { rate: 10, depth: 0.07 } },
  Nature: { wave: 'triangle', pitch: 1.15, filter: { type: 'lowpass', freq: 4000, q: 1 } },
  Earth: { wave: 'square', pitch: 0.6, filter: { type: 'lowpass', freq: 900, q: 3 }, noise: { type: 'lowpass', freq: 500, vol: 0.12 } },
  Storm: { wave: 'square', pitch: 1.1, filter: { type: 'bandpass', freq: 1800, q: 1.5 }, noise: { type: 'bandpass', freq: 3200, vol: 0.09 } },
  Frost: { wave: 'triangle', pitch: 1.35, filter: { type: 'highpass', freq: 500, q: 1 }, vibrato: { rate: 6, depth: 0.025 } },
  Metal: { wave: 'square', pitch: 0.9, filter: { type: 'bandpass', freq: 1400, q: 9 } },
  Toxic: { wave: 'sawtooth', pitch: 0.85, filter: { type: 'lowpass', freq: 1600, q: 6 }, vibrato: { rate: 4, depth: 0.1 } },
  Shadow: { wave: 'sawtooth', pitch: 0.7, filter: { type: 'lowpass', freq: 1100, q: 4 }, noise: { type: 'lowpass', freq: 800, vol: 0.06 } },
  Light: { wave: 'sine', pitch: 1.45, filter: { type: 'highpass', freq: 300, q: 1 }, harmony: true },
  Spirit: { wave: 'sine', pitch: 1.05, filter: { type: 'lowpass', freq: 2500, q: 1 }, vibrato: { rate: 5.5, depth: 0.09 }, harmony: true },
  Dragon: { wave: 'sawtooth', pitch: 0.62, filter: { type: 'lowpass', freq: 1500, q: 3 }, noise: { type: 'lowpass', freq: 700, vol: 0.1 } },
};

/** Shapes a syllable's pitch can take, as multipliers of its base pitch. */
const CONTOURS: [number, number, number][] = [
  [1, 1.35, 1.6], // rising chirp
  [1.5, 1.2, 0.8], // falling call
  [1, 1.5, 0.9], // up then down
  [1.3, 0.85, 1.25], // down then up
  [1, 1.05, 1], // steady
  [0.9, 1.25, 1.25], // swoop up and hold
];

/** The voice of one form. `stage` 0..2; evolved forms are deeper and longer. */
export function voiceFor(speciesId: string, types: readonly Element[], stage: number): Voice {
  const rng = new Rng(hashString(`cry:${speciesId}`));
  const main = FLAVOR[types[0]];
  const second = FLAVOR[types[1] ?? types[0]];
  const deeper = [1, 0.8, 0.64][stage] ?? 0.64;
  const longer = [1, 1.18, 1.38][stage] ?? 1.38;
  const base = rng.int(340, 760) * main.pitch * deeper;
  const count = rng.weighted({ 1: 3, 2: 4, 3: 2 } as Record<string, number>);
  const syllables: Syllable[] = [];
  for (let i = 0; i < Number(count); i++) {
    const c = CONTOURS[rng.int(0, CONTOURS.length - 1)];
    // Later syllables drift in pitch a little, like a phrase.
    const drift = 1 + (rng.next() - 0.5) * 0.3;
    syllables.push({
      f: c.map((m) => Math.round(base * m * drift)) as [number, number, number],
      dur: (0.1 + rng.next() * 0.18) * longer,
      gap: 0.03 + rng.next() * 0.06,
    });
  }
  return {
    syllables,
    wave: main.wave,
    filter: main.filter,
    vibrato: main.vibrato ?? second.vibrato ?? null,
    noise: main.noise ?? second.noise ?? null,
    harmony: !!(main.harmony || second.harmony),
    sub: stage === 2,
    vol: 0.2,
  };
}

/** The same voice, weak and fading: slower, lower, sliding down at the end. */
export function faintVoice(v: Voice): Voice {
  return {
    ...v,
    syllables: v.syllables.map((s, i, all) => ({
      f: [s.f[0] * 0.8, s.f[1] * 0.72, s.f[2] * (i === all.length - 1 ? 0.4 : 0.65)] as [number, number, number],
      dur: s.dur * 1.6,
      gap: s.gap * 1.5,
    })),
    vol: v.vol * 0.8,
  };
}

/** Total length in seconds. */
export const voiceLength = (v: Voice) => v.syllables.reduce((t, s) => t + s.dur + s.gap, 0);
