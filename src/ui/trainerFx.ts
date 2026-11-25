import Phaser from 'phaser';
import type { TrainerLook } from '../data/trainerLook';
import { calm } from './motion';
import { TRAINER_H, TRAINER_W } from './trainerSprite';

/**
 * Live effects for a trainer's aura and powered-up gear: flames, snow, lightning, smoke, bubbles,
 * orbiting stars, a rainbow ring, a void that pulls light in, jet exhaust and more. They follow
 * the trainer's image (position, scale, flip, visibility and fade) and are drawn in the sprite's
 * own pixels, so they stay chunky at any size. Reduce motion turns them off (the aura's outline
 * color still shows).
 */

type Spawn = (fx: Fx) => void;
interface Fx {
  /** Particles go here, in sprite pixels (0..32 × 0..34). */
  layer: Phaser.GameObjects.Container;
  scene: Phaser.Scene;
  back: boolean;
  /** A pixel (or a w × h block) in a color, added to the layer. */
  px: (x: number, y: number, color: number, w?: number, h?: number) => Phaser.GameObjects.Rectangle;
  tint: (c: number) => number;
}

const rand = Phaser.Math.FloatBetween;
const pick = <T,>(a: readonly T[]) => a[Math.floor(Math.random() * a.length)];
const FLAME = [0xffe060, 0xff9a2a, 0xff5a1a] as const;
const hue = (h: number) => (Phaser.Display.Color.HSVToRGB(((h % 1) + 1) % 1, 0.7, 1) as Phaser.Types.Display.ColorObject).color;

/** Float a particle somewhere and fade it out. */
function drift(fx: Fx, o: Phaser.GameObjects.Rectangle | Phaser.GameObjects.Arc, dx: number, dy: number, ms: number, extra: Phaser.Types.Tweens.TweenBuilderConfig | object = {}) {
  fx.scene.tweens.add({ targets: o, x: o.x + dx, y: o.y + dy, alpha: 0, duration: ms, ease: 'Sine.easeOut', onComplete: () => o.destroy(), ...extra });
}

const sparkle = (fx: Fx, x: number, y: number, color: number) => {
  const c = fx.px(x, y, 0xffffff);
  const arms = [fx.px(x - 1, y, color), fx.px(x + 1, y, color), fx.px(x, y - 1, color), fx.px(x, y + 1, color)];
  for (const o of [c, ...arms]) fx.scene.tweens.add({ targets: o, alpha: 0, duration: 520, delay: 120, onComplete: () => o.destroy() });
};

