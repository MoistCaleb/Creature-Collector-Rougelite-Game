import type { Element } from '../data/types';
import type { Voice } from '../data/cries';

/**
 * Retro sound: every effect and music loop is synthesized with Web Audio, no files.
 * Audio starts on the first tap (browsers block it until then). Mute is remembered per device.
 */

import { prefs } from './prefs';

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
      sfxBus.gain.value = SFX_GAIN * (prefs.sfxVol / 10);
      sfxBus.connect(master);
      musicBus = ctx.createGain();
      musicBus.gain.value = MUSIC_GAIN * (prefs.musicVol / 10);
      musicBus.connect(master);
      if (wantedTheme) startTheme(wantedTheme);
    }
    if (ctx.state === 'suspended') void ctx.resume();
  } catch {
    ctx = null;
  }
}

const SFX_GAIN = 0.55;
const MUSIC_GAIN = 0.22;

/** Apply the music / sound-effect volumes from prefs (0-10). */
export function applyVolumes() {
  if (!ctx) return;
  sfxBus?.gain.setTargetAtTime(SFX_GAIN * (prefs.sfxVol / 10), ctx.currentTime, 0.05);
  musicBus?.gain.setTargetAtTime(MUSIC_GAIN * (prefs.musicVol / 10), ctx.currentTime, 0.05);
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

/** Sing a creature's voice (see data/cries.ts). */
export function playVoice(v: Voice) {
  if (!ctx || muted || !sfxBus) return;
  let t = ctx.currentTime + 0.02;
  const filter = ctx.createBiquadFilter();
  filter.type = v.filter.type;
  filter.frequency.value = v.filter.freq;
  filter.Q.value = v.filter.q;
  const out = ctx.createGain();
  out.gain.value = v.vol;
  filter.connect(out).connect(sfxBus);
  const end = t + v.syllables.reduce((n, s) => n + s.dur + s.gap, 0) + 0.1;
  for (const syl of v.syllables) {
    const layers: [number, number][] = [[1, 1]];
    if (v.harmony) layers.push([1.5, 0.35]);
    if (v.sub) layers.push([0.5, 0.45]);
    for (const [mult, gain] of layers) {
      const o = ctx.createOscillator();
      o.type = v.wave;
      const [a, b, c] = syl.f.map((f) => Math.max(30, f * mult));
      o.frequency.setValueAtTime(a, t);
      o.frequency.linearRampToValueAtTime(b, t + syl.dur * 0.45);
      o.frequency.linearRampToValueAtTime(c, t + syl.dur);
      if (v.vibrato) {
        const lfo = ctx.createOscillator();
        const depth = ctx.createGain();
        lfo.frequency.value = v.vibrato.rate;
        depth.gain.value = b * v.vibrato.depth;
        lfo.connect(depth).connect(o.frequency);
        lfo.start(t);
        lfo.stop(t + syl.dur + 0.02);
      }
      const g = ctx.createGain();
      g.gain.setValueAtTime(0.0001, t);
      g.gain.exponentialRampToValueAtTime(gain, t + Math.min(0.03, syl.dur * 0.25));
      g.gain.setValueAtTime(gain * 0.8, t + syl.dur * 0.7);
      g.gain.exponentialRampToValueAtTime(0.0001, t + syl.dur);
      o.connect(g).connect(filter);
      o.start(t);
      o.stop(t + syl.dur + 0.02);
    }
    if (v.noise) noise(syl.dur, { type: v.noise.type, freq: v.noise.freq, vol: v.noise.vol, delay: t - ctx.currentTime });
    t += syl.dur + syl.gap;
  }
  // Let the shared filter go once the cry is over.
  setTimeout(() => out.disconnect(), (end - ctx.currentTime) * 1000 + 200);
}

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
  /** The map token's hop: a springy boing up, then a soft landing tap. */
  hop() {
    tone(260, 0.16, { type: 'triangle', vol: 0.2, slide: 620 });
  },
  land() {
    tone(180, 0.06, { type: 'triangle', vol: 0.18, slide: 120 });
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
  /** The crowd roars: 1 a big hit, 2 a knockout, 3 the winning blow. */
  crowd(level: 1 | 2 | 3 = 1) {
    const n = 3 + level * 3;
    for (let i = 0; i < n; i++) {
      // Many voices: overlapping bands of noise, swelling then fading.
      noise(0.5 + level * 0.35 + Math.random() * 0.3, { vol: 0.05 + level * 0.02, freq: 500 + Math.random() * 900, type: 'bandpass', q: 0.8, delay: Math.random() * 0.25 * level });
    }
    // A few whoops on the bigger moments.
    if (level >= 2)
      for (let i = 0; i < level * 2; i++) {
        const f = 500 + Math.random() * 300;
        tone(f, 0.25, { type: 'triangle', vol: 0.04, slide: f * 1.6, delay: 0.1 + Math.random() * 0.5 });
      }
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
  stone() {
    // A bright, ringing chime that climbs.
    [0, 7, 12, 16, 19, 24].forEach((s, i) => tone(note(s, 659), 0.22, { type: 'triangle', vol: 0.16, delay: i * 0.07 }));
    tone(note(24, 659), 0.9, { type: 'sine', vol: 0.1, delay: 0.42 });
    noise(0.5, { freq: 7000, to: 2500, vol: 0.08, type: 'highpass' });
  },
  /** A shiny Hexling appears: a quick glittering run up high. */
  shiny() {
    [0, 4, 7, 11, 14, 19].forEach((s, i) => tone(note(s, 1047), 0.09, { type: 'triangle', vol: 0.13, delay: i * 0.05 }));
    noise(0.5, { freq: 9000, to: 4000, vol: 0.08, type: 'highpass', delay: 0.1 });
  },
  /** The big shiny reveal: a bright rising chord, a chime cascade and a glittery wash. */
  shinyReveal() {
    [0, 4, 7, 12, 16, 19, 24, 28].forEach((s, i) => tone(note(s, 784), 0.14, { type: 'triangle', vol: 0.14, delay: i * 0.045 }));
    [0, 4, 7].forEach((s) => tone(note(s + 12, 523), 1.2, { type: 'sine', vol: 0.08, delay: 0.36, attack: 0.02 }));
    [24, 19, 28, 24, 31].forEach((s, i) => tone(note(s, 523), 0.3, { type: 'sine', vol: 0.09, delay: 0.5 + i * 0.09 }));
    noise(1.1, { freq: 10000, to: 3500, vol: 0.1, type: 'highpass', delay: 0.05 });
  },
  /** A shiny attacks: a quick sparkling sweep. */
  shinyZing() {
    tone(1568, 0.18, { type: 'triangle', vol: 0.09, slide: 3136 });
    tone(2093, 0.14, { type: 'sine', vol: 0.06, delay: 0.05 });
  },
  /** A shiny's hit lands: a bright ping on top of the normal hit. */
  shinyHit() {
    tone(2637, 0.22, { type: 'sine', vol: 0.08 });
    tone(3136, 0.2, { type: 'sine', vol: 0.05, delay: 0.04 });
  },
  /** A manga strip slashes across the screen. */
  slash(i = 0) {
    noise(0.16, { freq: 1500 + (i % 4) * 400, to: 7000, vol: 0.22, type: 'bandpass', q: 1.5 });
  },
  /** A cut-in strip slams home: a punchy thud and a paper snap. */
  stripHit(i = 0) {
    tone(150 - i * 15, 0.16, { type: 'sine', vol: 0.55, slide: 50 });
    noise(0.07, { freq: 3200, vol: 0.35, type: 'bandpass', q: 1.2 });
    noise(0.18, { freq: 900, to: 200, vol: 0.25 });
  },
  /** A trainer's name slams onto the cut-in page. */
  cutInHit() {
    tone(110, 0.25, { type: 'sine', vol: 0.5, slide: 45 });
    noise(0.12, { freq: 2200, vol: 0.25 });
    [0, 7, 12].forEach((s, i) => tone(note(s, 392), 0.12, { type: 'square', vol: 0.1, delay: 0.05 + i * 0.07 }));
  },
  /** A guardian's name slams in: heavier, darker. */
  cutInBoss() {
    tone(70, 0.6, { type: 'sawtooth', vol: 0.3, slide: 35 });
    tone(55, 0.6, { type: 'sine', vol: 0.5, slide: 30 });
    noise(0.5, { freq: 600, to: 120, vol: 0.4 });
    [0, 1, 0, -1].forEach((s, i) => tone(note(s, 147), 0.2, { type: 'square', vol: 0.08, delay: 0.1 + i * 0.12 }));
  },
  evolveDone() {
    [0, 4, 7, 12, 16, 19, 24].forEach((s, i) => tone(note(s, 523), 0.18, { type: 'square', vol: 0.14, delay: i * 0.06 }));
    noise(0.6, { freq: 6000, to: 800, vol: 0.2, type: 'highpass' });
  },
};

// ------------------------------------------------------------ music

/**
 * Music is composed on the fly from a few parameters: a mode, two 4-chord progressions and a seed.
 * Each song is 16 bars (A A' B A'') of eighth notes: a 2-bar motif repeats with variations and
 * cadences, over bass, drums, pads, arpeggios and bells. Map and battle songs take the colour of the
 * floor's element (its mode, tempo and instruments), so every element sounds different.
 */
export type Theme = 'title' | 'map' | 'battle' | 'trainer' | 'boss' | 'final' | 'shop' | 'event' | 'arena' | 'win' | 'lose' | 'lurk';

type Drums = 'none' | 'soft' | 'drive' | 'march' | 'half' | 'heart';

interface SongDef {
  bpm: number;
  root: number; // Hz
  scale: number[];
  /** Chords per bar as scale degrees (0 = the home chord), for the A and B sections. */
  progA: number[];
  progB: number[];
  lead: Wave;
  bass: Wave;
  drums: Drums;
  arp?: boolean;
  pad?: boolean;
  echo?: boolean;
  bells?: boolean;
  /** How busy the melody is (0-1). */
  density?: number;
  /** Chance each melody note after the downbeat is left out (long, lonely gaps). */
  sparse?: number;
  /** A low, slowly beating drone under everything, and a far-off tritone chime now and then. */
  dread?: boolean;
  seed: number;
}

const MINOR = [0, 2, 3, 5, 7, 8, 10];
const MAJOR = [0, 2, 4, 5, 7, 9, 11];
const PHRYGIAN = [0, 1, 3, 5, 7, 8, 10];
const HARMONIC = [0, 2, 3, 5, 7, 8, 11];
const DORIAN = [0, 2, 3, 5, 7, 9, 10];
const LYDIAN = [0, 2, 4, 6, 7, 9, 11];
const MIXOLYDIAN = [0, 2, 4, 5, 7, 9, 10];

const isMajor = (scale: number[]) => scale[2] === 4;

/** Each element's musical colour. */
interface Flavor {
  scale: number[];
  root: number;
  tempo: number;
  lead: Wave;
  arp?: boolean;
  echo?: boolean;
  bells?: boolean;
  seed: number;
}
const FLAVOR: Record<Element, Flavor> = {
  Fire: { scale: HARMONIC, root: 220, tempo: 1.08, lead: 'sawtooth', seed: 101 },
  Frost: { scale: MINOR, root: 247, tempo: 0.9, lead: 'triangle', bells: true, arp: true, seed: 202 },
  Nature: { scale: DORIAN, root: 262, tempo: 1, lead: 'triangle', echo: true, seed: 303 },
  Earth: { scale: MIXOLYDIAN, root: 196, tempo: 0.94, lead: 'square', seed: 404 },
  Storm: { scale: MINOR, root: 233, tempo: 1.14, lead: 'square', arp: true, seed: 505 },
  Water: { scale: DORIAN, root: 233, tempo: 0.96, lead: 'sine', echo: true, arp: true, seed: 606 },
  Metal: { scale: PHRYGIAN, root: 208, tempo: 1.04, lead: 'square', seed: 707 },
  Toxic: { scale: PHRYGIAN, root: 185, tempo: 1, lead: 'sawtooth', echo: true, seed: 808 },
  Shadow: { scale: HARMONIC, root: 175, tempo: 0.88, lead: 'sawtooth', bells: true, seed: 909 },
  Light: { scale: LYDIAN, root: 262, tempo: 1.02, lead: 'triangle', bells: true, arp: true, seed: 1010 },
  Spirit: { scale: DORIAN, root: 220, tempo: 0.86, lead: 'sine', echo: true, bells: true, seed: 1111 },
  Dragon: { scale: HARMONIC, root: 196, tempo: 1.1, lead: 'sawtooth', arp: true, seed: 1212 },
};

const PROGS_MINOR = [
  [0, 5, 2, 6],
  [0, 3, 4, 0],
  [0, 6, 5, 4],
  [0, 5, 3, 4],
];
const PROGS_MAJOR = [
  [0, 4, 5, 3],
  [0, 3, 4, 4],
  [0, 5, 3, 4],
  [0, 3, 0, 4],
];
const BRIDGES_MINOR = [
  [3, 4, 0, 0],
  [5, 6, 0, 4],
  [3, 0, 4, 4],
];
const BRIDGES_MAJOR = [
  [3, 4, 2, 5],
  [5, 3, 4, 4],
  [3, 0, 4, 4],
];

function progs(scale: number[], seed: number): { progA: number[]; progB: number[] } {
  const major = isMajor(scale);
  const a = major ? PROGS_MAJOR : PROGS_MINOR;
  const b = major ? BRIDGES_MAJOR : BRIDGES_MINOR;
  return { progA: a[seed % a.length], progB: b[(seed >> 2) % b.length] };
}

/** A song for a theme, coloured by an element where it has one. */
function songFor(theme: Theme, el: Element | null): SongDef {
  const f = el ? FLAVOR[el] : null;
  switch (theme) {
    case 'title':
      return { bpm: 88, root: 220, scale: MINOR, progA: [0, 5, 2, 6], progB: [3, 4, 0, 4], lead: 'triangle', bass: 'triangle', drums: 'soft', pad: true, bells: true, density: 0.5, seed: 11 };
    case 'arena':
      return { bpm: 128, root: 220, scale: MIXOLYDIAN, progA: [0, 6, 3, 0], progB: [3, 4, 6, 4], lead: 'square', bass: 'square', drums: 'half', pad: true, density: 0.6, seed: 61 };
    case 'lurk':
      // Online waiting rooms: something is out there. Slow, low, Phrygian, a heartbeat for drums.
      return { bpm: 60, root: 147, scale: PHRYGIAN, progA: [0, 1, 0, 4], progB: [5, 1, 6, 1], lead: 'sine', bass: 'sine', drums: 'heart', pad: true, echo: true, density: 0.25, sparse: 0.55, dread: true, seed: 66 };
    case 'shop':
      return { bpm: 112, root: 294, scale: MAJOR, progA: [0, 5, 1, 4], progB: [3, 2, 1, 4], lead: 'square', bass: 'triangle', drums: 'soft', arp: true, density: 0.7, seed: 71 };
    case 'event':
      return { bpm: 80, root: 233, scale: DORIAN, progA: [0, 3, 0, 4], progB: [5, 3, 1, 4], lead: 'sine', bass: 'triangle', drums: 'none', pad: true, echo: true, bells: true, density: 0.35, seed: 81 };
    case 'win':
      return { bpm: 120, root: 262, scale: MAJOR, progA: [0, 3, 4, 0], progB: [5, 3, 4, 4], lead: 'square', bass: 'square', drums: 'march', pad: true, bells: true, density: 0.6, seed: 91 };
    case 'lose':
      return { bpm: 70, root: 196, scale: MINOR, progA: [0, 5, 3, 4], progB: [5, 2, 3, 4], lead: 'triangle', bass: 'sine', drums: 'none', pad: true, echo: true, density: 0.3, seed: 97 };
    case 'final':
      return { bpm: 164, root: 185, scale: HARMONIC, progA: [0, 5, 6, 4], progB: [3, 1, 4, 4], lead: 'sawtooth', bass: 'sawtooth', drums: 'drive', arp: true, bells: true, density: 0.8, seed: 131 };
    case 'map': {
      const fl = f ?? FLAVOR.Nature;
      return { bpm: Math.round(100 * fl.tempo), root: fl.root, scale: fl.scale, ...progs(fl.scale, fl.seed), lead: fl.lead === 'sawtooth' ? 'triangle' : fl.lead, bass: 'triangle', drums: 'soft', pad: true, echo: fl.echo, bells: fl.bells, arp: false, density: 0.5, seed: fl.seed };
    }
    case 'battle':
    case 'trainer': {
      const fl = f ?? FLAVOR.Fire;
      const trainer = theme === 'trainer';
      const seed = fl.seed + (trainer ? 17 : 3);
      return {
        bpm: Math.round((trainer ? 150 : 140) * fl.tempo),
        root: fl.root,
        scale: fl.scale,
        ...progs(fl.scale, seed),
        lead: fl.lead,
        bass: trainer ? 'sawtooth' : 'square',
        drums: trainer ? 'march' : 'drive',
        arp: fl.arp || trainer,
        echo: fl.echo,
        bells: false,
        density: 0.75,
        seed,
      };
    }
    case 'boss': {
      const fl = f ?? FLAVOR.Dragon;
      // Guardians always sound dark, whatever their element's usual mode.
      const scale = isMajor(fl.scale) ? HARMONIC : fl.scale === DORIAN ? PHRYGIAN : fl.scale;
      return { bpm: Math.round(154 * Math.max(0.95, fl.tempo)), root: fl.root * 0.9, scale, progA: [0, 1, 0, 6], progB: [5, 6, 4, 4], lead: 'sawtooth', bass: 'sawtooth', drums: 'drive', arp: true, bells: fl.bells, density: 0.8, seed: fl.seed + 41 };
    }
  }
}

/** Steps of a 16-bar song: a melody note (scale degree), a tie (-1) or a rest (null). */
type Step = number | null;
const TIE = -1000;

function compose(def: SongDef): Step[] {
  let s = def.seed;
  const rnd = () => (s = (s * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff;
  const density = def.density ?? 0.6;
  const chordTones = (deg: number) => [deg, deg + 2, deg + 4];
  /** One bar of melody over a chord; `end` lands it on the chord root (a cadence). */
  const bar = (chord: number, start: number, end = false): Step[] => {
    const out: Step[] = [];
    let d = start;
    for (let i = 0; i < 8; i++) {
      if (i === 0) {
        // Downbeat: the nearest chord tone (in the melody's octave).
        const tones = chordTones(chord).flatMap((t) => [t + 7, t + 14]);
        d = tones.reduce((b, t) => (Math.abs(t - d) < Math.abs(b - d) ? t : b), tones[0]);
        out.push(d);
        continue;
      }
      if (end && i >= 4) {
        out.push(i === 4 ? chord + 7 : TIE);
        continue;
      }
      if (def.sparse && rnd() < def.sparse) {
        out.push(null);
        continue;
      }
      const r = rnd();
      if (r > density + 0.25 && i % 2 === 1) out.push(null);
      else if (r > density && i % 2 === 1) out.push(TIE);
      else {
        d = Math.max(5, Math.min(15, d + Math.round((rnd() - 0.5) * 4)));
        out.push(d);
      }
    }
    return out;
  };
  const section = (prog: number[], seedStart: number): Step[][] => {
    const m0 = bar(prog[0], seedStart);
    const m1 = bar(prog[1], (m0[7] as number) > 0 ? (m0[7] as number) : seedStart + 2);
    const m2 = bar(prog[2], seedStart);
    const m3 = bar(prog[3], seedStart + 1, true);
    // Bar 3 echoes bar 1's rhythm and shape, moved to its own chord.
    const shift = prog[2] - prog[0];
    const m2b = m0.map((n, i) => (n === null || n === TIE ? n : i === 0 ? m2[0] : n + shift));
    return [m0, m1, rnd() < 0.6 ? m2b : m2, m3];
  };
  const A = section(def.progA, 9);
  const A2 = [A[0], A[1], A[2], bar(def.progA[3], 10, true)];
  const B = section(def.progB, 11);
  return [...A.flat(), ...A2.flat(), ...B.flat(), ...A.flat()];
}

let wantedTheme: string | null = null;
let playing: string | null = null;
let timer: ReturnType<typeof setInterval> | null = null;
/** Fades the outgoing song while the next one starts. */
let songGain: GainNode | null = null;

/** Play a theme (coloured by an element for map and battle songs). null: silence. */
export function playMusic(theme: Theme | null, el: Element | null = null) {
  const key = theme ? `${theme}${el ? ':' + el : ''}` : null;
  wantedTheme = key;
  if (key === playing) return;
  stopTheme();
  if (key && ctx) startTheme(key);
}

function stopTheme() {
  if (timer) clearInterval(timer);
  timer = null;
  playing = null;
  if (songGain && ctx) {
    const g = songGain;
    g.gain.setTargetAtTime(0.0001, ctx.currentTime, 0.08);
    setTimeout(() => g.disconnect(), 600);
  }
  songGain = null;
}

function startTheme(key: string) {
  if (!ctx || !musicBus) return;
  stopTheme();
  playing = key;
  const [theme, el] = key.split(':') as [Theme, Element | undefined];
  const def = songFor(theme, el ?? null);
  const steps = compose(def);
  const bus = ctx.createGain();
  bus.gain.value = 1;
  bus.connect(musicBus);
  songGain = bus;
  const step = 60 / def.bpm / 2; // eighth note
  const deg = (d: number, base: number) => {
    const o = Math.floor(d / 7);
    return note(def.scale[((d % 7) + 7) % 7] + 12 * o, base);
  };
  const leadVol = def.lead === 'sawtooth' ? 0.08 : def.lead === 'square' ? 0.1 : def.lead === 'sine' ? 0.17 : 0.14;
  let i = 0;
  let next = ctx.currentTime + 0.1;
  const schedule = () => {
    if (!ctx || playing !== key) return;
    while (next < ctx.currentTime + 0.3) {
      const delay = Math.max(0, next - ctx.currentTime);
      const pos = i % steps.length;
      const barNo = Math.floor(pos / 8);
      const beat = pos % 8;
      const section = Math.floor(barNo / 4);
      const prog = section === 2 ? def.progB : def.progA;
      const chord = prog[barNo % 4];
      const lastBar = barNo % 4 === 3;
      // Melody (ties lengthen the note before them).
      const m = steps[pos];
      if (m !== null && m !== TIE) {
        let len = 1;
        while (steps[(pos + len) % steps.length] === TIE && len < 8) len++;
        tone(deg(m, def.root), step * len * 0.92, { type: def.lead, vol: leadVol, delay, bus });
        if (def.echo) tone(deg(m, def.root), step * len * 0.8, { type: 'sine', vol: leadVol * 0.35, delay: delay + step * 1.5, bus });
      }
      // Bass.
      const root = deg(chord, def.root / 2);
      const fifth = deg(chord + 4, def.root / 2);
      const bassVol = def.bass === 'sawtooth' ? 0.13 : 0.18;
      if (def.drums === 'drive') tone(beat % 2 ? root * 2 : root, step * 0.8, { type: def.bass, vol: bassVol, delay, bus });
      else if (def.drums === 'march') {
        if (beat % 2 === 0) tone(beat === 4 ? fifth : root, step * 1.6, { type: def.bass, vol: bassVol, delay, bus });
      } else if (def.drums === 'half') {
        if (beat === 0 || beat === 3 || beat === 6) tone(beat === 6 ? fifth : root, step * 1.8, { type: def.bass, vol: bassVol, delay, bus });
      } else if (beat === 0 || beat === 4) tone(beat === 4 ? fifth : root, step * 3.6, { type: def.bass, vol: bassVol * 0.9, delay, bus, attack: 0.02 });
      // Pad: the chord's third and fifth held through the bar.
      if (def.pad && beat === 0) {
        tone(deg(chord + 2, def.root), step * 7.5, { type: 'sine', vol: 0.05, delay, bus, attack: 0.25 });
        tone(deg(chord + 4, def.root), step * 7.5, { type: 'sine', vol: 0.045, delay, bus, attack: 0.25 });
      }
      // Dread: a drone a hair out of tune with itself (it throbs), and a distant tritone chime.
      if (def.dread) {
        if (beat === 0 && barNo % 2 === 0) {
          const low = def.root / 4;
          tone(low, step * 16, { type: 'sine', vol: 0.16, delay, bus, attack: 1.2 });
          tone(low * 1.012, step * 16, { type: 'sine', vol: 0.12, delay, bus, attack: 1.6 });
          tone(low * 2 * Math.pow(2, 6 / 12), step * 15, { type: 'triangle', vol: 0.025, delay, bus, attack: 2.5 });
        }
        if (barNo % 4 === 2 && beat === 5) {
          const f = def.root * 4 * Math.pow(2, 6 / 12);
          for (let k = 0; k < 4; k++) tone(f, step * 3, { type: 'sine', vol: 0.03 / (k + 1), delay: delay + k * step * 1.5, bus, attack: 0.005 });
        }
        if (barNo % 8 === 7 && beat === 2) noise(step * 5, { freq: 400, to: 120, vol: 0.05, type: 'lowpass', delay, bus });
      }
      // Arpeggio: chord tones climbing, quietly.
      if (def.arp && section !== 0) {
        const t = [0, 2, 4, 7][beat % 4];
        tone(deg(chord + t, def.root), step * 0.5, { type: 'square', vol: 0.035, delay, bus });
      }
      // Bells on the first beat of every other bar.
      if (def.bells && beat === 0 && barNo % 2 === 0) tone(deg(chord + 7, def.root * 2), step * 6, { type: 'sine', vol: 0.06, delay, bus, attack: 0.005 });
      // Drums.
      const kick = () => tone(110, 0.12, { type: 'sine', vol: 0.45, slide: 40, delay, bus });
      const snare = (v = 0.22) => noise(0.1, { freq: 1800, vol: v, delay, bus });
      const hat = (v = 0.05) => noise(0.03, { freq: 8000, vol: v, type: 'highpass', delay, bus });
      switch (def.drums) {
        case 'drive':
          if (beat === 0 || beat === 4 || (beat === 7 && barNo % 2)) kick();
          if (beat === 2 || beat === 6) snare();
          if (lastBar && beat >= 5) snare(0.14);
          hat();
          break;
        case 'march':
          if (beat === 0 || beat === 4) kick();
          if (beat === 2 || beat === 6) snare(0.18);
          if (lastBar && beat >= 6) snare(0.12);
          break;
        case 'half':
          if (beat === 0 || beat === 3) kick();
          if (beat === 4) snare();
          if (beat % 2 === 0) hat(0.05);
          break;
        case 'heart':
          // Lub-dub, low and muffled.
          if (beat === 0) tone(62, 0.16, { type: 'sine', vol: 0.4, slide: 30, delay, bus });
          if (beat === 1) tone(55, 0.14, { type: 'sine', vol: 0.26, slide: 28, delay, bus });
          break;
        case 'soft':
          if (beat === 0) tone(90, 0.1, { type: 'sine', vol: 0.22, slide: 45, delay, bus });
          if (beat === 4) hat(0.03);
          break;
      }
      i++;
      next += step;
    }
  };
  schedule();
  timer = setInterval(schedule, 60);
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
