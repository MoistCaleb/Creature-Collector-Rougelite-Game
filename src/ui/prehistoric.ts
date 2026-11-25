import Phaser from 'phaser';
import { sfx } from './sound';
import { FONT, fullRect, placeAbove, ZOOM } from './widgets';

/**
 * Prehistoric Hexlings get the same big moments a Gilded one does, in their own style: the ground
 * rumbles, rocks and dust fall, amber light breaks through, and a "PREHISTORIC!" banner lands.
 * While one is out it gives off a warm amber glow and drifting dust; its attacks shed rock.
 * (Camera shakes and flashes respect Reduce motion through the motion guard.)
 */

/** Prehistoric amber, and the earthy colours its dust and rock come in. */
export const AMBER = 0xe8a95a;
export const AMBER_TEXT = '#e8a95a';
const EARTH = [0xe8a95a, 0xffc870, 0xb07a3a, 0x8a5a2a, 0xe6d8b0];

/** A chunky rock fragment (white, tinted per particle). */
function ensureRock(scene: Phaser.Scene): string {
  const key = 'prehistoric-rock';
  if (scene.textures.exists(key)) return key;
  const g = scene.make.graphics({}, false);
  g.fillStyle(0xffffff, 1);
  g.fillPoints([new Phaser.Math.Vector2(3, 0), new Phaser.Math.Vector2(10, 1), new Phaser.Math.Vector2(12, 7), new Phaser.Math.Vector2(8, 12), new Phaser.Math.Vector2(1, 10), new Phaser.Math.Vector2(0, 4)], true);
  g.generateTexture(key, 12, 12);
  g.destroy();
  return key;
}

/** A soft round mote of dust or amber (white, tinted). */
function ensureMote(scene: Phaser.Scene): string {
  const key = 'prehistoric-mote';
  if (scene.textures.exists(key)) return key;
  const g = scene.make.graphics({}, false);
  g.fillStyle(0xffffff, 0.35);
  g.fillCircle(8, 8, 8);
  g.fillStyle(0xffffff, 1);
  g.fillCircle(8, 8, 4);
  g.generateTexture(key, 16, 16);
  g.destroy();
  return key;
}

/** Broad shafts of light, fewer and wider than a Gilded one's rays. */
function ensureShafts(scene: Phaser.Scene): string {
  const key = 'prehistoric-shafts';
  if (scene.textures.exists(key)) return key;
  const g = scene.make.graphics({}, false);
  const R = 160;
  const n = 8;
  for (let i = 0; i < n; i++) {
    const a = (i / n) * Math.PI * 2;
    const w = 0.18;
    g.fillStyle(0xffffff, i % 2 ? 0.3 : 0.55);
    g.fillTriangle(R, R, R + Math.cos(a - w) * R, R + Math.sin(a - w) * R, R + Math.cos(a + w) * R, R + Math.sin(a + w) * R);
  }
  g.generateTexture(key, R * 2, R * 2);
  g.destroy();
  return key;
}

const wait = (scene: Phaser.Scene, ms: number) => new Promise<void>((r) => scene.time.delayedCall(ms, r));

/**
 * A Prehistoric Hexling has just appeared: the ground shakes, rocks rain down, amber light breaks
 * out behind it and it glows through the colours of old stone. `big` (the first look at a foe)
 * adds the banner and the longer hold.
 */
