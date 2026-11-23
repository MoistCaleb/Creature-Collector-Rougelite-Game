import Phaser from 'phaser';
import { calm } from './motion';
import { ELEMENT_COLORS, type Element } from '../data/types';
import { sfx } from './sound';
import { fullRect, H, W, ZOOM } from './widgets';

/**
 * Battle visual effects, all drawn in code: per-element projectiles and impacts, status
 * sparkles, faint bursts, floating damage numbers and the evolution sequence.
 */

type Pt = { x: number; y: number };

const TEX = ['fx-dot', 'fx-spark', 'fx-shard', 'fx-leaf', 'fx-rock', 'fx-ring', 'fx-plus'] as const;
type Tex = (typeof TEX)[number];

/** Draw the small white particle textures once per game (tinted per use). */
export function ensureFxTextures(scene: Phaser.Scene) {
  if (scene.textures.exists('fx-dot')) return;
  const g = scene.make.graphics({ x: 0, y: 0 }, false);
  const make = (key: Tex, w: number, h: number, draw: () => void) => {
    g.clear();
    g.fillStyle(0xffffff, 1);
    g.lineStyle(2, 0xffffff, 1);
    draw();
    g.generateTexture(key, w, h);
  };
  make('fx-dot', 12, 12, () => g.fillCircle(6, 6, 6));
  make('fx-spark', 12, 12, () => g.fillPoints([new Phaser.Math.Vector2(6, 0), new Phaser.Math.Vector2(12, 6), new Phaser.Math.Vector2(6, 12), new Phaser.Math.Vector2(0, 6)], true));
  make('fx-shard', 8, 18, () => g.fillTriangle(4, 0, 8, 18, 0, 18));
  make('fx-leaf', 14, 8, () => g.fillEllipse(7, 4, 14, 8));
  make('fx-rock', 10, 10, () => g.fillRect(0, 0, 10, 10));
  make('fx-ring', 32, 32, () => g.strokeCircle(16, 16, 14));
  make('fx-plus', 12, 12, () => {
    g.fillRect(4, 0, 4, 12);
    g.fillRect(0, 4, 12, 4);
  });
  g.destroy();
}

const lighten = (c: number, n: number) => Phaser.Display.Color.ValueToColor(c).lighten(n).color;
const darken = (c: number, n: number) => Phaser.Display.Color.ValueToColor(c).darken(n).color;

/** One-shot particle burst that cleans itself up. */
function burst(
  scene: Phaser.Scene,
  at: Pt,
  tex: Tex,
  tints: number[],
  count: number,
  cfg: Partial<Phaser.Types.GameObjects.Particles.ParticleEmitterConfig> = {},
) {
  const em = scene.add.particles(at.x, at.y, tex, {
    speed: { min: 80, max: 220 },
    lifespan: { min: 300, max: 600 },
    scale: { start: 1, end: 0 },
    alpha: { start: 1, end: 0 },
    tint: tints,
    emitting: false,
    ...cfg,
  });
  em.setDepth(50);
  em.explode(count);
  scene.time.delayedCall(1200, () => em.destroy());
  return em;
}

function tweenP(scene: Phaser.Scene, cfg: Phaser.Types.Tweens.TweenBuilderConfig): Promise<void> {
  return new Promise((res) => scene.tweens.add({ ...cfg, onComplete: () => res() }));
}

/** A glowing orb (with trail) flying from a to b. */
async function orb(scene: Phaser.Scene, a: Pt, b: Pt, color: number, tex: Tex = 'fx-dot', scale = 1.6, dur = 260, arc = 0) {
  const o = scene.add.image(a.x, a.y, tex).setTint(lighten(color, 20)).setScale(scale).setDepth(51);
  const trail = scene.add.particles(0, 0, tex, {
    follow: o,
    speed: 15,
    lifespan: 220,
    scale: { start: scale * 0.7, end: 0 },
    alpha: { start: 0.8, end: 0 },
    tint: [color, lighten(color, 30)],
    frequency: 16,
  });
  trail.setDepth(50);
  const t = { p: 0 };
  await tweenP(scene, {
    targets: t,
    p: 1,
    duration: dur,
    ease: 'Quad.easeIn',
    onUpdate: () => {
      o.setPosition(a.x + (b.x - a.x) * t.p, a.y + (b.y - a.y) * t.p - Math.sin(t.p * Math.PI) * arc);
      o.rotation += 0.3;
    },
  });
  o.destroy();
  trail.stop();
  scene.time.delayedCall(300, () => trail.destroy());
}

