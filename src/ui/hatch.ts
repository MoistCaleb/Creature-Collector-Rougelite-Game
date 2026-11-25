import Phaser from 'phaser';
import { SPECIES_BY_ID } from '../data/species';
import { ELEMENT_COLORS, type Element } from '../data/types';
import { creatureName, type Creature } from '../logic/creature';
import type { EggTier } from '../logic/nest';
import { calm } from './motion';
import { sfx } from './sound';
import { colours, ensureCreatureTexture, SPRITE_FIT } from './sprites';
import { FONT, fullRect, H, W, ZOOM } from './widgets';

/**
 * Eggs (2.07) on screen: a speckled egg in its two parents' colours (a legendary parent's has a
 * gold band), and the hatch: it wobbles harder and harder, cracks, bursts into shell, and the baby
 * pops out with its name. Used for the camp Nest and for a Hatchery egg on a run.
 */

export interface EggLook {
  a: string;
  b?: string;
  tier: EggTier;
  legendary?: boolean;
}

const EGG_W = 18;
const EGG_H = 22;
const OUTLINE = 0x1a1426;

const elColour = (id: string | undefined, fallback: number) => (id && SPECIES_BY_ID[id] ? ELEMENT_COLORS[SPECIES_BY_ID[id].types[0] as Element] : fallback);
const shade = (c: number, k: number) => {
  const ch = (s: number) => Math.max(0, Math.min(255, Math.round(((c >> s) & 255) * k)));
  return (ch(16) << 16) | (ch(8) << 8) | ch(0);
};
const mixC = (a: number, b: number, t: number) => {
  const ch = (s: number) => Math.round(((a >> s) & 255) * (1 - t) + ((b >> s) & 255) * t);
  return (ch(16) << 16) | (ch(8) << 8) | ch(0);
};

/** The egg's texture: a pale shell tinted by one parent, speckled with the other (more spots the stronger it is). */
export function ensureEggTexture(scene: Phaser.Scene, egg: EggLook): string {
  const key = `egg:${egg.a}:${egg.b ?? ''}:${egg.tier}:${egg.legendary ? 1 : 0}`;
  if (scene.textures.exists(key)) return key;
  const shell = mixC(elColour(egg.a, 0xe8e0c8), 0xfff8e8, 0.6);
  const spot = shade(elColour(egg.b, 0x8a7a5a), 0.95);
  const cv = document.createElement('canvas');
  cv.width = EGG_W + 2;
  cv.height = EGG_H + 2;
  const ctx = cv.getContext('2d')!;
  const g: (number | null)[][] = Array.from({ length: EGG_H + 2 }, () => Array<number | null>(EGG_W + 2).fill(null));
  const cx = (EGG_W + 1) / 2;
  const inside = (x: number, y: number) => {
    // Egg-shaped: narrower at the top.
    const ny = (y - 1 - EGG_H * 0.58) / (y - 1 < EGG_H * 0.58 ? EGG_H * 0.58 : EGG_H * 0.42);
    const nx = (x - cx) / (EGG_W / 2 - 0.5);
    return nx * nx + ny * ny <= 1;
  };
  const rnd = new Phaser.Math.RandomDataGenerator([key]);
  for (let y = 1; y <= EGG_H; y++)
    for (let x = 1; x <= EGG_W; x++) {
      if (!inside(x, y)) continue;
      // Light from the top left.
      const lit = (x - cx) / EGG_W + (y - EGG_H / 2) / EGG_H;
      g[y][x] = lit < -0.35 ? shade(shell, 1.08) : lit > 0.45 ? shade(shell, 0.82) : shell;
    }
  // Speckles in the other parent's colour (3 + 2 per strength).
  for (let i = 0; i < 3 + egg.tier * 2; i++) {
    const x = rnd.between(3, EGG_W - 2);
    const y = rnd.between(4, EGG_H - 3);
    if (!g[y][x]) continue;
    g[y][x] = spot;
    if (rnd.frac() < 0.5 && g[y][x + 1]) g[y][x + 1] = spot;
  }
  // A legendary parent: a gold band round the middle.
  if (egg.legendary) for (let x = 1; x <= EGG_W; x++) for (const y of [Math.round(EGG_H * 0.6), Math.round(EGG_H * 0.6) + 1]) if (g[y][x]) g[y][x] = y % 2 ? 0xffd86b : 0xe0a820;
  // Shine and outline.
  if (g[5][6]) g[5][6] = 0xffffff;
  if (g[6][5]) g[6][5] = 0xffffff;
  for (let y = 0; y < EGG_H + 2; y++)
    for (let x = 0; x < EGG_W + 2; x++) {
      const c = g[y][x];
      const edge = c === null && (g[y][x - 1] || g[y][x + 1] || g[y - 1]?.[x] || g[y + 1]?.[x]);
      if (c === null && !edge) continue;
      ctx.fillStyle = `#${(c ?? OUTLINE).toString(16).padStart(6, '0')}`;
      ctx.fillRect(x, y, 1, 1);
    }
  scene.textures.addCanvas(key, cv);
  return key;
}

/** An egg image (`size`: its height on screen). */
export function eggImage(scene: Phaser.Scene, x: number, y: number, egg: EggLook, size = 48): Phaser.GameObjects.Image {
  return scene.add.image(x, y, ensureEggTexture(scene, egg)).setScale(size / (EGG_H + 2));
}

