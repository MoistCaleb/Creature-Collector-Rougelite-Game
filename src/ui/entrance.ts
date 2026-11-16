import Phaser from 'phaser';
import type { Element } from '../data/types';
import { sfx } from './sound';

/**
 * How creatures enter battle.
 * - Yours, and trainers' and guardians', are released from a glowing hexagon (and recalled into one).
 * - Wild creatures burst out of something that matches their main element: grass, flames, rocks,
 *   scrap metal, ice, water, sludge, shadow, a storm cloud, sunlight, mist or dragon stones.
 */


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

/** Flying bits (leaves, pebbles, droplets, embers) arcing out from the ground. */
function debris(scene: Phaser.Scene, x: number, ground: number, colors: number[], n: number, depth: number, size: [number, number], spread = 90, rise = false) {
  for (let i = 0; i < n; i++) {
    const w = Phaser.Math.Between(size[0], size[1]);
    const p = scene.add.rectangle(x + Phaser.Math.Between(-30, 30), ground - 6, w, w, colors[i % colors.length]).setDepth(depth);
    const dx = Phaser.Math.Between(-spread, spread);
    const up = Phaser.Math.Between(40, 110);
    const ms = Phaser.Math.Between(450, 750);
    if (rise) {
      // Embers, bubbles and sparks float up and fade.
      void tween(scene, { targets: p, x: p.x + dx * 0.4, y: ground - up * 1.6, alpha: 0, duration: ms * 1.3, ease: 'Sine.easeOut' }).then(() => p.destroy());
      continue;
    }
    // Up, then down: two chained tweens make a simple arc.
    void tween(scene, { targets: p, x: p.x + dx * 0.6, y: ground - up, angle: Phaser.Math.Between(-180, 180), duration: ms * 0.45, ease: 'Quad.easeOut' })
      .then(() => tween(scene, { targets: p, x: p.x + dx * 0.4, y: ground + 10, alpha: 0, duration: ms * 0.55, ease: 'Quad.easeIn' }))
      .then(() => p.destroy());
  }
}

/** Ground cover the creature hides in: blades of grass or tongues of flame. */
function cover(scene: Phaser.Scene, x: number, ground: number, depth: number, colors: [number, number, number], tall: number) {
  const g = scene.add.graphics({ x, y: ground }).setDepth(depth);
  [-64, -46, -30, -14, 0, 14, 30, 46, 64].forEach((bx, i) => {
    const h = tall + ((i * 37) % 22);
    g.fillStyle(colors[i % 2], 1);
    g.fillTriangle(bx - 9, 6, bx + 9, 6, bx + (i % 2 ? 4 : -4), -h);
    g.fillStyle(colors[2], 1);
    g.fillTriangle(bx - 3, 6, bx + 7, 6, bx + (i % 2 ? -6 : 6), -h * 0.6);
  });
  return g;
}

type ChunkShape = 'round' | 'square' | 'shard';

/** A heap of chunks (rocks, scrap, ice, scales) that bursts apart. */
function pile(scene: Phaser.Scene, x: number, ground: number, depth: number, colors: [number, number], shape: ChunkShape) {
  const spots: [number, number, number][] = [
    [-50, 4, 20],
    [-22, -6, 26],
    [10, 2, 24],
    [40, -4, 22],
    [62, 6, 16],
    [-6, 10, 18],
  ];
  return spots.map(([dx, dy, r], n) => {
    const g = scene.add.graphics({ x: x + dx, y: ground + dy }).setDepth(depth);
    g.fillStyle(colors[0], 1);
    if (shape === 'square') {
      g.fillRect(-r * 0.8, -r * 0.6, r * 1.6, r * 1.2);
      g.fillStyle(colors[1], 1);
      g.fillRect(-r * 0.6, -r * 0.45, r * 0.7, r * 0.25);
    } else if (shape === 'shard') {
      g.fillTriangle(-r * 0.7, r * 0.5, r * 0.7, r * 0.5, (n % 2 ? 0.25 : -0.25) * r, -r * 1.3);
      g.fillStyle(colors[1], 1);
      g.fillTriangle(-r * 0.2, r * 0.3, r * 0.15, r * 0.3, (n % 2 ? 0.2 : -0.2) * r, -r * 0.9);
    } else {
      g.fillPoints(
        [0, 1, 2, 3, 4, 5, 6].map((k) => {
          const a = (k / 7) * Math.PI * 2;
          const rr = r * (0.8 + ((k * 13 + r) % 5) * 0.06);
          return new Phaser.Math.Vector2(Math.cos(a) * rr, Math.sin(a) * rr * 0.75);
        }),
        true,
      );
      g.fillStyle(colors[1], 1);
      g.fillCircle(-r * 0.25, -r * 0.25, r * 0.35);
    }
    return g;
  });
}

interface Look {
  kind: 'cover' | 'pile' | 'pool' | 'sky';
  colors: number[];
  bits: number[];
  shape?: ChunkShape;
  sound: 'rustle' | 'rocks' | 'splash' | 'release';
  /** Pools: what rises out of them. */
  extra?: 'ripples' | 'bubbles' | 'smoke';
  /** Sky: what comes down. */
  sky?: 'bolt' | 'rays' | 'mist';
  tall?: number;
}

