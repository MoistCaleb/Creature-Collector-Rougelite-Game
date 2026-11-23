import type Phaser from 'phaser';
import { GILDED_MILESTONES, gildedCount, milestoneText, takeNewMilestones } from '../logic/gilded';
import { myTitle, takeNewTitles } from '../logic/titles';
import { huntNewsText, huntRewardLines, nextHuntMilestone, takeHuntNews } from '../logic/huntMilestones';
import { saveMeta, type Meta } from '../logic/run';
import { SPECIES } from '../data/species';
import { openPanel } from './panel';
import { showMessage } from './picker';
import { shinyBurst } from './shiny';
import { sfx } from './sound';
import { COLORS, H, LANDSCAPE, text, W } from './widgets';

/** Announce Gilded milestones reached since the last announcement, then continue. */
export function announceGilded(scene: Phaser.Scene, meta: Meta, after: () => void) {
  // Gilded Hunt milestones (2.0) follow the Gilded species ones.
  const then = () => announceHunt(scene, meta, after);
  const ms = takeNewMilestones(meta);
  if (!ms.length) return then();
  takeNewTitles(meta);
  saveMeta(meta);
  sfx.shinyReveal();
  shinyBurst(scene, W / 2, H / 2 - 120);
  showMessage(scene, '✦ Gilded milestone! ✦', `${milestoneText(ms)}\n\nWear your rewards from Edit trainer on the title screen.`, then);
}

/** Announce Gilded Hunt milestones paid since the last announcement (2.0), then continue. */
export function announceHunt(scene: Phaser.Scene, meta: Meta, then: () => void) {
  const news = takeHuntNews(meta);
  if (!news.length) return then();
  takeNewTitles(meta);
  saveMeta(meta);
  sfx.shinyReveal();
  shinyBurst(scene, W / 2, H / 2 - 120);
  const next = nextHuntMilestone(meta);
  showMessage(scene, '✦ Gilded Hunt milestone! ✦', `${huntNewsText(news)}\n\nNext: floor ${next.floor} (${huntRewardLines(next).join(', ')}).`, then);
}

/** Every milestone, what it gives, and how close you are. */
export function openGildedMilestones(scene: Phaser.Scene, meta: Meta, onClose: () => void = () => {}) {
  const n = gildedCount(meta);
  const rowH = LANDSCAPE ? 58 : 82;
  const p = openPanel(scene, 'Gilded milestones', { w: LANDSCAPE ? 700 : 430, h: LANDSCAPE ? 440 : 120 + GILDED_MILESTONES.length * rowH + 70, onClose });
  const x0 = p.x + 16;
  const w = p.w - 32;
  let y = p.top;
  p.root.add(
    text(scene, p.x + p.w / 2, y, `✦ ${n}/${SPECIES.length} Gilded species${myTitle(meta) ? `  ·  ${myTitle(meta)}` : ''}`, 15, '#ffd86b', { fontStyle: 'bold' }).setOrigin(0.5, 0),
  );
  y += 26;
  p.root.add(text(scene, p.x + p.w / 2, y, 'Catch a Gilded Hexling in any form to own its whole line.', 12, COLORS.textDim).setOrigin(0.5, 0));
  y += 26;
  for (const m of GILDED_MILESTONES) {
    const got = n >= m.count;
    p.root.add(scene.add.rectangle(x0, y, w, rowH - 8, got ? 0x3a2f18 : COLORS.panelLight).setOrigin(0).setStrokeStyle(2, got ? 0xffc94d : COLORS.stroke, got ? 1 : 0.5));
    p.root.add(text(scene, x0 + 12, y + (rowH - 8) / 2, got ? '✦' : `${Math.min(n, m.count)}/${m.count}`, got ? 24 : 14, got ? '#ffd86b' : COLORS.textDim, { fontStyle: 'bold' }).setOrigin(0, 0.5));
    const lines = [...(m.title ? [`Title: ${m.title}`] : []), ...m.unlocks.map((u) => u.name)];
    p.root.add(text(scene, x0 + 70, y + 6, `${m.count} Gilded species`, 14, got ? '#ffd86b' : COLORS.text, { fontStyle: 'bold' }));
    p.root.add(text(scene, x0 + 70, y + 26, lines.join(LANDSCAPE ? '  ·  ' : '\n'), 12, got ? COLORS.text : COLORS.textDim, { lineSpacing: 2, wordWrap: { width: w - 80 } }));
    if (!got) {
      // Progress bar.
      const bw = 48;
      p.root.add(scene.add.rectangle(x0 + 12, y + rowH - 18, bw, 4, 0x2a2238).setOrigin(0, 0.5));
      p.root.add(scene.add.rectangle(x0 + 12, y + rowH - 18, Math.max(1, (bw * Math.min(n, m.count)) / m.count), 4, 0xffc94d).setOrigin(0, 0.5));
    }
    y += rowH;
  }
  return p;
}