/** Several small projectiles in a staggered volley. */
async function volley(scene: Phaser.Scene, a: Pt, b: Pt, color: number, tex: Tex, n: number, spread = 24, dur = 240, arc = 0) {
  const shots: Promise<void>[] = [];
  for (let i = 0; i < n; i++) {
    const off = (i - (n - 1) / 2) * spread;
    shots.push(
      new Promise((res) =>
        scene.time.delayedCall(i * 70, () =>
          orb(scene, { x: a.x, y: a.y + off * 0.5 }, { x: b.x + off * 0.4, y: b.y + off * 0.6 }, color, tex, 1.3, dur, arc).then(res),
        ),
      ),
    );
  }
  await Promise.all(shots);
}

/** Slash marks drawn across the target. */
async function slashes(scene: Phaser.Scene, at: Pt, color: number, n: number, len = 90) {
  for (let i = 0; i < n; i++) {
    const g = scene.add.graphics().setDepth(52);
    const off = (i - (n - 1) / 2) * 18;
    const x1 = at.x - len / 2 + off;
    const y1 = at.y - len / 2;
    const t = { p: 0 };
    scene.tweens.add({
      targets: t,
      p: 1,
      duration: 110,
      onUpdate: () => {
        g.clear();
        g.lineStyle(6, lighten(color, 40), 1);
        g.lineBetween(x1, y1, x1 + len * t.p, y1 + len * t.p);
        g.lineStyle(2, 0xffffff, 1);
        g.lineBetween(x1, y1, x1 + len * t.p, y1 + len * t.p);
      },
      onComplete: () => scene.tweens.add({ targets: g, alpha: 0, duration: 220, onComplete: () => g.destroy() }),
    });
    await new Promise<void>((r) => scene.time.delayedCall(70, () => r()));
  }
  await new Promise<void>((r) => scene.time.delayedCall(60, () => r()));
}

/** A jagged lightning bolt from the sky onto the target. */
async function lightning(scene: Phaser.Scene, at: Pt, color: number) {
  const g = scene.add.graphics().setDepth(52);
  const pts: Pt[] = [{ x: at.x + Phaser.Math.Between(-30, 30), y: 0 }];
  for (let y = 40; y < at.y; y += 40) pts.push({ x: at.x + Phaser.Math.Between(-26, 26), y });
  pts.push(at);
  const draw = (w: number, c: number) => {
    g.lineStyle(w, c, 1);
    g.beginPath();
    g.moveTo(pts[0].x, pts[0].y);
    for (const p of pts.slice(1)) g.lineTo(p.x, p.y);
    g.strokePath();
  };
  draw(10, color);
  draw(4, 0xffffff);
  scene.cameras.main.flash(90, 255, 250, 200, true);
  await tweenP(scene, { targets: g, alpha: 0, duration: 260, delay: 80 });
  g.destroy();
}

/** A beam of light from a to b. */
async function beam(scene: Phaser.Scene, a: Pt, b: Pt, color: number, width = 14) {
  const g = scene.add.graphics().setDepth(52);
  g.lineStyle(width, color, 0.85);
  g.lineBetween(a.x, a.y, b.x, b.y);
  g.lineStyle(width / 3, 0xffffff, 1);
  g.lineBetween(a.x, a.y, b.x, b.y);
  g.setAlpha(0);
  await tweenP(scene, { targets: g, alpha: 1, duration: 90 });
  await tweenP(scene, { targets: g, alpha: 0, duration: 260 });
  g.destroy();
}

/** A dark orb swelling over the target. */
async function swell(scene: Phaser.Scene, at: Pt, color: number) {
  const o = scene.add.circle(at.x, at.y, 10, color, 0.85).setDepth(52);
  const ring = scene.add.circle(at.x, at.y, 10).setStrokeStyle(3, lighten(color, 30)).setDepth(52);
  await tweenP(scene, { targets: [o, ring], scale: 6, duration: 260, ease: 'Quad.easeOut' });
  scene.tweens.add({ targets: [o, ring], alpha: 0, scale: 7.5, duration: 200, onComplete: () => (o.destroy(), ring.destroy()) });
}