export async function prehistoricReveal(scene: Phaser.Scene, sprite: Phaser.GameObjects.Image, big = true, restore?: () => void): Promise<void> {
  const { x, y } = sprite;
  const home = sprite.depth;
  const depth = 40;
  sprite.setDepth(depth);
  const cam = scene.cameras.main;
  sfx.prehistoricReveal();
  const dim = fullRect(scene, 0x0a0602, 0).setDepth(depth - 2);
  scene.tweens.add({ targets: dim, fillAlpha: big ? 0.6 : 0.45, duration: 160, yoyo: true, hold: big ? 1000 : 450, onComplete: () => dim.destroy() });
  cam.shake(big ? 520 : 300, big ? 0.012 : 0.006);
  cam.flash(200, 232, 169, 90);

  // Amber light breaking out behind it.
  const shafts = scene.add.image(x, y, ensureShafts(scene)).setDepth(depth - 1).setTint(AMBER).setBlendMode(Phaser.BlendModes.ADD).setScale(0.2).setAlpha(0);
  scene.tweens.add({ targets: shafts, scale: big ? 1.3 : 0.95, alpha: 0.85, duration: 300, ease: 'Back.easeOut' });
  scene.tweens.add({ targets: shafts, angle: -60, duration: big ? 1600 : 1000 });
  scene.tweens.add({ targets: shafts, alpha: 0, delay: big ? 1100 : 650, duration: 450, onComplete: () => shafts.destroy() });

  // A shockwave along the ground.
  for (let k = 0; k < (big ? 2 : 1); k++) {
    const ring = scene.add.ellipse(x, y + sprite.displayHeight * 0.4, 30, 10, 0, 0).setStrokeStyle(5 - k * 2, k ? 0xb07a3a : AMBER, 1).setDepth(depth + 1);
    scene.tweens.add({ targets: ring, scaleX: 9 + k * 2, scaleY: 6 + k, alpha: 0, delay: k * 160, duration: 650, ease: 'Cubic.easeOut', onComplete: () => ring.destroy() });
  }

  // Rocks raining down around it, and dust thrown up from the ground.
  const rocks = scene.add.particles(x, y - 160, ensureRock(scene), {
    x: { min: -140, max: 140 },
    speedY: { min: 80, max: 200 },
    speedX: { min: -30, max: 30 },
    gravityY: 700,
    rotate: { min: 0, max: 360 },
    scale: { min: 0.8, max: 1.8 },
    lifespan: 900,
    tint: [0x8a5a2a, 0xb07a3a, 0x6a4020],
    emitting: false,
  }).setDepth(depth + 2);
  rocks.explode(big ? 26 : 14);
  const dust = scene.add.particles(x, y + sprite.displayHeight * 0.35, ensureMote(scene), {
    speed: { min: 60, max: 220 },
    angle: { min: 190, max: 350 },
    scale: { start: 1.2, end: 0 },
    alpha: { start: 0.8, end: 0 },
    lifespan: { min: 500, max: 1000 },
    tint: EARTH,
    gravityY: 120,
    emitting: false,
  }).setDepth(depth + 2);
  dust.explode(big ? 40 : 24);
  scene.time.delayedCall(1400, () => {
    rocks.destroy();
    dust.destroy();
  });

  // It stomps once and glows through amber and old stone.
  const sy = sprite.scaleY;
  const sx = sprite.scaleX;
  scene.tweens.add({ targets: sprite, scaleX: sx * 1.18, scaleY: sy * 0.9, yoyo: true, duration: 120, ease: 'Quad.easeOut' });
  EARTH.forEach((c, i) => scene.time.delayedCall(i * 110, () => sprite.active && sprite.setTint(c)));
  scene.time.delayedCall(EARTH.length * 110, () => sprite.active && sprite.clearTint());

  if (big) {
    const by = y + sprite.displayHeight * 0.5 + 56;
    const banner = scene.add
      .text(x, by, '◈ PREHISTORIC! ◈', {
        fontFamily: FONT,
        fontSize: '32px',
        fontStyle: 'bold',
        color: '#ffc870',
        stroke: '#3a2008',
        strokeThickness: 8,
        resolution: ZOOM,
      })
      .setOrigin(0.5)
      .setDepth(depth + 3)
      .setScale(0.4)
      .setAlpha(0);
    banner.setShadow(0, 0, '#e08a2e', 16, true, true);
    // It drops in and lands with a thud (a Gilded banner spins in; this one is heavy).
    banner.y -= 60;
    scene.tweens.add({ targets: banner, y: by, scale: 1, alpha: 1, duration: 260, ease: 'Bounce.easeOut' });
    scene.tweens.add({ targets: banner, y: by - 24, alpha: 0, delay: 1350, duration: 400, onComplete: () => banner.destroy() });
  }
  await wait(scene, big ? 1500 : 800);
  if (sprite.active) sprite.setDepth(home);
  restore?.();
}

