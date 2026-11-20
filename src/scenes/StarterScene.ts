import Phaser from 'phaser';
import { prepsAvailable } from '../logic/camp';
import { SPECIES_BY_ID } from '../data/species';
import { BALANCE } from '../data/balance';
import { createCreature, moveDef, stats } from '../logic/creature';
import { Rng } from '../logic/rng';
import { dailyPassives, dailySeed, racePassives, dailyStarters, PASSIVES, startWeekly, TWISTS, twistShort, weeklyInfo, rollStarterChoices, starterShiny, startRun, toggleStarterShiny } from '../logic/run';
import { formName } from '../logic/dex';
import { dex, state } from '../state';
import { MAP_BY_ID } from '../data/maps';
import type { RaceInfo } from '../net/duel';
import { duel, sendProgress } from '../net/runtime';
import { royale } from '../net/royale';
import { session } from '../net/session';
import { ensureCreatureTexture, SPRITE_FIT } from '../ui/sprites';
import { playMusic } from '../ui/sound';
import { icon as pixelIcon } from '../ui/icons';
import { background, button, COLORS, LANDSCAPE, text, typeChips, W } from '../ui/widgets';

/** This visit's three random starters. */
let rolled: string[] | null = null;

export class StarterScene extends Phaser.Scene {
  constructor() {
    super('Starter');
  }

  private mapId = 'wildlands';
  private daily: string | null = null;
  private weekly: string | null = null;
  private race: RaceInfo | null = null;

  create(data: { mapId?: string; daily?: string; weekly?: string; race?: RaceInfo } = {}) {
    this.daily = data.daily ?? null;
    this.weekly = data.weekly ?? null;
    const week = this.weekly ? weeklyInfo(this.weekly) : null;
    this.race = data.race ?? null;
    this.mapId = this.race ? this.race.mapId : week ? week.mapId : this.daily ? 'wildlands' : data.mapId ?? state.meta.lastMap ?? 'wildlands';
    background(this);
    playMusic('title');
    const opp = duel.opponent?.name ?? 'your friend';
    const titleText = this.race ? (royale.active ? `Battle royale · ${royale.players.length} players` : `Stage battle vs ${opp}`) : week ? `Weekly · ${TWISTS[week.twist].name}` : this.daily ? `Daily run · ${this.daily}` : 'Choose your starter';
    const title = text(this, W / 2 + 20, 34, titleText, this.daily || this.race || week ? 22 : 26, '#ffc94d', { fontStyle: 'bold' }).setOrigin(0.5);
    if (this.daily || week) pixelIcon(this, title.x - title.width / 2 - 16, 34, week ? 'crown' : 'calendar', 22);
    text(
      this,
      W / 2 + 20,
      64,
      this.race
        ? `${MAP_BY_ID[this.mapId]?.name ?? 'Map'} · double battle rewards · same starters for ${royale.active ? 'everyone' : 'both'}`
        : week
        ? twistShort(week)
        : this.daily
        ? 'Same starters, map and passives for everyone'
        : state.meta.favorite && state.meta.unlockedStarters.includes(state.meta.favorite)
          ? 'Your favorite plus two random picks'
          : 'Three picked at random from your unlocked pool',
      14,
      COLORS.textDim,
    ).setOrigin(0.5);

    // The roll is kept until you pick or leave, so turning the phone doesn't reroll it.
    rolled ??= rollStarterChoices(state.meta, new Rng());
    const choices = this.race ? this.race.starters : week ? week.starters : this.daily ? dailyStarters(this.daily) : rolled;
    // Daily runs and weekly challenges: each starter comes with a passive that suits it.
    const passives = this.race ? racePassives(this.race.seed, this.race.starters) : week ? week.passives : this.daily ? dailyPassives(this.daily) : null;
    choices.forEach((id, i) => {
      const sp = SPECIES_BY_ID[id];
      dex.form(id, 0);
      const preview = createCreature(id, BALANCE.starterLevel);
      const s = stats(preview);
      if (LANDSCAPE) {
        // Sideways: three tall cards side by side.
        const cw = (W - 40 - 24) / 3;
        const x = 20 + i * (cw + 12);
        const y = 88;
        const mid = x + cw / 2;
        const card = this.add.rectangle(x, y, cw, 350, COLORS.panel).setOrigin(0).setStrokeStyle(2, COLORS.stroke);
        card.setInteractive({ useHandCursor: true }).on('pointerup', () => this.pick(id));
        const img = this.add.image(mid, y + 66, ensureCreatureTexture(this, id, 0, starterShiny(state.meta, id))).setScale(3.4 * SPRITE_FIT);
        this.shinyToggle(id, x + cw - 50, y + 18, 84);
        this.tweens.add({ targets: img, y: y + 60, yoyo: true, repeat: -1, duration: 800 + i * 120, ease: 'Sine.easeInOut' });
        if (!this.daily && !week && state.meta.favorite === id) {
          pixelIcon(this, x + 18, y + 16, 'star', 16);
          text(this, x + 30, y + 9, 'Favorite', 11, '#ffc94d', { fontStyle: 'bold' });
        }
        text(this, mid, y + 122, sp.names[0], 22, COLORS.text, { fontStyle: 'bold' }).setOrigin(0.5, 0);
        const chipsW = sp.types[0] === sp.types[1] ? 104 : 128;
        typeChips(this, mid - chipsW / 2, y + 162, sp.types);
        text(this, mid, y + 180, `HP ${s.hp}   ATK ${s.atk}\nDEF ${s.def}   SPD ${s.spd}`, 14, COLORS.textDim, { lineSpacing: 3, align: 'center' }).setOrigin(0.5, 0);
        text(this, mid, y + 226, 'Moves: ' + preview.moves.map((m) => moveDef(m).name).join(', '), 12, COLORS.textDim, { wordWrap: { width: cw - 20 }, align: 'center' }).setOrigin(0.5, 0);
        text(this, mid, y + 262, `Evolves: ${formName(state.meta.dex, id, 1)} → ${formName(state.meta.dex, id, 2)}`, 11, '#8e86ad', { wordWrap: { width: cw - 20 }, align: 'center' }).setOrigin(0.5, 0);
        if (passives?.[id]) {
          const pv = PASSIVES[passives[id]];
          text(this, mid, y + 280, `${pv.name}: ${pv.desc}`, 11, '#ffc94d', { wordWrap: { width: cw - 16 }, align: 'center' }).setOrigin(0.5, 0);
        }
        button(this, mid, y + 328, cw - 40, 32, 'Pick', () => this.pick(id), { color: 0x3b6d4a, fontSize: 16 });
        return;
      }
      const y = 100 + i * 228;
      const card = this.add.rectangle(20, y, W - 40, 214, COLORS.panel).setOrigin(0).setStrokeStyle(2, COLORS.stroke);
      card.setInteractive({ useHandCursor: true });
      card.on('pointerup', () => this.pick(id));

      const img = this.add.image(90, y + 85, ensureCreatureTexture(this, id, 0, starterShiny(state.meta, id))).setScale(4 * SPRITE_FIT);
      this.shinyToggle(id, 82, y + 20, 100);
      this.tweens.add({ targets: img, y: y + 79, yoyo: true, repeat: -1, duration: 800 + i * 120, ease: 'Sine.easeInOut' });
      text(this, 175, y + 16, sp.names[0], 24, COLORS.text, { fontStyle: 'bold' });
      if (!this.daily && !week && state.meta.favorite === id) {
        pixelIcon(this, W - 48, y + 22, 'star', 18);
        text(this, W - 60, y + 14, 'Favorite', 12, '#ffc94d', { fontStyle: 'bold' }).setOrigin(1, 0);
      }
      typeChips(this, 175, y + 56, sp.types);
      text(this, 175, y + 76, `HP ${s.hp}   ATK ${s.atk}\nDEF ${s.def}   SPD ${s.spd}`, 15, COLORS.textDim, { lineSpacing: 4 });
      text(this, 175, y + 122, 'Moves: ' + preview.moves.map((m) => moveDef(m).name).join(', '), 13, COLORS.textDim, {
        wordWrap: { width: W - 215 },
      });
      text(this, 175, y + 146, `Evolves: ${formName(state.meta.dex, id, 1)} → ${formName(state.meta.dex, id, 2)}`, 12, '#8e86ad', { wordWrap: { width: W - 215 } });
      if (passives?.[id]) {
        const pv = PASSIVES[passives[id]];
        pixelIcon(this, 42, y + 177, 'star', 14);
        text(this, 54, y + 168, `Passive: ${pv.name}`, 13, '#ffc94d', { fontStyle: 'bold' });
        text(this, 36, y + 186, pv.desc, 11, COLORS.textDim, { wordWrap: { width: W - 186 } });
      }
      button(this, W - 82, y + 189, 96, 32, 'Pick', () => this.pick(id), { color: 0x3b6d4a, fontSize: 16 });
    });

    if (!this.race) {
      button(this, 40, 28, 64, 36, '', () => {
        rolled = null;
        this.scene.start(this.daily || this.weekly ? 'Daily' : 'MapSelect', {});
      }, { fontSize: 15, glyph: 'back' });
    }
  }

