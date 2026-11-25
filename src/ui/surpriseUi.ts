import Phaser from 'phaser';
import { SURPRISES } from '../data/surprises';
import { ELEMENT_COLORS } from '../data/types';
import type { Run } from '../logic/run';
import { eggNeed, floorSurprise } from '../logic/surprises';
import { calm } from './motion';
import { showMessage } from './picker';
import { text } from './widgets';

export const SURPRISE_PINK = 0xff7ad9;

/** What's special about this run and floor right now: a short name, and the details to read. */
export function activeSurprises(run: Run): { name: string; lines: string[]; big: boolean } | null {
  const rs = run.surprises;
  if (!rs) return null;
  const fs = floorSurprise(run);
  const names: string[] = [];
  const lines: string[] = [];
  if (rs.omen && SURPRISES[rs.omen]) {
    names.push(SURPRISES[rs.omen].name);
    lines.push(`Omen (all run): ${SURPRISES[rs.omen].name}\n${SURPRISES[rs.omen].desc}`);
  }
  if (fs.floor && SURPRISES[fs.floor]) {
    names.push(SURPRISES[fs.floor].name);
    lines.push(`This floor: ${SURPRISES[fs.floor].name}\n${SURPRISES[fs.floor].desc}${fs.floor === 'shattered' && fs.second ? ` (${run.map.biome} and ${fs.second})` : ''}`);
  }
  if (fs.elder && fs.floor !== 'ruins') {
    names.push('Elder');
    lines.push(`An Elder guardian waits at the top of this floor.\n${SURPRISES.elder.desc}`);
  }
  if (fs.hexNode && !run.visited.includes(fs.hexNode)) lines.push('Something glitters on a hex ahead (???).');
  if (rs.egg) lines.push(`Egg: ${Math.min(rs.egg.wins, eggNeed(rs.egg))} / ${eggNeed(rs.egg)} battles to hatch.`);
  if (!lines.length) return null;
  return { name: names.length === 1 ? names[0] : names.length ? `${names.length} surprises` : 'Surprise', lines, big: names.length > 0 };
}

/** A pulsing pink badge (right edge at x) while a surprise is active; tap to read them. Null if none. */
export function surpriseBadge(
  scene: Phaser.Scene,
  run: Run,
  x: number,
  y: number,
  opts: { maxW?: number; h?: number; canTap?: () => boolean } = {},
): (Phaser.GameObjects.Container & { width: number }) | null {
  const a = activeSurprises(run);
  if (!a) return null;
  const h = opts.h ?? 30;
  const maxW = opts.maxW ?? 200;
  const label = text(scene, 10, 0, `✶ ${a.name}`, Math.round(h * 0.43), '#ff9ae2', { fontStyle: 'bold' }).setOrigin(0, 0.5);
  let s = a.name;
  while (label.width + 20 > maxW && s.length > 4) {
    s = s.slice(0, -1);
    label.setText(`✶ ${s}…`);
  }
  const w = label.width + 20;
  const c = scene.add.container(x - w, y);
  const glow = scene.add.rectangle(w / 2, 0, w + 8, h + 8, SURPRISE_PINK, 0.2);
  const bg = scene.add.rectangle(w / 2, 0, w, h, 0x2a1230, 0.95).setStrokeStyle(2, SURPRISE_PINK).setInteractive({ useHandCursor: true });
  bg.on('pointerup', () => {
    if (opts.canTap && !opts.canTap()) return;
    showMessage(scene, 'Active surprises', a.lines.join('\n\n'));
  });
  c.add([glow, bg, label]);
  c.setSize(w, h);
  if (!calm()) scene.tweens.add({ targets: glow, alpha: { from: 0.08, to: 0.4 }, duration: 1100, yoyo: true, repeat: -1, ease: 'Sine.easeInOut' });
  return c as Phaser.GameObjects.Container & { width: number };
}

/** A soft pink glow round the screen's edge during an omen or rare floor. */
export function surpriseEdge(scene: Phaser.Scene, run: Run, r: { x: number; y: number; w: number; h: number }, depth = 5) {
  if (!activeSurprises(run)?.big) return;
  const edge = scene.add.rectangle(r.x, r.y, r.w, r.h).setOrigin(0).setStrokeStyle(6, SURPRISE_PINK, 0.35).setDepth(depth);
  if (!calm()) scene.tweens.add({ targets: edge, alpha: { from: 0.4, to: 1 }, duration: 1600, yoyo: true, repeat: -1, ease: 'Sine.easeInOut' });
}

/** The rare floor's (or, failing that, the omen's) colour: [colour, wash over the map, edge vignette]. */
const FLOOR_TINT: Record<string, [number, number, number]> = {
  grove: [0xffc94d, 0.1, 0.4],
  eclipse: [0x05021a, 0.3, 0.75],
  stormfront: [0x4a7ac0, 0.12, 0.45],
  mirror: [0xbfe8ff, 0.08, 0.35],
  ruins: [0xa07a40, 0.12, 0.45],
};
const OMEN_TINT: Record<string, [number, number, number]> = {
  bloodmoon: [0xc0102a, 0.08, 0.45],
  goldenage: [0xffc94d, 0.05, 0.35],
  wildsurge: [0x3ad06a, 0.05, 0.35],
  starfall: [0x8fb0ff, 0.06, 0.4],
};

/** Edge vignette: the colour strongest at the screen's edges, fading inward. */
function vignette(scene: Phaser.Scene, col: number, a: number, r: { x: number; y: number; w: number; h: number }) {
  const g = scene.add.graphics();
  const d = Math.min(r.w, r.h) * 0.28;
  g.fillGradientStyle(col, col, col, col, a, a, 0, 0);
  g.fillRect(r.x, r.y, r.w, d);
  g.fillGradientStyle(col, col, col, col, 0, 0, a, a);
  g.fillRect(r.x, r.y + r.h - d, r.w, d);
  g.fillGradientStyle(col, col, col, col, a, 0, a, 0);
  g.fillRect(r.x, r.y, d, r.h);
  g.fillGradientStyle(col, col, col, col, 0, a, 0, a);
  g.fillRect(r.x + r.w - d, r.y, d, r.h);
  return g;
}

/** Tint the map for a rare floor or omen (over the hexes, under the bars). Shattered: the second land's colour fades in across. */
export function surpriseTint(scene: Phaser.Scene, run: Run, r: { x: number; y: number; w: number; h: number }) {
  const fs = floorSurprise(run);
  if (fs.floor === 'shattered' && fs.second) {
    const col = ELEMENT_COLORS[fs.second];
    const g = scene.add.graphics();
    g.fillGradientStyle(col, col, col, col, 0, 0.3, 0, 0.3);
    g.fillRect(r.x, r.y, r.w, r.h);
    return;
  }
  const t = (fs.floor && FLOOR_TINT[fs.floor]) || (run.surprises?.omen && OMEN_TINT[run.surprises.omen]);
  if (!t) return;
  const wash = scene.add.rectangle(r.x, r.y, r.w, r.h, t[0], t[1]).setOrigin(0);
  const v = vignette(scene, t[0], t[2], r);
  // It breathes, gently.
  if (!calm()) scene.tweens.add({ targets: [wash, v], alpha: { from: 0.75, to: 1 }, duration: 2400, yoyo: true, repeat: -1, ease: 'Sine.easeInOut' });
}