/** The travel part of an attack, resolving the moment it lands. */
export async function attackTravel(scene: Phaser.Scene, el: Element, from: Pt, to: Pt) {
  const c = ELEMENT_COLORS[el];
  sfx.attack(el);
  switch (el) {
    case 'Fire':
      return orb(scene, from, to, 0xff7a1a, 'fx-dot', 2.2, 280, 20);
    case 'Frost':
      return volley(scene, from, to, 0xbfeaff, 'fx-shard', 3, 22, 220);
    case 'Water':
      return orb(scene, from, to, 0x3aa0ff, 'fx-dot', 2.4, 300, 10);
    case 'Nature':
      return volley(scene, from, to, 0x6fd16a, 'fx-leaf', 4, 18, 300, 30);
    case 'Earth':
      return volley(scene, from, to, 0x9b6b3c, 'fx-rock', 3, 26, 320, 90);
    case 'Storm':
      return lightning(scene, to, 0xffe14d);
    case 'Metal':
      return slashes(scene, to, 0xc9d3dd, 2);
    case 'Toxic':
      return volley(scene, from, to, 0xa64dff, 'fx-dot', 3, 20, 320, 60);
    case 'Shadow':
      return swell(scene, to, 0x2a1840);
    case 'Light':
      return beam(scene, from, to, 0xfff3a0);
    case 'Spirit':
      return volley(scene, from, to, 0x9ad8ff, 'fx-dot', 4, 30, 360, -40);
    case 'Dragon':
      return slashes(scene, to, 0xff5a3a, 3, 100);
    default:
      return orb(scene, from, to, c);
  }
}

/** The impact burst on the target. `strength` > 1 for super-effective hits. */
export function attackImpact(scene: Phaser.Scene, el: Element, at: Pt, strength = 1) {
  const c = ELEMENT_COLORS[el];
  const n = Math.round(14 * strength);
  switch (el) {
    case 'Fire':
      burst(scene, at, 'fx-dot', [0xff4a1a, 0xffa31a, 0xffe04d], n + 6, { gravityY: -260, speed: { min: 40, max: 160 } });
      break;
    case 'Frost':
      burst(scene, at, 'fx-shard', [0xffffff, 0xbfeaff, 0x7fc8ff], n, { rotate: { min: 0, max: 360 } });
      break;
    case 'Water':
      burst(scene, at, 'fx-dot', [0x3aa0ff, 0x9fd4ff, 0xffffff], n + 4, { gravityY: 420, speed: { min: 120, max: 260 }, angle: { min: 200, max: 340 } });
      break;
    case 'Nature':
      burst(scene, at, 'fx-leaf', [0x6fd16a, 0x3f9e3b, 0xc4f08a], n, { rotate: { min: 0, max: 360 }, gravityY: 120 });
      break;
    case 'Earth':
      burst(scene, at, 'fx-rock', [0x9b6b3c, 0x6e4a28, 0xc9a06a], n, { gravityY: 500, speed: { min: 120, max: 260 } });
      break;
    case 'Storm':
      burst(scene, at, 'fx-spark', [0xffe14d, 0xffffff], n + 4, { speed: { min: 160, max: 320 }, lifespan: 260 });
      break;
    case 'Metal':
      burst(scene, at, 'fx-spark', [0xffffff, 0xc9d3dd, 0xffd27a], n, { speed: { min: 180, max: 340 }, lifespan: 240, scale: { start: 0.7, end: 0 } });
      break;
    case 'Toxic':
      burst(scene, at, 'fx-dot', [0xa64dff, 0x6a1fb0, 0xd7a6ff], n, { gravityY: -120, speed: { min: 30, max: 120 }, lifespan: 800 });
      break;
    case 'Shadow':
      burst(scene, at, 'fx-dot', [0x2a1840, 0x5b3c8a, 0x000000], n, { speed: { min: 60, max: 200 } });
      break;
    case 'Light':
      burst(scene, at, 'fx-spark', [0xffffff, 0xfff3a0], n + 4, { speed: { min: 200, max: 360 }, lifespan: 300 });
      break;
    case 'Spirit':
      burst(scene, at, 'fx-ring', [0x9ad8ff, 0xd0b3ff], 3, { speed: 0, scale: { start: 0.4, end: 2.5 }, lifespan: 500 });
      burst(scene, at, 'fx-dot', [0x9ad8ff, 0xd0b3ff], n, { gravityY: -80, speed: { min: 30, max: 120 } });
      break;
    case 'Dragon':
      burst(scene, at, 'fx-dot', [0xff5a3a, 0xffb02e, 0x8a2be2], n + 4, { gravityY: -140 });
      break;
    default:
      burst(scene, at, 'fx-dot', [c], n);
  }
  if (strength > 1) burst(scene, at, 'fx-ring', [0xffffff], 1, { speed: 0, scale: { start: 0.5, end: 4 }, lifespan: 350 });
}

