import type Phaser from 'phaser';
import { saveMeta, type Meta } from '../logic/run';
import { earnedTitles, hasTitle, myTitle, TIER_INFO, TIERS, TITLES, type TitleTier } from '../logic/titles';
import { openPanel } from './panel';
import { sfx } from './sound';
import { titleBadge } from './titleBadge';
import { button, COLORS, LANDSCAPE, text } from './widgets';

/** The tier tab last looked at (kept while you browse). */
let shownTier: TitleTier | null = null;

const hexNum = (c: string) => parseInt(c.slice(1), 16);

/**
 * Every title by tier: the ones you've earned in their colors (tap to wear), the rest dimmed with
 * how to earn them and how close you are.
 */
export function openTitles(scene: Phaser.Scene, meta: Meta, onClose: () => void) {
  const pw = LANDSCAPE ? 760 : 436;
  const ph = LANDSCAPE ? 440 : 640;
  const p = openPanel(scene, 'Trainer titles', { w: pw, h: ph, onClose });
  const x0 = p.x + 14;
  const w = p.w - 28;
  const earned = earnedTitles(meta);
  shownTier ??= (myTitle(meta) && TITLES.find((t) => t.name === myTitle(meta))?.tier) || 'common';

  p.root.add(
    text(scene, p.x + p.w / 2, p.top - 6, `${earned.length}/${TITLES.length} earned · your title is shown to your opponent online`, 12, COLORS.textDim, {
      align: 'center',
      wordWrap: { width: w },
    }).setOrigin(0.5, 0),
  );

  const body = scene.add.container(0, 0);
  p.root.add(body);
  const draw = () => {
    body.removeAll(true);
    // Tier tabs, each in its tier's color, with how many you have.
    const tabY = p.top + 30;
    const tabW = (w - 4 * 6) / 5;
    TIERS.forEach((tier, i) => {
      const info = TIER_INFO[tier];
      const all = TITLES.filter((t) => t.tier === tier);
      const have = all.filter((t) => hasTitle(meta, t)).length;
      const on = tier === shownTier;
      const b = button(
        scene,
        x0 + tabW / 2 + i * (tabW + 6),
        tabY + 20,
        tabW,
        40,
        info.name,
        () => {
          shownTier = tier;
          draw();
        },
        { fontSize: LANDSCAPE ? 14 : 12, sub: `${have}/${all.length}`, color: on ? 0x3a3360 : 0x24203a, textColor: info.color },
      );
      if (on) b.add(scene.add.rectangle(0, 0, tabW, 40).setStrokeStyle(2, hexNum(info.color)));
      body.add(b);
    });

    // The tier's titles: two columns sideways, one upright.
    const list = TITLES.filter((t) => t.tier === shownTier);
    const cols = LANDSCAPE ? 2 : 1;
    const top = tabY + 50;
    const rowH = LANDSCAPE ? 62 : 64;
    const cw = (w - (cols - 1) * 10) / cols;
    const cur = myTitle(meta);
    list.forEach((t, i) => {
      const cx = x0 + (i % cols) * (cw + 10);
      const cy = top + Math.floor(i / cols) * rowH;
      const got = hasTitle(meta, t);
      const worn = t.name === cur;
      const [have, need] = t.progress(meta);
      const bg = scene.add
        .rectangle(cx, cy, cw, rowH - 6, worn ? 0x3a3360 : COLORS.panelLight, got ? 1 : 0.55)
        .setOrigin(0)
        .setStrokeStyle(2, worn ? hexNum(TIER_INFO[t.tier].color) : COLORS.stroke, worn ? 1 : 0.6);
      body.add(bg);
      if (got) body.add(titleBadge(scene, cx + 12, cy + 18, t.name, 16, { originX: 0, maxW: cw - 110 }));
      else body.add(text(scene, cx + 12, cy + 18, t.name, 16, '#6d6888', { fontStyle: 'bold' }).setOrigin(0, 0.5));
      body.add(text(scene, cx + 12, cy + 34, t.desc, 12, got ? COLORS.text : COLORS.textDim, { wordWrap: { width: cw - 110 } }));
      const right = worn ? 'Wearing' : got ? 'Tap to wear' : `${Math.min(have, need)}/${need}`;
      body.add(text(scene, cx + cw - 12, cy + (rowH - 6) / 2, right, 12, worn ? '#8fe08a' : got ? '#ffc94d' : COLORS.textDim, { fontStyle: 'bold' }).setOrigin(1, 0.5));
      if (!got) {
        // A thin progress bar under the count.
        const bw = 70;
        const bx = cx + cw - 12 - bw;
        const by = cy + (rowH - 6) / 2 + 12;
        body.add(scene.add.rectangle(bx, by, bw, 4, 0x15121f).setOrigin(0));
        body.add(scene.add.rectangle(bx, by, Math.max(0, bw * Math.min(1, have / need)), 4, hexNum(TIER_INFO[t.tier].color), 0.7).setOrigin(0));
      }
      if (got && !worn) {
        bg.setInteractive({ useHandCursor: true }).on('pointerup', () => {
          meta.trainerTitle = t.name;
          saveMeta(meta);
          sfx.coin();
          draw();
        });
      }
    });

    // Take your title off.
    if (cur) {
      body.add(
        button(scene, p.x + p.w - 58, p.y + 30, 92, 32, 'No title', () => {
          meta.trainerTitle = undefined;
          saveMeta(meta);
          sfx.coin();
          draw();
        }, { fontSize: 13 }),
      );
    }
  };
  draw();
  return p;
}
