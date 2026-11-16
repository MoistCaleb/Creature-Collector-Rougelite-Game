import Phaser from 'phaser';
import type { MoveDef } from '../data/moves';
import { moveStyle, type Style } from '../data/moveStyle';
export type { Style } from '../data/moveStyle';
import type { Element } from '../data/types';
import { attackImpact, attackTravel, healFx } from './fx';
import { sfx } from './sound';

/**
 * Move animations chosen from the words in a move's name ("Venom Fang" bites, "Tsunami"
 * sweeps a wave across), tinted by the move's element.
 */

// ------------------------------------------------------------ palette

const PAL: Record<Element, { main: number; light: number; dark: number; tex: string }> = {
  Fire: { main: 0xff6a1a, light: 0xffd04d, dark: 0xb32a0a, tex: 'fx-dot' },
  Frost: { main: 0x9fe0ff, light: 0xffffff, dark: 0x4a9ad0, tex: 'fx-shard' },
  Nature: { main: 0x5fc95a, light: 0xc4f08a, dark: 0x2f7a2c, tex: 'fx-leaf' },
  Earth: { main: 0xa8743f, light: 0xd8b07a, dark: 0x5e3d1e, tex: 'fx-rock' },
  Storm: { main: 0xffe14d, light: 0xffffff, dark: 0xc9a000, tex: 'fx-spark' },
  Water: { main: 0x3aa0ff, light: 0xb8e2ff, dark: 0x1a5aa8, tex: 'fx-dot' },
  Metal: { main: 0xc9d3dd, light: 0xffffff, dark: 0x6d7a88, tex: 'fx-spark' },
  Toxic: { main: 0xa64dff, light: 0xd7a6ff, dark: 0x5a1a8f, tex: 'fx-dot' },
  Shadow: { main: 0x5b3c8a, light: 0x9a7ad0, dark: 0x140a22, tex: 'fx-dot' },
  Light: { main: 0xfff3a0, light: 0xffffff, dark: 0xe0b83a, tex: 'fx-spark' },
  Spirit: { main: 0x9ad8ff, light: 0xe6d6ff, dark: 0x6a5ad0, tex: 'fx-dot' },
  Dragon: { main: 0xff5a3a, light: 0xffb02e, dark: 0x8a2be2, tex: 'fx-dot' },
};

type Pt = { x: number; y: number };
type Img = Phaser.GameObjects.Image;

const sleep = (s: Phaser.Scene, ms: number) => new Promise<void>((r) => s.time.delayedCall(ms, () => r()));
const tw = (s: Phaser.Scene, cfg: Phaser.Types.Tweens.TweenBuilderConfig) =>
  new Promise<void>((r) => s.tweens.add({ ...cfg, onComplete: () => r() }));

function particles(s: Phaser.Scene, at: Pt, tex: string, tints: number[], count: number, cfg: Partial<Phaser.Types.GameObjects.Particles.ParticleEmitterConfig> = {}) {
  const em = s.add.particles(at.x, at.y, tex, {
    speed: { min: 60, max: 200 },
    lifespan: { min: 300, max: 600 },
    scale: { start: 1, end: 0 },
    alpha: { start: 1, end: 0 },
    tint: tints,
    emitting: false,
    ...cfg,
  });
  em.setDepth(50);
  em.explode(count);
  s.time.delayedCall(1500, () => em.destroy());
  return em;
}

/** Quick lunge toward the target, for moves that don't travel. */
function lunge(s: Phaser.Scene, actor: Img, target: Pt) {
  const home = { x: actor.x, y: actor.y };
  const dx = Math.sign(target.x - home.x) * 26;
  const dy = Math.sign(target.y - home.y) * 10;
  s.tweens.add({ targets: actor, x: home.x + dx, y: home.y + dy, yoyo: true, duration: 110 });
}

// ------------------------------------------------------------ attack styles

