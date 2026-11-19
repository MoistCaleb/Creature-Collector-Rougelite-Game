import Phaser from 'phaser';
import { roundName, type Bracket } from '../logic/bracket';
import type { TrainerLook } from '../data/trainerLook';
import { trainerFx } from './trainerFx';
import { ensureTrainerTexture } from './trainerSprite';
import { COLORS, H, LANDSCAPE, text, W } from './widgets';

/**
 * A tournament bracket drawn on a screen: a column per round, matches spread evenly, lines to the
 * next round. Used by the battle royale finale and the Arena tournament.
 */
export function drawBracket(
  scene: Phaser.Scene,
  b: Bracket,
  area: { top: number; bottom: number; width: number },
  who: { nameOf: (id: string) => string; me: string; watch?: (round: number, index: number) => (() => void) | null },
) {
  const { top, bottom, width } = area;
  const R = b.rounds.length;
  const colW = (width - 24) / R;
  const boxW = Math.min(colW - 18, 220);
  const boxH = 40;
  // Drawn first, so the match boxes sit over the line ends.
  const lines = scene.add.graphics().lineStyle(2, 0x5a5480, 1);
  const head = 18;
  const centers: { x: number; y: number }[][] = [];
  b.rounds.forEach((round, r) => {
    const cx = 12 + colW * r + colW / 2;
    text(scene, cx, top - head, roundName(b, r), 12, COLORS.textDim, { fontStyle: 'bold' }).setOrigin(0.5, 0);
    const slot = (bottom - top) / round.length;
    centers.push(
      round.map((m, i) => {
        const cy = top + slot * i + slot / 2;
        drawMatch(scene, cx, cy, boxW, boxH, m, r === 0, who, who.watch?.(r, i) ?? null);
        return { x: cx, y: cy };
      }),
    );
  });
  // Connectors from each pair of matches to the one they feed.
  for (let r = 0; r + 1 < R; r++) {
    centers[r].forEach((c, i) => {
      const to = centers[r + 1][Math.floor(i / 2)];
      const x0 = c.x + boxW / 2;
      const xm = (x0 + to.x - boxW / 2) / 2;
      lines.lineBetween(x0, c.y, xm, c.y);
      lines.lineBetween(xm, c.y, xm, to.y);
      lines.lineBetween(xm, to.y, to.x - boxW / 2, to.y);
    });
  }
}

function drawMatch(
  scene: Phaser.Scene,
  cx: number,
  cy: number,
  w: number,
  h: number,
  m: Bracket['rounds'][number][number],
  firstRound: boolean,
  who: { nameOf: (id: string) => string; me: string },
  onWatch: (() => void) | null,
) {
  const { a, b, winner, bye } = m;
  const mine = a === who.me || b === who.me;
  const live = !!a && !!b && !winner;
  const box = scene.add.rectangle(cx, cy, w, h, live ? 0x2a2a48 : COLORS.panel).setStrokeStyle(2, mine ? COLORS.accent : live ? 0x8fd0ff : COLORS.stroke);
  // A live match you can watch: tap it, with a pulsing "Watch" tag beside it.
  if (onWatch) {
    box.setInteractive({ useHandCursor: true }).on('pointerup', onWatch);
    const tag = scene.add.container(cx + w / 2 - 4, cy - h / 2 - 1);
    const label = text(scene, 0, 0, '▶ WATCH', 10, '#12101c', { fontStyle: 'bold' }).setOrigin(1, 0.5);
    tag.add(scene.add.rectangle(4, 0, label.width + 10, 15, 0x8fd0ff).setOrigin(1, 0.5));
    tag.add(label);
    scene.tweens.add({ targets: tag, alpha: 0.55, yoyo: true, repeat: -1, duration: 700 });
  }
  const row = (pid: string | null, dy: number) => {
    const won = !!winner && pid === winner;
    const lost = !!winner && !!pid && pid !== winner;
    const label = pid ? who.nameOf(pid) : bye && firstRound ? 'bye' : '?';
    const t = text(scene, cx - w / 2 + 8, cy + dy, label, 12, won ? '#ffc94d' : pid === who.me ? '#8fe08a' : pid ? COLORS.text : COLORS.textDim, {
      fontStyle: won ? 'bold' : 'normal',
    }).setOrigin(0, 0.5);
    if (lost) t.setAlpha(0.4);
    if (t.width > w - 26) t.setScale((w - 26) / t.width);
    if (won) text(scene, cx + w / 2 - 6, cy + dy, '✓', 12, '#ffc94d').setOrigin(1, 0.5);
  };
  row(a, -h / 4);
  row(b, h / 4);
  scene.add.rectangle(cx, cy, w - 8, 1, COLORS.stroke);
}

/** The champion's trainer, effects and all, with their name: a column on the right sideways, a strip at `y` upright. */
export function drawChampion(scene: Phaser.Scene, name: string, look: TrainerLook, y: number) {
  const x = LANDSCAPE ? W - 80 : W / 2;
  const cy = LANDSCAPE ? H / 2 - 10 : y - 30;
  const img = scene.add.image(x, cy, ensureTrainerTexture(scene, look, 'command')).setScale(2.4).setDepth(5);
  trainerFx(scene, img, look);
  const label = text(scene, x, cy + 48, `${name} · CHAMPION`, 14, '#ffc94d', { fontStyle: 'bold' }).setOrigin(0.5, 0).setDepth(5);
  if (LANDSCAPE && label.width > 156) label.setScale(156 / label.width);
  scene.tweens.add({ targets: img, y: cy - 4, yoyo: true, repeat: -1, duration: 600, ease: 'Sine.easeInOut' });
}
