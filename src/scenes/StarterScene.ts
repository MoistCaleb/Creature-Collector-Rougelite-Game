import Phaser from 'phaser';
import { rollTrait, TRAITS, type TraitId } from '../data/traits';
import { traitDescOf, traitName } from '../ui/traitText';
import { tip } from '../ui/tips';
import { bondColours, bondStarterLevels, bondTrait, canChooseTrait, prepsAvailable, setBondTrait } from '../logic/camp';
import { traitsFound } from '../logic/dex';
import { SPECIES_BY_ID } from '../data/species';
import { BALANCE } from '../data/balance';
import { createCreature, moveDef, stats } from '../logic/creature';
import { Rng } from '../logic/rng';
import { omenFor } from '../logic/surprises';
import { SURPRISES } from '../data/surprises';
import { addPartner, noteShinyOwned, saveMeta, dailyPassives, dailySeed, racePassives, dailyStarters, PASSIVES, startWeekly, TWISTS, twistShort, weeklyInfo, rollStarterChoices, starterShiny, startRun, toggleStarterShiny } from '../logic/run';
import { formName } from '../logic/dex';
import { dex, state } from '../state';
import { MAP_BY_ID } from '../data/maps';
import type { RaceInfo } from '../net/duel';
import { duel, sendProgress } from '../net/runtime';
import { royale } from '../net/royale';
import { session } from '../net/session';
import { ensureCreatureTexture, SPRITE_FIT, type Colours } from '../ui/sprites';
import { playMusic } from '../ui/sound';
import { icon as pixelIcon } from '../ui/icons';
import { background, button, COLORS, LANDSCAPE, text, typeChips, W } from '../ui/widgets';
import { openPicker, showMessage } from '../ui/picker';
import { wsHas } from '../logic/workshop';
import { gildedStarterOffer } from '../logic/huntMilestones';

/** This visit's three random starters. */
let rolled: string[] | null = null;
/** The starters' traits come from this (shared seeds: the same for everyone; otherwise rolled per visit). */
let traitKey: string | null = null;

export class StarterScene extends Phaser.Scene {
  constructor() {
    super('Starter');
  }

  private mapId = 'wildlands';
  private daily: string | null = null;
  private weekly: string | null = null;
  private race: RaceInfo | null = null;
  /** Gilded Hunt milestone (floor 7): the starter offered Gilded at this pick, if any. */
  private gold: string | null = null;
  /** A quick run (2.0): two floors on smaller maps. */
  private quick = false;