/** Rising (buff) or falling (debuff) sparkles in the move's color. */
export function statusFx(scene: Phaser.Scene, at: Pt, el: Element, up: boolean) {
  const c = ELEMENT_COLORS[el];
  burst(scene, { x: at.x, y: at.y + (up ? 40 : -50) }, 'fx-spark', [c, lighten(c, 35), 0xffffff], 16, {
    x: { min: -50, max: 50 },
    speed: { min: 10, max: 40 },
    gravityY: up ? -260 : 260,
    lifespan: 700,
  });
}

export function healFx(scene: Phaser.Scene, at: Pt) {
  burst(scene, { x: at.x, y: at.y + 30 }, 'fx-plus', [0x8fe08a, 0xd8ffd0], 12, {
    x: { min: -45, max: 45 },
    speed: { min: 5, max: 30 },
    gravityY: -200,
    lifespan: 800,
  });
}

export function faintFx(scene: Phaser.Scene, at: Pt, color: number) {
  burst(scene, at, 'fx-dot', [color, darken(color, 30), 0xffffff], 26, { speed: { min: 40, max: 180 }, lifespan: 700, gravityY: -60 });
}

/** A number that pops off the target. */
export function damageNumber(scene: Phaser.Scene, at: Pt, amount: number, mult = 1, why?: string[]) {
  const big = mult > 1.01;
  const weak = mult < 0.99;
  const t = scene.add
    .text(at.x + Phaser.Math.Between(-20, 20), at.y - 40, big ? `${amount}!` : `${amount}`, {
      fontFamily: '"Trebuchet MS", system-ui, sans-serif',
      fontSize: big ? '34px' : weak ? '20px' : '26px',
      fontStyle: 'bold',
      color: big ? '#ffd23f' : weak ? '#b8b4c8' : '#ffffff',
      stroke: '#000000',
      strokeThickness: 5,
      resolution: ZOOM,
    })
    .setOrigin(0.5)
    .setDepth(60)
    .setScale(0.4);
  scene.tweens.add({ targets: t, scale: 1, duration: 140, ease: 'Back.easeOut' });
  scene.tweens.add({ targets: t, y: t.y - 46, alpha: 0, delay: 380, duration: 520, onComplete: () => t.destroy() });
  // The "why": what boons and traits changed this hit, in small print under the number.
  if (why?.length) {
    const w = scene.add
      .text(t.x, t.y + 24, why.slice(0, 3).join('  ·  '), {
        fontFamily: '"Trebuchet MS", system-ui, sans-serif',
        fontSize: '13px',
        fontStyle: 'bold',
        color: '#ffe9a8',
        stroke: '#000000',
        strokeThickness: 4,
        resolution: ZOOM,
      })
      .setOrigin(0.5)
      .setDepth(60)
      .setAlpha(0);
    // Keep it on screen (the foe stands near the right edge on a phone).
    const half = w.displayWidth / 2 + 8;
    w.setX(Phaser.Math.Clamp(w.x, half, Math.max(half, scene.cameras.main.width - half)));
    scene.tweens.add({ targets: w, alpha: 1, duration: 120 });
    scene.tweens.add({ targets: w, y: w.y - 30, alpha: 0, delay: 700, duration: 500, onComplete: () => w.destroy() });
  }
}