/** Effects for each aura: [spawn every ms, spawn]. */
const AURA_FX: Record<number, [number, Spawn][]> = {
  // Golden glow
  1: [[320, (fx) => sparkle(fx, rand(0, 31), rand(2, 32), 0xf0c838)]],
  // Inferno: flames licking up the body
  2: [
    [55, (fx) => drift(fx, fx.px(rand(4, 24), rand(18, 33), pick(FLAME)), rand(-2, 2), -rand(8, 15), rand(500, 850), { scaleX: 0.3, scaleY: 0.3 })],
    [400, (fx) => sparkle(fx, rand(3, 28), rand(0, 12), 0xff9a2a)],
  ],
  // Frost: snow drifting down, icy glints
  3: [
    [140, (fx) => drift(fx, fx.px(rand(-3, 34), rand(-4, 8), pick([0xffffff, 0xbfefff])), rand(-4, 4), rand(22, 32), rand(1500, 2100), { ease: 'Linear' })],
    [450, (fx) => sparkle(fx, rand(2, 29), rand(4, 30), 0x8ae0ff)],
  ],
  // Storm: sparks crackling and the odd lightning bolt
  4: [
    [90, (fx) => drift(fx, fx.px(rand(2, 29), rand(4, 32), pick([0xfff27a, 0x8ad8ff, 0xffffff])), rand(-3, 3), rand(-3, 3), 240)],
    [
      850,
      (fx) => {
        const g = fx.scene.add.graphics();
        fx.layer.add(g);
        let x = rand(1, 30);
        let y = rand(-2, 8);
        g.lineStyle(1, fx.tint(0xfff8b0), 1).beginPath().moveTo(x, y);
        for (let i = 0; i < 4; i++) g.lineTo((x += rand(-3, 3)), (y += rand(3, 6)));
        g.strokePath();
        fx.scene.tweens.add({ targets: g, alpha: 0, duration: 220, ease: 'Quad.easeIn', onComplete: () => g.destroy() });
      },
    ],
  ],
  // Shadow: dark smoke welling up
  5: [[100, (fx) => drift(fx, fx.px(rand(2, 25), rand(16, 33), pick([0x3a1a5a, 0x1a0f2e, 0x5a2a8a]), 2, 2).setAlpha(0.8), rand(-3, 3), -rand(8, 14), rand(800, 1100), { scaleX: 2.2, scaleY: 2.2 })]],
  // Toxic: bubbles that rise and pop
  6: [
    [
      170,
      (fx) => {
        const b = fx.scene.add.circle(rand(3, 25), rand(20, 33), 1.3, fx.tint(0x3ac030), 0.5).setStrokeStyle(0.6, fx.tint(0x9aff6a));
        fx.layer.add(b);
        fx.scene.tweens.add({
          targets: b,
          y: b.y - rand(10, 16),
          x: b.x + rand(-2, 2),
          duration: rand(700, 1000),
          ease: 'Sine.easeOut',
          onComplete: () => fx.scene.tweens.add({ targets: b, scale: 2, alpha: 0, duration: 140, onComplete: () => b.destroy() }),
        });
      },
    ],
  ],
  // Starfall: twinkles drifting down (the orbiting stars are in ORBITS)
  7: [[260, (fx) => drift(fx, fx.px(rand(0, 31), rand(-2, 10), pick([0xffffff, 0xc8d4ff, 0xfff0a0])), rand(-2, 2), rand(14, 22), 1200)]],
  // Rainbow: sparkles in every color (plus the ring in ORBITS)
  8: [[80, (fx) => drift(fx, fx.px(rand(0, 31), rand(2, 32), fx.tint(hue(Math.random()))), rand(-2, 2), -rand(3, 8), 700)]],
  // Regal: gold and royal-purple motes rising like a coronation, and the odd gold glint
  10: [
    [110, (fx) => drift(fx, fx.px(rand(1, 30), rand(14, 33), pick([0xffd060, 0xfff0a0, 0x9a5ae0])), rand(-1, 1), -rand(10, 16), rand(800, 1100))],
    [520, (fx) => sparkle(fx, rand(2, 29), rand(0, 20), 0xffd060)],
  ],
  // Amber: warm motes drifting slowly up like resin in sunlight, the odd glint of something caught in it
  11: [
    [150, (fx) => drift(fx, fx.px(rand(1, 30), rand(12, 33), pick([0xffb84a, 0xe08a2e, 0xffd890]), 1, 1).setAlpha(0.9), rand(-1, 1), -rand(6, 10), rand(1200, 1600), { ease: 'Linear' })],
    [700, (fx) => sparkle(fx, rand(2, 29), rand(2, 28), 0xffb84a)],
  ],
  // Void: light pulled into the trainer
  9: [
    [
      55,
      (fx) => {
        const a = rand(0, Math.PI * 2);
        const p = fx.px(14 + Math.cos(a) * 17, 19 + Math.sin(a) * 15, pick([0x8a3ad8, 0xff6ad8, 0x2a0a4a]));
        fx.scene.tweens.add({ targets: p, x: 14, y: 19, scaleX: 0.2, scaleY: 0.2, alpha: 0.2, duration: 650, ease: 'Quad.easeIn', onComplete: () => p.destroy() });
      },
    ],
  ],
};

