import Phaser from 'phaser';
import { calm } from './motion';
import { EYE_COLORS, SKIN_TONES, type TrainerLook } from '../data/trainerLook';
import type { Creature } from '../logic/creature';
import { sfx } from './sound';
import { ensureCreatureTexture } from './sprites';
import { ensureTrainerTexture } from './trainerSprite';
import { FONT, fullRect, H, LANDSCAPE, W, ZOOM } from './widgets';

/**
 * Trainer / guardian intro, drawn like a manga panel page: slanted strips slash in, each a tight
 * black-and-white close-up of a face (the trainer's eyes on top, then their Hexlings), split by
 * sketchy ink lines, with "NAME Approaching..." in big ink lettering. Tap to skip.
 */

// ------------------------------------------------------------ ink versions of sprites

/** Each sprite pixel becomes INK x INK pixels of the inked copy (room for screen-tone patterns). */
const INK = 6;
const PAPER = [241, 237, 228];

/**
 * Inked copy of a texture, like a manga page: black stays black, white stays paper, and the two
 * middle tones become screen tones (dense crosshatch for shadows, fine diagonal lines for midtones).
 * It's INK times larger than the source.
 */
function inkTexture(scene: Phaser.Scene, key: string, force: Map<number, number> = new Map()): string {
  const ink = `${key}~ink`;
  if (scene.textures.exists(ink)) return ink;
  const src = scene.textures.get(key).getSourceImage() as HTMLCanvasElement | HTMLImageElement;
  const sc = document.createElement('canvas');
  sc.width = src.width;
  sc.height = src.height;
  const sctx = sc.getContext('2d')!;
  sctx.drawImage(src, 0, 0);
  const sd = sctx.getImageData(0, 0, sc.width, sc.height).data;
  const c = document.createElement('canvas');
  c.width = src.width * INK;
  c.height = src.height * INK;
  const ctx = c.getContext('2d')!;
  const out = ctx.createImageData(c.width, c.height);
  const d = out.data;
  const lumAt = (i: number) => 0.3 * sd[i] + 0.59 * sd[i + 1] + 0.11 * sd[i + 2];
  // Tone cut-offs from this sprite's own brightness, so dark and pale sprites both get every tone:
  // the darkest ~18% is solid ink, the next 20% crosshatch, the next 22% fine lines, the rest paper.
  const lums: number[] = [];
  for (let i = 0; i < sd.length; i += 4) if (sd[i + 3] > 0) lums.push(lumAt(i));
  lums.sort((p, q) => p - q);
  const q = (f: number) => lums[Math.min(lums.length - 1, Math.floor(lums.length * f))] ?? 128;
  const cuts = [q(0.18), q(0.38), q(0.6)];
  const level = (x: number, y: number) => {
    const i = (y * sc.width + x) * 4;
    if (sd[i + 3] === 0) return -1;
    const forced = force.get((sd[i] << 16) | (sd[i + 1] << 8) | sd[i + 2]);
    if (forced !== undefined) return forced;
    const lum = lumAt(i);
    return lum <= cuts[0] ? 0 : lum <= cuts[1] ? 1 : lum <= cuts[2] ? 2 : 3;
  };
  for (let y = 0; y < c.height; y++)
    for (let x = 0; x < c.width; x++) {
      const lv = level(Math.floor(x / INK), Math.floor(y / INK));
      if (lv < 0) continue;
      let black: boolean;
      if (lv === 0) black = true;
      else if (lv === 1) black = (x + y) % 3 !== 0 && (x - y + 300) % 3 !== 0; // crosshatch
      else if (lv === 2) black = (x - y + 300) % 4 === 0; // fine diagonal tone
      else black = false;
      const o = (y * c.width + x) * 4;
      if (black) d[o] = d[o + 1] = d[o + 2] = 18;
      else [d[o], d[o + 1], d[o + 2]] = PAPER;
      d[o + 3] = 255;
    }
  ctx.putImageData(out, 0, 0);
  scene.textures.addCanvas(ink, c);
  return ink;
}

const shadeRgb = (c: number, k: number) => {
  const ch = (sh: number) => Math.max(0, Math.min(255, Math.round(((c >> sh) & 255) * k)));
  return (ch(16) << 16) | (ch(8) << 8) | ch(0);
};

/** A trainer inked like a manga face: skin is white paper, eyes solid black, shading as fine lines. */
function trainerInk(look: TrainerLook): Map<number, number> {
  const m = new Map<number, number>();
  const skin = SKIN_TONES[look.skin];
  const eye = EYE_COLORS[look.eyes];
  m.set(skin, 3).set(shadeRgb(skin, 1.08), 3).set(0xffffff, 3);
  m.set(shadeRgb(skin, 0.78), 2).set(shadeRgb(skin, 0.86), 2).set(shadeRgb(skin, 0.6), 0);
  m.set(eye, 0).set(shadeRgb(eye, 0.6), 0).set(shadeRgb(eye, 0.78), 0).set(shadeRgb(eye, 0.86), 0);
  m.set(0xf08a9a, 2);
  return m;
}

