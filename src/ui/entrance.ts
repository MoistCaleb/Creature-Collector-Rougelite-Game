import Phaser from 'phaser';
import type { Element } from '../data/types';
import { sfx } from './sound';

/**
 * How creatures enter battle.
 * - Yours, and trainers' and guardians', are released from a glowing hexagon (and recalled into one).
 * - Wild creatures burst out of the terrain that suits their main element: grass, rocks or water.
 */

export type Terrain = 'grass' | 'rocks' | 'water';

export function terrainFor(el: Element): Terrain {
  if (el === 'Water' || el === 'Frost') return 'water';
  if (el === 'Earth' || el === 'Metal' || el === 'Fire' || el === 'Dragon') return 'rocks';
  return 'grass';
}

interface Home {
  x: number;
  y: number;
  scale: number;
}

const tween = (scene: Phaser.Scene, cfg: Phaser.Types.Tweens.TweenBuilderConfig) =>
  new Promise<void>((res) => scene.tweens.add({ ...cfg, onComplete: () => res() }));

/** Where the creature's feet are (the sprite's bottom edge). */
const groundOf = (s: Phaser.GameObjects.Image, home: Home) => home.y + s.height * home.scale * 0.5;

/** Draw `obj` just underneath the sprite (above the backdrop and shadow). */
function behind(scene: Phaser.Scene, obj: Phaser.GameObjects.GameObject, s: Phaser.GameObjects.Image) {
  scene.children.moveBelow(obj as never, s as never);
}

/** A flat hexagon on the ground, drawn around (0, 0). */
function hexGraphic(scene: Phaser.Scene, x: number, y: number, w: number, h: number, color: number, depth: number) {
  const g = scene.add.graphics({ x, y }).setDepth(depth);
  const pts = [
    new Phaser.Math.Vector2(-w / 2, 0),
    new Phaser.Math.Vector2(-w / 4, -h / 2),
    new Phaser.Math.Vector2(w / 4, -h / 2),
    new Phaser.Math.Vector2(w / 2, 0),
    new Phaser.Math.Vector2(w / 4, h / 2),
    new Phaser.Math.Vector2(-w / 4, h / 2),
  ];
  g.fillStyle(color, 0.35);
  g.fillPoints(pts, true);
  g.lineStyle(3, color, 1);
  g.strokePoints(pts, true);
  g.lineStyle(1.5, 0xffffff, 0.9);
  g.strokePoints(
    pts.map((p) => new Phaser.Math.Vector2(p.x * 0.7, p.y * 0.7)),
    true,
  );
  return g;
}

/** Light column rising from the hexagon. */
function beam(scene: Phaser.Scene, x: number, ground: number, color: number, depth: number) {
  const b = scene.add.rectangle(x, ground, 64, 190, color, 0.55).setOrigin(0.5, 1).setDepth(depth).setBlendMode(Phaser.BlendModes.ADD);
  const core = scene.add.rectangle(x, ground, 22, 190, 0xffffff, 0.8).setOrigin(0.5, 1).setDepth(depth).setBlendMode(Phaser.BlendModes.ADD);
  b.scaleX = 0;
  core.scaleX = 0;
  return [b, core];
}

/** Sparks flying up out of the hexagon. */
function sparks(scene: Phaser.Scene, x: number, ground: number, color: number, depth: number) {
  for (let i = 0; i < 10; i++) {
    const p = scene.add.rectangle(x + Phaser.Math.Between(-40, 40), ground, 4, 4, i % 2 ? color : 0xffffff).setDepth(depth);
    void tween(scene, {
      targets: p,
      y: ground - Phaser.Math.Between(60, 150),
      alpha: 0,
      duration: Phaser.Math.Between(350, 650),
      ease: 'Quad.easeOut',
    }).then(() => p.destroy());
  }
}

/** Release a creature from a hexagon. The sprite should already show the creature at its home spot. */
export async function releaseFromHex(scene: Phaser.Scene, s: Phaser.GameObjects.Image, color: number) {
  const home: Home = { x: s.x, y: s.y, scale: s.scale };
  const ground = groundOf(s, home);
  const depth = s.depth;
  const hex = hexGraphic(scene, home.x, ground - 8, 130, 44, color, depth).setScale(0);
  behind(scene, hex, s);
  s.setVisible(false);
  await tween(scene, { targets: hex, scale: 1, duration: 200, ease: 'Back.easeOut' });
  sfx.release();
  const beams = beam(scene, home.x, ground - 8, color, depth);
  await tween(scene, { targets: beams, scaleX: 1, duration: 120, ease: 'Quad.easeOut' });
  sparks(scene, home.x, ground - 8, color, depth);
  // The creature forms inside the light, growing up out of the hexagon.
  s.setVisible(true).setAlpha(1).setScale(home.scale * 0.15).setPosition(home.x, ground - 10).setTintFill(0xffffff);
  await tween(scene, { targets: s, scale: home.scale, y: home.y, duration: 280, ease: 'Back.easeOut' });
  s.clearTint();
  scene.cameras.main.flash(90, 255, 255, 255, true);
  await tween(scene, { targets: beams, scaleX: 0, alpha: 0, duration: 160 });
  beams.forEach((b) => b.destroy());
  void tween(scene, { targets: hex, alpha: 0, scale: 1.25, duration: 320 }).then(() => hex.destroy());
}

