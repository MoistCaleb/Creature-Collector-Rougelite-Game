import Phaser from 'phaser';
import { branchUpgrades, WORKSHOP_BRANCHES, type WorkshopBranch, type WorkshopUpgrade } from '../data/workshop';
import { camp } from '../logic/camp';
import { buyUpgrade, nextUpgrade, ownedUpgrades, workshopProgress } from '../logic/workshop';
import type { Meta } from '../logic/run';
import { icon, type IconId } from './icons';
import { calm } from './motion';
import { holdScroll } from './scroll';
import { sfx } from './sound';
import { button, COLORS, fullRect, H, LANDSCAPE, text, W } from './widgets';

const GLYPH: Record<WorkshopBranch, IconId> = { supplies: 'potion', training: 'swords', fortune: 'sparkle', lore: 'book' };
/** Brighter branch colours for the tree (the data's are dark, for buttons). */
const TINT: Record<WorkshopBranch, number> = { supplies: 0xd08a3a, training: 0x4a9ad8, fortune: 0xe0c040, lore: 0xa070e0 };

export interface WorkshopTreeConfig {
  meta: Meta;
  /** Saves the game after a purchase; may show news (new titles) and then calls `done`. */
  afterBuy: (u: WorkshopUpgrade, done: () => void) => void;
  onClose: () => void;
}

/**
 * The Workshop as a tech tree: four branches growing out of the anvil, each a chain of upgrades you
 * build in order. Built ones glow in their branch's colour, the next one pulses (gold when you can
 * afford it), the rest wait in the dark. Tap any node to read it; build the next from the panel.
 * Upright the branches grow up the screen; sideways they grow to the right.
 */