async function bite(s: Phaser.Scene, at: Pt, c: { main: number; light: number }) {
  const mk = (top: boolean) => {
    const g = s.add.graphics().setDepth(52);
    g.fillStyle(0xffffff, 1);
    for (let i = 0; i < 5; i++) {
      const x = -50 + i * 25;
      if (top) g.fillTriangle(x, 0, x + 20, 0, x + 10, 26);
      else g.fillTriangle(x, 0, x + 20, 0, x + 10, -26);
    }
    g.lineStyle(5, c.main, 1);
    g.lineBetween(-54, 0, 54, 0);
    g.setPosition(at.x, at.y + (top ? -70 : 70));
    return g;
  };
  const top = mk(true);
  const bot = mk(false);
  sfx.style('bite');
  await Promise.all([
    tw(s, { targets: top, y: at.y - 22, duration: 150, ease: 'Quad.easeIn' }),
    tw(s, { targets: bot, y: at.y + 22, duration: 150, ease: 'Quad.easeIn' }),
  ]);
  s.tweens.add({ targets: [top, bot], alpha: 0, duration: 220, delay: 80, onComplete: () => (top.destroy(), bot.destroy()) });
}

async function slashLines(s: Phaser.Scene, at: Pt, color: number, n: number, len: number, angle: number, width = 6) {
  sfx.style('slash');
  for (let i = 0; i < n; i++) {
    const g = s.add.graphics().setDepth(52);
    const off = (i - (n - 1) / 2) * 20;
    const cos = Math.cos(angle);
    const sin = Math.sin(angle);
    // perpendicular offset for parallel claw marks
    const ox = -sin * off;
    const oy = cos * off;
    const x1 = at.x - (cos * len) / 2 + ox;
    const y1 = at.y - (sin * len) / 2 + oy;
    const t = { p: 0 };
    s.tweens.add({
      targets: t,
      p: 1,
      duration: 100,
      onUpdate: () => {
        g.clear();
        g.lineStyle(width, color, 1);
        g.lineBetween(x1, y1, x1 + cos * len * t.p, y1 + sin * len * t.p);
        g.lineStyle(Math.max(2, width / 3), 0xffffff, 1);
        g.lineBetween(x1, y1, x1 + cos * len * t.p, y1 + sin * len * t.p);
      },
      onComplete: () => s.tweens.add({ targets: g, alpha: 0, duration: 240, onComplete: () => g.destroy() }),
    });
    await sleep(s, 65);
  }
  await sleep(s, 50);
}

async function whip(s: Phaser.Scene, from: Pt, to: Pt, color: number) {
  const g = s.add.graphics().setDepth(52);
  const mid = { x: (from.x + to.x) / 2, y: Math.min(from.y, to.y) - 90 };
  const pt = (p: number) => {
    const a = 1 - p;
    return { x: a * a * from.x + 2 * a * p * mid.x + p * p * to.x, y: a * a * from.y + 2 * a * p * mid.y + p * p * to.y };
  };
  const t = { p: 0 };
  sfx.style('whip');
  await tw(s, {
    targets: t,
    p: 1,
    duration: 200,
    ease: 'Quad.easeIn',
    onUpdate: () => {
      g.clear();
      g.lineStyle(6, color, 1);
      g.beginPath();
      g.moveTo(from.x, from.y);
      for (let i = 1; i <= 16; i++) {
        const q = pt((t.p * i) / 16);
        g.lineTo(q.x, q.y);
      }
      g.strokePath();
    },
  });
  s.tweens.add({ targets: g, alpha: 0, duration: 200, onComplete: () => g.destroy() });
}

async function bind(s: Phaser.Scene, target: Img, c: { main: number; dark: number }) {
  const g = s.add.graphics().setDepth(52);
  const base = { x: target.x, y: target.y + 40 };
  const t = { p: 0 };
  sfx.style('bind');
  await tw(s, {
    targets: t,
    p: 1,
    duration: 320,
    onUpdate: () => {
      g.clear();
      for (let k = 0; k < 3; k++) {
        g.lineStyle(5, k % 2 ? c.dark : c.main, 1);
        g.beginPath();
        const h = 110 * t.p;
        for (let y = 0; y <= h; y += 6) {
          const x = base.x + Math.sin(y / 14 + k * 2.1) * (34 - y * 0.08) * (k % 2 ? -1 : 1);
          if (y === 0) g.moveTo(x, base.y - y);
          else g.lineTo(x, base.y - y);
        }
        g.strokePath();
      }
    },
  });
  const sx = target.scaleX;
  s.tweens.add({ targets: target, scaleX: sx * 0.82, yoyo: true, duration: 120, repeat: 1 });
  s.tweens.add({ targets: g, alpha: 0, duration: 300, delay: 150, onComplete: () => g.destroy() });
}