/** Effects for gear, by part and option. */
function gearFx(look: TrainerLook, back: boolean): [number, Spawn][] {
  const out: [number, Spawn][] = [];
  // Jetpack exhaust.
  if (look.back === 3) {
    const nozzles = back ? [10.5, 16.5] : [5.5, 21.5];
    out.push([45, (fx) => drift(fx, fx.px(pick(nozzles) + rand(-0.5, 0.5), back ? 29 : 28, pick(FLAME)), rand(-1, 1), rand(4, 7), 260)]);
  }
  // Phoenix wings shed embers; angel wings, feathers.
  if (look.back === 8) out.push([90, (fx) => drift(fx, fx.px(pick([rand(0, 5), rand(23, 29)]), rand(8, 26), pick(FLAME)), rand(-2, 2), -rand(5, 10), 650)]);
  if (look.back === 1) out.push([700, (fx) => drift(fx, fx.px(pick([rand(0, 5), rand(23, 28)]), rand(14, 26), 0xffffff, 2, 1), rand(-3, 3), rand(6, 10), 1300, { angle: 180 })]);
  if (look.back === 6) out.push([300, (fx) => sparkle(fx, pick([rand(1, 6), rand(22, 27)]), rand(10, 26), pick([0xa8f0ff, 0xf8b8e8]))]);
  // Victory banner: the flag catches the light.
  if (look.back === 9) out.push([520, (fx) => sparkle(fx, back ? 2 : 25, 7, 0xfff0a0)]);
  // Monarch crown jewels; the royal mantle's ermine shimmer.
  if (look.hat === 27) out.push([700, (fx) => sparkle(fx, pick([9, 13.5, 18]), 5, pick([0xff6a5a, 0x6aa0ff, 0x7aff7a]))]);
  if (look.top === 17) out.push([900, (fx) => sparkle(fx, rand(7, 20), 18, 0xffffff)]);
  // Rocket boots.
  if (look.shoes === 4) out.push([50, (fx) => drift(fx, fx.px(pick([10, 17]) + rand(-1, 1), 33.5, pick(FLAME)), rand(-1, 1), rand(2, 4), 200)]);
  // Flame crown.
  if (look.hat === 20) out.push([70, (fx) => drift(fx, fx.px(rand(8, 19), rand(-1, 2), pick(FLAME)), rand(-1, 1), -rand(3, 6), 420)]);
  // Storm cloud: rain, and now and then a little bolt.
  if (look.hat === 21) {
    out.push([110, (fx) => drift(fx, fx.px(pick([rand(3, 6), rand(21, 24)]), 5, 0x8ad8ff, 0.6, 1.5), 0, rand(6, 10), 420, { ease: 'Linear' })]);
    out.push([1400, (fx) => sparkle(fx, rand(5, 22), 2, 0xfff27a)]);
  }
  // Astral halo, Third eye, Void cloak, Mech suit core.
  if (look.hat === 26) out.push([260, (fx) => sparkle(fx, rand(7, 20), rand(0, 4), 0x9af0ff)]);
  if (look.hat === 25 && !back) out.push([900, (fx) => sparkle(fx, 13.5, 8, 0xf080ff)]);
  if (look.top === 15) out.push([240, (fx) => drift(fx, fx.px(rand(9, 18), rand(20, 30), pick([0xffffff, 0xc8a8f0])), 0, 0, 600)]);
  if (look.top === 16 && !back) out.push([600, (fx) => sparkle(fx, 13.5, 21, 0x5af0ff)]);
  // Cloud steps: little puffs.
  if (look.shoes === 5) out.push([260, (fx) => drift(fx, fx.px(pick([rand(8, 13), rand(14, 19)]), 33, 0xf4f8ff, 2, 1), rand(-3, 3), rand(0, 1), 700, { scaleX: 1.8 })]);
  return out;
}

/** Things that orbit the trainer every frame (Starfall's stars, Rainbow's ring). */
function orbiters(look: TrainerLook, fx: Fx): ((t: number) => void) | null {
  const n = look.aura === 7 ? 3 : look.aura === 8 ? 10 : 0;
  if (!n) return null;
  const dots = Array.from({ length: n }, () => fx.px(0, 0, 0xffffff, look.aura === 7 ? 2 : 1, look.aura === 7 ? 2 : 1));
  return (t) => {
    dots.forEach((d, i) => {
      const a = t / (look.aura === 7 ? 900 : 600) + (i / n) * Math.PI * 2;
      d.setPosition(14 + Math.cos(a) * 15, 19 + Math.sin(a) * 6);
      // Dimmer as it passes behind.
      d.setAlpha(Math.sin(a) < 0 ? 0.45 : 1);
      if (look.aura === 8) d.setFillStyle(fx.tint(hue(t / 2000 + i / n)));
      else d.setFillStyle(fx.tint(i === 0 ? 0xfff0a0 : 0xc8d4ff));
    });
  };
}

/** True when this look has any live effect. */
export const hasTrainerFx = (look: TrainerLook, back = false) => !!AURA_FX[look.aura] || gearFx(look, back).length > 0;

