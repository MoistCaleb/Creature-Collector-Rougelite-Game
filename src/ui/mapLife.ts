import Phaser from 'phaser';
import { speciesWithElement } from '../data/species';
import type { Element } from '../data/types';
import { dayPhase, holidayOn, type DayPhase, type Holiday } from '../logic/ambience';
import type { MapNode } from '../logic/map';
import { cry } from './cries';
import { calm } from './motion';
import { prefs } from './prefs';
import { ensureCreatureTexture, SPRITE_FIT } from './sprites';
import { placeBelow, text } from './widgets';

/**
 * The map's life: wild Hexlings of the land roaming the hexes, hopping from hex to hex along the
 * paths (they scatter when your trainer lands close by, and squeak when tapped), birds and cloud shadows, glints
 * on rest and treasure hexes, the time of day, and holiday touches on holidays.
 */

export interface MapLifeOpts {
  /** The scrolling map layer: wild Hexlings go in it, standing on the hexes. */
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
  /** Hexes wild Hexlings keep off: yours, the ones you can move to next, and the guardian's. */
  blocked: (at?: string) => Set<string>;
}

export interface MapLife {
  /** Your trainer landed on hex `id` at (x, y), layer coordinates: wild Hexlings close by scatter. */
  scare(x: number, y: number, id: string): void;
  phase: DayPhase | null;
  holiday: Holiday | null;
}

interface Wild {
  c: Phaser.GameObjects.Container;
  img: Phaser.GameObjects.Image;
  speciesId: string;
  stage: number;
  /** The hex it's on. */
  node: string;
  /** Which corner of the hex it stands in (-1 left, 1 right). */
  side: number;
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
  placeBelow(scene.children, under, o.layer);
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

  // ---- wild Hexlings roaming the hexes
  const herd = new Herd(scene, o);