async function quake(s: Phaser.Scene, from: Pt, to: Pt, c: { main: number; dark: number; tex: string }) {
  sfx.style('quake');
  s.cameras.main.shake(450, 0.012);
  const g = s.add.graphics().setDepth(40);
  const groundY = to.y + 60;
  const t = { p: 0 };
  await tw(s, {
    targets: t,
    p: 1,
    duration: 320,
    onUpdate: () => {
      g.clear();
      g.lineStyle(4, c.dark, 1);
      g.beginPath();
      const x0 = from.x;
      const y0 = from.y + 60;
      g.moveTo(x0, y0);
      const steps = 10;
      for (let i = 1; i <= steps * t.p; i++) {
        const p = i / steps;
        g.lineTo(x0 + (to.x - x0) * p + (i % 2 ? 8 : -8), y0 + (groundY - y0) * p + (i % 2 ? -6 : 6));
      }
      g.strokePath();
    },
  });
  particles(s, { x: to.x, y: groundY }, 'fx-rock', [c.main, c.dark], 16, { angle: { min: 200, max: 340 }, gravityY: 500, speed: { min: 150, max: 300 } });
  s.tweens.add({ targets: g, alpha: 0, duration: 400, delay: 200, onComplete: () => g.destroy() });
}

async function burrow(s: Phaser.Scene, actor: Img, to: Pt, c: { main: number; dark: number }) {
  const home = { x: actor.x, y: actor.y };
  sfx.style('quake');
  particles(s, { x: home.x, y: home.y + 40 }, 'fx-rock', [c.main, c.dark, 0x6e4a28], 12, { angle: { min: 200, max: 340 }, gravityY: 500 });
  await tw(s, { targets: actor, y: home.y + 50, alpha: 0, duration: 180 });
  await sleep(s, 140);
  s.cameras.main.shake(250, 0.01);
  particles(s, { x: to.x, y: to.y + 50 }, 'fx-rock', [c.main, c.dark, 0x6e4a28], 22, { angle: { min: 220, max: 320 }, gravityY: 600, speed: { min: 220, max: 380 } });
  s.time.delayedCall(260, () => {
    actor.setPosition(home.x, home.y + 50);
    s.tweens.add({ targets: actor, y: home.y, alpha: 1, duration: 200 });
  });
}

async function column(s: Phaser.Scene, at: Pt, c: { main: number; light: number; tex: string }, fromSky: boolean) {
  sfx.style(fromSky ? 'pillar' : 'geyser');
  const w = 64;
  const top = fromSky ? 0 : at.y - 130;
  const bottom = at.y + 60;
  const h = bottom - top;
  // Sky pillars grow down from the top; geysers grow up from the ground.
  const oy = fromSky ? 0 : 1;
  const y = fromSky ? top : bottom;
  const r = s.add.rectangle(at.x, y, w, h, c.main, 0.85).setOrigin(0.5, oy).setDepth(52).setScale(1, 0.01);
  const core = s.add.rectangle(at.x, y, w / 3, h, c.light, 1).setOrigin(0.5, oy).setDepth(53).setScale(1, 0.01);
  if (fromSky) s.cameras.main.flash(120, 255, 250, 210, true);
  await tw(s, { targets: [r, core], scaleY: 1, duration: 180, ease: 'Quad.easeOut' });
  particles(s, { x: at.x, y: fromSky ? at.y + 30 : at.y }, c.tex, [c.main, c.light], 18, { gravityY: fromSky ? 200 : -400, speed: { min: 60, max: 180 } });
  s.tweens.add({ targets: [r, core], alpha: 0, scaleX: 1.6, duration: 320, onComplete: () => (r.destroy(), core.destroy()) });
}

