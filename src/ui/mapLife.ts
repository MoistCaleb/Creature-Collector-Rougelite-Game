import Phaser from 'phaser';
import { speciesWithElement } from '../data/species';
import type { Element } from '../data/types';
import { dayPhase, holidayOn, type DayPhase, type Holiday } from '../logic/ambience';
import type { MapNode } from '../logic/map';
import { cry } from './cries';
import { calm } from './motion';
import { prefs } from './prefs';
import { ensureCreatureTexture, SPRITE_FIT } from './sprites';
import { text } from './widgets';

/**
 * The map's life: wild Hexlings of the land wandering the empty spaces between hexes (they run
 * off when your trainer lands close by, and squeak when tapped), birds and cloud shadows, glints
 * on rest and treasure hexes, the time of day, and holiday touches on holidays.
 */

export interface MapLifeOpts {
  /** The scrolling map layer: wild Hexlings go in it, under the hexes. */
  layer: Phaser.GameObjects.Container;
  biome: Element;
  /** Evolution stage the land's wild Hexlings show at. */
  stage: number;
  nodes: MapNode[];
  cols: number;
  /** Layer position of a lattice cell. */
  at: (col: number, y: number) => { x: number; y: number };
  hexW: number;
  hexH: number;
  /** The map's area on screen. */
  area: { x: number; w: number; top: number; bottom: number };
  /** May a tap count (false right after a drag). */
  tapOk: () => boolean;
}

export interface MapLife {
  /** Your trainer landed here (layer coordinates): wild Hexlings close by run off. */
  scare(x: number, y: number): void;
  phase: DayPhase | null;
  holiday: Holiday | null;
}

interface Wild {
  c: Phaser.GameObjects.Container;
  img: Phaser.GameObjects.Image;
  speciesId: string;
  stage: number;
  home: { x: number; y: number };
  busy: boolean;
  gone: boolean;
  timer?: Phaser.Time.TimerEvent;
}

const PX = 2;

/** A small pixel picture from rows of characters (any non-dot is the color). */
function pixelTexture(scene: Phaser.Scene, key: string, rows: string[], colors: Record<string, number>): string {
  if (scene.textures.exists(key)) return key;
  const g = scene.make.graphics({}, false);
  rows.forEach((line, y) =>
    [...line].forEach((ch, x) => {
      if (ch !== '.') g.fillStyle(colors[ch] ?? 0xffffff).fillRect(x * PX, y * PX, PX, PX);
    }),
  );
  g.generateTexture(key, rows[0].length * PX, rows.length * PX);
  g.destroy();
  return key;
}

/** A one-pixel white dot texture for sparkles. */
export const dot = (scene: Phaser.Scene) => pixelTexture(scene, 'ml-px', ['#'], { '#': 0xffffff });
const BIRD = [
  ['#...#', '.#.#.', '..#..'],
  ['.....', '#####', '..#..'],
];
const HEART = ['.##.##.', '#######', '#######', '.#####.', '..###..', '...#...'];
const CLOVER = ['.##.##.', '###.###', '.#####.', '###.###', '.##.##.', '...#...', '...#...'];
const BAT = [
  ['#.......#', '##.#.#.##', '.#######.', '...###...'],
  ['.........', '.##.#.##.', '#########', '#..###..#'],
];
const PUMPKIN = ['...#...', '.#####.', '##o#o##', '#######', '#o#o#o#', '.#####.'];