/** What each element's wild creatures emerge from. */
const LOOKS: Record<Element, Look> = {
  Nature: { kind: 'cover', colors: [0x5ad06a, 0x3f9a4a, 0x2f7a3e], bits: [0x5ad06a, 0x3f9a4a, 0x9be07a], sound: 'rustle', tall: 26 },
  Fire: { kind: 'cover', colors: [0xff8a3a, 0xe0524a, 0xffd23f], bits: [0xffd23f, 0xff8a3a, 0xffffff], sound: 'rustle', tall: 34 },
  Earth: { kind: 'pile', colors: [0x8a6a44, 0xb08c5c], bits: [0x8a6a44, 0xb08c5c, 0x5a4530], shape: 'round', sound: 'rocks' },
  Metal: { kind: 'pile', colors: [0x7f8a96, 0xd0d8e0], bits: [0x7f8a96, 0xd0d8e0, 0x4a525c], shape: 'square', sound: 'rocks' },
  Frost: { kind: 'pile', colors: [0x8fdcf0, 0xffffff], bits: [0x8fdcf0, 0xffffff, 0x5ab0d0], shape: 'shard', sound: 'rocks' },
  Dragon: { kind: 'pile', colors: [0x7a3a9a, 0xd08aff], bits: [0x7a3a9a, 0xd08aff, 0xff8a3a], shape: 'shard', sound: 'rocks' },
  Water: { kind: 'pool', colors: [0x3f86e0, 0x8fdcf0], bits: [0x8fdcf0, 0x4aa0f0, 0xffffff], sound: 'splash', extra: 'ripples' },
  Toxic: { kind: 'pool', colors: [0x8a3ab0, 0x9be05a], bits: [0x9be05a, 0xb05ae0, 0x6ad04a], sound: 'splash', extra: 'bubbles' },
  Shadow: { kind: 'pool', colors: [0x1a1426, 0x6a4a9a], bits: [0x4a3a6a, 0x2a2040, 0x8a6ab0], sound: 'splash', extra: 'smoke' },
  Storm: { kind: 'sky', colors: [0x4a4a60, 0xf0d040], bits: [0xf0d040, 0xffffff], sound: 'rocks', sky: 'bolt' },
  Light: { kind: 'sky', colors: [0xfff3b0, 0xffffff], bits: [0xfff3b0, 0xffd23f, 0xffffff], sound: 'release', sky: 'rays' },
  Spirit: { kind: 'sky', colors: [0xf0a0d0, 0xc8c4f0], bits: [0xf0a0d0, 0xffffff, 0xc8c4f0], sound: 'release', sky: 'mist' },
};