async function wave(s: Phaser.Scene, from: Pt, to: Pt, c: { main: number; light: number; dark: number; tex: string }) {
  sfx.style('wave');
  const g = s.add.graphics().setDepth(52);
  g.fillStyle(c.main, 0.85);
  g.fillEllipse(0, 0, 120, 150);
  g.fillStyle(c.light, 0.9);
  g.fillEllipse(-10, -50, 90, 40);
  g.setPosition(from.x, from.y + 20).setScale(0.4);
  const spray = s.add.particles(0, 0, 'fx-dot', {
    follow: g,
    speed: { min: 40, max: 140 },
    angle: { min: 220, max: 320 },
    gravityY: 300,
    lifespan: 500,
    scale: { start: 1, end: 0 },
    tint: [c.light, c.main, 0xffffff],
    frequency: 18,
  });
  spray.setDepth(51);
  await tw(s, { targets: g, x: to.x, y: to.y, scale: 1.1, duration: 360, ease: 'Quad.easeIn' });
  spray.stop();
  s.time.delayedCall(600, () => spray.destroy());
  s.tweens.add({ targets: g, alpha: 0, scale: 1.5, duration: 260, onComplete: () => g.destroy() });
}

async function vortex(s: Phaser.Scene, at: Pt, c: { main: number; light: number; tex: string }) {
  sfx.style('vortex');
  const bits: Phaser.GameObjects.Image[] = [];
  for (let i = 0; i < 18; i++) bits.push(s.add.image(at.x, at.y, c.tex).setTint(i % 2 ? c.main : c.light).setDepth(52).setScale(1.2));
  const t = { p: 0 };
  await tw(s, {
    targets: t,
    p: 1,
    duration: 480,
    onUpdate: () => {
      bits.forEach((b, i) => {
        const a = t.p * Math.PI * 5 + (i / bits.length) * Math.PI * 2;
        const r = 80 * (1 - t.p) + 14;
        b.setPosition(at.x + Math.cos(a) * r, at.y + Math.sin(a) * r * 0.55 + (i % 3) * 10 - 10);
        b.rotation = a;
      });
    },
  });
  bits.forEach((b) => s.tweens.add({ targets: b, alpha: 0, scale: 0, duration: 200, onComplete: () => b.destroy() }));
}

async function rain(s: Phaser.Scene, at: Pt, c: { main: number; light: number; tex: string }) {
  sfx.style('rain');
  const drops: Promise<void>[] = [];
  for (let i = 0; i < 16; i++) {
    const x = at.x + Phaser.Math.Between(-80, 80);
    const y = at.y + Phaser.Math.Between(-40, 40);
    drops.push(
      sleep(s, i * 28).then(async () => {
        const d = s.add.image(x - 40, -20, c.tex).setTint(i % 2 ? c.main : c.light).setDepth(52).setScale(1.4);
        d.rotation = 0.5;
        await tw(s, { targets: d, x, y, duration: 260, ease: 'Quad.easeIn' });
        d.destroy();
        particles(s, { x, y }, 'fx-dot', [c.main, c.light], 3, { speed: { min: 30, max: 90 }, lifespan: 250 });
      }),
    );
  }
  await Promise.all(drops.slice(0, 8));
}

async function breath(s: Phaser.Scene, from: Pt, to: Pt, c: { main: number; light: number; tex: string }) {
  sfx.style('breath');
  const ang = Phaser.Math.RadToDeg(Math.atan2(to.y - from.y, to.x - from.x));
  const dist = Phaser.Math.Distance.Between(from.x, from.y, to.x, to.y);
  const em = s.add.particles(from.x, from.y, c.tex, {
    angle: { min: ang - 9, max: ang + 9 },
    speed: dist * 2.2,
    lifespan: 450,
    scale: { start: 0.6, end: 2.4 },
    alpha: { start: 1, end: 0 },
    tint: [c.main, c.light],
    frequency: 12,
    quantity: 2,
  });
  em.setDepth(52);
  await sleep(s, 260);
  s.time.delayedCall(200, () => em.stop());
  s.time.delayedCall(900, () => em.destroy());
}

async function beam(s: Phaser.Scene, from: Pt, to: Pt, c: { main: number; light: number }, width: number, charge = false) {
  if (charge) {
    sfx.style('gather');
    const o = s.add.circle(from.x, from.y, 4, c.light, 1).setDepth(53);
    await tw(s, { targets: o, scale: 6, duration: 260, ease: 'Quad.easeIn' });
    o.destroy();
  }
  sfx.style('beam');
  const g = s.add.graphics().setDepth(52);
  g.lineStyle(width, c.main, 0.85);
  g.lineBetween(from.x, from.y, to.x, to.y);
  g.lineStyle(Math.max(2, width / 3), c.light, 1);
  g.lineBetween(from.x, from.y, to.x, to.y);
  g.setAlpha(0);
  await tw(s, { targets: g, alpha: 1, duration: 80 });
  s.tweens.add({ targets: g, alpha: 0, duration: 280, onComplete: () => g.destroy() });
}