/** A glowing hexagonal "bond crystal" drawn around (0, 0). */
function crystal(scene: Phaser.Scene, color: number): Phaser.GameObjects.Graphics {
  const g = scene.add.graphics();
  const hex = (r: number) =>
    Array.from({ length: 6 }, (_, i) => new Phaser.Math.Vector2(Math.cos(-Math.PI / 2 + (i * Math.PI) / 3) * r, Math.sin(-Math.PI / 2 + (i * Math.PI) / 3) * r));
  g.fillStyle(darken(color, 25), 1);
  g.fillPoints(hex(18), true);
  g.fillStyle(lighten(color, 25), 1);
  g.fillPoints(hex(11), true);
  g.fillStyle(0xffffff, 0.9);
  g.fillTriangle(-6, -10, 0, -13, -2, -4);
  g.lineStyle(3, 0xffffff, 0.9);
  g.strokePoints(hex(18), true);
  return g;
}

/**
 * Catch sequence: a bond crystal arcs over, draws the creature in as light, drops, wobbles three
 * times and locks with a burst. `special` adds a golden flourish (first-catch / type bonus).
 */
export function playCatch(
  scene: Phaser.Scene,
  creatureKey: string,
  scale: number,
  from: Pt,
  at: Pt,
  color: number,
  special: boolean,
  onDone: () => void,
) {
  ensureFxTextures(scene);
  const dim = fullRect(scene, 0x000000, 0.35).setDepth(1500).setInteractive();
  const mon = scene.add.image(at.x, at.y, creatureKey).setScale(scale).setDepth(1501).setAlpha(0);
  const gem = crystal(scene, color).setDepth(1503).setPosition(from.x, from.y).setScale(0.8);
  const groundY = at.y + 60;
  const parts: Phaser.GameObjects.GameObject[] = [dim, mon, gem];
  const step = (fn: () => void, ms: number) => scene.time.delayedCall(ms, fn);

  // The creature reappears so you can see what you're catching.
  scene.tweens.add({ targets: mon, alpha: 1, duration: 200 });
  sfx.throwCrystal();
  // 1. Throw: arc from your side to just above the creature, spinning.
  const t = { p: 0 };
  scene.tweens.add({
    targets: t,
    p: 1,
    duration: 520,
    delay: 250,
    ease: 'Sine.easeInOut',
    onUpdate: () => {
      gem.setPosition(from.x + (at.x - from.x) * t.p, from.y + (at.y - 70 - from.y) * t.p - Math.sin(t.p * Math.PI) * 160);
      gem.rotation = t.p * Math.PI * 4;
    },
    onComplete: () => {
      gem.rotation = 0;
      // 2. Draw in: a beam of light, the creature turns to light and shrinks into the crystal.
      sfx.catchDraw();
      // Triangle points are relative to its own box, so the apex sits at x = 55 of a 110-wide box.
      const beam = scene.add.triangle(at.x, at.y - 70, 55, 0, 0, 110, 110, 110, lighten(color, 40), 0.55).setOrigin(0.5, 0).setDepth(1502);
      parts.push(beam);
      scene.tweens.add({ targets: beam, alpha: 0.85, yoyo: true, duration: 220, repeat: 1 });
      mon.setTintFill(0xffffff);
      scene.tweens.add({ targets: mon, scale: 0.05, y: at.y - 70, alpha: 0.3, duration: 420, delay: 120, ease: 'Quad.easeIn' });
      burst(scene, at, 'fx-spark', [0xffffff, lighten(color, 30)], 18, { speed: { min: 20, max: 80 }, lifespan: 500 }).setDepth(1504);
      step(() => {
        beam.destroy();
        mon.setVisible(false);
        // 3. Drop to the ground with a bounce.
        scene.tweens.add({
          targets: gem,
          y: groundY,
          duration: 420,
          ease: 'Bounce.easeOut',
          onComplete: () => {
            sfx.crystalLand();
            // 4. Three wobbles, each with a pulse of light.
            for (let w = 0; w < 3; w++) {
              step(() => {
                sfx.wobble(w);
                scene.tweens.add({ targets: gem, rotation: w % 2 ? 0.45 : -0.45, yoyo: true, duration: 140, ease: 'Sine.easeInOut' });
                const pulse = scene.add.circle(at.x, groundY, 10, color, 0.4).setDepth(1502);
                parts.push(pulse);
                scene.tweens.add({ targets: pulse, scale: 3, alpha: 0, duration: 380, onComplete: () => pulse.destroy() });
              }, 350 + w * 520);
            }
            // 5. Lock: flash, burst of stars, the crystal hops.
            step(() => {
              sfx.catch();
              scene.cameras.main.flash(160, 255, 255, 255, true);
              burst(scene, { x: at.x, y: groundY }, 'fx-spark', special ? [0xffd23f, 0xffffff, 0xffb02e] : [0xffffff, lighten(color, 30)], special ? 40 : 24, {
                speed: { min: 120, max: 300 },
                lifespan: 800,
              }).setDepth(1504);
              burst(scene, { x: at.x, y: groundY }, 'fx-ring', [special ? 0xffd23f : 0xffffff], 2, { speed: 0, scale: { start: 0.5, end: 5 }, lifespan: 500 }).setDepth(1504);
              scene.tweens.add({ targets: gem, y: groundY - 30, yoyo: true, duration: 180, ease: 'Quad.easeOut' });
              if (special) {
                // A golden star rises for a bonus catch.
                const star = scene.add
                  .text(at.x, groundY - 40, '★', { fontFamily: 'system-ui', fontSize: '44px', color: '#ffd23f', stroke: '#000', strokeThickness: 4, resolution: ZOOM })
                  .setOrigin(0.5)
                  .setDepth(1505)
                  .setScale(0.2);
                parts.push(star);
                scene.tweens.add({ targets: star, scale: 1.2, y: groundY - 110, duration: 500, ease: 'Back.easeOut' });
                step(() => sfx.levelUp(), 200);
              }
            }, 350 + 3 * 520 + 150);
            step(() => {
              scene.tweens.add({ targets: parts, alpha: 0, duration: 250 });
              step(() => {
                parts.forEach((p) => p.destroy());
                onDone();
              }, 260);
            }, 350 + 3 * 520 + 150 + 1000);
          },
        });
      }, 560);
    },
  });
}

