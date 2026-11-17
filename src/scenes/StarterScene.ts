import Phaser from 'phaser';
import { SPECIES_BY_ID } from '../data/species';
import { BALANCE } from '../data/balance';
import { createCreature, moveDef, stats } from '../logic/creature';
import { Rng } from '../logic/rng';
import { dailySeed, dailyStarters, rollStarterChoices, startRun } from '../logic/run';
import { formName } from '../logic/dex';
import { dex, state } from '../state';
import { MAP_BY_ID } from '../data/maps';
import type { RaceInfo } from '../net/duel';
import { duel, sendProgress } from '../net/runtime';
import { session } from '../net/session';
import { ensureCreatureTexture, SPRITE_FIT } from '../ui/sprites';
import { playMusic } from '../ui/sound';
import { icon as pixelIcon } from '../ui/icons';
import { background, button, COLORS, text, typeChips, W } from '../ui/widgets';

export class StarterScene extends Phaser.Scene {
  constructor() {
    super('Starter');
  }

  private mapId = 'wildlands';
  private daily: string | null = null;
  private race: RaceInfo | null = null;

  create(data: { mapId?: string; daily?: string; race?: RaceInfo } = {}) {
    this.daily = data.daily ?? null;
    this.race = data.race ?? null;
    this.mapId = this.race ? this.race.mapId : this.daily ? 'wildlands' : data.mapId ?? state.meta.lastMap ?? 'wildlands';
    background(this);
    playMusic('title');
    const opp = duel.opponent?.name ?? 'your friend';
    const titleText = this.race ? `Stage race vs ${opp}` : this.daily ? `Daily run · ${this.daily}` : 'Choose your starter';
    const title = text(this, W / 2 + 20, 34, titleText, this.daily || this.race ? 22 : 26, '#ffc94d', { fontStyle: 'bold' }).setOrigin(0.5);
    if (this.daily) pixelIcon(this, title.x - title.width / 2 - 16, 34, 'calendar', 22);
    text(
      this,
      W / 2 + 20,
      64,
      this.race
        ? `${MAP_BY_ID[this.mapId]?.name ?? 'Map'} · double battle rewards · same starters for both`
        : this.daily
        ? 'Same starters and map for everyone today'
        : state.meta.favorite && state.meta.unlockedStarters.includes(state.meta.favorite)
          ? 'Your favorite plus two random picks'
          : 'Three picked at random from your unlocked pool',
      14,
      COLORS.textDim,
    ).setOrigin(0.5);

    const choices = this.race ? this.race.starters : this.daily ? dailyStarters(this.daily) : rollStarterChoices(state.meta, new Rng());
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
      if (!this.daily && state.meta.favorite === id) {
        pixelIcon(this, W - 48, y + 22, 'star', 18);
        text(this, W - 60, y + 14, 'Favorite', 12, '#ffc94d', { fontStyle: 'bold' }).setOrigin(1, 0);
      }
      typeChips(this, 175, y + 56, sp.types);
      text(this, 175, y + 76, `HP ${s.hp}   ATK ${s.atk}\nDEF ${s.def}   SPD ${s.spd}`, 15, COLORS.textDim, { lineSpacing: 4 });
      text(this, 175, y + 122, 'Moves: ' + preview.moves.map((m) => moveDef(m).name).join(', '), 13, COLORS.textDim, {
        wordWrap: { width: W - 215 },
      });
      text(this, 175, y + 146, `Evolves: ${formName(state.meta.dex, id, 1)} → ${formName(state.meta.dex, id, 2)}`, 12, '#8e86ad', { wordWrap: { width: W - 215 } });
      button(this, W - 82, y + 189, 96, 32, 'Pick', () => this.pick(id), { color: 0x3b6d4a, fontSize: 16 });
    });

    if (!this.race) button(this, 40, 28, 64, 36, '', () => this.scene.start(this.daily ? 'Daily' : 'MapSelect', {}), { fontSize: 15, glyph: 'back' });
  }

  private pick(id: string) {
    if (this.race) {
      // Same map and seed as the other racer; Heat 0 and no passive so it's even.
      const run = startRun(state.meta, id, this.race.seed, this.mapId, undefined, true);
      run.race = { opponent: duel.opponent?.name ?? 'Friend', role: session.role === 'host' ? 'host' : 'guest' };
      state.run = run;
      sendProgress({ floor: 0, finished: false, won: false });
    } else {
      state.run = this.daily
        ? startRun(state.meta, id, dailySeed(this.daily), 'wildlands', this.daily)
        : startRun(state.meta, id, Date.now(), this.mapId);
    }
    this.scene.start('Map', {});
  }
}