/** Call a creature back into its hexagon. */
export async function recallToHex(scene: Phaser.Scene, s: Phaser.GameObjects.Image, color: number) {
  const home: Home = { x: s.x, y: s.y, scale: s.scale };
  const ground = groundOf(s, home);
  const depth = s.depth;
  const hex = hexGraphic(scene, home.x, ground - 8, 130, 44, color, depth).setScale(0);
  behind(scene, hex, s);
  void tween(scene, { targets: hex, scale: 1, duration: 160, ease: 'Back.easeOut' });
  sfx.recall();
  const beams = beam(scene, home.x, ground - 8, color, depth);
  await tween(scene, { targets: beams, scaleX: 1, duration: 110 });
  s.setTintFill(0xff6a6a);
  await tween(scene, { targets: s, scale: home.scale * 0.1, y: ground - 8, alpha: 0.4, duration: 240, ease: 'Quad.easeIn' });
  s.setVisible(false).clearTint().setScale(home.scale).setPosition(home.x, home.y).setAlpha(1);
  await tween(scene, { targets: beams, scaleX: 0, alpha: 0, duration: 120 });
  beams.forEach((b) => b.destroy());
  await tween(scene, { targets: hex, alpha: 0, scale: 0.6, duration: 160 });
  hex.destroy();
}

// ------------------------------------------------------------ wild creatures

/** The creature springs up from its feet: origin at the bottom, growing taller with a bounce. */
async function sprout(scene: Phaser.Scene, s: Phaser.GameObjects.Image, home: Home, ground: number, ms: number) {
  s.setVisible(true).setAlpha(1).setOrigin(0.5, 1).setPosition(home.x, ground).setScale(home.scale * 0.8, 0.01);
  await tween(scene, { targets: s, scaleY: home.scale, scaleX: home.scale, duration: ms, ease: 'Back.easeOut' });
  // Back to a centered origin at the same visual spot.
  s.setOrigin(0.5, 0.5).setPosition(home.x, home.y);
}

/** Flying bits (leaves, pebbles, droplets) arcing out from the ground. */
function debris(scene: Phaser.Scene, x: number, ground: number, colors: number[], n: number, depth: number, size: [number, number], spread = 90) {
  for (let i = 0; i < n; i++) {
    const w = Phaser.Math.Between(size[0], size[1]);
    const p = scene.add.rectangle(x + Phaser.Math.Between(-30, 30), ground - 6, w, w, colors[i % colors.length]).setDepth(depth);
    const dx = Phaser.Math.Between(-spread, spread);
    const up = Phaser.Math.Between(40, 110);
    const ms = Phaser.Math.Between(450, 750);
    // Up, then down: two chained tweens make a simple arc.
    void tween(scene, { targets: p, x: p.x + dx * 0.6, y: ground - up, angle: Phaser.Math.Between(-180, 180), duration: ms * 0.45, ease: 'Quad.easeOut' })
      .then(() => tween(scene, { targets: p, x: p.x + dx * 0.4, y: ground + 10, alpha: 0, duration: ms * 0.55, ease: 'Quad.easeIn' }))
      .then(() => p.destroy());
  }
}

function grassTufts(scene: Phaser.Scene, x: number, ground: number, depth: number) {
  const g = scene.add.graphics({ x, y: ground }).setDepth(depth);
  const blades = [-64, -46, -30, -14, 0, 14, 30, 46, 64];
  blades.forEach((bx, i) => {
    const h = 26 + ((i * 37) % 22);
    g.fillStyle(i % 2 ? 0x3f9a4a : 0x5ad06a, 1);
    g.fillTriangle(bx - 9, 6, bx + 9, 6, bx + (i % 2 ? 4 : -4), -h);
    g.fillStyle(0x2f7a3e, 1);
    g.fillTriangle(bx - 3, 6, bx + 7, 6, bx + (i % 2 ? -6 : 6), -h * 0.7);
  });
  return g;
}