export function mapLife(scene: Phaser.Scene, o: MapLifeOpts): MapLife {
  const clock = prefs.worldClock;
  const phase = clock ? dayPhase() : null;
  const holiday = clock ? holidayOn() : null;
  const quiet = calm();
  const { area } = o;
  const scr = new Phaser.Geom.Rectangle(area.x, area.top, area.w, area.bottom - area.top);

  // Screen-space layers: under the map (tint, cloud shadows) and over it (birds, fireflies, holiday).
  const under = scene.add.container(0, 0);
  scene.children.moveBelow(under as never, o.layer as never);
  const over = scene.add.container(0, 0);
  const mask = scene.make.graphics({}, false).fillRect(scr.x, scr.y, scr.width, scr.height);
  over.setMask(mask.createGeometryMask());
  under.setMask(mask.createGeometryMask());
  scene.events.once('shutdown', () => mask.destroy());

  // ---- time of day: a wash over the land's background (the hexes stay bright and readable)
  const tint: Record<DayPhase, [number, number]> = { dawn: [0xff9ab0, 0.14], day: [0, 0], dusk: [0xff7a3a, 0.16], night: [0x0a1240, 0.42] };
  if (phase && phase !== 'day') under.add(scene.add.rectangle(scr.x, scr.y, scr.width, scr.height, tint[phase][0], tint[phase][1]).setOrigin(0));
  if (holiday?.id === 'halloween') under.add(scene.add.rectangle(scr.x, scr.y, scr.width, scr.height, 0x5a1a8a, 0.18).setOrigin(0));

  const night = phase === 'night';
  if (night) {
    // Stars twinkling, and fireflies drifting over the map.
    const rng = new Phaser.Math.RandomDataGenerator(['stars']);
    for (let i = 0; i < 26; i++) {
      const s = scene.add.image(rng.between(scr.x, scr.right), rng.between(scr.y, scr.bottom), dot(scene)).setTint(0xfff6d0).setAlpha(0.5);
      under.add(s);
      if (!quiet) scene.tweens.add({ targets: s, alpha: 0.1, yoyo: true, repeat: -1, duration: rng.between(900, 2400), delay: rng.between(0, 2000) });
    }
    over.add(
      scene.add.particles(0, 0, dot(scene), {
        emitZone: { type: 'random', source: scr as never },
        speedX: { min: -10, max: 10 },
        speedY: { min: -10, max: 6 },
        lifespan: 4200,
        frequency: quiet ? 900 : 420,
        tint: [0xd8ff6a, 0xfff08a],
        alpha: { start: 0, end: 1, ease: 'Sine.easeInOut' },
        scale: { min: 1, max: 1.6 },
        blendMode: 'ADD',
        advance: 4000,
      }),
    );
  }

  // ---- cloud shadows (daytime) and birds crossing now and then
  if (!night && !quiet) {
    const cloud = () => {
      const w = Phaser.Math.Between(160, 260);
      const y = Phaser.Math.Between(scr.y, scr.bottom);
      const sh = scene.add.ellipse(scr.x - w, y, w, w * 0.45, 0x000000, 0.08);
      under.add(sh);
      scene.tweens.add({ targets: sh, x: scr.right + w, duration: Phaser.Math.Between(26000, 38000), onComplete: () => sh.destroy() });
    };
    cloud();
    scene.time.addEvent({ delay: 14000, loop: true, callback: cloud });
  }
  const flock = (frames: string[], count: number, tintColor?: number) => {
    const fromLeft = Math.random() < 0.5;
    const y0 = Phaser.Math.Between(scr.y + 30, scr.y + scr.height * 0.6);
    for (let i = 0; i < count; i++) {
      const b = scene.add.sprite(fromLeft ? scr.x - 20 - i * 18 : scr.right + 20 + i * 18, y0 + Phaser.Math.Between(-16, 16) + (i % 2) * 10, frames[0]).setAlpha(0.7).setFlipX(!fromLeft);
      if (tintColor !== undefined) b.setTint(tintColor);
      over.add(b);
      let f = 0;
      const flap = scene.time.addEvent({ delay: 160 + i * 7, loop: true, callback: () => b.setTexture(frames[++f % frames.length]) });
      scene.tweens.add({
        targets: b,
        x: fromLeft ? scr.right + 40 : scr.x - 40,
        y: `-=${Phaser.Math.Between(10, 50)}`,
        duration: Phaser.Math.Between(7000, 9500),
        onComplete: () => {
          flap.remove();
          b.destroy();
        },
      });
    }
  };
  const birdFrames = BIRD.map((rows, i) => pixelTexture(scene, `ml-bird${i}`, rows, { '#': 0x1a1a24 }));
  const batFrames = BAT.map((rows, i) => pixelTexture(scene, `ml-bat${i}`, rows, { '#': 0x1a0e24 }));
  if (!night)
    scene.time.addEvent({
      delay: 20000,
      startAt: 13000,
      loop: true,
      callback: () => flock(birdFrames, Phaser.Math.Between(3, 5)),
    });

  // ---- holidays
  if (holiday) holidayFx(scene, holiday, over, scr, quiet, flock, batFrames);

  // ---- glints on rest and treasure hexes
  for (const n of o.nodes) {
    if (n.kind !== 'heal' && n.kind !== 'treasure') continue;
    const p = o.at(n.col, n.y);
    const em = scene.add.particles(p.x, p.y, dot(scene), {
      emitZone: { type: 'random', source: new Phaser.Geom.Circle(0, 0, o.hexW * 0.32) as never },
      speedY: n.kind === 'heal' ? { min: -22, max: -10 } : 0,
      lifespan: n.kind === 'heal' ? 1400 : 900,
      frequency: quiet ? 1600 : 700,
      tint: n.kind === 'heal' ? [0x8fffb0, 0xffffff] : [0xffe14d, 0xffffff],
      alpha: { start: 1, end: 0 },
      scale: n.kind === 'heal' ? { min: 0.8, max: 1.3 } : { start: 1.6, end: 0 },
    });
    o.layer.add(em);
  }

  // ---- wild Hexlings in the gaps between hexes
  const wilds = makeWilds(scene, o);

  return {
    phase,
    holiday,
    scare(x, y) {
      for (const w of wilds) {
        if (w.gone || Phaser.Math.Distance.Between(w.c.x, w.c.y, x, y) > o.hexW * 1.35) continue;
        flee(scene, w, x, y, o);
      }
    },
  };
}