  create(data: { mapId?: string; daily?: string; weekly?: string; race?: RaceInfo; quick?: boolean } = {}) {
    this.daily = data.daily ?? null;
    this.quick = !!data.quick && !data.daily && !data.weekly && !data.race;
    this.weekly = data.weekly ?? null;
    const week = this.weekly ? weeklyInfo(this.weekly) : null;
    this.race = data.race ?? null;
    this.mapId = this.race ? this.race.mapId : week ? week.mapId : this.daily ? 'wildlands' : data.mapId ?? state.meta.lastMap ?? 'wildlands';
    background(this);
    playMusic('title');
    const opp = duel.opponent?.name ?? 'your friend';
    const titleText = this.race ? (royale.active ? `Battle royale · ${royale.players.length} players` : `Stage battle vs ${opp}`) : week ? `Weekly · ${TWISTS[week.twist].name}` : this.daily ? `Daily run · ${this.daily}` : this.quick ? 'Quick run: choose your starter' : 'Choose your starter';
    const title = text(this, W / 2 + 20, 34, titleText, this.daily || this.race || week || this.quick ? 22 : 26, '#ffc94d', { fontStyle: 'bold' }).setOrigin(0.5);
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

    // Shared seeds: everyone gets the same omen, so it's shown before you pick.
    const omenSeed = this.race ? this.race.seed : week ? week.seed : this.daily ? dailySeed(this.daily) : null;
    // Omen Week: the week's omen.
    const omen = week?.omen ?? (omenSeed !== null ? omenFor(omenSeed) : undefined);
    if (omen) {
      const o = text(this, W / 2 + 20, 84, `✶ Omen: ${SURPRISES[omen].name}  (tap)`, 13, '#ff7ad9', { fontStyle: 'bold' }).setOrigin(0.5);
      o.setInteractive({ useHandCursor: true }).on('pointerup', () => showMessage(this, `Omen: ${SURPRISES[omen].name}`, SURPRISES[omen].desc));
    }

    // The roll is kept until you pick or leave, so turning the phone doesn't reroll it.
    rolled ??= rollStarterChoices(state.meta, new Rng());
    const choices = this.race ? this.race.starters : week ? week.starters : this.daily ? dailyStarters(this.daily) : rolled;
    // Daily runs and weekly challenges: each starter comes with a passive that suits it.
    const passives = this.race ? racePassives(this.race.seed, this.race.starters) : week ? week.passives : this.daily ? dailyPassives(this.daily) : null;
    this.gold = !this.race && !week && !this.daily ? gildedStarterOffer(state.meta, choices) : null;
    traitKey = this.race ? `race:${this.race.seed}` : week ? `week:${this.weekly}` : this.daily ? `daily:${this.daily}` : (traitKey ?? `free:${Math.random()}`);
    const free = !this.race && !week && !this.daily;
    choices.forEach((id, i) => {
      const sp = SPECIES_BY_ID[id];
      const trait = this.cardTrait(id);
      // Camp bond heart 4: tap the trait to choose it (from the ones you've found).
      const choose = free && canChooseTrait(state.meta, id);
      const tName = trait ? `Trait: ${traitName(id, trait)}${choose ? ' ♥' : ''}` : '';
      dex.form(id, 0);
      const preview = createCreature(id, BALANCE.starterLevel + (free ? bondStarterLevels(state.meta, id) : 0));
      const look: Colours = starterShiny(state.meta, id) || id === this.gold ? true : bondColours(state.meta, id) ? 'alt' : false;
      const s = stats(preview);
      if (LANDSCAPE) {
        // Sideways: three tall cards side by side.
        const cw = (W - 40 - 24) / 3;
        const x = 20 + i * (cw + 12);
        const y = 88;
        const mid = x + cw / 2;
        const card = this.add.rectangle(x, y, cw, 350, COLORS.panel).setOrigin(0).setStrokeStyle(2, COLORS.stroke);
        card.setInteractive({ useHandCursor: true }).on('pointerup', () => this.pick(id));
        const img = this.add.image(mid, y + 66, ensureCreatureTexture(this, id, 0, look)).setScale(3.4 * SPRITE_FIT);
        this.shinyToggle(id, x + cw - 50, y + 18, 84);
        if (id === this.gold) this.goldTag(x + cw - 50, y + 18);
        this.tweens.add({ targets: img, y: y + 60, yoyo: true, repeat: -1, duration: 800 + i * 120, ease: 'Sine.easeInOut' });
        if (!this.daily && !week && state.meta.favorite === id) {
          pixelIcon(this, x + 18, y + 16, 'star', 16);
          text(this, x + 30, y + 9, 'Favorite', 11, '#ffc94d', { fontStyle: 'bold' });
        }
        text(this, mid, y + 122, sp.names[0], 22, COLORS.text, { fontStyle: 'bold' }).setOrigin(0.5, 0);
        const chipsW = sp.types[0] === sp.types[1] ? 104 : 128;
        typeChips(this, mid - chipsW / 2, y + 162, sp.types);
        text(this, mid, y + 180, `HP ${s.hp}   ATK ${s.atk}\nDEF ${s.def}   SPD ${s.spd}`, 14, COLORS.textDim, { lineSpacing: 3, align: 'center' }).setOrigin(0.5, 0);
        const mv = text(this, mid, y + 224, 'Moves: ' + preview.moves.map((m) => moveDef(m).name).join(', '), 12, COLORS.textDim, { wordWrap: { width: cw - 20 }, align: 'center' }).setOrigin(0.5, 0);
        // A third move (camp bond heart 5's extra levels) can wrap: make room below it.
        const dy = mv.height > 20 ? 12 : 0;
        if (tName) this.traitTap(text(this, mid, y + 252 + dy, `${tName}  ⓘ`, 12, '#ffe9a8', { fontStyle: 'bold' }).setOrigin(0.5, 0), id, trait!, choose);
        // (With a passive to show, the card has no room for the evolution line.)
        if (passives?.[id]) {
          const pv = PASSIVES[passives[id]];
          text(this, mid, y + 272 + dy, `${pv.name}: ${pv.desc}`, 11, '#ffc94d', { wordWrap: { width: cw - 16 }, align: 'center' }).setOrigin(0.5, 0);
        } else text(this, mid, y + 274 + dy, `Evolves: ${formName(state.meta.dex, id, 1)} → ${formName(state.meta.dex, id, 2)}`, 11, '#8e86ad', { wordWrap: { width: cw - 20 }, align: 'center' }).setOrigin(0.5, 0);
        button(this, mid, y + 328, cw - 40, 32, 'Pick', () => this.pick(id), { color: 0x3b6d4a, fontSize: 16 });
        return;
      }
      const y = 100 + i * 228;
      const card = this.add.rectangle(20, y, W - 40, 214, COLORS.panel).setOrigin(0).setStrokeStyle(2, COLORS.stroke);
      card.setInteractive({ useHandCursor: true });
      card.on('pointerup', () => this.pick(id));

      const img = this.add.image(90, y + 85, ensureCreatureTexture(this, id, 0, look)).setScale(4 * SPRITE_FIT);
      this.shinyToggle(id, 82, y + 20, 100);
      if (id === this.gold) this.goldTag(82, y + 20);
      this.tweens.add({ targets: img, y: y + 79, yoyo: true, repeat: -1, duration: 800 + i * 120, ease: 'Sine.easeInOut' });
      text(this, 175, y + 16, sp.names[0], 24, COLORS.text, { fontStyle: 'bold' });
      if (!this.daily && !week && state.meta.favorite === id) {
        pixelIcon(this, W - 48, y + 22, 'star', 18);
        text(this, W - 60, y + 14, 'Favorite', 12, '#ffc94d', { fontStyle: 'bold' }).setOrigin(1, 0);
      }
      typeChips(this, 175, y + 56, sp.types);
      text(this, 175, y + 76, `HP ${s.hp}   ATK ${s.atk}\nDEF ${s.def}   SPD ${s.spd}`, 15, COLORS.textDim, { lineSpacing: 4 });
      const mv = text(this, 175, y + 122, 'Moves: ' + preview.moves.map((m) => moveDef(m).name).join(', '), 13, COLORS.textDim, {
        wordWrap: { width: W - 215 },
      });
      // A third move (camp bond heart 5's extra levels) can wrap: make room below it.
      const dy = mv.height > 22 ? 14 : 0;
      if (tName) this.traitTap(text(this, 175, y + 146 + dy, `${tName}  ⓘ`, 13, '#ffe9a8', { fontStyle: 'bold' }), id, trait!, choose);
      // (With a passive to show, the card has no room for the evolution line.)
      if (!passives?.[id]) {
        const evo = text(this, 175, y + 168 + dy, `Evolves: ${formName(state.meta.dex, id, 1)} → ${formName(state.meta.dex, id, 2)}`, 12, '#8e86ad');
        // Keep it clear of the Pick button.
        if (evo.width > W - 320) evo.setScale((W - 320) / evo.width, 1);
      }
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
        traitKey = null;
        this.scene.start(this.daily || this.weekly ? 'Daily' : 'MapSelect', { quick: this.quick });
      }, { fontSize: 15, glyph: 'back' });
    }
    // First time: what traits are.
    if (choices.some((id) => this.cardTrait(id))) tip(this, 'traits');
  }

  /** The trait a card shows: your chosen one (camp bond heart 4, normal runs), else rolled. */
  private cardTrait(id: string): TraitId | undefined {
    const free = !this.race && !this.weekly && !this.daily;
    return (free ? bondTrait(state.meta, id) : undefined) ?? rollTrait(id, traitKey!);
  }

  /** Tap a trait: what it does, or (camp bond heart 4) choose it from the ones you've found. */
  private traitTap(t: Phaser.GameObjects.Text, id: string, trait: TraitId, choose: boolean) {
    if (!choose) return traitHint(t, trait);
    t.setInteractive({ useHandCursor: true }).on('pointerup', (_p: unknown, _x: number, _y: number, e: Phaser.Types.Input.EventData) => {
      e?.stopPropagation?.();
      const found = traitsFound(state.meta.dex, id);
      openPicker(this, {
        title: 'Choose its trait',
        subtitle: `Camp bond ♥♥♥♥: as your starter, ${SPECIES_BY_ID[id].names[0]} can have any trait you've found on its line.`,
        options: found.map((k) => ({ label: `${TRAITS[k].name}${k === trait ? ' (now)' : ''}`, sub: traitDescOf(k, false), color: k === trait ? 0x6a3a5a : undefined })),
        cancelLabel: 'Back',
        onCancel: () => {},
        onPick: (i) => {
          setBondTrait(state.meta, id, found[i]);
          saveMeta(state.meta);
          this.scene.restart({ mapId: this.mapId, quick: this.quick });
        },
      });
    });
  }

  /** The Gilded offer's tag: pick it and the line is yours Gilded (a Gilded Hunt milestone). */
  private goldTag(x: number, y: number) {
    const t = text(this, x, y, '✦ Gilded offer', 12, '#ffd86b', { fontStyle: 'bold', stroke: '#14101e', strokeThickness: 3 }).setOrigin(0.5);
    t.setInteractive({ useHandCursor: true }).on('pointerup', (_p: unknown, _x: number, _y: number, e: Phaser.Types.Input.EventData) => {
      e?.stopPropagation?.();
      showMessage(this, '✦ Gilded offer', 'A reward from floor 7 of the Gilded Hunt: now and then, one of your starters is offered Gilded. Pick it and you own its line Gilded for good.');
    });
  }

  /** Shiny unlocked for this line: start it shiny (tap to switch to its normal colours and back). */
  private shinyToggle(id: string, x: number, y: number, w: number) {
    const meta = state.meta;
    if (!(meta.shinyOwned ?? []).includes(id)) return;
    const on = starterShiny(meta, id);
    button(this, x, y, w, 24, on ? '✦ Gilded' : '✦ Normal', () => {
      toggleStarterShiny(meta, id);
      this.scene.restart({ mapId: this.mapId, quick: this.quick, daily: this.daily ?? undefined, weekly: this.weekly ?? undefined, race: this.race ?? undefined });
    }, { fontSize: 11, color: on ? 0x7a5a1c : 0x2a2440 });
  }

  private pick(id: string) {
    // Partner (a Workshop capstone): the other two starters, with the traits their cards showed.
    const key = traitKey;
    const gold = this.gold === id;
    this.gold = null;
    const others = !this.race && !this.daily && !this.weekly ? (rolled ?? []).filter((x) => x !== id) : [];
    rolled = null;
    const trait = traitKey ? this.cardTrait(id) : undefined;
    traitKey = null;
    if (this.race) {
      // Same map and seed as the other racer; Heat 0 and no passive so it's even.
      const run = startRun(state.meta, id, this.race.seed, this.mapId, undefined, true, undefined, racePassives(this.race.seed, this.race.starters)[id] ?? null);
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
        : startRun(state.meta, id, Date.now(), this.mapId, undefined, false, undefined, undefined, this.quick);
    }
    // The starter keeps the trait it showed on its card.
    if (trait && state.run.team[0]) state.run.team[0].trait = trait;
    // The Gilded offer (a Gilded Hunt milestone): it starts Gilded, and its line is yours Gilded.
    if (gold && state.run.team[0]) {
      state.run.team[0].shiny = true;
      noteShinyOwned(state.meta, id);
      saveMeta(state.meta);
    }
    const run = state.run;
    // Every run but dailies and weeklies stops at camp first: one thing for the road, and the news.
    const go = () => (prepsAvailable(run) ? this.scene.start('Camp', { prep: true }) : this.scene.start('Map', {}));
    if (!wsHas(run, 'partner') || !others.length) return go();
    const lead = run.team[0];
    const previews = others.map((o) => {
      const c = createCreature(o, lead.level);
      if (key) c.trait = rollTrait(o, key) ?? c.trait;
      return c;
    });
    openPicker(this, {
      title: 'Choose a partner',
      subtitle: `Partner (Workshop): one more starter joins ${SPECIES_BY_ID[lead.speciesId].names[lead.stage]} at Lv ${lead.level}.`,
      options: previews.map((c) => ({ creature: c })),
      onPick: (i) => {
        const p = addPartner(run, others[i]);
        if (p && previews[i].trait) p.trait = previews[i].trait;
        go();
      },
      cancelLabel: 'No partner',
      onCancel: go,
    });
  }
}

/** Tap a trait to see what it does. */
function traitHint(t: Phaser.GameObjects.Text, id: TraitId) {
  t.setInteractive({ useHandCursor: true }).on('pointerup', (_p: unknown, _x: number, _y: number, e: Phaser.Types.Input.EventData) => {
    e?.stopPropagation?.();
    showMessage(t.scene, TRAITS[id].name, traitDescOf(id, false));
  });
}