/** The box of non-empty pixels in a texture. */
function bounds(scene: Phaser.Scene, key: string) {
  const src = scene.textures.get(key).getSourceImage() as HTMLCanvasElement;
  const ctx = src.getContext?.('2d');
  if (!ctx) return { x: 0, y: 0, w: src.width, h: src.height };
  const { data, width, height } = ctx.getImageData(0, 0, src.width, src.height);
  let x0 = width;
  let y0 = height;
  let x1 = 0;
  let y1 = 0;
  for (let y = 0; y < height; y++)
    for (let x = 0; x < width; x++)
      if (data[(y * width + x) * 4 + 3] > 0) {
        x0 = Math.min(x0, x);
        y0 = Math.min(y0, y);
        x1 = Math.max(x1, x);
        y1 = Math.max(y1, y);
      }
  return x1 < x0 ? { x: 0, y: 0, w: width, h: height } : { x: x0, y: y0, w: x1 - x0 + 1, h: y1 - y0 + 1 };
}

/** Screen-tone hatching for a strip's background. */
function hatch(g: Phaser.GameObjects.Graphics, x: number, y: number, w: number, h: number, step: number, alpha: number) {
  g.lineStyle(1, 0x000000, alpha);
  for (let i = -h; i < w; i += step) g.lineBetween(x + i, y + h, x + i + h, y);
}

/** A hand-inked line: a few strokes, slightly off from each other, overshooting the ends. */
function inkLine(g: Phaser.GameObjects.Graphics, x0: number, y0: number, x1: number, y1: number, rnd: () => number, heavy = 1) {
  for (let k = 0; k < 3; k++) {
    const j = () => (rnd() - 0.5) * 6;
    g.lineStyle((k === 0 ? 4 : 1.5) * heavy, 0x000000, k === 0 ? 1 : 0.8);
    g.lineBetween(x0 + j(), y0 + j(), x1 + j(), y1 + j());
  }
}

/** Ink splatter flung off a strip's leading edge as it slams home (dir: which way it flies). */
function splatter(scene: Phaser.Scene, x: number, y: number, dir: number, h: number) {
  for (let k = 0; k < 9; k++) {
    const r = 2 + Math.random() * 5;
    const dot = scene.add.circle(x, y + (Math.random() - 0.5) * h, r, 0x111111).setDepth(3002);
    scene.tweens.add({
      targets: dot,
      x: x + dir * (20 + Math.random() * 60),
      y: dot.y + (Math.random() - 0.5) * 30,
      scale: 0.3,
      alpha: 0,
      duration: 380 + Math.random() * 200,
      ease: 'Cubic.easeOut',
      onComplete: () => dot.destroy(),
    });
  }
}

/** When the first strip starts, and the time between strips (each lands on its own beat). */
const STRIP_T0 = 150;
const STRIP_GAP = 260;

// ------------------------------------------------------------ the cut-in

export interface CutInOpts {
  /** Shown big: "NAME Approaching...". */
  name: string;
  /** Under the name (a guardian's title, or "Trainer"). */
  sub?: string;
  look: TrainerLook;
  team: Creature[];
  boss?: boolean;
  /** Accent color (the floor's element). */
  accent: number;
}

