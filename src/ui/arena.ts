import Phaser from 'phaser';
import type { Board } from './backdrops';
import { calm } from './motion';
import { sfx } from './sound';

/**
 * Online battles happen in a stadium: tiers of stands packed with a crowd that bobs along, waves
 * flags and roars for big hits, knockouts and the final blow. Drawn behind the field like the
 * element backdrops (see backdrops.battleBackdrop).
 */
export interface Crowd {
  /** 1: a big hit, 2: a knockout, 3: the match is won. */
  cheer(level: 1 | 2 | 3): void;
}

const SKIN = [0xffe0c4, 0xf2c39b, 0xd9a273, 0xb57a4e, 0x8a5a36, 0x5e3b22];
const SHIRTS = [0xd8443a, 0xf08a2a, 0xf0c838, 0x5ab84a, 0x2aa8a0, 0x6ac8f0, 0x3a6ad8, 0x8a4ad0, 0xf08ac0, 0xeeeeee, 0x2a3458, 0xa8e05a];
const HAIR = [0x2a2230, 0x5a3a24, 0x8a3a20, 0xe8c25a, 0xeeeeee, 0xd8443a];

/** A stone battle pad on the arena floor, under a Hexling (the arena's version of battlePad). */
export function arenaPad(scene: Phaser.Scene, x: number, y: number, w = 200) {
  scene.add.ellipse(x, y + 6, w + 16, 52, 0x5a4a3a);
  scene.add.ellipse(x, y, w + 16, 48, 0x9a8a72);
  scene.add.ellipse(x, y, w - 6, 40, 0x000000, 0).setStrokeStyle(2, 0xf0e2c0, 0.5);
  scene.add.ellipse(x, y + 2, w - 30, 30, 0xb8a888, 0.6);
  scene.add.ellipse(x, y, w - 20, 34, 0x000000, 0.3);
}