/** Full-screen evolution sequence: the old form flickers into the new one, then a burst. */
export function playEvolution(
  scene: Phaser.Scene,
  fromKey: string,
  toKey: string,
  scale: number,
  color: number,
  onDone: () => void,
) {
  ensureFxTextures(scene);
  const root = scene.add.container(0, 0).setDepth(2000);
  const dim = fullRect(scene, 0x05040a, 0.92).setInteractive();
  root.add(dim);
  const glow = scene.add.circle(W / 2, H / 2 - 40, 90, color, 0.25);
  root.add(glow);
  scene.tweens.add({ targets: glow, scale: 1.3, yoyo: true, repeat: -1, duration: 500 });
  const img = scene.add.image(W / 2, H / 2 - 40, fromKey).setScale(scale);
  root.add(img);
  sfx.evolveStart();
  // Flicker between forms, faster and faster.
  let delay = 0;
  let step = 0;
  // Reduce motion: a slower flicker that never strobes.
  for (let gap = 340; gap > (calm() ? 170 : 40); gap *= 0.82) {
    const showNew = step % 2 === 0;
    scene.time.delayedCall(delay, () => {
      img.setTexture(showNew ? toKey : fromKey).setTintFill(0xffffff);
      sfx.evolveTick(step);
    });
    delay += gap;
    step++;
  }
  scene.time.delayedCall(delay, () => {
    scene.cameras.main.flash(300, 255, 255, 255);
    img.setTexture(toKey).clearTint();
    burst(scene, { x: W / 2, y: H / 2 - 40 }, 'fx-spark', [color, 0xffffff, lighten(color, 40)], 40, { speed: { min: 120, max: 360 }, lifespan: 900 }).setDepth(2001);
    burst(scene, { x: W / 2, y: H / 2 - 40 }, 'fx-ring', [0xffffff], 2, { speed: 0, scale: { start: 1, end: 7 }, lifespan: 600 }).setDepth(2001);
    scene.tweens.add({ targets: img, scale: scale * 1.15, yoyo: true, duration: 180 });
    sfx.evolveDone();
  });
  scene.time.delayedCall(delay + 1100, () => {
    root.destroy();
    onDone();
  });
}