export function trainerCutIn(scene: Phaser.Scene, o: CutInOpts): Promise<void> {
  return new Promise((resolve) => {
    let seed = 7;
    for (const ch of o.name) seed = (seed * 31 + ch.charCodeAt(0)) >>> 0;
    const rnd = () => ((seed = (seed * 1103515245 + 12345) >>> 0) % 10000) / 10000;

    // Layers: the paper, then the strips (each masked, so they can't sit inside a container), then the ink.
    const root = scene.add.container(0, 0).setDepth(3000);
    const over = scene.add.container(0, 0).setDepth(3002);
    // Paper.
    const paper = fullRect(scene, 0xf1ede4, 1).setInteractive();
    root.add(paper);
    const tone = scene.add.graphics();
    root.add(tone);

    // Strips: the trainer's eyes, then up to 3 of their Hexlings.
    const faces: { key: string; trainer: boolean }[] = [{ key: ensureTrainerTexture(scene, o.look, 'stand'), trainer: true }];
    for (const c of o.team.slice(0, 2)) faces.push({ key: ensureCreatureTexture(scene, c.speciesId, c.stage, c.shiny), trainer: false });
    const n = faces.length;
    const sw = LANDSCAPE ? 470 : W - 64;
    const sx = LANDSCAPE ? 40 : (W - sw) / 2;
    const top = LANDSCAPE ? 30 : 92;
    const areaH = LANDSCAPE ? H - 60 : H - 290;
    const gap = 14;
    const sh = (areaH - gap * (n - 1)) / n;

    const strips: Phaser.GameObjects.Container[] = [];
    faces.forEach((f, i) => {
      const y = top + i * (sh + gap);
      const strip = scene.add.container(0, 0);
      const bg = scene.add.graphics();
      bg.fillStyle(i === 0 ? 0xd9d4ca : 0xe6e1d6, 1).fillRect(sx, y, sw, sh);
      hatch(bg, sx, y, sw, sh, i === 0 ? 5 : 7, i === 0 ? 0.28 : 0.16);
      strip.add(bg);
      // A tight close-up: the eyes fill the strip.
      const key = inkTexture(scene, f.key, f.trainer ? trainerInk(o.look) : undefined);
      const b = bounds(scene, f.key);
      const img = scene.add.image(0, 0, key);
      const tw = img.width / INK;
      const th = img.height / INK;
      if (f.trainer) {
        // The trainer's face: the head box is x 6-21 and the eyes sit around y 12.
        // Brows to chin fill the strip (a wide, short strip zooms to the eyes less).
        const scale = Math.min(sw / 22, sh / 8.5) / INK;
        img.setScale(scale).setOrigin(13.5 / tw, 11.6 / th);
      } else {
        // A Hexling's head and eyes: the top part of its body.
        const scale = Math.min(sw / (b.w * 1.15), (sh * 2.1) / b.h) / INK;
        const cy = b.y + b.h * 0.36;
        img.setScale(scale).setOrigin((b.x + b.w / 2) / tw, cy / th);
        img.setFlipX(i % 2 === 1);
      }
      img.setPosition(sx + sw / 2, y + sh / 2);
      strip.add(img);
      // Clip to the strip.
      const maskG = scene.make.graphics({}, false).fillRect(sx, y, sw, sh);
      strip.setMask(maskG.createGeometryMask());
      strip.once('destroy', () => maskG.destroy());
      // Speed lines on the trainer's strip.
      if (i === 0) {
        const sl = scene.add.graphics();
        sl.lineStyle(2, 0x000000, 0.18);
        for (let k = 0; k < 10; k++) {
          const yy = y + rnd() * sh;
          sl.lineBetween(sx, yy, sx + sw * (0.08 + rnd() * 0.12), yy);
          sl.lineBetween(sx + sw, yy, sx + sw * (0.9 - rnd() * 0.12), yy);
        }
        strip.add(sl);
      }
      strip.setDepth(3001);
      strips.push(strip);
      // Impact flash, inside the strip.
      const flash = scene.add.rectangle(sx, y, sw, sh, 0xffffff, 0).setOrigin(0);
      strip.add(flash);
      // Slam in from alternating sides: fast, overshooting a touch, then a hit.
      const dir = i % 2 === 0 ? -1 : 1;
      const from = dir * (W + 100);
      strip.x = from;
      maskG.x = from;
      const baseScale = img.scale;
      scene.tweens.add({
        targets: [strip, maskG],
        x: 0,
        delay: STRIP_T0 + i * STRIP_GAP,
        duration: 170,
        ease: 'Back.easeOut',
        easeParams: [1.1],
        onStart: () => sfx.slash(i),
        onComplete: () => {
          sfx.stripHit(i);
          scene.cameras.main.shake(90, 0.007);
          if (!calm()) {
            flash.setFillStyle(0xffffff, 0.95);
            scene.tweens.add({ targets: flash, fillAlpha: 0, duration: 220, ease: 'Quad.easeOut' });
            img.setScale(baseScale * 1.14);
            scene.tweens.add({ targets: img, scale: baseScale, duration: 260, ease: 'Back.easeOut' });
          }
          splatter(scene, dir < 0 ? sx + sw : sx, y + sh / 2, -dir, sh);
        },
      });
    });

    // Ink frame: slanted separators and side rules, drawn on after the strips land.
    const ink = scene.add.graphics().setAlpha(0);
    over.add(ink);
    for (let i = 0; i <= n; i++) {
      const y = top + i * (sh + gap) - gap / 2 - (i === 0 ? -gap / 2 + 2 : 0) - (i === n ? gap / 2 - 2 : 0);
      const tilt = (rnd() - 0.5) * 18;
      inkLine(ink, sx - 26, y - tilt, sx + sw + 26, y + tilt, rnd, i === 0 || i === n ? 1.2 : 1);
    }
    inkLine(ink, sx - 6, top - 30, sx - 2, top + areaH + 30, rnd);
    inkLine(ink, sx + sw + 4, top - 30, sx + sw, top + areaH + 30, rnd);
    scene.tweens.add({ targets: ink, alpha: 1, delay: STRIP_T0 + n * STRIP_GAP, duration: 120 });

    // Name and "Approaching...".
    const tx = LANDSCAPE ? sx + sw + (W - sx - sw) / 2 + 6 : W / 2;
    const ty = LANDSCAPE ? H / 2 - 40 : top + areaH + 70;
    const style = (size: number, color = '#111111'): Phaser.Types.GameObjects.Text.TextStyle => ({
      fontFamily: FONT,
      fontSize: `${size}px`,
      fontStyle: 'bold italic',
      color,
      stroke: '#f1ede4',
      strokeThickness: 6,
      resolution: ZOOM,
      align: 'center',
      wordWrap: { width: LANDSCAPE ? W - sx - sw - 20 : W - 30 },
    });
    // A brush slash of the floor's color behind the name.
    const slash = scene.add.rectangle(tx, ty, LANDSCAPE ? 210 : 360, LANDSCAPE ? 60 : 64, o.accent, 0.85).setAngle(-5).setScale(0, 1);
    const name = scene.add.text(tx, ty, o.name.toUpperCase(), style(LANDSCAPE ? 30 : 38)).setOrigin(0.5).setAngle(-5).setAlpha(0).setScale(1.8);
    const sub = scene.add
      .text(tx, ty + (LANDSCAPE ? 34 : 40), o.sub ?? '', style(LANDSCAPE ? 14 : 16, '#3a3530'))
      .setOrigin(0.5, 0)
      .setAngle(-5)
      .setAlpha(0);
    const appr = scene.add
      .text(tx, ty + (LANDSCAPE ? 60 : 70), 'Approaching', style(LANDSCAPE ? 22 : 26, o.boss ? '#a01818' : '#111111'))
      .setOrigin(0.5, 0)
      .setAngle(-5)
      .setAlpha(0);
    // Stack the lines by their real heights (the subtitle can wrap on the narrow sideways column).
    sub.setY(ty + slash.height / 2 + 6);
    appr.setY(sub.y + sub.height + 6);
    over.add([slash, name, sub, appr]);
    const tLand = STRIP_T0 + n * STRIP_GAP + 160;
    scene.tweens.add({ targets: slash, scaleX: 1, delay: tLand, duration: 160, ease: 'Cubic.easeOut' });
    scene.tweens.add({
      targets: name,
      alpha: 1,
      scale: 1,
      delay: tLand + 60,
      duration: 180,
      ease: 'Back.easeOut',
      onStart: () => (o.boss ? sfx.cutInBoss() : sfx.cutInHit()),
      onComplete: () => scene.cameras.main.shake(o.boss ? 260 : 140, o.boss ? 0.012 : 0.005),
    });
    scene.tweens.add({ targets: sub, alpha: 1, delay: tLand + 200, duration: 200 });
    scene.tweens.add({ targets: appr, alpha: 1, delay: tLand + 320, duration: 160 });
    // The dots arrive one at a time.
    let dots = 0;
    const dotTimer = scene.time.addEvent({
      delay: 220,
      startAt: 0,
      repeat: 5,
      callback: () => {
        if (!appr.active || appr.alpha === 0) return;
        dots = Math.min(3, dots + 1);
        appr.setText('Approaching' + '.'.repeat(dots));
      },
    });

    // Leave: the strips slash away and the page fades into the battle.
    let done = false;
    const finish = (fast = false) => {
      if (done) return;
      done = true;
      dotTimer.remove();
      sfx.slash(9);
      strips.forEach((s, i) => {
        scene.tweens.add({ targets: s, x: (i % 2 === 0 ? 1 : -1) * (W + 100), duration: fast ? 140 : 220, delay: fast ? 0 : i * 50, ease: 'Cubic.easeIn' });
      });
      scene.tweens.add({
        targets: [root, over, ...strips],
        alpha: 0,
        delay: fast ? 80 : 200,
        duration: fast ? 140 : 260,
        onComplete: () => {
          root.destroy();
          over.destroy();
          strips.forEach((st) => st.destroy());
          resolve();
        },
      });
    };
    const hold = tLand + (o.boss ? 3000 : 2600);
    scene.time.delayedCall(hold, () => finish());
    // Tap to skip (once it's had a moment to appear).
    scene.time.delayedCall(350, () => paper.once('pointerdown', () => finish(true)));
  });
}
