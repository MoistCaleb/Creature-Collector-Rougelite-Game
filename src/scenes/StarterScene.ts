import Phaser from 'phaser';
import { SPECIES_BY_ID } from '../data/species';
import { BALANCE } from '../data/balance';
import { createCreature, moveDef, stats } from '../logic/creature';
import { Rng } from '../logic/rng';
import { dailySeed, dailyStarters, rollStarterChoices, startRun } from '../logic/run';
import { formName } from '../logic/dex';
import { dex, state } from '../state';
import { ensureCreatureTexture, SPRITE_FIT } from '../ui/sprites';
import { playMusic } from '../ui/sound';
import { background, button, COLORS, text, typeChips, W } from '../ui/widgets';

export class StarterScene extends Phaser.Scene {
  constructor() {
    super('Starter');
  }

  private mapId = 'wildlands';
  private daily: string | null = null;

  create(data: { mapId?: string; daily?: string } = {}) {
    this.daily = data.daily ?? null;
    this.mapId = this.daily ? 'wildlands' : data.mapId ?? state.meta.lastMap ?? 'wildlands';
    background(this);
    playMusic('title');
    text(this, W / 2 + 20, 34, this.daily ? `📅 Daily run · ${this.daily}` : 'Choose your starter', this.daily ? 22 : 26, '#ffc94d', { fontStyle: 'bold' }).setOrigin(0.5);
    text(
      this,
      W / 2 + 20,
      64,
      this.daily ? 'Same starters and map for everyone today' : 'Three picked at random from your unlocked pool',
      14,
      COLORS.textDim,
    ).setOrigin(0.5);

    const choices = this.daily ? dailyStarters(this.daily) : rollStarterChoices(state.meta, new Rng());
    choices.forEach((id, i) => {
      const sp = SPECIES_BY_ID[id];
      dex.form(id, 0);
      const preview = createCreature(id, BALANCE.starterLevel);
      const s = stats(preview);
      const y = 100 + i * 228;
      const card = this.add.rectangle(20, y, W - 40, 214, COLORS.panel).setOrigin(0).setStrokeStyle(2, COLORS.stroke);
      card.setInteractive({ useHandCursor: true });
      card.on('pointerup', () => this.pick(id));

      const img = this.add.image(90, y + 85, ensureCreatureTexture(this, id, 0)).setScale(4 * SPRITE_FIT);
      this.tweens.add({ targets: img, y: y + 79, yoyo: true, repeat: -1, duration: 800 + i * 120, ease: 'Sine.easeInOut' });
      text(this, 175, y + 16, sp.names[0], 24, COLORS.text, { fontStyle: 'bold' });
      typeChips(this, 175, y + 56, sp.types);
      text(this, 175, y + 76, `HP ${s.hp}   ATK ${s.atk}\nDEF ${s.def}   SPD ${s.spd}`, 15, COLORS.textDim, { lineSpacing: 4 });
      text(this, 175, y + 122, 'Moves: ' + preview.moves.map((m) => moveDef(m).name).join(', '), 13, COLORS.textDim, {
        wordWrap: { width: W - 215 },
      });
      text(this, 175, y + 146, `Evolves: ${formName(state.meta.dex, id, 1)} → ${formName(state.meta.dex, id, 2)}`, 12, '#8e86ad', { wordWrap: { width: W - 215 } });
      button(this, W - 82, y + 189, 96, 32, 'Pick', () => this.pick(id), { color: 0x3b6d4a, fontSize: 16 });
    });

    button(this, 40, 28, 64, 36, '◀', () => this.scene.start(this.daily ? 'Title' : 'MapSelect'), { fontSize: 15 });
  }

  private pick(id: string) {
    state.run = this.daily
      ? startRun(state.meta, id, dailySeed(this.daily), 'wildlands', this.daily)
      : startRun(state.meta, id, Date.now(), this.mapId);
    this.scene.start('Map');
  }
}