export function arenaBackdrop(scene: Phaser.Scene, b: Board, field: { w: number; h: number }): Crowd {
  const left = -b.ox;
  const top = -b.oy;
  const right = field.w >= b.w ? b.fw - b.ox : field.w;
  const bottom = field.h >= b.h ? b.fh - b.oy : field.h;
  const width = right - left;
  const horizon = field.h * 0.4;
  const wallH = 16;
  const standsBottom = horizon - wallH;

  // Night sky over the stadium, and the lights.
  const g = scene.add.graphics();
  g.fillGradientStyle(0x0a0a1e, 0x0a0a1e, 0x1e1636, 0x1e1636, 1).fillRect(left, top, width, standsBottom - top + 4);
  for (const x of [left + width * 0.08, left + width * 0.92]) {
    g.fillStyle(0x3a3a4a, 1).fillRect(x - 2, top, 4, 40);
    g.fillStyle(0xfff6d0, 1).fillRect(x - 12, top + 8, 24, 8);
  }

  // The stands: rows of seats packed with fans, bigger toward the front.
  // As many rows as fit under the lights (taller screens get a bigger stadium).
  const rows = Phaser.Math.Clamp(Math.round((standsBottom - (top + 44)) / 22), 5, 10);
  const rowTop = Math.max(top + 44, standsBottom - rows * 24);
  const rowH = (standsBottom - rowTop) / rows;
  const rowCs: Phaser.GameObjects.Container[] = [];
  const flags: Phaser.GameObjects.GameObject[] = [];
  const rand = new Phaser.Math.RandomDataGenerator(['hexbound-arena']);
  for (let r = 0; r < rows; r++) {
    const y = rowTop + r * rowH;
    // Far away across the floor: small fans, a little bigger in the front rows.
    const scale = 0.38 + Math.pow(r / (rows - 1), 1.4) * 0.5;
    g.fillStyle(r % 2 ? 0x2e2240 : 0x3a2a4a, 1).fillRect(left, y, width, rowH + 1);
    g.fillStyle(0x000000, 0.25).fillRect(left, y + rowH - 3, width, 3);
    const row = scene.add.container(0, 0);
    const people = scene.add.graphics();
    const step = 12 * scale;
    for (let x = left + rand.between(0, 8); x < right; x += step + rand.between(0, 3)) {
      if (rand.frac() < 0.08) continue; // an empty seat
      const by = y + rowH - 2;
      const bw = 9 * scale;
      const bh = 9 * scale;
      people.fillStyle(rand.pick(SHIRTS), 1).fillRect(x - bw / 2, by - bh, bw, bh);
      const hy = by - bh - 3.6 * scale;
      people.fillStyle(rand.pick(SKIN), 1).fillCircle(x, hy, 3.6 * scale);
      people.fillStyle(rand.pick(HAIR), 1).fillRect(x - 3.6 * scale, hy - 3.6 * scale, 7.2 * scale, 2.2 * scale);
      // Some fans wave flags.
      if (rand.frac() < 0.06) {
        const pole = scene.add.rectangle(x + 4 * scale, hy - 2, 1.5, 14 * scale, 0xc9c0e0).setOrigin(0.5, 1);
        const flag = scene.add.triangle(x + 4 * scale, hy - 2 - 14 * scale, 0, 0, 10 * scale, 3 * scale, 0, 6 * scale, rand.pick(SHIRTS)).setOrigin(0, 0);
        row.add([pole, flag]);
        flags.push(flag);
      }
    }
    row.addAt(people, 0);
    rowCs.push(row);
  }

  // The wall between the stands and the floor, with banners.
  g.fillStyle(0x4a3a5a, 1).fillRect(left, standsBottom, width, wallH);
  g.fillStyle(0x6a5a7a, 1).fillRect(left, standsBottom, width, 2);
  const bannerColors = [0x8a2c2c, 0x2f4a6b, 0x3b6d4a, 0x7a5a1c];
  const bw = 54;
  for (let x = left + 10, i = 0; x < right - bw; x += bw + 30, i++) {
    g.fillStyle(bannerColors[i % bannerColors.length], 1).fillRect(x, standsBottom + 3, bw, wallH - 6);
    g.fillStyle(0xffffff, 0.35).fillRect(x + 6, standsBottom + 7, bw - 12, 2);
  }

  // The arena floor, seen from the same low angle as every battle field: packed sand receding to
  // the wall, its stripes and markings squashed toward the far side.
  const floorTop = horizon;
  const depth = bottom - floorTop;
  const cx = left + width / 2;
  g.fillStyle(0xb8935a, 1).fillRect(left, floorTop, width, depth);
  // Raked stripes: thin far away, wide up close.
  const bands = 10;
  for (let k = 0; k < bands; k += 2) {
    const y0 = floorTop + depth * Math.pow(k / bands, 1.7);
    const y1 = floorTop + depth * Math.pow((k + 1) / bands, 1.7);
    g.fillStyle(0xc4a068, 1).fillRect(left, y0, width, y1 - y0);
  }
  // Grit, smaller toward the far side.
  g.fillStyle(0xa8834a, 1);
  for (let i = 0; i < 70; i++) {
    const t = rand.frac();
    const y = floorTop + depth * t * t;
    const sz = 1 + t * 3;
    g.fillRect(left + rand.between(0, width), y, sz * 3, Math.max(1, sz * 0.6));
  }
  // Painted lines: the far boundary, the side lines running toward a point beyond the wall, and
  // the halfway line and ring across the middle (flattened by the angle).
  const vy = floorTop - depth * 1.1;
  const sideAt = (x0: number, y: number) => cx + (x0 - cx) * ((y - vy) / (bottom - vy));
  const farY = floorTop + depth * 0.05;
  const lineC = 0xf0e2c0;
  g.lineStyle(2, lineC, 0.45).lineBetween(sideAt(cx - width * 0.62, farY), farY, sideAt(cx + width * 0.62, farY), farY);
  for (const x0 of [cx - width * 0.62, cx + width * 0.62]) g.lineStyle(3, lineC, 0.45).lineBetween(sideAt(x0, farY), farY, x0, bottom);
  const midY = floorTop + depth * 0.45;
  g.lineStyle(3, lineC, 0.5).lineBetween(sideAt(cx - width * 0.62, midY), midY, sideAt(cx + width * 0.62, midY), midY);
  g.lineStyle(3, lineC, 0.5).strokeEllipse(cx, midY, width * 0.42, depth * 0.16);
  // Haze and the wall's shadow at the far edge.
  g.fillStyle(0x000000, 0.22).fillRect(left, floorTop, width, 6);
  g.fillGradientStyle(0xe8d0a0, 0xe8d0a0, 0xe8d0a0, 0xe8d0a0, 0.25, 0.25, 0, 0).fillRect(left, floorTop + 6, width, depth * 0.12);

  // Spotlight beams sweeping the floor.
  if (!calm()) {
    for (const [x0, dir] of [
      [left + width * 0.08, 1],
      [left + width * 0.92, -1],
    ] as const) {
      const beam = scene.add.triangle(x0, top + 14, 0, 0, -50, bottom - top, 50, bottom - top, 0xfff6d0, 0.06).setOrigin(0.5, 0);
      beam.setAngle(-20 * dir);
      scene.tweens.add({ targets: beam, angle: 20 * dir, yoyo: true, repeat: -1, duration: 5200 + (dir > 0 ? 0 : 900), ease: 'Sine.easeInOut' });
    }
    // The crowd is never quite still.
    rowCs.forEach((row, i) => scene.tweens.add({ targets: row, y: -1.5, yoyo: true, repeat: -1, duration: 380 + i * 47, ease: 'Sine.easeInOut', delay: i * 90 }));
    flags.forEach((f, i) => scene.tweens.add({ targets: f, scaleX: 0.6, yoyo: true, repeat: -1, duration: 300 + (i % 5) * 60 }));
  }

  // Shade under the controls, as on the other fields.
  const shade = 0x15101c;
  if (field.h < b.h) {
    for (let i = 0; i < 4; i++) scene.add.rectangle(left, field.h - 12 + i * 3, b.fw, 3, shade, 0.2 + i * 0.15).setOrigin(0);
    scene.add.rectangle(left, field.h, b.fw, b.fh - b.oy - field.h, shade, 0.82).setOrigin(0);
  }
  if (field.w < b.w) {
    for (let i = 0; i < 4; i++) scene.add.rectangle(field.w - 12 + i * 3, top, 3, b.fh, shade, 0.2 + i * 0.15).setOrigin(0);
    scene.add.rectangle(field.w, top, b.fw - b.ox - field.w, b.fh, shade, 0.82).setOrigin(0);
  }

  const confetti = (n: number) => {
    for (let i = 0; i < n; i++) {
      const x = left + Math.random() * width;
      const p = scene.add.rectangle(x, rowTop + Math.random() * (standsBottom - rowTop), 4, 6, Phaser.Utils.Array.GetRandom(SHIRTS)).setDepth(2);
      scene.tweens.add({
        targets: p,
        y: p.y - 30 - Math.random() * 40,
        x: x + (Math.random() - 0.5) * 40,
        angle: 360 * (Math.random() < 0.5 ? -1 : 1),
        alpha: 0,
        duration: 900 + Math.random() * 900,
        ease: 'Quad.easeOut',
        onComplete: () => p.destroy(),
      });
    }
  };

  return {
    cheer(level) {
      sfx.crowd(level);
      if (calm()) return;
      // The fans jump (their row's idle bob carries on underneath), then settle back in their seats.
      rowCs.forEach((row, i) => {
        const kids = row.list as unknown as { y: number }[];
        const base = (row.getData('base') as number[] | undefined) ?? kids.map((k) => k.y);
        row.setData('base', base);
        scene.tweens.killTweensOf(kids);
        kids.forEach((k, j) => (k.y = base[j]));
        scene.tweens.add({
          targets: kids,
          y: `-=${3 + level * 2}`,
          yoyo: true,
          repeat: level,
          duration: 120,
          delay: i * 40 + Math.random() * 60,
          ease: 'Quad.easeOut',
          onComplete: () => kids.forEach((k, j) => (k.y = base[j])),
        });
      });
      if (level >= 2) confetti(level === 3 ? 60 : 20);
    },
  };
}