export function openWorkshopTree(scene: Phaser.Scene, cfg: WorkshopTreeConfig): Phaser.GameObjects.Container {
  const root = scene.add.container(0, 0).setDepth(1000);
  holdScroll(root);
  root.add(fullRect(scene, 0x0b0814, 1).setInteractive());
  const layer = scene.add.container(0, 0);
  root.add(layer);
  const still = calm();
  const m = cfg.meta;

  // Pick something to show first: the cheapest upgrade you can build, else the cheapest next one.
  const firstPick = (): WorkshopUpgrade | null => {
    const nexts = WORKSHOP_BRANCHES.map((b) => nextUpgrade(m, b.id)).filter((u): u is WorkshopUpgrade => !!u).sort((a, b) => a.cost - b.cost);
    return nexts.find((u) => u.cost <= camp(m).embers) ?? nexts[0] ?? null;
  };
  let sel: WorkshopUpgrade | null = firstPick();

  // Geometry.
  const hub = LANDSCAPE ? { x: 52, y: 214 } : { x: W / 2, y: 572 };
  const lanes = LANDSCAPE ? [104, 174, 244, 314] : [60, 168, 282, 390];
  const step = LANDSCAPE ? 54 : 52;
  const nodeAt = (bi: number, k: number) => (LANDSCAPE ? { x: 148 + k * step, y: lanes[bi] } : { x: lanes[bi], y: 500 - k * step });
  const R = LANDSCAPE ? 18 : 19;

  const draw = () => {
    layer.removeAll(true);
    const own = ownedUpgrades(m);
    const embers = camp(m).embers;
    const prog = workshopProgress(m);

    // Header.
    if (LANDSCAPE) {
      layer.add(text(scene, 20, 14, 'Workshop', 24, '#ffc94d', { fontStyle: 'bold' }));
      layer.add(icon(scene, 560, 30, 'flame', 20));
      layer.add(text(scene, 574, 30, `${embers} embers`, 17, '#ffb36a', { fontStyle: 'bold' }).setOrigin(0, 0.5));
      layer.add(text(scene, 180, 32, `${prog.spent} / ${prog.total} built · not used on daily, weekly or online runs`, 12, COLORS.textDim).setOrigin(0, 0.5));
    } else {
      layer.add(text(scene, W / 2, 34, 'Workshop', 26, '#ffc94d', { fontStyle: 'bold' }).setOrigin(0.5));
      layer.add(icon(scene, W / 2 - 52, 70, 'flame', 20));
      layer.add(text(scene, W / 2 - 38, 70, `${embers} embers`, 17, '#ffb36a', { fontStyle: 'bold' }).setOrigin(0, 0.5));
      layer.add(text(scene, W / 2, 94, `${prog.spent} / ${prog.total} built · not used on daily, weekly or online runs`, 11, COLORS.textDim).setOrigin(0.5));
    }

    // Roots and branches: lines first, so the nodes sit on top.
    const g = scene.add.graphics();
    layer.add(g);
    WORKSHOP_BRANCHES.forEach((b, bi) => {
      const ups = branchUpgrades(b.id);
      const tint = TINT[b.id];
      const first = nodeAt(bi, 0);
      const rootLit = own.includes(ups[0].id);
      g.lineStyle(rootLit ? 4 : 3, rootLit ? tint : 0x3a3450, rootLit ? 0.9 : 1);
      if (LANDSCAPE) {
        g.beginPath().moveTo(hub.x, hub.y).lineTo(hub.x + 36, hub.y).lineTo(hub.x + 36, first.y).lineTo(first.x, first.y).strokePath();
      } else {
        g.beginPath().moveTo(hub.x, hub.y).lineTo(hub.x, hub.y - 24).lineTo(first.x, hub.y - 24).lineTo(first.x, first.y).strokePath();
      }
      for (let k = 1; k < ups.length; k++) {
        const a = nodeAt(bi, k - 1);
        const z = nodeAt(bi, k);
        const lit = own.includes(ups[k].id);
        g.lineStyle(lit ? 4 : 3, lit ? tint : 0x3a3450, lit ? 0.9 : 1);
        g.lineBetween(a.x, a.y, z.x, z.y);
      }
      // Branch name: under the first node (upright) or above the lane (sideways).
      const have = ups.filter((u) => own.includes(u.id)).length;
      const label = `${b.name} ${have}/${ups.length}`;
      if (LANDSCAPE) layer.add(text(scene, first.x - R, first.y - R - 16, label, 11, Phaser.Display.Color.IntegerToColor(tint).rgba, { fontStyle: 'bold' }));
      else layer.add(text(scene, first.x, first.y + R + 4, label, 11, Phaser.Display.Color.IntegerToColor(tint).rgba, { fontStyle: 'bold', align: 'center' }).setOrigin(0.5, 0));
    });

    // The anvil at the root.
    layer.add(scene.add.circle(hub.x, hub.y, 26, 0x241c34).setStrokeStyle(3, 0xffc94d));
    layer.add(icon(scene, hub.x, hub.y, 'gear', 28));

    // Nodes.
    WORKSHOP_BRANCHES.forEach((b, bi) => {
      const ups = branchUpgrades(b.id);
      const next = nextUpgrade(m, b.id);
      const tint = TINT[b.id];
      ups.forEach((u, k) => {
        const p = nodeAt(bi, k);
        const built = own.includes(u.id);
        const isNext = next?.id === u.id;
        const ready = isNext && embers >= u.cost;
        const r = u.capstone ? R + 4 : R;
        if (built || ready) {
          const halo = scene.add.circle(p.x, p.y, r + 9, ready ? 0xffd36a : tint, ready ? 0.35 : 0.22).setBlendMode(Phaser.BlendModes.ADD);
          layer.add(halo);
          if (ready && !still) scene.tweens.add({ targets: halo, scale: { from: 0.85, to: 1.25 }, alpha: { from: 0.45, to: 0.05 }, duration: 900, repeat: -1 });
        }
        const fill = built ? tint : isNext ? 0x2a2140 : 0x16121f;
        const edge = built ? 0xfff1c8 : ready ? 0xffd36a : isNext ? 0xd8d0f0 : 0x3a3450;
        const node = scene.add.circle(p.x, p.y, r, fill).setStrokeStyle(sel?.id === u.id ? 4 : 2, sel?.id === u.id ? 0xffffff : edge);
        layer.add(node);
        const ic = icon(scene, p.x, p.y, u.capstone ? 'crown' : GLYPH[b.id], u.capstone ? 24 : 20);
        if (!built) ic.setAlpha(isNext ? 0.85 : 0.3);
        layer.add(ic);
        if (!built && !isNext) layer.add(icon(scene, p.x + r * 0.62, p.y + r * 0.62, 'lock', 11).setAlpha(0.7));
        if (!built) {
          const cost = String(u.cost);
          const col = ready ? '#ffd36a' : isNext ? '#e6defa' : '#6a6480';
          if (LANDSCAPE) layer.add(text(scene, p.x, p.y + r + 2, cost, 10, col, { fontStyle: 'bold' }).setOrigin(0.5, 0));
          else layer.add(text(scene, p.x + r + 3, p.y, cost, 10, col, { fontStyle: 'bold' }).setOrigin(0, 0.5));
        }
        if (sel?.id === u.id && !still) scene.tweens.add({ targets: node, scale: 1.1, yoyo: true, repeat: -1, duration: 500, ease: 'Sine.easeInOut' });
        node.setInteractive({ useHandCursor: true }).on('pointerup', () => {
          sel = u;
          sfx.click();
          draw();
        });
      });
    });

    // The panel: what the selected upgrade does, and Build.
    const P = LANDSCAPE ? { x: 572, y: 62, w: 216, h: 330 } : { x: 14, y: 610, w: W - 28, h: 134 };
    layer.add(scene.add.rectangle(P.x, P.y, P.w, P.h, COLORS.panel, 0.96).setOrigin(0).setStrokeStyle(2, sel ? TINT[sel.branch] : COLORS.stroke));
    if (sel) {
      const u = sel;
      const built = own.includes(u.id);
      const isNext = nextUpgrade(m, u.branch)?.id === u.id;
      const bname = WORKSHOP_BRANCHES.find((x) => x.id === u.branch)!.name;
      const head = `${bname}${u.capstone ? ' · capstone' : ''}`;
      layer.add(text(scene, P.x + 12, P.y + 10, head.toUpperCase(), 11, Phaser.Display.Color.IntegerToColor(TINT[u.branch]).rgba, { fontStyle: 'bold' }));
      layer.add(text(scene, P.x + 12, P.y + 26, u.name, 19, COLORS.text, { fontStyle: 'bold' }));
      const btnH = 40;
      const descRoom = P.h - 58 - btnH - 14;
      const desc = text(scene, P.x + 12, P.y + 52, u.desc, 13, COLORS.text, { wordWrap: { width: P.w - 24 }, lineSpacing: 3 });
      if (desc.height > descRoom) desc.setScale(Math.max(0.8, descRoom / desc.height));
      layer.add(desc);
      const by = P.y + P.h - btnH / 2 - 10;
      if (built) layer.add(text(scene, P.x + P.w / 2, by, '✓ Built', 16, '#8fe0a0', { fontStyle: 'bold' }).setOrigin(0.5));
      else if (!isNext) layer.add(text(scene, P.x + P.w / 2, by, `${u.cost} embers · build the ones before it first`, 12, COLORS.textDim, { align: 'center', wordWrap: { width: P.w - 20 } }).setOrigin(0.5));
      else {
        const short = u.cost - embers;
        layer.add(
          button(scene, P.x + P.w / 2, by, P.w - 24, btnH, short > 0 ? `Need ${short} more embers` : `Build · ${u.cost} embers`, () => {
            if (buyUpgrade(m, u.id) !== null) return;
            sfx.workshopBuild(!!u.capstone);
            const p = nodeAt(WORKSHOP_BRANCHES.findIndex((x) => x.id === u.branch), branchUpgrades(u.branch).indexOf(u));
            cfg.afterBuy(u, () => {
              sel = firstPick() ?? u;
              draw();
              flare(scene, layer, p.x, p.y, TINT[u.branch], !!u.capstone);
            });
          }, { enabled: short <= 0, fontSize: 15, color: 0x8a5a1a, glyph: 'flame' }),
        );
      }
    } else {
      layer.add(text(scene, P.x + P.w / 2, P.y + P.h / 2, 'Every upgrade is built!', 16, '#ffc94d', { fontStyle: 'bold' }).setOrigin(0.5));
    }

    // Close.
    layer.add(
      button(scene, LANDSCAPE ? P.x + P.w / 2 : W / 2, LANDSCAPE ? H - 30 : H - 30, LANDSCAPE ? P.w : 200, 42, 'Back', () => {
        root.destroy();
        cfg.onClose();
      }, { fontSize: 16 }),
    );
  };
  draw();
  return root;
}

/** A freshly built node flares. */
function flare(scene: Phaser.Scene, layer: Phaser.GameObjects.Container, x: number, y: number, col: number, big: boolean) {
  const ring = scene.add.circle(x, y, 20, 0xffffff, 0).setStrokeStyle(4, col).setBlendMode(Phaser.BlendModes.ADD);
  layer.add(ring);
  scene.tweens.add({ targets: ring, scale: big ? 4 : 2.6, alpha: 0, duration: big ? 900 : 600, ease: 'Quad.easeOut', onComplete: () => ring.destroy() });
  if (calm()) return;
  for (let i = 0; i < (big ? 18 : 10); i++) {
    const a = (i / (big ? 18 : 10)) * Math.PI * 2;
    const s = scene.add.circle(x, y, 2.5, i % 2 ? 0xffffff : col).setBlendMode(Phaser.BlendModes.ADD);
    layer.add(s);
    scene.tweens.add({ targets: s, x: x + Math.cos(a) * 46, y: y + Math.sin(a) * 46, alpha: 0, duration: 520, ease: 'Quad.easeOut', onComplete: () => s.destroy() });
  }
}