  /** Shiny unlocked for this line: start it shiny (tap to switch to its normal colours and back). */
  private shinyToggle(id: string, x: number, y: number, w: number) {
    const meta = state.meta;
    if (!(meta.shinyOwned ?? []).includes(id)) return;
    const on = starterShiny(meta, id);
    button(this, x, y, w, 24, on ? '✦ Gilded' : '✦ Normal', () => {
      toggleStarterShiny(meta, id);
      this.scene.restart({ mapId: this.mapId, daily: this.daily ?? undefined, weekly: this.weekly ?? undefined, race: this.race ?? undefined });
    }, { fontSize: 11, color: on ? 0x7a5a1c : 0x2a2440 });
  }

  private pick(id: string) {
    rolled = null;
    if (this.race) {
      // Same map and seed as the other racer; Heat 0 and no passive so it's even.
      const run = startRun(state.meta, id, this.race.seed, this.mapId, undefined, true, undefined, racePassives(this.race.seed, this.race.starters)[id]);
      run.race = royale.active
        ? { opponent: `${royale.players.length - 1} rivals`, role: session.role === 'host' ? 'host' : 'guest', royale: true }
        : { opponent: duel.opponent?.name ?? 'Friend', role: session.role === 'host' ? 'host' : 'guest' };
      state.run = run;
      sendProgress({ floor: 0, finished: false, won: false });
    } else {
      state.run = this.weekly
        ? startWeekly(state.meta, this.weekly, id)
        : this.daily
        ? startRun(state.meta, id, dailySeed(this.daily), 'wildlands', this.daily)
        : startRun(state.meta, id, Date.now(), this.mapId);
    }
    // Every run but dailies and weeklies stops at camp first: one thing for the road, and the news.
    if (prepsAvailable(state.run)) this.scene.start('Camp', { prep: true });
    else this.scene.start('Map', {});
  }
}