function holidayFx(
  scene: Phaser.Scene,
  h: Holiday,
  over: Phaser.GameObjects.Container,
  scr: Phaser.Geom.Rectangle,
  quiet: boolean,
  flock: (frames: string[], count: number, tint?: number) => void,
  batFrames: string[],
) {
  const rise = (key: string, every: number, down = false, tint?: number) =>
    scene.time.addEvent({
      delay: quiet ? every * 2 : every,
      loop: true,
      callback: () => {
        const x = Phaser.Math.Between(scr.x + 10, scr.right - 10);
        const img = scene.add.image(x, down ? scr.y - 10 : scr.bottom + 10, key).setAlpha(0.85).setScale(Phaser.Math.FloatBetween(0.8, 1.3));
        if (tint !== undefined) img.setTint(tint);
        over.add(img);
        scene.tweens.add({
          targets: img,
          y: down ? scr.bottom + 20 : scr.y - 20,
          x: x + Phaser.Math.Between(-40, 40),
          angle: Phaser.Math.Between(-30, 30),
          duration: Phaser.Math.Between(9000, 13000),
          onComplete: () => img.destroy(),
        });
      },
    });
  switch (h.id) {
    case 'valentine':
      rise(pixelTexture(scene, 'ml-heart', HEART, { '#': 0xff6b9a }), 700);
      break;
    case 'clover':
      rise(pixelTexture(scene, 'ml-clover', CLOVER, { '#': 0x4ad86a }), 750, true);
      break;
    case 'halloween': {
      scene.time.addEvent({ delay: 9000, startAt: 7000, loop: true, callback: () => flock(batFrames, Phaser.Math.Between(3, 6)) });
      const pk = pixelTexture(scene, 'ml-pumpkin', PUMPKIN, { '#': 0xff8a1a, o: 0xffe14d });
      // Jack-o'-lanterns in the corners, glowing.
      for (const [x, y] of [
        [scr.x + 18, scr.bottom - 18],
        [scr.right - 18, scr.bottom - 18],
        [scr.x + 18, scr.y + 18],
        [scr.right - 18, scr.y + 18],
      ]) {
        const img = scene.add.image(x, y, pk).setScale(1.6);
        over.add(img);
        if (!quiet) scene.tweens.add({ targets: img, alpha: 0.6, yoyo: true, repeat: -1, duration: 900 + x });
      }
      break;
    }
    case 'winter': {
      over.add(
        scene.add.particles(0, 0, dot(scene), {
          emitZone: { type: 'random', source: new Phaser.Geom.Rectangle(scr.x - 30, scr.y - 8, scr.width + 60, 6) as never },
          speedY: { min: 22, max: 46 },
          speedX: { min: -12, max: 8 },
          lifespan: 16000,
          frequency: quiet ? 160 : 60,
          tint: 0xffffff,
          alpha: { min: 0.6, max: 1 },
          scale: { min: 0.8, max: 1.5 },
          advance: 8000,
        }),
      );
      // A string of lights along the top.
      const colors = [0xff4a4a, 0x4ad86a, 0xffe14d, 0x5ab8ff];
      const g = scene.add.graphics().lineStyle(1, 0x2a3a2a, 0.9);
      over.add(g);
      const n = Math.floor(scr.width / 22);
      for (let i = 0; i <= n; i++) {
        const x = scr.x + (scr.width * i) / n;
        const y = scr.y + 6 + Math.sin((i / n) * Math.PI * 6) * 4 + 4;
        if (i) g.lineTo(x, y - 3);
        else g.beginPath().moveTo(x, y - 3);
        const bulb = scene.add.circle(x, y, 3, colors[i % colors.length]);
        over.add(bulb);
        if (!quiet) scene.tweens.add({ targets: bulb, alpha: 0.35, yoyo: true, repeat: -1, duration: 600, delay: (i % 4) * 300 });
      }
      g.strokePath();
      break;
    }
    case 'newyear': {
      const burst = () => {
        const x = Phaser.Math.Between(scr.x + 40, scr.right - 40);
        const y = Phaser.Math.Between(scr.y + 40, scr.y + scr.height * 0.5);
        const color = Phaser.Utils.Array.GetRandom([0xff4a4a, 0xffe14d, 0x5ab8ff, 0x8fffb0, 0xff8ae0]);
        const em = scene.add.particles(x, y, dot(scene), {
          speed: { min: 40, max: 110 },
          gravityY: 40,
          lifespan: 1300,
          tint: [color, 0xffffff],
          alpha: { start: 1, end: 0 },
          scale: { start: 1.5, end: 0.5 },
          blendMode: 'ADD',
          emitting: false,
        });
        over.add(em);
        em.explode(quiet ? 14 : 30);
        scene.time.delayedCall(1600, () => em.destroy());
      };
      scene.time.addEvent({ delay: quiet ? 3000 : 1400, loop: true, callback: burst });
      break;
    }
  }
  // The greeting, once on the way in.
  const t = text(scene, scr.centerX, scr.y + 26, h.greeting, 15, '#ffe9a8', { fontStyle: 'bold', stroke: '#14101e', strokeThickness: 4 }).setOrigin(0.5);
  over.add(t);
  scene.tweens.add({ targets: t, alpha: 0, delay: 3200, duration: 900, onComplete: () => t.destroy() });
}