async function gaze(s: Phaser.Scene, actor: Img, to: Pt, c: { main: number; light: number }) {
  const eyes = [-10, 10].map((dx) => s.add.circle(actor.x + dx, actor.y - 14, 4, c.light, 1).setDepth(53));
  sfx.style('gather');
  await tw(s, { targets: eyes, scale: 2.4, duration: 200, yoyo: true });
  eyes.forEach((e) => e.destroy());
  await beam(s, { x: actor.x, y: actor.y - 14 }, to, c, 6);
}

async function roar(s: Phaser.Scene, from: Pt, to: Pt, c: { main: number; light: number }) {
  sfx.style('roar');
  s.cameras.main.shake(300, 0.006);
  const rings: Promise<void>[] = [];
  for (let i = 0; i < 4; i++) {
    rings.push(
      sleep(s, i * 70).then(async () => {
        const r = s.add.image(from.x, from.y, 'fx-ring').setTint(i % 2 ? c.main : c.light).setDepth(52).setScale(0.6);
        await tw(s, { targets: r, x: to.x, y: to.y, scale: 3, alpha: 0.2, duration: 320 });
        r.destroy();
      }),
    );
  }
  await rings[1];
}

async function zap(s: Phaser.Scene, from: Pt, to: Pt, c: { main: number; light: number }) {
  sfx.style('zap');
  const g = s.add.graphics().setDepth(52);
  const pts: Pt[] = [from];
  const n = 8;
  for (let i = 1; i < n; i++) {
    const p = i / n;
    pts.push({ x: from.x + (to.x - from.x) * p + Phaser.Math.Between(-18, 18), y: from.y + (to.y - from.y) * p + Phaser.Math.Between(-18, 18) });
  }
  pts.push(to);
  const draw = (w: number, col: number) => {
    g.lineStyle(w, col, 1);
    g.beginPath();
    g.moveTo(pts[0].x, pts[0].y);
    for (const p of pts.slice(1)) g.lineTo(p.x, p.y);
    g.strokePath();
  };
  draw(7, c.main);
  draw(2, c.light);
  await sleep(s, 90);
  s.tweens.add({ targets: g, alpha: 0, duration: 220, onComplete: () => g.destroy() });
}

async function lob(s: Phaser.Scene, from: Pt, to: Pt, c: { main: number; light: number }) {
  sfx.style('lob');
  const o = s.add.circle(from.x, from.y, 12, c.main, 1).setDepth(52).setStrokeStyle(3, c.light);
  const t = { p: 0 };
  await tw(s, {
    targets: t,
    p: 1,
    duration: 380,
    onUpdate: () => o.setPosition(from.x + (to.x - from.x) * t.p, from.y + (to.y - from.y) * t.p - Math.sin(t.p * Math.PI) * 140),
  });
  o.destroy();
  particles(s, to, 'fx-dot', [c.main, c.light], 18, { gravityY: 400, speed: { min: 100, max: 240 }, angle: { min: 190, max: 350 } });
}

async function volley(s: Phaser.Scene, from: Pt, to: Pt, c: { main: number; light: number }, tex: string, n: number) {
  sfx.style('volley');
  const shots: Promise<void>[] = [];
  for (let i = 0; i < n; i++) {
    shots.push(
      sleep(s, i * 60).then(async () => {
        const off = (i - (n - 1) / 2) * 16;
        const o = s.add.image(from.x, from.y + off * 0.4, tex).setTint(i % 2 ? c.main : c.light).setDepth(52).setScale(1.3);
        o.rotation = Math.atan2(to.y - from.y, to.x - from.x) + Math.PI / 2;
        await tw(s, { targets: o, x: to.x + off * 0.5, y: to.y + off * 0.5, duration: 200, ease: 'Quad.easeIn' });
        o.destroy();
      }),
    );
  }
  await Promise.all(shots);
}