/** A wild creature bursts out of something that matches its main element. */
export async function emergeFrom(scene: Phaser.Scene, s: Phaser.GameObjects.Image, el: Element) {
  const home: Home = { x: s.x, y: s.y, scale: s.scale };
  const ground = groundOf(s, home);
  const front = s.depth;
  const look = LOOKS[el];
  s.setVisible(false);

  if (look.kind === 'cover') {
    const c = cover(scene, home.x, ground, front, look.colors as [number, number, number], look.tall ?? 26);
    // Grass rustles; flames flicker.
    if (el === 'Fire') await tween(scene, { targets: c, scaleY: 1.15, yoyo: true, repeat: 2, duration: 70 });
    else await tween(scene, { targets: c, x: home.x + 5, yoyo: true, repeat: 2, duration: 70 });
    sfx[look.sound]();
    debris(scene, home.x, ground, look.bits, 14, front, [3, 6], 90, el === 'Fire');
    await sprout(scene, s, home, ground, 320);
    await tween(scene, { targets: c, alpha: 0, y: ground + 14, scaleY: el === 'Fire' ? 0.2 : 1, duration: 350 });
    c.destroy();
    return;
  }

  if (look.kind === 'pile') {
    const chunks = pile(scene, home.x, ground, front, look.colors as [number, number], look.shape ?? 'round');
    await tween(scene, { targets: chunks, x: '+=4', yoyo: true, repeat: 3, duration: 50 });
    sfx.rocks();
    scene.cameras.main.shake(180, 0.006);
    // The heap bursts apart as the creature pushes up.
    chunks.forEach((r, i) => {
      const dir = r.x < home.x ? -1 : 1;
      void tween(scene, { targets: r, x: r.x + dir * (40 + i * 8), y: r.y - 50, angle: dir * 90, duration: 260, ease: 'Quad.easeOut' })
        .then(() => tween(scene, { targets: r, y: ground + 30, alpha: 0, duration: 300, ease: 'Quad.easeIn' }))
        .then(() => r.destroy());
    });
    debris(scene, home.x, ground, look.bits, 12, front, [3, 7]);
    await sprout(scene, s, home, ground, 300);
    return;
  }

  if (look.kind === 'pool') {
    // A pool spreads, something stirs in it, and the creature rises out.
    const pool = scene.add.ellipse(home.x, ground - 6, 10, 4, look.colors[0], 0.85).setDepth(s.depth);
    behind(scene, pool, s);
    await tween(scene, { targets: pool, width: 170, height: 46, duration: 220, ease: 'Quad.easeOut' });
    for (let i = 0; i < 3; i++) {
      const ring = scene.add.ellipse(home.x, ground - 6, 40, 14).setStrokeStyle(2, look.colors[1], 1).setDepth(s.depth);
      behind(scene, ring, s);
      void tween(scene, { targets: ring, scaleX: 4, scaleY: 3.2, alpha: 0, duration: 600, delay: i * 140 }).then(() => ring.destroy());
    }
    sfx.splash();
    if (look.extra === 'smoke') {
      for (let i = 0; i < 7; i++) {
        const puff = scene.add.circle(home.x + Phaser.Math.Between(-60, 60), ground - 6, Phaser.Math.Between(10, 18), look.bits[i % 3], 0.8).setDepth(front);
        void tween(scene, { targets: puff, y: puff.y - Phaser.Math.Between(40, 90), scale: 1.8, alpha: 0, duration: 700, delay: i * 40 }).then(() => puff.destroy());
      }
    } else {
      debris(scene, home.x, ground, look.bits, 16, front, [3, 6], 70, look.extra === 'bubbles');
      const splash = scene.add.ellipse(home.x, ground, 120, 34, look.colors[1], 0.7).setDepth(front);
      void tween(scene, { targets: splash, scaleY: 0.2, alpha: 0, duration: 420 }).then(() => splash.destroy());
    }
    await sprout(scene, s, home, ground, 340);
    await tween(scene, { targets: pool, alpha: 0, scaleX: 1.2, duration: 380 });
    pool.destroy();
    return;
  }

  // From the sky (or thin air).
  if (look.sky === 'bolt') {
    // A storm cloud gathers and lightning strikes where the creature appears.
    const cloud = scene.add.container(home.x, home.y - 130).setDepth(front);
    for (const [dx, dy, r] of [[-40, 6, 22], [-12, -6, 28], [20, 0, 26], [46, 8, 18]] as const) cloud.add(scene.add.circle(dx, dy, r, look.colors[0]));
    cloud.setAlpha(0);
    await tween(scene, { targets: cloud, alpha: 1, duration: 220 });
    const bolt = scene.add.graphics().setDepth(front);
    bolt.lineStyle(6, look.colors[1], 1);
    const pts = [[0, -110], [-14, -70], [8, -60], [-10, -20], [6, -14], [0, 0]].map(([bx, by]) => new Phaser.Math.Vector2(home.x + bx, ground + by));
    bolt.strokePoints(pts);
    bolt.lineStyle(2, 0xffffff, 1);
    bolt.strokePoints(pts);
    sfx.rocks();
    scene.cameras.main.flash(120, 255, 240, 160, true);
    debris(scene, home.x, ground, look.bits, 12, front, [2, 4], 80, true);
    await sprout(scene, s, home, ground, 240);
    void tween(scene, { targets: [bolt, cloud], alpha: 0, duration: 300 }).then(() => {
      bolt.destroy();
      cloud.destroy();
    });
    return;
  }
  if (look.sky === 'rays') {
    // A burst of sunlight blooms from the ground.
    const rays = scene.add.graphics({ x: home.x, y: ground - 30 }).setDepth(front).setBlendMode(Phaser.BlendModes.ADD);
    for (let k = 0; k < 12; k++) {
      const a = (k / 12) * Math.PI * 2;
      rays.fillStyle(k % 2 ? look.colors[0] : look.colors[1], 0.7);
      rays.fillTriangle(0, 0, Math.cos(a - 0.12) * 110, Math.sin(a - 0.12) * 110, Math.cos(a + 0.12) * 110, Math.sin(a + 0.12) * 110);
    }
    rays.setScale(0);
    sfx.release();
    await tween(scene, { targets: rays, scale: 1, angle: 30, duration: 260, ease: 'Quad.easeOut' });
    debris(scene, home.x, ground, look.bits, 12, front, [2, 5], 90, true);
    await sprout(scene, s, home, ground, 280);
    await tween(scene, { targets: rays, alpha: 0, scale: 1.3, angle: 60, duration: 300 });
    rays.destroy();
    return;
  }
  // Mist: wisps swirl together, and the creature fades in from them.
  const wisps: Phaser.GameObjects.Arc[] = [];
  for (let i = 0; i < 10; i++) {
    const a = (i / 10) * Math.PI * 2;
    const w = scene.add.circle(home.x + Math.cos(a) * 90, home.y + Math.sin(a) * 40, Phaser.Math.Between(8, 16), look.bits[i % 3], 0.7).setDepth(front);
    wisps.push(w);
  }
  sfx.release();
  await tween(scene, { targets: wisps, x: home.x, y: home.y, scale: 0.3, duration: 420, ease: 'Sine.easeIn' });
  wisps.forEach((w) => w.destroy());
  s.setVisible(true).setAlpha(0).setScale(home.scale * 1.15).setPosition(home.x, home.y);
  await tween(scene, { targets: s, alpha: 1, scale: home.scale, duration: 320, ease: 'Sine.easeOut' });
}
