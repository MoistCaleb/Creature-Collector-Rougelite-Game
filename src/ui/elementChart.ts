import type Phaser from 'phaser';
import { SYNERGY_LABEL, SYNERGY_STAT } from '../logic/synergy';
import { ELEMENTS, STRONG_AGAINST, type Element } from '../data/types';
import { openPanel } from './panel';
import { COLORS, LANDSCAPE, text, typeChip } from './widgets';

/** Elements whose attacks are strong against `el`. */
export const weakTo = (el: Element): Element[] => ELEMENTS.filter((a) => STRONG_AGAINST[a].includes(el));

/**
 * The element chart: for each element, what it's strong against and what it's weak to, plus the
 * team synergy stat. `focus` highlights some rows (e.g. the elements of the Hexling you're facing).
 */
export function openElementChart(scene: Phaser.Scene, focus: readonly Element[] = [], onClose: () => void = () => {}) {
  const ROW = LANDSCAPE ? 31 : 33;
  const perCol = LANDSCAPE ? 6 : 12;
  const p = openPanel(scene, 'Element chart', { w: LANDSCAPE ? 780 : 436, h: LANDSCAPE ? 440 : 660, onClose });
  const tableW = LANDSCAPE ? 372 : p.w - 20;
  // Chip columns: strong-vs starts at sx, weak-to at wx; chips are `step` apart.
  const step = LANDSCAPE ? 46 : 50;
  const chipScale = LANDSCAPE ? 0.9 : 1;
  const sx = 74;
  const wx = sx + 3 * step + 6;
  const notes = [
    'Strong vs: its attacks deal ×1.5. Attacks from an element it beats only deal ×0.67 to it, unless the two beat each other.',
    'Against two elements the two multiply. A move of the user’s own element hits ×1.25 (×1.5 for a single-element Hexling).',
    'Synergy: 2/3/4 team members sharing an element give the whole team +6/12/18% of that stat.',
  ];

  ELEMENTS.forEach((el, i) => {
    const col = Math.floor(i / perCol);
    const x = p.x + 10 + col * (tableW + 16);
    const head = p.top;
    if (i % perCol === 0) {
      p.root.add(text(scene, x + 6, head, 'Element', 11, COLORS.textDim));
      p.root.add(text(scene, x + sx, head, 'Strong vs', 11, '#7fe08a'));
      p.root.add(text(scene, x + wx, head, 'Weak to', 11, '#ff8a80'));
      if (!LANDSCAPE) p.root.add(text(scene, x + tableW - 6, head, 'Synergy', 11, COLORS.textDim).setOrigin(1, 0));
    }
    const y = head + 20 + (i % perCol) * ROW;
    const lit = focus.includes(el);
    const bg = scene.add.rectangle(x, y, tableW, ROW - 4, lit ? 0x3a2f58 : i % 2 ? COLORS.panelLight : 0x272140).setOrigin(0);
    if (lit) bg.setStrokeStyle(2, 0xffc94d);
    p.root.add(bg);
    const mid = y + (ROW - 4) / 2;
    p.root.add(typeChip(scene, x + 6, mid, el));
    STRONG_AGAINST[el].forEach((t, k) => p.root.add(typeChip(scene, x + sx + k * step, mid, t, true).setScale(chipScale)));
    weakTo(el).forEach((t, k) => p.root.add(typeChip(scene, x + wx + k * step, mid, t, true).setScale(chipScale)));
    if (!LANDSCAPE) p.root.add(text(scene, x + tableW - 6, mid, SYNERGY_LABEL[SYNERGY_STAT[el]], 11, COLORS.textDim, { fontStyle: 'bold' }).setOrigin(1, 0.5));
  });

  const ny = p.top + 20 + perCol * ROW + 6;
  p.root.add(
    text(scene, p.x + 14, ny, notes.join('\n'), 11, COLORS.textDim, { wordWrap: { width: p.w - 28 }, lineSpacing: 3 }),
  );
  return p;
}
