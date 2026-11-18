import Phaser from 'phaser';
import { icon } from './icons';
import { sfx } from './sound';
import { FONT, fullRect, ZOOM } from './widgets';

/** Odds that a wild Hexling is shiny. */
export const SHINY_ODDS = 1 / 200;

/** Shiny gold, and the rainbow a shiny shimmers through. */
export const SHINY_GOLD = 0xffd86b;
const RAINBOW = [0xff6b9d, 0xffb84d, 0xfff27a, 0x7dff9a, 0x6bd8ff, 0xb98bff];

/** A small twinkling sparkle, marking a shiny Hexling. */
export function shinySparkle(scene: Phaser.Scene, x: number, y: number, size = 12): Phaser.GameObjects.Image {
  const s = icon(scene, x, y, 'sparkle', size);
  scene.tweens.add({ targets: s, alpha: 0.35, scale: s.scale * 0.7, yoyo: true, repeat: -1, duration: 700, ease: 'Sine.easeInOut' });
  return s;
}

/** A burst of sparkles around a shiny Hexling as it appears. */
export function shinyBurst(scene: Phaser.Scene, x: number, y: number, radius = 60, depth = 20, count = 9) {
  for (let i = 0; i < count; i++) {
    const a = (i / count) * Math.PI * 2 + Math.random() * 0.4;
    const s = icon(scene, x, y, 'sparkle', 14 + Math.random() * 12).setDepth(depth).setAlpha(0);
    scene.tweens.add({
      targets: s,
      x: x + Math.cos(a) * radius * (0.7 + Math.random() * 0.5),
      y: y + Math.sin(a) * radius * (0.7 + Math.random() * 0.5),
      alpha: { from: 1, to: 0 },
      angle: 180,
      delay: i * 25,
      duration: 750,
      ease: 'Cubic.easeOut',
      onComplete: () => s.destroy(),
    });
  }
}

// ------------------------------------------------------------ textures

/** A soft four-point star (white, tinted per particle). */
function ensureStar(scene: Phaser.Scene): string {
  const key = 'shiny-star';
  if (scene.textures.exists(key)) return key;
  const g = scene.make.graphics({}, false);
  const c = 16;
  g.fillStyle(0xffffff, 0.35);
  g.fillCircle(c, c, 5);
  g.fillStyle(0xffffff, 1);
  g.fillPoints([new Phaser.Math.Vector2(c, 0), new Phaser.Math.Vector2(c + 3, c - 3), new Phaser.Math.Vector2(32, c), new Phaser.Math.Vector2(c + 3, c + 3), new Phaser.Math.Vector2(c, 32), new Phaser.Math.Vector2(c - 3, c + 3), new Phaser.Math.Vector2(0, c), new Phaser.Math.Vector2(c - 3, c - 3)], true);
  g.generateTexture(key, 32, 32);
  g.destroy();
  return key;
}

/** Light rays fanning out from the center. */
function ensureRays(scene: Phaser.Scene): string {
  const key = 'shiny-rays';
  if (scene.textures.exists(key)) return key;
  const g = scene.make.graphics({}, false);
  const R = 160;
  const n = 14;
  for (let i = 0; i < n; i++) {
    const a = (i / n) * Math.PI * 2;
    const w = i % 2 ? 0.07 : 0.12;
    g.fillStyle(0xffffff, i % 2 ? 0.35 : 0.6);
    g.fillTriangle(R, R, R + Math.cos(a - w) * R, R + Math.sin(a - w) * R, R + Math.cos(a + w) * R, R + Math.sin(a + w) * R);
  }
  g.generateTexture(key, R * 2, R * 2);
  g.destroy();
  return key;
}

// ------------------------------------------------------------ the reveal

const wait = (scene: Phaser.Scene, ms: number) => new Promise<void>((r) => scene.time.delayedCall(ms, r));

/**
 * The big moment: a shiny Hexling has just appeared. The world dims, gold light rays spin up
 * behind it, rings and stars burst out, it shimmers through the rainbow, and a "SHINY!" banner
 * slams in. `big` (the first look at a foe) adds the banner and the longer hold.
 */