/** Lattice cells with no hex: where wild Hexlings can stand. */
function freeCells(o: MapLifeOpts): { x: number; y: number }[] {
  if (!o.nodes.length) return [];
  const taken = new Set(o.nodes.map((n) => `${n.col},${n.y}`));
  const parity = (((o.nodes[0].col + o.nodes[0].y) % 2) + 2) % 2;
  const ys = o.nodes.map((n) => n.y);
  const lo = Math.min(...ys);
  const hi = Math.max(...ys);
  const out: { x: number; y: number }[] = [];
  // Any column that lands inside the map's area (wide screens have room beside the grid).
  const step = o.at(1, lo).x - o.at(0, lo).x;
  const first = Math.floor((o.area.x - o.at(0, lo).x) / step);
  const last = Math.ceil((o.area.x + o.area.w - o.at(0, lo).x) / step);
  for (let y = lo; y <= hi; y++)
    for (let col = first; col <= last; col++) {
      if ((((col + y) % 2) + 2) % 2 !== parity || taken.has(`${col},${y}`)) continue;
      const p = o.at(col, y);
      if (p.x < o.area.x + 18 || p.x > o.area.x + o.area.w - 18) continue;
      out.push(p);
    }
  return out;
}

function makeWilds(scene: Phaser.Scene, o: MapLifeOpts): Wild[] {
  const cells = freeCells(o);
  const pool = speciesWithElement(o.biome);
  if (!cells.length || !pool.length) return [];
  const count = Phaser.Math.Clamp(Math.round(cells.length / 5), 2, 9);
  Phaser.Utils.Array.Shuffle(cells);
  const homes: { x: number; y: number }[] = [];
  for (const c of cells) {
    if (homes.length >= count) break;
    if (homes.some((h) => Phaser.Math.Distance.Between(h.x, h.y, c.x, c.y) < o.hexH * 1.6)) continue;
    homes.push(c);
  }
  const wilds: Wild[] = homes.map((home) => {
    const sp = Phaser.Utils.Array.GetRandom(pool);
    // Mostly the land's young ones, now and then a grown one.
    const stage = Math.min(2, Math.max(0, o.stage - (Math.random() < 0.6 ? 1 : 0)));
    const c = scene.add.container(home.x, home.y + o.hexH * 0.1);
    const shadow = scene.add.ellipse(0, 0, 22, 7, 0x000000, 0.35);
    const img = scene.add.image(0, 0, ensureCreatureTexture(scene, sp.id, stage)).setOrigin(0.5, 0.92).setScale(1.4 * SPRITE_FIT).setFlipX(Math.random() < 0.5);
    c.add([shadow, img]);
    c.setAlpha(0);
    // Under the hexes, over the paths.
    o.layer.addAt(c, 1);
    scene.tweens.add({ targets: c, alpha: 1, duration: 600, delay: Phaser.Math.Between(0, 900) });
    const w: Wild = { c, img, speciesId: sp.id, stage, home, busy: false, gone: false };
    img.setInteractive({ useHandCursor: true }).on('pointerup', () => {
      if (!o.tapOk() || w.gone) return;
      cry(w.speciesId, w.stage);
      bubble(scene, w, Math.random() < 0.5 ? '♪' : '!');
      hop(scene, w);
    });
    schedule(scene, w, o);
    return w;
  });
  return wilds;
}