const wait = (scene: Phaser.Scene, ms: number) => new Promise<void>((r) => scene.time.delayedCall(ms, r));

/**
 * The hatch, over everything: the egg wobbles, cracks and bursts, and the baby pops out. Calls
 * `then` when it's done (tap to hurry it along). Reduce motion: a short, gentle version.
 */
export async function playHatch(scene: Phaser.Scene, egg: EggLook, baby: Creature, then: () => void) {
  const D = 1500;
  const quiet = calm();
  const root = scene.add.container(0, 0).setDepth(D);
  const dim = fullRect(scene, 0x07050c, 0).setInteractive();
  root.add(dim);
  scene.tweens.add({ targets: dim, fillAlpha: 0.82, duration: 250 });
  const x = W / 2;
  const y = H / 2 - 30;
  const glow = scene.add.circle(x, y, 90, egg.legendary ? 0xffd86b : 0xfff0c0, 0.12).setBlendMode(Phaser.BlendModes.ADD);
  const img = eggImage(scene, x, y, egg, 150);
  root.add([glow, img]);
  scene.tweens.add({ targets: glow, scale: 1.25, alpha: 0.25, yoyo: true, repeat: -1, duration: 700 });
  let skip = false;
  dim.on('pointerup', () => (skip = true));
  const pause = async (ms: number) => {
    if (!skip) await wait(scene, ms);
  };

  // Wobbles, harder each time, with a crack after each.
  const cracks = scene.add.graphics();
  root.add(cracks);
  const crack = (n: number) => {
    cracks.lineStyle(3, OUTLINE, 1);
    const r = new Phaser.Math.RandomDataGenerator([`${baby.uid}:${n}`]);
    let cx = x + r.between(-30, 30);
    let cy = y - 40 + n * 18;
    cracks.beginPath().moveTo(cx, cy);
    for (let i = 0; i < 4; i++) cracks.lineTo((cx += r.between(-14, 14)), (cy += r.between(6, 14)));
    cracks.strokePath();
  };
  for (let n = 0; n < 3; n++) {
    await pause(quiet ? 250 : 420);
    sfx.eggWobble(n);
    if (!quiet) scene.tweens.add({ targets: img, angle: { from: -6 - n * 5, to: 6 + n * 5 }, yoyo: true, repeat: 1 + n, duration: 90 - n * 12, onComplete: () => img.setAngle(0) });
    await pause(quiet ? 150 : 300 + n * 60);
    crack(n);
  }
  await pause(quiet ? 200 : 350);

  // It bursts: a flash, shell flying, and the baby.
  sfx.eggHatch();
  scene.cameras.main.flash(220, 255, 248, 220);
  const shellC = mixC(elColour(egg.a, 0xe8e0c8), 0xfff8e8, 0.6);
  if (!quiet) {
    for (let i = 0; i < 14; i++) {
      const a = (i / 14) * Math.PI * 2 + Math.random() * 0.3;
      const bit = scene.add.rectangle(x, y, 10 + Math.random() * 10, 8 + Math.random() * 8, i % 3 ? shellC : 0xffffff).setStrokeStyle(2, OUTLINE);
      root.add(bit);
      scene.tweens.add({
        targets: bit,
        x: x + Math.cos(a) * (120 + Math.random() * 80),
        y: y + Math.sin(a) * (90 + Math.random() * 60) + 60,
        angle: Math.random() * 540 - 270,
        alpha: 0,
        duration: 800,
        ease: 'Cubic.easeOut',
        onComplete: () => bit.destroy(),
      });
    }
  }
  img.destroy();
  cracks.destroy();
  const sprite = scene.add.image(x, y + 10, ensureCreatureTexture(scene, baby.speciesId, baby.stage, colours(baby))).setScale(0.2 * SPRITE_FIT);
  root.add(sprite);
  scene.tweens.add({ targets: sprite, scale: 4.2 * SPRITE_FIT, duration: quiet ? 200 : 420, ease: 'Back.easeOut' });
  if (!quiet) scene.tweens.add({ targets: sprite, y: y - 4, yoyo: true, repeat: 2, duration: 260, delay: 420, ease: 'Sine.easeInOut' });
  const name = scene.add
    .text(x, y + 120, creatureName(baby), { fontFamily: FONT, fontSize: '30px', fontStyle: 'bold', color: '#fff4c8', stroke: '#2a1a08', strokeThickness: 7, resolution: ZOOM })
    .setOrigin(0.5)
    .setAlpha(0);
  const sub = scene.add
    .text(x, y + 156, egg.legendary ? 'Hatched! (a legendary parent)' : 'Hatched!', { fontFamily: FONT, fontSize: '16px', color: egg.legendary ? '#ffd86b' : '#dcd6ee', resolution: ZOOM })
    .setOrigin(0.5)
    .setAlpha(0);
  root.add([name, sub]);
  scene.tweens.add({ targets: [name, sub], alpha: 1, duration: 300, delay: 250 });
  skip = false;
  await pause(1500);
  scene.tweens.add({ targets: root, alpha: 0, duration: 250, onComplete: () => root.destroy() });
  then();
}
