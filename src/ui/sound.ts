import type { Element } from '../data/types';

/**
 * Retro sound: every effect and music loop is synthesized with Web Audio, no files.
 * Audio starts on the first tap (browsers block it until then). Mute is remembered per device.
 */

import { buzz } from './haptics';

const MUTE_KEY = 'ccr-audio-muted';
let ctx: AudioContext | null = null;
let master: GainNode | null = null;
let sfxBus: GainNode | null = null;
let musicBus: GainNode | null = null;
let muted = readMuted();

function readMuted(): boolean {
  try {
    return globalThis.localStorage?.getItem(MUTE_KEY) === '1';
  } catch {
    return false;
  }
}

/** Create/resume the audio context. Call from a user gesture. */
export function unlockAudio() {
  try {
    if (!ctx) {
      const AC = (globalThis as unknown as { AudioContext?: typeof AudioContext; webkitAudioContext?: typeof AudioContext }).AudioContext
        ?? (globalThis as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
      if (!AC) return;
      ctx = new AC();
      master = ctx.createGain();
      master.gain.value = muted ? 0 : 0.8;
      master.connect(ctx.destination);
      sfxBus = ctx.createGain();
      sfxBus.gain.value = 0.55;
      sfxBus.connect(master);
      musicBus = ctx.createGain();
      musicBus.gain.value = 0.22;
      musicBus.connect(master);
      if (wantedTheme) startTheme(wantedTheme);
    }
    if (ctx.state === 'suspended') void ctx.resume();
  } catch {
    ctx = null;
  }
}

export function isMuted() {
  return muted;
}

export function setMuted(m: boolean) {
  muted = m;
  try {
    globalThis.localStorage?.setItem(MUTE_KEY, m ? '1' : '0');
  } catch {
    /* ignore */
  }
  if (ctx && master) master.gain.setTargetAtTime(m ? 0 : 0.8, ctx.currentTime, 0.05);
}

// ------------------------------------------------------------ primitives

type Wave = OscillatorType;

function tone(freq: number, dur: number, opts: { type?: Wave; vol?: number; slide?: number; delay?: number; bus?: GainNode | null; attack?: number } = {}) {
  if (!ctx || muted) return;
  const bus = opts.bus ?? sfxBus;
  if (!bus) return;
  const t = ctx.currentTime + (opts.delay ?? 0);
  const o = ctx.createOscillator();
  const g = ctx.createGain();
  o.type = opts.type ?? 'square';
  o.frequency.setValueAtTime(freq, t);
  if (opts.slide) o.frequency.exponentialRampToValueAtTime(Math.max(20, opts.slide), t + dur);
  const v = opts.vol ?? 0.3;
  g.gain.setValueAtTime(0.0001, t);
  g.gain.exponentialRampToValueAtTime(v, t + (opts.attack ?? 0.005));
  g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  o.connect(g).connect(bus);
  o.start(t);
  o.stop(t + dur + 0.02);
}

let noiseBuf: AudioBuffer | null = null;
function noise(dur: number, opts: { vol?: number; freq?: number; to?: number; type?: BiquadFilterType; delay?: number; bus?: GainNode | null; q?: number } = {}) {
  if (!ctx || muted) return;
  const bus = opts.bus ?? sfxBus;
  if (!bus) return;
  if (!noiseBuf) {
    noiseBuf = ctx.createBuffer(1, ctx.sampleRate, ctx.sampleRate);
    const d = noiseBuf.getChannelData(0);
    for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
  }
  const t = ctx.currentTime + (opts.delay ?? 0);
  const src = ctx.createBufferSource();
  src.buffer = noiseBuf;
  src.loop = true;
  const f = ctx.createBiquadFilter();
  f.type = opts.type ?? 'lowpass';
  f.Q.value = opts.q ?? 1;
  f.frequency.setValueAtTime(opts.freq ?? 2000, t);
  if (opts.to) f.frequency.exponentialRampToValueAtTime(opts.to, t + dur);
  const g = ctx.createGain();
  g.gain.setValueAtTime(opts.vol ?? 0.3, t);
  g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  src.connect(f).connect(g).connect(bus);
  src.start(t);
  src.stop(t + dur + 0.02);
}

const note = (semi: number, base = 440) => base * Math.pow(2, semi / 12);

// ------------------------------------------------------------ effects

export const sfx = {
  click() {
    tone(660, 0.05, { type: 'square', vol: 0.12 });
  },
  attack(el: Element) {
    switch (el) {
      case 'Fire':
        noise(0.35, { freq: 600, to: 2400, vol: 0.35, type: 'bandpass' });
        break;
      case 'Frost':
        for (let i = 0; i < 3; i++) tone(1800 + i * 300, 0.08, { type: 'triangle', vol: 0.15, delay: i * 0.07 });
        break;
      case 'Water':
        tone(300, 0.25, { type: 'sine', vol: 0.3, slide: 900 });
        noise(0.25, { freq: 1200, vol: 0.12 });
        break;
      case 'Nature':
        noise(0.3, { freq: 3000, to: 800, vol: 0.18, type: 'highpass' });
        break;
      case 'Earth':
        tone(90, 0.3, { type: 'sawtooth', vol: 0.3, slide: 50 });
        noise(0.3, { freq: 400, vol: 0.3 });
        break;
      case 'Storm':
        noise(0.4, { freq: 5000, to: 300, vol: 0.45, type: 'lowpass' });
        tone(120, 0.3, { type: 'sawtooth', vol: 0.25, slide: 40 });
        break;
      case 'Metal':
        tone(1400, 0.15, { type: 'square', vol: 0.18, slide: 2400 });
        noise(0.12, { freq: 6000, vol: 0.2, type: 'highpass' });
        break;
      case 'Toxic':
        for (let i = 0; i < 3; i++) tone(260 + i * 90, 0.1, { type: 'sine', vol: 0.22, slide: 500 + i * 100, delay: i * 0.08 });
        break;
      case 'Shadow':
        tone(180, 0.4, { type: 'sawtooth', vol: 0.22, slide: 60 });
        break;
      case 'Light':
        tone(1200, 0.35, { type: 'triangle', vol: 0.22, slide: 2400 });
        tone(1800, 0.3, { type: 'sine', vol: 0.12, delay: 0.05 });
        break;
      case 'Spirit':
        tone(500, 0.5, { type: 'sine', vol: 0.2, slide: 900, attack: 0.08 });
        tone(505, 0.5, { type: 'sine', vol: 0.15, slide: 880, attack: 0.08 });
        break;
      case 'Dragon':
        noise(0.25, { freq: 900, to: 300, vol: 0.4, type: 'bandpass' });
        tone(110, 0.35, { type: 'sawtooth', vol: 0.28, slide: 70 });
        break;
    }
  },
  /** The sound of an animation style (bite, wave, roar...). */
  style(kind: string) {
    switch (kind) {
      case 'bite':
        noise(0.06, { freq: 2500, vol: 0.4, type: 'bandpass', q: 3 });
        noise(0.08, { freq: 1800, vol: 0.45, type: 'bandpass', q: 3, delay: 0.12 });
        break;
      case 'slash':
        noise(0.16, { freq: 1200, to: 7000, vol: 0.3, type: 'bandpass', q: 2 });
        break;
      case 'whip':
        noise(0.12, { freq: 800, to: 6000, vol: 0.25, type: 'bandpass' });
        noise(0.04, { freq: 5000, vol: 0.4, type: 'highpass', delay: 0.18 });
        break;
      case 'bind':
        noise(0.35, { freq: 400, to: 1200, vol: 0.2, type: 'bandpass', q: 4 });
        break;
      case 'quake':
        tone(55, 0.6, { type: 'sawtooth', vol: 0.3, slide: 35 });
        noise(0.6, { freq: 220, vol: 0.45 });
        break;
      case 'geyser':
        noise(0.45, { freq: 300, to: 3000, vol: 0.35, type: 'bandpass' });
        break;
      case 'pillar':
        tone(880, 0.5, { type: 'triangle', vol: 0.18, slide: 1760 });
        tone(1320, 0.5, { type: 'sine', vol: 0.12 });
        break;
      case 'wave':
        noise(0.6, { freq: 300, to: 1500, vol: 0.35, type: 'lowpass' });
        break;
      case 'vortex':
        noise(0.5, { freq: 600, to: 2400, vol: 0.25, type: 'bandpass', q: 6 });
        break;
      case 'rain':
        for (let i = 0; i < 6; i++) noise(0.05, { freq: 3000 + i * 300, vol: 0.15, type: 'highpass', delay: i * 0.05 });
        break;
      case 'breath':
        noise(0.45, { freq: 900, to: 400, vol: 0.4, type: 'bandpass', q: 0.7 });
        break;
      case 'beam':
        tone(1600, 0.3, { type: 'sawtooth', vol: 0.1, slide: 800 });
        tone(800, 0.3, { type: 'square', vol: 0.08 });
        break;
      case 'gather':
        tone(300, 0.35, { type: 'sine', vol: 0.18, slide: 1200, attack: 0.1 });
        break;
      case 'roar':
        noise(0.55, { freq: 500, to: 150, vol: 0.5, type: 'bandpass', q: 1.5 });
        tone(90, 0.5, { type: 'sawtooth', vol: 0.25, slide: 60 });
        break;
      case 'zap':
        tone(2000, 0.12, { type: 'square', vol: 0.12, slide: 400 });
        noise(0.12, { freq: 6000, vol: 0.2, type: 'highpass' });
        break;
      case 'lob':
        tone(300, 0.35, { type: 'sine', vol: 0.18, slide: 120 });
        break;
      case 'volley':
        for (let i = 0; i < 3; i++) noise(0.05, { freq: 4000, vol: 0.18, type: 'highpass', delay: i * 0.06 });
        break;
      case 'cloud':
        noise(0.5, { freq: 1500, to: 500, vol: 0.18, type: 'lowpass' });
        break;
      case 'curse':
        tone(220, 0.5, { type: 'sine', vol: 0.18, slide: 110 });
        tone(233, 0.5, { type: 'sine', vol: 0.14, slide: 116 });
        break;
      case 'burst':
        noise(0.4, { freq: 3000, to: 120, vol: 0.5 });
        break;
      case 'leap':
        tone(300, 0.25, { type: 'square', vol: 0.12, slide: 700 });
        break;
      case 'dash':
        noise(0.15, { freq: 400, to: 2500, vol: 0.25, type: 'bandpass' });
        break;
      case 'shield':
        [0, 7, 12].forEach((s, i) => tone(note(s, 880), 0.25, { type: 'triangle', vol: 0.14, delay: i * 0.05 }));
        break;
      case 'fade':
        tone(700, 0.35, { type: 'sine', vol: 0.15, slide: 200 });
        break;
      case 'mend':
        [0, 4, 7, 12].forEach((s, i) => tone(note(s, 784), 0.2, { type: 'sine', vol: 0.14, delay: i * 0.07 }));
        break;
    }
  },
  hit(mult = 1) {
    if (mult > 1.01) {
      noise(0.25, { freq: 3000, to: 200, vol: 0.55 });
      tone(160, 0.22, { type: 'square', vol: 0.35, slide: 50 });
    } else if (mult < 0.99) {
      noise(0.1, { freq: 900, vol: 0.2 });
    } else {
      noise(0.15, { freq: 1800, to: 300, vol: 0.4 });
      tone(200, 0.12, { type: 'square', vol: 0.2, slide: 80 });
    }
  },
  dot() {
    noise(0.12, { freq: 700, vol: 0.18 });
  },
  miss() {
    tone(500, 0.18, { type: 'triangle', vol: 0.18, slide: 250 });
  },
  faint() {
    tone(440, 0.6, { type: 'square', vol: 0.22, slide: 60 });
  },
  heal() {
    [0, 4, 7, 12].forEach((s, i) => tone(note(s, 660), 0.12, { type: 'triangle', vol: 0.18, delay: i * 0.06 }));
  },
  statUp() {
    tone(500, 0.2, { type: 'square', vol: 0.14, slide: 1100 });
  },
  statDown() {
    tone(900, 0.2, { type: 'square', vol: 0.14, slide: 350 });
  },
  levelUp() {
    [0, 4, 7, 12, 16].forEach((s, i) => tone(note(s, 523), 0.12, { type: 'square', vol: 0.14, delay: i * 0.07 }));
  },
  coin() {
    tone(988, 0.07, { type: 'square', vol: 0.14 });
    tone(1319, 0.2, { type: 'square', vol: 0.14, delay: 0.07 });
  },
  catch() {
    [0, 7, 12, 7, 12, 19].forEach((s, i) => tone(note(s, 523), 0.1, { type: 'triangle', vol: 0.2, delay: i * 0.08 }));
  },
  throwCrystal() {
    noise(0.4, { freq: 600, to: 2400, vol: 0.18, type: 'bandpass', q: 3 });
    tone(400, 0.4, { type: 'triangle', vol: 0.12, slide: 900 });
  },
  catchDraw() {
    tone(1200, 0.5, { type: 'sine', vol: 0.16, slide: 300 });
    tone(1800, 0.5, { type: 'triangle', vol: 0.08, slide: 450 });
  },
  crystalLand() {
    tone(1500, 0.08, { type: 'square', vol: 0.12 });
    tone(1100, 0.1, { type: 'square', vol: 0.1, delay: 0.09 });
  },
  wobble(i: number) {
    tone(320 + i * 60, 0.12, { type: 'triangle', vol: 0.22, slide: 220 + i * 60 });
    noise(0.06, { freq: 2500, vol: 0.12, type: 'bandpass' });
  },
  victory() {
    const seq = [0, 4, 7, 12, 7, 12, 16];
    seq.forEach((s, i) => tone(note(s, 523), i === seq.length - 1 ? 0.5 : 0.12, { type: 'square', vol: 0.16, delay: i * 0.11 }));
  },
  defeat() {
    [7, 3, 0, -5].forEach((s, i) => tone(note(s, 330), 0.3, { type: 'triangle', vol: 0.22, delay: i * 0.22 }));
  },
  /** A creature bursts out of its hexagon. */
  release() {
    tone(330, 0.25, { type: 'triangle', vol: 0.16, slide: 990 });
    noise(0.25, { freq: 3000, to: 900, vol: 0.12, type: 'bandpass', q: 2 });
    tone(1320, 0.18, { type: 'sine', vol: 0.1, delay: 0.18 });
  },
  /** A creature is called back into its hexagon. */
  recall() {
    tone(990, 0.22, { type: 'triangle', vol: 0.14, slide: 330 });
    noise(0.18, { freq: 1500, to: 400, vol: 0.1, type: 'bandpass', q: 2 });
  },
  rustle() {
    noise(0.35, { freq: 3500, to: 1800, vol: 0.2, type: 'highpass' });
    noise(0.2, { freq: 2500, vol: 0.12, type: 'bandpass', q: 1 });
  },
  rocks() {
    noise(0.3, { freq: 600, to: 150, vol: 0.4 });
    tone(110, 0.2, { type: 'square', vol: 0.2, slide: 60 });
  },
  splash() {
    noise(0.45, { freq: 2200, to: 600, vol: 0.3, type: 'bandpass', q: 1.5 });
    tone(500, 0.2, { type: 'sine', vol: 0.1, slide: 1200 });
  },
  bossRoar() {
    noise(0.9, { freq: 300, to: 80, vol: 0.6 });
    tone(70, 0.9, { type: 'sawtooth', vol: 0.35, slide: 40 });
  },
  evolveStart() {
    tone(220, 2.2, { type: 'triangle', vol: 0.18, slide: 880, attack: 0.3 });
  },
  evolveTick(i: number) {
    tone(note(i, 440), 0.06, { type: 'square', vol: 0.08 });
  },
  evolveDone() {
    [0, 4, 7, 12, 16, 19, 24].forEach((s, i) => tone(note(s, 523), 0.18, { type: 'square', vol: 0.14, delay: i * 0.06 }));
    noise(0.6, { freq: 6000, to: 800, vol: 0.2, type: 'highpass' });
  },
};

// ------------------------------------------------------------ music

export type Theme = 'title' | 'map' | 'battle' | 'boss';

interface ThemeDef {
  bpm: number;
  root: number; // Hz
  scale: number[];
  chords: number[]; // chord roots per bar, in semitones
  lead: Wave;
  bass: Wave;
  drums: boolean;
  seed: number;
}

const MINOR = [0, 2, 3, 5, 7, 8, 10];
const MAJOR = [0, 2, 4, 5, 7, 9, 11];
const PHRYGIAN = [0, 1, 3, 5, 7, 8, 10];

const THEMES: Record<Theme, ThemeDef> = {
  title: { bpm: 88, root: 220, scale: MINOR, chords: [0, 8, 3, 10], lead: 'triangle', bass: 'triangle', drums: false, seed: 11 },
  map: { bpm: 104, root: 262, scale: MAJOR, chords: [0, 5, 9, 7], lead: 'triangle', bass: 'square', drums: false, seed: 23 },
  battle: { bpm: 144, root: 220, scale: MINOR, chords: [0, 8, 10, 7], lead: 'square', bass: 'square', drums: true, seed: 37 },
  boss: { bpm: 156, root: 196, scale: PHRYGIAN, chords: [0, 1, 0, 10], lead: 'sawtooth', bass: 'sawtooth', drums: true, seed: 53 },
};

/** Builds a deterministic 4-bar melody of eighth notes for a theme (null = rest). */
function melody(def: ThemeDef): (number | null)[] {
  let s = def.seed;
  const rnd = () => ((s = (s * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff);
  const out: (number | null)[] = [];
  let deg = 4;
  for (let bar = 0; bar < 4; bar++) {
    for (let i = 0; i < 8; i++) {
      if (i % 2 === 1 && rnd() < 0.3) {
        out.push(null);
        continue;
      }
      deg = Math.max(0, Math.min(11, deg + Math.round((rnd() - 0.5) * 4)));
      if (i === 0) deg = [0, 2, 4][Math.floor(rnd() * 3)] + 4; // land near a chord tone on the downbeat
      const oct = Math.floor(deg / 7);
      out.push(def.scale[deg % 7] + 12 * oct);
    }
  }
  return out;
}

let wantedTheme: Theme | null = null;
let playing: Theme | null = null;
let timer: ReturnType<typeof setInterval> | null = null;

export function playMusic(theme: Theme | null) {
  wantedTheme = theme;
  if (theme === playing) return;
  stopTheme();
  if (theme && ctx) startTheme(theme);
}

function stopTheme() {
  if (timer) clearInterval(timer);
  timer = null;
  playing = null;
}

function startTheme(theme: Theme) {
  if (!ctx || !musicBus) return;
  stopTheme();
  playing = theme;
  const def = THEMES[theme];
  const mel = melody(def);
  const step = 60 / def.bpm / 2; // eighth note
  let i = 0;
  let next = ctx.currentTime + 0.1;
  const schedule = () => {
    if (!ctx || playing !== theme) return;
    while (next < ctx.currentTime + 0.25) {
      const delay = Math.max(0, next - ctx.currentTime);
      const bar = Math.floor(i / 8) % 4;
      const beat = i % 8;
      const chord = def.chords[bar];
      const m = mel[i % mel.length];
      if (m !== null) tone(note(m, def.root * 2), step * 0.9, { type: def.lead, vol: def.lead === 'sawtooth' ? 0.1 : 0.14, delay, bus: musicBus });
      // bass: root on beats, fifth on offbeats for driving themes
      if (def.drums || beat % 2 === 0) {
        const b = beat % 4 === 2 && def.drums ? chord + 7 : chord;
        tone(note(b, def.root / 2), step * 0.85, { type: def.bass, vol: 0.18, delay, bus: musicBus });
      }
      if (!def.drums && beat === 0) {
        // soft pad: chord third and fifth
        tone(note(chord + (def.scale === MAJOR ? 4 : 3), def.root), step * 7, { type: 'sine', vol: 0.06, delay, bus: musicBus, attack: 0.2 });
        tone(note(chord + 7, def.root), step * 7, { type: 'sine', vol: 0.05, delay, bus: musicBus, attack: 0.2 });
      }
      if (def.drums) {
        if (beat % 4 === 0) tone(110, 0.12, { type: 'sine', vol: 0.5, slide: 40, delay, bus: musicBus });
        if (beat % 4 === 2) noise(0.1, { freq: 1800, vol: 0.25, delay, bus: musicBus });
        noise(0.03, { freq: 8000, vol: 0.06, type: 'highpass', delay, bus: musicBus });
      }
      i++;
      next += step;
    }
  };
  schedule();
  timer = setInterval(schedule, 60);
}

// Matching vibrations for the moments that should be felt (vibration has its own on/off).
const HAPTICS: Partial<Record<keyof typeof sfx, (...args: never[]) => number | number[]>> = {
  hit: (mult: number = 1) => (mult > 1.01 ? [35, 30, 45] : mult < 0.99 ? 8 : 18),
  faint: () => 70,
  crystalLand: () => 15,
  wobble: () => 12,
  catch: () => [30, 50, 30, 50, 60],
  victory: () => [20, 60, 40],
  defeat: () => [120, 80, 200],
  bossRoar: () => [80, 40, 160],
  levelUp: () => [15, 40, 15],
  evolveDone: () => [40, 40, 40, 40, 120],
};
for (const [key, pattern] of Object.entries(HAPTICS)) {
  const k = key as keyof typeof sfx;
  const play = sfx[k] as (...args: unknown[]) => void;
  (sfx as Record<string, unknown>)[k] = (...args: unknown[]) => {
    play(...args);
    buzz((pattern as (...a: unknown[]) => number | number[])(...args));
  };
}

// Browsers only allow audio after a gesture: unlock on the first tap anywhere.
if (typeof window !== 'undefined') {
  const unlock = () => unlockAudio();
  window.addEventListener('pointerdown', unlock);
  window.addEventListener('keydown', unlock);
  // Pause music when the page is hidden (phone locked, app switched).
  document.addEventListener('visibilitychange', () => {
    if (!ctx) return;
    if (document.hidden) void ctx.suspend();
    else if (!muted) void ctx.resume();
  });
}