function rockPile(scene: Phaser.Scene, x: number, ground: number, depth: number) {
  const rocks: Phaser.GameObjects.Graphics[] = [];
  const spots: [number, number, number][] = [
    [-50, 4, 20],
    [-22, -6, 26],
    [10, 2, 24],
    [40, -4, 22],
    [62, 6, 16],
    [-6, 10, 18],
  ];
  for (const [dx, dy, r] of spots) {
    const g = scene.add.graphics({ x: x + dx, y: ground + dy }).setDepth(depth);
    g.fillStyle(0x7a7468, 1);
    g.fillPoints(
      [0, 1, 2, 3, 4, 5, 6].map((k) => {
        const a = (k / 7) * Math.PI * 2;
        const rr = r * (0.8 + ((k * 13 + r) % 5) * 0.06);
        return new Phaser.Math.Vector2(Math.cos(a) * rr, Math.sin(a) * rr * 0.75);
      }),
      true,
    );
    g.fillStyle(0xa09a8c, 1);
    g.fillCircle(-r * 0.25, -r * 0.25, r * 0.35);
    rocks.push(g);
  }
  return rocks;
}

/** A wild creature bursts out of grass, rocks or water. */
export async function emergeFrom(scene: Phaser.Scene, s: Phaser.GameObjects.Image, terrain: Terrain) {
  const home: Home = { x: s.x, y: s.y, scale: s.scale };
  const ground = groundOf(s, home);
  const front = s.depth;
  s.setVisible(false);

  if (terrain === 'grass') {
    const tufts = grassTufts(scene, home.x, ground, front);
    // The grass rustles, then the creature leaps out.
    await tween(scene, { targets: tufts, x: home.x + 5, yoyo: true, repeat: 2, duration: 70 });
    sfx.rustle();
    debris(scene, home.x, ground, [0x5ad06a, 0x3f9a4a, 0x9be07a], 14, front, [3, 6]);
    await sprout(scene, s, home, ground, 320);
    await tween(scene, { targets: tufts, alpha: 0, y: ground + 14, duration: 350 });
    tufts.destroy();
    return;
  }

  if (terrain === 'rocks') {
    const rocks = rockPile(scene, home.x, ground, front);
    await tween(scene, { targets: rocks, x: '+=4', yoyo: true, repeat: 3, duration: 50 });
    sfx.rocks();
    scene.cameras.main.shake(180, 0.006);
    // The pile bursts apart as the creature pushes up.
    rocks.forEach((r, i) => {
      const dir = r.x < home.x ? -1 : 1;
      void tween(scene, { targets: r, x: r.x + dir * (40 + i * 8), y: r.y - 50, angle: dir * 90, duration: 260, ease: 'Quad.easeOut' })
        .then(() => tween(scene, { targets: r, y: ground + 30, alpha: 0, duration: 300, ease: 'Quad.easeIn' }))
        .then(() => r.destroy());
    });
    debris(scene, home.x, ground, [0x7a7468, 0xa09a8c, 0x5a554c], 12, front, [3, 7]);
    await sprout(scene, s, home, ground, 300);
    return;
  }

  // Water: a pool forms, ripples spread, and the creature rises with a splash.
  const pool = scene.add.ellipse(home.x, ground - 6, 10, 4, 0x3f86e0, 0.8).setDepth(s.depth);
  behind(scene, pool, s);
  await tween(scene, { targets: pool, width: 170, height: 46, duration: 220, ease: 'Quad.easeOut' });
  for (let i = 0; i < 3; i++) {
    const ring = scene.add.ellipse(home.x, ground - 6, 40, 14).setStrokeStyle(2, 0x8fdcf0, 1).setDepth(s.depth);
    behind(scene, ring, s);
    void tween(scene, { targets: ring, scaleX: 4, scaleY: 3.2, alpha: 0, duration: 600, delay: i * 140 }).then(() => ring.destroy());
  }
  sfx.splash();
  debris(scene, home.x, ground, [0x8fdcf0, 0x4aa0f0, 0xffffff], 16, front, [3, 5], 70);
  const splash = scene.add.ellipse(home.x, ground, 120, 34, 0x8fdcf0, 0.8).setDepth(front);
  void tween(scene, { targets: splash, scaleY: 0.2, alpha: 0, duration: 420 }).then(() => splash.destroy());
  await sprout(scene, s, home, ground, 340);
  await tween(scene, { targets: pool, alpha: 0, scaleX: 1.2, duration: 380 });
  pool.destroy();
}