async function cloud(s: Phaser.Scene, from: Pt, to: Pt, c: { main: number; light: number; dark: number }) {
  sfx.style('cloud');
  const puffs: Phaser.GameObjects.Arc[] = [];
  for (let i = 0; i < 7; i++) {
    const p = s.add.circle(from.x, from.y, 16, i % 2 ? c.main : c.dark, 0.55).setDepth(52);
    puffs.push(p);
    s.tweens.add({
      targets: p,
      x: to.x + Phaser.Math.Between(-50, 50),
      y: to.y + Phaser.Math.Between(-40, 30),
      scale: Phaser.Math.FloatBetween(2, 3.2),
      duration: 380,
      delay: i * 30,
      ease: 'Sine.easeOut',
    });
  }
  await sleep(s, 400);
  particles(s, to, 'fx-dot', [c.main, c.light], 14, { gravityY: -40, speed: { min: 10, max: 60 }, lifespan: 900 });
  puffs.forEach((p) => s.tweens.add({ targets: p, alpha: 0, duration: 500, onComplete: () => p.destroy() }));
}

async function sigil(s: Phaser.Scene, at: Pt, c: { main: number; light: number; dark: number }) {
  sfx.style('curse');
  const g = s.add.graphics().setDepth(52).setPosition(at.x, at.y);
  g.lineStyle(3, c.main, 1);
  g.strokeCircle(0, 0, 60);
  g.strokeCircle(0, 0, 44);
  g.lineStyle(2, c.light, 1);
  const star: Phaser.Math.Vector2[] = [];
  for (let i = 0; i < 5; i++) {
    const a = -Math.PI / 2 + (i * 4 * Math.PI) / 5;
    star.push(new Phaser.Math.Vector2(Math.cos(a) * 44, Math.sin(a) * 44));
  }
  g.strokePoints(star, true);
  g.setScale(1.6).setAlpha(0);
  await tw(s, { targets: g, alpha: 1, scale: 1, rotation: Math.PI, duration: 340, ease: 'Quad.easeOut' });
  s.tweens.add({ targets: g, scale: 0.2, alpha: 0, rotation: Math.PI * 1.6, duration: 260, onComplete: () => g.destroy() });
}

async function boom(s: Phaser.Scene, at: Pt, c: { main: number; light: number }, flash: boolean) {
  sfx.style('burst');
  if (flash) s.cameras.main.flash(160, 255, 255, 255, true);
  const o = s.add.circle(at.x, at.y, 10, c.light, 0.9).setDepth(52);
  const ring = s.add.circle(at.x, at.y, 10).setStrokeStyle(4, c.main).setDepth(52);
  await tw(s, { targets: [o, ring], scale: 7, duration: 200, ease: 'Quad.easeOut' });
  s.tweens.add({ targets: [o, ring], alpha: 0, scale: 9, duration: 220, onComplete: () => (o.destroy(), ring.destroy()) });
}

async function dash(s: Phaser.Scene, actor: Img, to: Pt, arc: number) {
  const home = { x: actor.x, y: actor.y };
  const stop = { x: home.x + (to.x - home.x) * 0.72, y: home.y + (to.y - home.y) * 0.72 };
  sfx.style(arc ? 'leap' : 'dash');
  const t = { p: 0 };
  await tw(s, {
    targets: t,
    p: 1,
    duration: arc ? 300 : 170,
    ease: 'Quad.easeIn',
    onUpdate: () => actor.setPosition(home.x + (stop.x - home.x) * t.p, home.y + (stop.y - home.y) * t.p - Math.sin(t.p * Math.PI) * arc),
  });
  s.tweens.add({ targets: actor, x: home.x, y: home.y, duration: 220, delay: 60, ease: 'Quad.easeOut' });
}

async function smash(s: Phaser.Scene, at: Pt, c: { main: number; dark: number }) {
  sfx.style('dash');
  const o = s.add.circle(at.x, -40, 30, c.dark, 1).setStrokeStyle(4, c.main).setDepth(52);
  await tw(s, { targets: o, y: at.y, duration: 260, ease: 'Quad.easeIn' });
  s.cameras.main.shake(300, 0.014);
  sfx.style('quake');
  s.tweens.add({ targets: o, alpha: 0, scale: 1.4, duration: 220, onComplete: () => o.destroy() });
}