  return {
    phase,
    holiday,
    scare: (x, y, id) => herd.scare(x, y, id),
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

/** The wild Hexlings on the map, hopping between connected hexes. */
class Herd {
  private wilds: Wild[] = [];
  /** The hex your trainer just landed on (before the run records the move). */
  private landing: string | null = null;
  private links = new Map<string, string[]>();
  private byId = new Map<string, MapNode>();

  constructor(
    private scene: Phaser.Scene,
    private o: MapLifeOpts,
  ) {
    // Paths both ways: up the map and back down.
    for (const n of o.nodes) {
      this.byId.set(n.id, n);
      for (const m of n.next) {
        this.links.set(n.id, [...(this.links.get(n.id) ?? []), m]);
        this.links.set(m, [...(this.links.get(m) ?? []), n.id]);
      }
    }
    const pool = speciesWithElement(o.biome);
    if (!pool.length) return;
    const free = Phaser.Utils.Array.Shuffle(this.freeNodes());
    const count = Phaser.Math.Clamp(Math.round(o.nodes.length / 5), 3, 11);
    for (const id of free) {
      if (this.wilds.length >= count) break;
      // Spread out: not right next to another one.
      if (this.wilds.some((w) => w.node === id || (this.links.get(id) ?? []).includes(w.node))) continue;
      this.add(id, Phaser.Utils.Array.GetRandom(pool).id);
    }
  }

  /** Hexes a wild Hexling may stand on now. */
  private freeNodes(except?: Wild): string[] {
    const blocked = this.o.blocked(this.landing ?? undefined);
    return this.o.nodes.filter((n) => n.kind !== 'start' && !blocked.has(n.id) && !this.wilds.some((w) => w !== except && !w.gone && w.node === n.id)).map((n) => n.id);
  }

  /** Where it stands on a hex: in a lower corner, clear of the icon. */
  private spot(id: string, side: number) {
    const n = this.byId.get(id)!;
    const p = this.o.at(n.col, n.y);
    return { x: p.x + side * this.o.hexW * 0.22, y: p.y + this.o.hexH * 0.24 };
  }

  private add(node: string, speciesId: string) {
    const { scene, o } = this;
    // Mostly the land's young ones, now and then a grown one.
    const stage = Math.min(2, Math.max(0, o.stage - (Math.random() < 0.6 ? 1 : 0)));
    const side = Math.random() < 0.5 ? -1 : 1;
    const at = this.spot(node, side);
    const c = scene.add.container(at.x, at.y);
    const shadow = scene.add.ellipse(0, 0, 24, 7, 0x000000, 0.45);
    const img = scene.add.image(0, 0, ensureCreatureTexture(scene, speciesId, stage)).setOrigin(0.5, 0.92).setScale(1.45 * SPRITE_FIT).setFlipX(side > 0);
    c.add([shadow, img]);
    c.setAlpha(0);
    o.layer.add(c);
    scene.tweens.add({ targets: c, alpha: 1, duration: 600, delay: Phaser.Math.Between(0, 900) });
    const w: Wild = { c, img, speciesId, stage, node, side, busy: false, gone: false };
    img.setInteractive({ useHandCursor: true }).on('pointerup', () => {
      if (!o.tapOk() || w.gone || w.busy) return;
      cry(w.speciesId, w.stage);
      this.bubble(w, Math.random() < 0.5 ? '♪' : '!');
      this.bounce(w);
    });
    this.wilds.push(w);
    this.schedule(w);
  }

  private schedule(w: Wild) {
    w.timer?.remove();
    w.timer = this.scene.time.delayedCall(Phaser.Math.Between(1600, 4600), () => this.act(w));
  }

  private act(w: Wild) {
    if (w.gone || !w.c.active) return;
    if (w.busy) return this.schedule(w);
    const r = Math.random();
    if (r < 0.5) {
      // Hop along a path to a neighboring hex (if one is free).
      const free = new Set(this.freeNodes(w));
      const next = (this.links.get(w.node) ?? []).filter((id) => free.has(id));
      if (next.length) return this.hopTo(w, Phaser.Utils.Array.GetRandom(next), false, () => this.schedule(w));
    } else if (r < 0.7) {
      // Look around.
      w.img.setFlipX(!w.img.flipX);
      this.scene.time.delayedCall(700, () => w.c.active && w.img.setFlipX(!w.img.flipX));
    } else if (r < 0.85) {
      // A nap.
      w.busy = true;
      this.scene.tweens.add({ targets: w.img, scaleY: w.img.scaleY * 0.9, yoyo: true, repeat: 3, duration: 900 });
      for (let i = 0; i < 4; i++) this.scene.time.delayedCall(i * 900, () => w.c.active && !w.gone && this.bubble(w, 'z', true));
      this.scene.time.delayedCall(3800, () => (w.busy = false));
    } else this.bounce(w);
    this.schedule(w);
  }

  /** A hop in an arc to another hex, landing in a corner of it. */
  private hopTo(w: Wild, id: string, fast: boolean, done: () => void) {
    const from = { x: w.c.x, y: w.c.y };
    w.side = Math.random() < 0.5 ? -1 : 1;
    const to = this.spot(id, w.side);
    w.node = id;
    w.busy = true;
    w.img.setFlipX(to.x > from.x);
    const arc = { t: 0 };
    const lift = calm() ? 6 : fast ? 16 : 22;
    this.scene.tweens.add({
      targets: arc,
      t: 1,
      duration: fast ? 260 : 460,
      ease: 'Sine.easeInOut',
      onUpdate: () => {
        w.c.setPosition(from.x + (to.x - from.x) * arc.t, from.y + (to.y - from.y) * arc.t);
        w.img.setY(-Math.sin(arc.t * Math.PI) * lift);
      },
      onComplete: () => {
        w.img.setY(0);
        w.busy = false;
        done();
      },
    });
  }

  private bounce(w: Wild) {
    this.scene.tweens.add({ targets: w.img, y: -10, yoyo: true, duration: 180, ease: 'Quad.easeOut' });
  }

  private bubble(w: Wild, s: string, drift = false) {
    const b = text(this.scene, w.c.x + (drift ? 8 : 0), w.c.y - 30, s, drift ? 11 : 15, drift ? '#d8e0ff' : '#ffffff', { fontStyle: 'bold', stroke: '#14101e', strokeThickness: 3 }).setOrigin(0.5);
    this.o.layer.add(b);
    this.scene.tweens.add({ targets: b, y: b.y - (drift ? 18 : 10), x: b.x + (drift ? 8 : 0), alpha: 0, duration: drift ? 1300 : 900, onComplete: () => b.destroy() });
  }

  /** Your trainer landed at (x, y): anyone on your hexes or close by scatters, a hex or two away. */
  scare(x: number, y: number, id: string) {
    this.landing = id;
    const blocked = this.o.blocked(id);
    for (const w of this.wilds) {
      if (w.gone) continue;
      if (!blocked.has(w.node) && Phaser.Math.Distance.Between(w.c.x, w.c.y, x, y) > this.o.hexW * 1.3) continue;
      w.timer?.remove();
      this.scene.tweens.killTweensOf(w.img);
      w.img.setY(0);
      w.busy = false;
      this.bubble(w, '!');
      this.run(w, x, y, 2);
    }
  }

  /** Hop away from (x, y), `steps` hexes; with nowhere to go, slip away and come back elsewhere. */
  private run(w: Wild, x: number, y: number, steps: number) {
    const free = new Set(this.freeNodes(w));
    const away = (id: string) => {
      const n = this.byId.get(id)!;
      const p = this.o.at(n.col, n.y);
      return Phaser.Math.Distance.Between(p.x, p.y, x, y);
    };
    const here = away(w.node);
    const options = (this.links.get(w.node) ?? []).filter((id) => free.has(id) && away(id) >= here).sort((a, b) => away(b) - away(a));
    if (steps > 0 && options.length) return this.hopTo(w, options[0], true, () => this.run(w, x, y, steps - 1));
    if (!this.o.blocked(this.landing ?? undefined).has(w.node) && Phaser.Math.Distance.Between(w.c.x, w.c.y, x, y) > this.o.hexW * 1.1) return this.schedule(w);
    // Cornered: it dashes off the map and turns up again later on a quiet hex.
    w.gone = true;
    this.scene.tweens.add({
      targets: w.c,
      alpha: 0,
      y: w.c.y - 12,
      duration: 500,
      onComplete: () =>
        this.scene.time.delayedCall(Phaser.Math.Between(5000, 9000), () => {
          if (!w.c.active) return;
          const spots = this.freeNodes(w).filter((id) => away(id) > this.o.hexW * 2);
          if (!spots.length) return;
          w.node = Phaser.Utils.Array.GetRandom(spots);
          const p = this.spot(w.node, w.side);
          w.c.setPosition(p.x, p.y);
          w.gone = false;
          this.scene.tweens.add({ targets: w.c, alpha: 1, duration: 700 });
          this.schedule(w);
        }),
    });
  }
}