/** A Prehistoric Hexling glows amber the whole time it's out, with dust drifting up around it. */
export function prehistoricAura(scene: Phaser.Scene, sprite: Phaser.GameObjects.Image): { destroy: () => void } {
  const w = sprite.displayWidth * 0.4;
  const h = sprite.displayHeight * 0.4;
  const motes = scene.add
    .particles(0, 0, ensureMote(scene), {
      follow: sprite,
      emitZone: { type: 'random', source: new Phaser.Geom.Ellipse(0, 0, w * 2, h * 2), quantity: 1 } as Phaser.Types.GameObjects.Particles.EmitZoneData,
      speedY: { min: -26, max: -10 },
      speedX: { min: -6, max: 6 },
      scale: { start: 0.45, end: 0 },
      alpha: { start: 0.9, end: 0 },
      lifespan: 1300,
      frequency: 90,
      tint: EARTH,
      blendMode: 'ADD',
    })
    .setDepth(sprite.depth);
  if (!sprite.parentContainer) placeAbove(scene.children, motes, sprite);
  sprite.preFX?.setPadding(6);
  const fx = sprite.preFX?.addGlow(AMBER, 2, 0, false, 0.1, 6) ?? null;
  const pulse = fx ? scene.tweens.add({ targets: fx, outerStrength: 4.5, yoyo: true, repeat: -1, duration: 900, ease: 'Sine.easeInOut' }) : null;
  const halo = scene.add
    .ellipse(sprite.x, sprite.y, sprite.displayWidth * 0.9, sprite.displayHeight * 0.9, AMBER, 0.2)
    .setDepth(sprite.depth - 0.5)
    .setBlendMode(Phaser.BlendModes.ADD);
  const haloPulse = scene.tweens.add({ targets: halo, scale: 1.12, fillAlpha: 0.36, yoyo: true, repeat: -1, duration: 900, ease: 'Sine.easeInOut' });
  const follow = () => halo.setPosition(sprite.x, sprite.y).setVisible(sprite.visible && sprite.alpha > 0.3);
  scene.events.on('update', follow);
  const destroy = () => {
    scene.events.off('update', follow);
    scene.events.off('shutdown', destroy);
    motes.destroy();
    pulse?.remove();
    haloPulse.remove();
    halo.destroy();
    if (fx && sprite.preFX) sprite.preFX.remove(fx);
  };
  scene.events.once('shutdown', destroy);
  return { destroy };
}

/** A Prehistoric Hexling winds up: an amber flare and a spray of rock toward its target. */
export function prehistoricAttackStart(scene: Phaser.Scene, attacker: Phaser.GameObjects.Image, target: Phaser.GameObjects.Image) {
  sfx.prehistoricGrowl();
  EARTH.slice(0, 3).forEach((c, i) => scene.time.delayedCall(i * 60, () => attacker.active && attacker.setTint(c)));
  scene.time.delayedCall(180, () => attacker.active && attacker.clearTint());
  const deg = Phaser.Math.RadToDeg(Phaser.Math.Angle.Between(attacker.x, attacker.y, target.x, target.y));
  const trail = scene.add
    .particles(attacker.x, attacker.y, ensureRock(scene), {
      speed: { min: 240, max: 460 },
      angle: { min: deg - 12, max: deg + 12 },
      scale: { start: 1.1, end: 0.3 },
      alpha: { start: 1, end: 0 },
      rotate: { start: 0, end: 360 },
      lifespan: 500,
      tint: [AMBER, 0xb07a3a, 0x8a5a2a],
      emitting: false,
    })
    .setDepth(Math.max(attacker.depth, target.depth) + 2);
  trail.explode(16);
  scene.time.delayedCall(900, () => trail.destroy());
}

/** A Prehistoric Hexling's hit lands: an amber crack ring and rock shards on the target. */
export function prehistoricImpact(scene: Phaser.Scene, at: { x: number; y: number }, depth: number) {
  sfx.prehistoricHit();
  const ring = scene.add.circle(at.x, at.y, 14, 0, 0).setStrokeStyle(5, AMBER, 1).setDepth(depth);
  scene.tweens.add({ targets: ring, radius: 80, alpha: 0, duration: 400, ease: 'Cubic.easeOut', onComplete: () => ring.destroy() });
  const shards = scene.add
    .particles(at.x, at.y, ensureRock(scene), {
      speed: { min: 120, max: 280 },
      angle: { min: 0, max: 360 },
      scale: { start: 1, end: 0.2 },
      rotate: { start: 0, end: 360 },
      gravityY: 400,
      lifespan: 650,
      tint: [AMBER, 0xb07a3a, 0x6a4020],
      emitting: false,
    })
    .setDepth(depth);
  shards.explode(18);
  scene.time.delayedCall(800, () => shards.destroy());
}