export async function shinyReveal(scene: Phaser.Scene, sprite: Phaser.GameObjects.Image, big = true, restore?: () => void): Promise<void> {
  const { x, y } = sprite;
  // Lift it into a spotlight above everything else for the reveal.
  const home = sprite.depth;
  const depth = 40;
  sprite.setDepth(depth);
  const cam = scene.cameras.main;
  sfx.shinyReveal();
  // Dim everything else for a beat.
  const dim = fullRect(scene, 0x05030a, 0).setDepth(depth - 2);
  scene.tweens.add({ targets: dim, fillAlpha: big ? 0.6 : 0.45, duration: 160, yoyo: true, hold: big ? 1000 : 450, onComplete: () => dim.destroy() });
  cam.flash(220, 255, 230, 140);

  // Spinning rays behind it.
  const rays = scene.add.image(x, y, ensureRays(scene)).setDepth(depth - 1).setTint(SHINY_GOLD).setBlendMode(Phaser.BlendModes.ADD).setScale(0.2).setAlpha(0);
  scene.tweens.add({ targets: rays, scale: big ? 1.25 : 0.9, alpha: 0.9, duration: 260, ease: 'Back.easeOut' });
  scene.tweens.add({ targets: rays, angle: 120, duration: big ? 1600 : 1000 });
  scene.tweens.add({ targets: rays, alpha: 0, scale: (big ? 1.25 : 0.9) * 1.2, delay: big ? 1100 : 650, duration: 450, onComplete: () => rays.destroy() });

  // Rings of light.
  for (let k = 0; k < (big ? 3 : 2); k++) {
    const ring = scene.add.circle(x, y, 20, 0, 0).setStrokeStyle(5 - k, RAINBOW[(k * 2) % RAINBOW.length], 1).setDepth(depth + 1);
    scene.tweens.add({ targets: ring, radius: 150 + k * 30, alpha: 0, delay: k * 140, duration: 700, ease: 'Cubic.easeOut', onComplete: () => ring.destroy() });
  }

  // A fountain of rainbow stars.
  const stars = scene.add.particles(x, y, ensureStar(scene), {
    speed: { min: 120, max: 320 },
    angle: { min: 0, max: 360 },
    scale: { start: 0.9, end: 0 },
    rotate: { start: 0, end: 360 },
    lifespan: { min: 500, max: 900 },
    tint: RAINBOW,
    blendMode: 'ADD',
    gravityY: 220,
    emitting: false,
  }).setDepth(depth + 2);
  stars.explode(big ? 46 : 28);
  scene.time.delayedCall(1400, () => stars.destroy());
  shinyBurst(scene, x, y, big ? 110 : 80, depth + 2, big ? 12 : 8);

  // It shimmers through the rainbow with a little hop.
  const sy = sprite.scaleY;
  const sx = sprite.scaleX;
  scene.tweens.add({ targets: sprite, scaleX: sx * 1.15, scaleY: sy * 1.15, yoyo: true, duration: 140, ease: 'Quad.easeOut' });
  RAINBOW.forEach((c, i) => scene.time.delayedCall(i * 90, () => sprite.active && sprite.setTint(c)));
  scene.time.delayedCall(RAINBOW.length * 90, () => sprite.active && sprite.clearTint());

  if (big) {
    // Under the Hexling, in the open field (never over the panels).
    const by = y + sprite.displayHeight * 0.5 + 56;
    const banner = scene.add
      .text(x, by, '✦ GILDED! ✦', {
        fontFamily: FONT,
        fontSize: '44px',
        fontStyle: 'bold',
        color: '#ffe27a',
        stroke: '#5a2a00',
        strokeThickness: 8,
        resolution: ZOOM,
      })
      .setOrigin(0.5)
      .setDepth(depth + 3)
      .setScale(3)
      .setAlpha(0);
    banner.setShadow(0, 0, '#ffb84d', 18, true, true);
    scene.tweens.add({ targets: banner, scale: 1, alpha: 1, duration: 220, ease: 'Back.easeOut' });
    scene.tweens.add({ targets: banner, angle: { from: -4, to: 4 }, yoyo: true, repeat: 3, duration: 160 });
    scene.tweens.add({ targets: banner, y: banner.y - 24, alpha: 0, delay: 1350, duration: 400, onComplete: () => banner.destroy() });
  }
  await wait(scene, big ? 1500 : 800);
  if (sprite.active) sprite.setDepth(home);
  // Raising its depth re-sorted it to the end of the draw order: the caller puts it back in place.
  restore?.();
}

// ------------------------------------------------------------ while it's on the field

export interface ShinyAura {
  destroy: () => void;
}