// ------------------------------------------------------------ status styles

async function shield(s: Phaser.Scene, actor: Img, c: { main: number; light: number }) {
  sfx.style('shield');
  const g = s.add.graphics().setDepth(52).setPosition(actor.x, actor.y);
  const hex: Phaser.Math.Vector2[] = [];
  for (let i = 0; i < 6; i++) hex.push(new Phaser.Math.Vector2(Math.cos((i * Math.PI) / 3 + Math.PI / 6) * 70, Math.sin((i * Math.PI) / 3 + Math.PI / 6) * 70));
  g.fillStyle(c.main, 0.25);
  g.fillPoints(hex, true);
  g.lineStyle(4, c.light, 1);
  g.strokePoints(hex, true);
  g.setScale(0.3).setAlpha(0);
  await tw(s, { targets: g, scale: 1, alpha: 1, duration: 220, ease: 'Back.easeOut' });
  s.tweens.add({ targets: g, alpha: 0, duration: 400, delay: 200, onComplete: () => g.destroy() });
}

async function gather(s: Phaser.Scene, actor: Img, c: { main: number; light: number; tex: string }) {
  sfx.style('gather');
  const bits: Promise<void>[] = [];
  for (let i = 0; i < 14; i++) {
    const a = (i / 14) * Math.PI * 2;
    const b = s.add.image(actor.x + Math.cos(a) * 110, actor.y + Math.sin(a) * 110, c.tex).setTint(i % 2 ? c.main : c.light).setDepth(52);
    bits.push(tw(s, { targets: b, x: actor.x, y: actor.y, scale: 0.3, duration: 340, delay: i * 10, ease: 'Quad.easeIn' }).then(() => b.destroy()));
  }
  await Promise.all(bits);
  const glow = s.add.circle(actor.x, actor.y, 20, c.light, 0.6).setDepth(51);
  s.tweens.add({ targets: glow, scale: 4, alpha: 0, duration: 380, onComplete: () => glow.destroy() });
}

async function swirlSelf(s: Phaser.Scene, actor: Img, c: { main: number; light: number; tex: string }) {
  sfx.style('vortex');
  const bits = Array.from({ length: 12 }, (_, i) => s.add.image(actor.x, actor.y, c.tex).setTint(i % 2 ? c.main : c.light).setDepth(52));
  const t = { p: 0 };
  await tw(s, {
    targets: t,
    p: 1,
    duration: 520,
    onUpdate: () =>
      bits.forEach((b, i) => {
        const a = t.p * Math.PI * 4 + (i / bits.length) * Math.PI * 2;
        b.setPosition(actor.x + Math.cos(a) * 70, actor.y + 40 - t.p * 90 + Math.sin(a) * 18);
      }),
  });
  bits.forEach((b) => s.tweens.add({ targets: b, alpha: 0, duration: 200, onComplete: () => b.destroy() }));
}

async function fade(s: Phaser.Scene, actor: Img, c: { dark: number }) {
  sfx.style('fade');
  const ghost = s.add.image(actor.x, actor.y, actor.texture.key).setScale(actor.scaleX, actor.scaleY).setFlipX(actor.flipX).setTintFill(c.dark).setAlpha(0.6).setDepth(49);
  s.tweens.add({ targets: ghost, x: ghost.x - 30, alpha: 0, duration: 400, onComplete: () => ghost.destroy() });
  await tw(s, { targets: actor, alpha: 0.15, duration: 180, yoyo: true, hold: 160 });
}

async function mend(s: Phaser.Scene, actor: Img, c: { main: number; light: number }) {
  sfx.style('mend');
  const r = s.add.rectangle(actor.x, 0, 90, actor.y + 60, c.light, 0.35).setOrigin(0.5, 0).setDepth(51);
  r.setAlpha(0);
  await tw(s, { targets: r, alpha: 1, duration: 180 });
  healFx(s, actor);
  s.tweens.add({ targets: r, alpha: 0, duration: 400, onComplete: () => r.destroy() });
}

// ------------------------------------------------------------ entry points

/**
 * Plays a move's animation. Resolves when the hit should land (or the status effect has played).
 * `actor` and `target` are the battle sprites.
 */
