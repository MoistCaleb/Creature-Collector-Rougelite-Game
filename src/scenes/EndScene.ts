import Phaser from 'phaser';
import { ACHIEVEMENTS } from '../logic/achievements';
import { allCreatures, clearSavedRun, runMvp, saveMeta } from '../logic/run';
import { state } from '../state';
import { playMusic, sfx } from '../ui/sound';
import { ensureCreatureTexture, SPRITE_FIT } from '../ui/sprites';
import { background, button, COLORS, text, W } from '../ui/widgets';

/** End of a run: what happened, who carried the team, who made it and who didn't. */
export class EndScene extends Phaser.Scene {
  constructor() {
    super('End');
  }

  create(data: { won: boolean }) {
    background(this);
    playMusic(data.won ? 'title' : null);
    if (data.won) sfx.victory();
    else sfx.defeat();
    const run = state.run!;
    clearSavedRun();
    const sprite = (x: number, y: number, speciesId: string, stage: number, scale: number) =>
      this.add.image(x, y, ensureCreatureTexture(this, speciesId, stage)).setScale(scale * SPRITE_FIT);

    text(this, W / 2, 46, data.won ? 'VICTORY!' : 'RUN OVER', 40, data.won ? '#ffc94d' : '#e0524a', { fontStyle: 'bold' }).setOrigin(0.5);
    text(
      this,
      W / 2,
      86,
      data.won ? `${run.map.biome} lands conquered. All three floors cleared.` : `Fell on floor ${run.floor + 1}, in the ${run.map.biome} lands.`,
      15,
      COLORS.textDim,
      { align: 'center', wordWrap: { width: W - 40 } },
    ).setOrigin(0.5, 0);

    let y = 118;
    const card = (h: number, stroke: number) => this.add.rectangle(16, y, W - 32, h, COLORS.panel).setOrigin(0).setStrokeStyle(2, stroke, 0.8);

    // What ended the run.
    const ended = run.log.endedBy;
    if (!data.won && ended) {
      card(64, 0xe0524a);
      sprite(52, y + 30, ended.speciesId, ended.stage, 2.2).setFlipX(true);
      text(this, 92, y + 12, 'Defeated by', 12, '#ff8a7a', { fontStyle: 'bold' });
      text(this, 92, y + 30, ended.label, 16, COLORS.text, { wordWrap: { width: W - 130 } });
      y += 76;
    }

    // MVP: the creature that dealt the most damage.
    const mvp = runMvp(run);
    if (mvp && mvp.dealt > 0) {
      card(92, 0xffc94d);
      sprite(64, y + 42, mvp.speciesId, mvp.stage, 2.6);
      text(this, 112, y + 12, '★ MVP', 13, '#ffc94d', { fontStyle: 'bold' });
      text(this, 112, y + 30, `${mvp.name}  Lv ${mvp.level}${mvp.fallen ? '  (fallen)' : ''}`, 18, COLORS.text, { fontStyle: 'bold' });
      text(this, 112, y + 58, `${mvp.dealt.toLocaleString()} damage · ${mvp.kos} knockout${mvp.kos === 1 ? '' : 's'}`, 14, COLORS.textDim);
      y += 104;
    }

    // Numbers, two columns.
    const totalDamage = [...allCreatures(run), ...(run.log.fallen ?? [])].reduce((n, c) => n + (c.dealt ?? 0), 0);
    const stats: [string, string][] = [
      ['Battles won', String(run.log.battlesWon)],
      ['Floors cleared', String(data.won ? 3 : run.floor)],
      ['Caught', String(run.log.caught)],
      ['Lost', String(run.log.lost)],
      ['Coins earned', String(run.log.coins ?? 0)],
      ['Damage dealt', totalDamage.toLocaleString()],
    ];
    const colW = (W - 32) / 2;
    stats.forEach(([label, value], i) => {
      const x = 16 + (i % 2) * colW;
      const yy = y + Math.floor(i / 2) * 44;
      this.add.rectangle(x + 4, yy, colW - 8, 38, COLORS.panelLight).setOrigin(0);
      text(this, x + 14, yy + 19, label, 13, COLORS.textDim).setOrigin(0, 0.5);
      text(this, x + colW - 16, yy + 19, value, 17, COLORS.text, { fontStyle: 'bold' }).setOrigin(1, 0.5);
    });
    y += 3 * 44 + 10;

    // Who made it, and who didn't.
    const roster = (title: string, list: { speciesId: string; stage: number; level: number }[], dim: boolean) => {
      if (!list.length) return;
      text(this, 20, y, title, 15, dim ? '#ff8a7a' : '#ffc94d', { fontStyle: 'bold' });
      y += 24;
      const per = 7;
      const cell = (W - 32) / per;
      list.slice(0, per * 2).forEach((c, i) => {
        const x = 16 + cell / 2 + (i % per) * cell;
        const yy = y + Math.floor(i / per) * 62 + 22;
        const img = sprite(x, yy, c.speciesId, c.stage, 1.6);
        if (dim) img.setTint(0xa49ac0).setAlpha(0.75);
        text(this, x, yy + 26, `Lv${c.level}`, 11, COLORS.textDim).setOrigin(0.5);
      });
      if (list.length > per * 2) text(this, W - 20, y - 22, `+${list.length - per * 2} more`, 12, COLORS.textDim).setOrigin(1, 0);
      y += Math.ceil(Math.min(list.length, per * 2) / per) * 62 + 6;
    };
    const survivors = allCreatures(run);
    roster(data.won ? 'Champions' : 'Survivors', survivors, false);
    roster('Fallen', run.log.fallen ?? [], true);

    const extra: string[] = [];
    if (run.unlockedThisRun.length) extra.push(`New starters: ${run.unlockedThisRun.join(', ')}`);
    const earned = state.meta.newAchievements.splice(0);
    if (earned.length) {
      saveMeta(state.meta);
      extra.push(`Achievements: ${earned.map((id) => ACHIEVEMENTS.find((a) => a.id === id)!.name).join(', ')}`);
    }
    if (extra.length && y < 690) {
      text(this, W / 2, y + 4, extra.join('\n'), 13, '#8fe08a', { align: 'center', wordWrap: { width: W - 40 }, lineSpacing: 4 }).setOrigin(0.5, 0);
    }

    button(this, W / 2, 752, 260, 56, 'Back to title', () => {
      state.run = null;
      this.scene.start('Title');
    }, { color: 0x3b6d4a, fontSize: 20 });
  }
}