/** A shiny Hexling glitters the whole time it's out: rising rainbow stars and a pulsing gold glow. */
export function shinyAura(scene: Phaser.Scene, sprite: Phaser.GameObjects.Image): ShinyAura {
  const w = sprite.displayWidth * 0.4;
  const h = sprite.displayHeight * 0.4;
  const glitter = scene.add
    .particles(0, 0, ensureStar(scene), {
      follow: sprite,
      emitZone: { type: 'random', source: new Phaser.Geom.Ellipse(0, 0, w * 2, h * 2), quantity: 1 } as Phaser.Types.GameObjects.Particles.EmitZoneData,
      speedY: { min: -40, max: -15 },
      speedX: { min: -8, max: 8 },
      scale: { start: 0.55, end: 0 },
      alpha: { start: 1, end: 0 },
      lifespan: 900,
      frequency: 70,
      tint: RAINBOW,
      blendMode: 'ADD',
    })
    .setDepth(sprite.depth);
  // Just above its Hexling in the draw order, not above everything at a higher depth: a trainer
  // standing in front of it, and the panels and messages, stay on top.
  if (!sprite.parentContainer) scene.children.moveAbove(glitter as unknown as Phaser.GameObjects.GameObject, sprite);
  // A gold glow around the sprite where the renderer supports it (WebGL).
  sprite.preFX?.setPadding(6);
  const fx = sprite.preFX?.addGlow(SHINY_GOLD, 2, 0, false, 0.1, 6) ?? null;
  const pulse = fx ? scene.tweens.add({ targets: fx, outerStrength: 5, yoyo: true, repeat: -1, duration: 650, ease: 'Sine.easeInOut' }) : null;
  // A soft gold halo behind it (also where there's no glow effect).
  const halo = scene.add
    .ellipse(sprite.x, sprite.y, sprite.displayWidth * 0.9, sprite.displayHeight * 0.9, SHINY_GOLD, 0.22)
    .setDepth(sprite.depth - 0.5)
    .setBlendMode(Phaser.BlendModes.ADD);
  const haloPulse = scene.tweens.add({ targets: halo, scale: 1.15, fillAlpha: 0.4, yoyo: true, repeat: -1, duration: 650, ease: 'Sine.easeInOut' });
  const follow = () => {
    halo.setPosition(sprite.x, sprite.y).setVisible(sprite.visible && sprite.alpha > 0.3);
  };
  scene.events.on('update', follow);
  return {
    destroy: () => {
      glitter.destroy();
      pulse?.remove();
      haloPulse.remove();
      halo.destroy();
      scene.events.off('update', follow);
      if (fx && sprite.preFX) sprite.preFX.remove(fx);
    },
  };
}

// ------------------------------------------------------------ attacks

/** A shiny winds up: a rainbow shimmer and a spray of stars toward its target. */
export function shinyAttackStart(scene: Phaser.Scene, attacker: Phaser.GameObjects.Image, target: Phaser.GameObjects.Image) {
  sfx.shinyZing();
  RAINBOW.forEach((c, i) => scene.time.delayedCall(i * 45, () => attacker.active && attacker.setTint(c)));
  scene.time.delayedCall(RAINBOW.length * 45, () => attacker.active && attacker.clearTint());
  const a = Phaser.Math.Angle.Between(attacker.x, attacker.y, target.x, target.y);
  const deg = Phaser.Math.RadToDeg(a);
  const trail = scene.add
    .particles(attacker.x, attacker.y, ensureStar(scene), {
      speed: { min: 260, max: 520 },
      angle: { min: deg - 14, max: deg + 14 },
      scale: { start: 0.7, end: 0.1 },
      alpha: { start: 1, end: 0 },
      rotate: { start: 0, end: 360 },
      lifespan: 520,
      tint: RAINBOW,
      blendMode: 'ADD',
      emitting: false,
    })
    .setDepth(Math.max(attacker.depth, target.depth) + 2);
  trail.explode(18);
  scene.time.delayedCall(140, () => trail.explode(14));
  scene.time.delayedCall(900, () => trail.destroy());
}

/** A shiny's hit lands: a gold star ring and rainbow sparks on the target. */
export function shinyImpact(scene: Phaser.Scene, at: { x: number; y: number }, depth: number) {
  sfx.shinyHit();
  const ring = scene.add.circle(at.x, at.y, 14, 0, 0).setStrokeStyle(4, SHINY_GOLD, 1).setDepth(depth);
  scene.tweens.add({ targets: ring, radius: 90, alpha: 0, duration: 420, ease: 'Cubic.easeOut', onComplete: () => ring.destroy() });
  const sparks = scene.add
    .particles(at.x, at.y, ensureStar(scene), {
      speed: { min: 100, max: 260 },
      angle: { min: 0, max: 360 },
      scale: { start: 0.75, end: 0 },
      lifespan: 600,
      tint: RAINBOW,
      blendMode: 'ADD',
      emitting: false,
    })
    .setDepth(depth);
  sparks.explode(22);
  scene.time.delayedCall(800, () => sparks.destroy());
  shinyBurst(scene, at.x, at.y, 70, depth, 6);
}