/**
 * Attach the look's live effects to a trainer image (in a container or on the scene). `back`: the
 * image shows the trainer from behind. `gray`: everything in grays (a stage-race ghost). They
 * clean up with the image.
 */
export function trainerFx(scene: Phaser.Scene, img: Phaser.GameObjects.Image, look: TrainerLook, o: { back?: boolean; gray?: boolean } = {}) {
  if (calm()) return;
  const spawns = [...(AURA_FX[look.aura] ?? []), ...gearFx(look, !!o.back)];
  if (!spawns.length && look.aura !== 7 && look.aura !== 8) return;

  const root = scene.add.container(img.x, img.y);
  const layer = scene.add.container(0, 0);
  root.add(layer);
  const parent = img.parentContainer;
  if (parent) parent.addAt(root, parent.getIndex(img) + 1);
  else root.setDepth(img.depth);
  const tint = (c: number) => {
    if (!o.gray) return c;
    const v = Math.round(40 + (0.3 * ((c >> 16) & 255) + 0.59 * ((c >> 8) & 255) + 0.11 * (c & 255)) * 0.75);
    return (v << 16) | (v << 8) | v;
  };
  const fx: Fx = {
    layer,
    scene,
    back: !!o.back,
    tint,
    px: (x, y, color, w = 1, h = 1) => {
      const r = scene.add.rectangle(x, y, w, h, tint(color));
      layer.add(r);
      return r;
    },
  };
  const orbit = orbiters(look, fx);

  // Follow the image: position, scale, flip, visibility and fade.
  const follow = () => {
    if (!img.active) return stop();
    root.setPosition(img.x, img.y);
    root.setScale(img.scaleX * (img.flipX ? -1 : 1), img.scaleY);
    root.setVisible(img.visible);
    root.setAlpha(img.alpha);
    layer.setPosition(-img.originX * TRAINER_W, -img.originY * TRAINER_H);
    orbit?.(scene.time.now);
  };
  const timers = spawns.map(([every, spawn]) =>
    scene.time.addEvent({ delay: every, loop: true, callback: () => img.active && img.visible && img.alpha > 0.05 && spawn(fx) }),
  );
  const stop = () => {
    scene.events.off('update', follow);
    for (const t of timers) t.remove();
    if (root.active) root.destroy();
  };
  follow();
  scene.events.on('update', follow);
  img.once('destroy', stop);
  scene.events.once('shutdown', stop);
}

/** Each aura's color (for the victory flare and the cut-in); 0 (none) is white. */
export const AURA_COLORS = [0xffffff, 0xf0c838, 0xff7a2a, 0x8ae0ff, 0xfff27a, 0x8a4ad0, 0x7aff5a, 0xc8d4ff, 0xff7ad9, 0xa04ae8, 0xffd060];

/** A burst of light in the trainer's aura color: a ring flying out and sparks rising (victory). */
export function trainerFlare(scene: Phaser.Scene, img: Phaser.GameObjects.Image, look: TrainerLook) {
  if (calm() || !img.active) return;
  const m = img.getWorldTransformMatrix();
  const x = m.tx;
  const y = m.ty;
  const s = Math.abs(img.scaleX);
  const depth = (img.parentContainer?.depth ?? img.depth) + 1;
  const n = 18;
  for (let i = 0; i < n; i++) {
    const a = (i / n) * Math.PI * 2;
    const c = look.aura === 8 ? hue(i / n) : AURA_COLORS[look.aura] ?? 0xffffff;
    const p = scene.add.rectangle(x, y, s * 1.4, s * 1.4, c).setDepth(depth);
    scene.tweens.add({ targets: p, x: x + Math.cos(a) * s * 20, y: y + Math.sin(a) * s * 14, alpha: 0, angle: 180, duration: 650, ease: 'Cubic.easeOut', onComplete: () => p.destroy() });
  }
  for (let i = 0; i < 10; i++) {
    const c = look.aura === 8 ? hue(Math.random()) : AURA_COLORS[look.aura] ?? 0xffffff;
    const p = scene.add.rectangle(x + rand(-12, 12) * s, y + rand(-4, 14) * s, s, s, c).setDepth(depth);
    scene.tweens.add({ targets: p, y: p.y - rand(14, 24) * s, alpha: 0, delay: rand(0, 300), duration: 800, ease: 'Sine.easeOut', onComplete: () => p.destroy() });
  }
}