function schedule(scene: Phaser.Scene, w: Wild, o: MapLifeOpts) {
  w.timer?.remove();
  w.timer = scene.time.delayedCall(Phaser.Math.Between(1400, 4200), () => act(scene, w, o));
}

function act(scene: Phaser.Scene, w: Wild, o: MapLifeOpts) {
  if (w.gone || !w.c.active) return;
  if (w.busy) return schedule(scene, w, o);
  const r = Math.random();
  if (r < 0.5) {
    // Wander a little way from home.
    const tx = w.home.x + Phaser.Math.Between(-1, 1) * o.hexW * 0.22;
    const ty = w.home.y + o.hexH * 0.1 + Phaser.Math.Between(-1, 1) * o.hexH * 0.12;
    walk(scene, w, tx, ty, 24, () => schedule(scene, w, o));
    return;
  }
  if (r < 0.7) {
    // Look around.
    w.img.setFlipX(!w.img.flipX);
    scene.time.delayedCall(700, () => w.c.active && w.img.setFlipX(!w.img.flipX));
  } else if (r < 0.85) {
    // A nap.
    w.busy = true;
    scene.tweens.add({ targets: w.img, scaleY: w.img.scaleY * 0.9, yoyo: true, repeat: 3, duration: 900 });
    for (let i = 0; i < 4; i++) scene.time.delayedCall(i * 900, () => w.c.active && !w.gone && bubble(scene, w, 'z', true));
    scene.time.delayedCall(3800, () => (w.busy = false));
  } else hop(scene, w);
  schedule(scene, w, o);
}