export async function playMove(s: Phaser.Scene, def: MoveDef, actor: Img, target: Img): Promise<Style> {
  const style = moveStyle(def);
  const c = PAL[def.element];
  const from = { x: actor.x, y: actor.y };
  const to = { x: target.x, y: target.y };
  const name = def.name.toLowerCase();
  const moving = ['dash', 'leap', 'burrow', 'fade'].includes(style);
  if (!moving && def.kind !== 'heal' && def.kind !== 'buff') lunge(s, actor, to);
  switch (style) {
    case 'bite': await bite(s, to, c); break;
    case 'claw': await slashLines(s, to, c.main, /reap|scythe/.test(name) ? 1 : 3, /reap|scythe/.test(name) ? 160 : 100, Math.PI / 4, /reap|scythe/.test(name) ? 10 : 6); break;
    case 'slash': await slashLines(s, to, c.main, 1, 150, Math.PI * 0.8, 9); break;
    case 'guillotine': await slashLines(s, to, c.main, 1, 190, Math.PI / 2, 12); break;
    case 'whip': await whip(s, from, to, c.main); break;
    case 'bind': await bind(s, target, c); break;
    case 'drain': await whip(s, from, to, c.main); break;
    case 'quake': await quake(s, from, to, c); break;
    case 'burrow': await burrow(s, actor, to, c); break;
    case 'geyser': await column(s, to, c, false); break;
    case 'pillar': await column(s, to, c, true); break;
    case 'wave': await wave(s, from, to, c); break;
    case 'vortex': await vortex(s, to, c); break;
    case 'rain': await rain(s, to, c); break;
    case 'breath': await breath(s, from, to, c); break;
    case 'beam': await beam(s, from, to, c, /lance|glint/.test(name) ? 7 : 14); break;
    case 'cannon': await beam(s, from, to, c, 26, true); break;
    case 'gaze': await gaze(s, actor, to, c); break;
    case 'roar': await roar(s, from, to, c); break;
    case 'zap': await zap(s, from, to, c); break;
    case 'bolt': await attackTravel(s, 'Storm', from, to); break;
    case 'lob': await lob(s, from, to, c); break;
    case 'volley': {
      const tex = /needle|shard|coral/.test(name) ? 'fx-shard' : /seed|pebble|stone|toss|pearl|bullet/.test(name) ? 'fx-rock' : c.tex;
      await volley(s, from, to, c, tex, Math.max(3, def.hits ?? 4));
      break;
    }
    case 'cloud': await cloud(s, from, to, c); break;
    case 'curse': await sigil(s, to, c); break;
    case 'burst': await boom(s, to, c, false); break;
    case 'flash': await boom(s, to, c, true); break;
    case 'leap': await dash(s, actor, to, 120); break;
    case 'dash': await dash(s, actor, to, 0); break;
    case 'smash': await smash(s, to, c); break;
    case 'shield': await shield(s, actor, c); break;
    case 'gather': await gather(s, actor, c); break;
    case 'swirl': await swirlSelf(s, actor, c); break;
    case 'fade': await fade(s, actor, c); break;
    case 'mend': await mend(s, actor, c); break;
    default: await attackTravel(s, def.element, from, to);
  }
  return style;
}

/** The hit itself: element particles plus a style-specific touch. */
export function moveImpact(s: Phaser.Scene, style: Style, el: Element, at: Pt, strength: number, from?: Pt) {
  attackImpact(s, el, at, strength);
  const c = PAL[el];
  if (style === 'drain' && from) {
    // Life flows back to the attacker.
    for (let i = 0; i < 10; i++) {
      const b = s.add.image(at.x + Phaser.Math.Between(-20, 20), at.y + Phaser.Math.Between(-20, 20), 'fx-dot').setTint(i % 2 ? c.main : 0x8fe08a).setDepth(52);
      s.tweens.add({ targets: b, x: from.x, y: from.y, scale: 0.4, duration: 420, delay: i * 30, ease: 'Sine.easeIn', onComplete: () => b.destroy() });
    }
  }
  if (style === 'bite' || style === 'dash' || style === 'leap' || style === 'smash') {
    particles(s, at, 'fx-spark', [0xffffff, c.light], 8, { speed: { min: 160, max: 300 }, lifespan: 220 });
  }
}
