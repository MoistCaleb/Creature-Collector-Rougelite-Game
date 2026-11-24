import Phaser from 'phaser';
import { heartFill } from '../logic/camp';
import { calm } from './motion';

/** A heart outline (the classic curve), centred on (0, 0), `size` px across. */
function heartPoints(size: number): Phaser.Math.Vector2[] {
  const k = size / 34;
  const out: Phaser.Math.Vector2[] = [];
  for (let i = 0; i < 48; i++) {
    const t = (i / 48) * Math.PI * 2;
    const x = 16 * Math.sin(t) ** 3;
    const y = -(13 * Math.cos(t) - 5 * Math.cos(2 * t) - 2 * Math.cos(3 * t) - Math.cos(4 * t));
    out.push(new Phaser.Math.Vector2(x * k, (y - 2.5) * k));
  }
  return out;
}

/** The part of a polygon below the line y = cut (so a heart fills from the bottom up). */
function below(poly: Phaser.Math.Vector2[], cut: number): Phaser.Math.Vector2[] {
  const out: Phaser.Math.Vector2[] = [];
  poly.forEach((a, i) => {
    const b = poly[(i + 1) % poly.length];
    const ina = a.y >= cut;
    const inb = b.y >= cut;
    if (ina) out.push(a);
    if (ina !== inb) {
      const t = (cut - a.y) / (b.y - a.y);
      out.push(new Phaser.Math.Vector2(a.x + (b.x - a.x) * t, cut));
    }
  });
  return out;
}

/**
 * Five camp-bond hearts in a row, each filling from the bottom as bond grows toward it. The fill
 * rises into place when it's drawn (unless motion is reduced).
 */
export function bondMeter(scene: Phaser.Scene, x: number, y: number, points: number, size = 22, gap = 6): Phaser.GameObjects.Graphics {
  const g = scene.add.graphics({ x, y });
  const shape = heartPoints(size);
  const top = Math.min(...shape.map((p) => p.y));
  const bottom = Math.max(...shape.map((p) => p.y));
  const fills = heartFill(points);
  const draw = (f: number) => {
    g.clear();
    fills.forEach((full, i) => {
      const cx = size / 2 + i * (size + gap);
      const at = (p: Phaser.Math.Vector2) => new Phaser.Math.Vector2(p.x + cx, p.y);
      g.fillStyle(0x2a1f36, 1).fillPoints(shape.map(at), true);
      const amt = full * f;
      if (amt > 0) {
        const part = amt >= 1 ? shape : below(shape, bottom - (bottom - top) * amt);
        if (part.length > 2) g.fillStyle(full >= 1 ? 0xff5c8a : 0xc9467a, 1).fillPoints(part.map(at), true);
      }
      g.lineStyle(1.5, full >= 1 ? 0xffb3c8 : 0x8a5a78, 1).strokePoints(shape.map(at), true, true);
    });
  };
  if (calm() || !points) draw(1);
  else {
    draw(0);
    scene.tweens.addCounter({ from: 0, to: 1, duration: 700, ease: 'Cubic.easeOut', onUpdate: (tw) => g.active && draw(tw.getValue() ?? 1) });
  }
  return g;
}

/** The meter's width for `size` and `gap`. */
export const bondMeterWidth = (size = 22, gap = 6) => size * 5 + gap * 4;