function walk(scene: Phaser.Scene, w: Wild, x: number, y: number, speed: number, done: () => void) {
  const d = Phaser.Math.Distance.Between(w.c.x, w.c.y, x, y);
  if (d < 2) return done();
  w.img.setFlipX(x < w.c.x);
  const duration = (d / speed) * 1000;
  const bounce = scene.tweens.add({ targets: w.img, y: -3, yoyo: true, repeat: -1, duration: 140 });
  scene.tweens.add({
    targets: w.c,
    x,
    y,
    duration,
    ease: 'Sine.easeInOut',
    onComplete: () => {
      bounce.remove();
      w.img.setY(0);
      done();
    },
  });
}

function hop(scene: Phaser.Scene, w: Wild) {
  scene.tweens.add({ targets: w.img, y: -10, yoyo: true, duration: 180, ease: 'Quad.easeOut' });
}

function bubble(scene: Phaser.Scene, w: Wild, s: string, drift = false) {
  const b = text(scene, w.c.x + (drift ? 8 : 0), w.c.y - 34, s, drift ? 11 : 15, drift ? '#d8e0ff' : '#ffffff', { fontStyle: 'bold', stroke: '#14101e', strokeThickness: 3 }).setOrigin(0.5);
  w.c.parentContainer?.add(b);
  scene.tweens.add({ targets: b, y: b.y - (drift ? 18 : 10), x: b.x + (drift ? 8 : 0), alpha: 0, duration: drift ? 1300 : 900, onComplete: () => b.destroy() });
}

/** Startled: a jump, then a dash away, fading; it comes back somewhere else a while later. */
function flee(scene: Phaser.Scene, w: Wild, fx: number, fy: number, o: MapLifeOpts) {
  w.gone = true;
  w.timer?.remove();
  scene.tweens.killTweensOf(w.c);
  scene.tweens.killTweensOf(w.img);
  w.img.setY(0);
  bubble(scene, w, '!');
  const a = Math.atan2(w.c.y - fy, w.c.x - fx) || Math.random() * Math.PI * 2;
  scene.tweens.add({
    targets: w.img,
    y: -12,
    yoyo: true,
    duration: 160,
    onComplete: () => {
      w.img.setFlipX(Math.cos(a) < 0);
      walk(scene, w, w.c.x + Math.cos(a) * o.hexW * 1.6, w.c.y + Math.sin(a) * o.hexH * 1.2, 150, () => {});
      scene.tweens.add({
        targets: w.c,
        alpha: 0,
        duration: 650,
        onComplete: () =>
          scene.time.delayedCall(Phaser.Math.Between(5000, 9000), () => {
            if (!w.c.active) return;
            // Back at a quiet spot away from where it was scared.
            const cells = freeCells(o).filter((c) => Phaser.Math.Distance.Between(c.x, c.y, fx, fy) > o.hexW * 2);
            const home = cells.length ? Phaser.Utils.Array.GetRandom(cells) : w.home;
            w.home = home;
            w.c.setPosition(home.x, home.y + o.hexH * 0.1);
            w.gone = false;
            scene.tweens.add({ targets: w.c, alpha: 1, duration: 700 });
            schedule(scene, w, o);
          }),
      });
    },
  });
}
