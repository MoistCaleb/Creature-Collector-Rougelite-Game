import Phaser from 'phaser';
import { maxUsesText, MOVES, moveSummary } from '../data/moves';
import { ELEMENT_COLORS } from '../data/types';
import {
  ARENA_LEVEL,
  ARENA_ROUNDS,
  ARENA_TEAM,
  arenaForms,
  arenaMovePool,
  arenaOpponent,
  arenaRoster,
  defaultArenaMoves,
  makeArenaCreature,
  validArenaTeam,
  type ArenaPick,
} from '../logic/arena';
import { createCreature, creatureName, creatureTypes, getFloorCeiling, MAX_MOVES, setFloorCeiling } from '../logic/creature';
import { SPECIES_BY_ID } from '../data/species';

const arenaName = (speciesId: string, stage: number) => SPECIES_BY_ID[speciesId].names[stage];
import { saveMeta } from '../logic/run';
import { state } from '../state';
import { openPicker, showMessage } from '../ui/picker';
import { playMusic } from '../ui/sound';
import { ensureCreatureTexture, SPRITE_FIT } from '../ui/sprites';
import { background, button, COLORS, text, typeChips, W } from '../ui/widgets';
import type { BattleMatch } from './BattleScene';

/** A ladder in progress: which round is next, and its seed. */
interface Ladder {
  round: number;
  seed: number;
}

const SLOT_H = 112;
const SLOT_Y = 104;

/** The Battle Arena: build a Lv 50 team from your Dex and climb a ladder of trainers. */
export class ArenaScene extends Phaser.Scene {
  private team: ArenaPick[] = [];

  constructor() {
    super('Arena');
  }

  create(data: { ladder?: Ladder } = {}) {
    const meta = state.meta;
    // A run's floor level cap doesn't apply to Lv 50 Arena creatures.
    const ceiling = getFloorCeiling();
    setFloorCeiling(Infinity);
    this.events.once('shutdown', () => setFloorCeiling(ceiling));
    this.team = validArenaTeam(meta, meta.arenaTeam);
    background(this);
    playMusic('title');
    button(this, 40, 28, 64, 36, '', () => this.scene.start('Title', {}), { fontSize: 15, glyph: 'back' });
    text(this, W / 2 + 20, 18, 'Battle Arena', 26, '#ffc94d', { fontStyle: 'bold' }).setOrigin(0.5, 0);
    text(this, W / 2 + 20, 54, `Everyone Lv ${ARENA_LEVEL} · no stars or items · best ${meta.arenaBest ?? 0}/${ARENA_ROUNDS}`, 13, COLORS.textDim).setOrigin(0.5, 0);
    text(this, 16, 78, `Your team (${this.team.length}/${ARENA_TEAM}) · tap a slot to edit`, 14, COLORS.text);

    for (let i = 0; i < ARENA_TEAM; i++) this.drawSlot(i);

    const y = SLOT_Y + ARENA_TEAM * SLOT_H + 14;
    button(this, W / 2, y + 30, W - 40, 60, `Start ladder (${ARENA_ROUNDS} rounds)`, () => this.startLadder({ round: 0, seed: Date.now() % 1e9 }), {
      color: 0x3b6d4a,
      fontSize: 20,
      enabled: this.team.length > 0,
      sub: this.team.length ? 'Full heal before every round' : 'Add at least one creature',
      glyph: 'swords',
    });

    if (data.ladder) this.time.delayedCall(50, () => this.startLadder(data.ladder!));
  }

  private save() {
    state.meta.arenaTeam = this.team;
    saveMeta(state.meta);
  }

  // ------------------------------------------------------------ team slots

  private drawSlot(i: number) {
    const y = SLOT_Y + i * SLOT_H;
    const p = this.team[i];
    const bg = this.add.rectangle(12, y, W - 24, SLOT_H - 8, p ? COLORS.panel : 0x18141f).setOrigin(0).setStrokeStyle(2, COLORS.stroke);
    bg.setInteractive({ useHandCursor: true }).on('pointerup', () => (p ? this.editSlot(i) : this.chooseSpecies(i)));
    if (!p) {
      text(this, W / 2, y + (SLOT_H - 8) / 2, '+ Add a creature', 16, COLORS.textDim).setOrigin(0.5);
      return;
    }
    const key = ensureCreatureTexture(this, p.speciesId, p.stage);
    this.add.image(54, y + 46, key).setScale(2.2 * SPRITE_FIT);
    const c = createCreature(p.speciesId, ARENA_LEVEL, p.stage);
    text(this, 100, y + 8, `${creatureName(c)}  Lv ${ARENA_LEVEL}`, 16, COLORS.text, { fontStyle: 'bold' });
    typeChips(this, 100, y + 38, creatureTypes(c), true);
    p.moves.forEach((id, k) => {
      const d = MOVES[id];
      const mx = 100 + (k % 2) * 165;
      const my = y + 58 + Math.floor(k / 2) * 18;
      this.add.rectangle(mx, my + 7, 7, 7, ELEMENT_COLORS[d.element]).setOrigin(0, 0.5);
      text(this, mx + 11, my, d.name, 12, COLORS.text);
    });
  }

  private editSlot(i: number) {
    const p = this.team[i];
    const forms = arenaForms(state.meta, p.speciesId);
    openPicker(this, {
      title: arenaName(p.speciesId, p.stage),
      options: [
        { label: 'Choose moves', sub: `${p.moves.length}/${MAX_MOVES} chosen`, color: 0x2f4a6b },
        { label: 'Change form', sub: forms.length > 1 ? 'Pick another stage of this line' : 'Only one form seen so far', disabled: forms.length < 2 },
        { label: 'Swap creature', sub: 'Pick a different species for this slot' },
        { label: 'Remove', color: 0x5a2a2a },
      ],
      onPick: (k) => {
        if (k === 0) this.chooseMoves(i, []);
        else if (k === 1) this.chooseForm(i, p.speciesId);
        else if (k === 2) this.chooseSpecies(i);
        else {
          this.team.splice(i, 1);
          this.save();
          this.scene.restart({});
        }
      },
      onCancel: () => {},
    });
  }

  private chooseSpecies(i: number) {
    const taken = this.team.filter((_, k) => k !== i).map((p) => p.speciesId);
    const roster = arenaRoster(state.meta).filter((id) => !taken.includes(id));
    const previews = roster.map((id) => {
      const forms = arenaForms(state.meta, id);
      return createCreature(id, ARENA_LEVEL, forms[forms.length - 1]);
    });
    openPicker(this, {
      title: 'Choose a creature',
      subtitle: 'Any species you have caught, in its most evolved form you have seen.',
      options: previews.map((c) => ({ creature: c })),
      onPick: (k) => {
        const id = roster[k];
        const forms = arenaForms(state.meta, id);
        if (forms.length > 1) return this.chooseForm(i, id);
        this.setPick(i, id, forms[0]);
      },
      onCancel: () => {},
    });
  }

  private chooseForm(i: number, speciesId: string) {
    const forms = arenaForms(state.meta, speciesId);
    openPicker(this, {
      title: 'Which form?',
      subtitle: 'Later forms have higher stats.',
      options: forms.map((st) => ({ creature: createCreature(speciesId, ARENA_LEVEL, st), note: `Stage ${st + 1}` })),
      onPick: (k) => this.setPick(i, speciesId, forms[k]),
      onCancel: () => {},
    });
  }

  private setPick(i: number, speciesId: string, stage: number) {
    this.team[i] = { speciesId, stage, moves: defaultArenaMoves(speciesId, stage) };
    this.save();
    this.scene.restart({});
  }

  /** Pick moves one at a time (up to 4); "Done" keeps what's chosen so far. */
  private chooseMoves(i: number, chosen: string[]) {
    const p = this.team[i];
    const pool = arenaMovePool(p.speciesId, p.stage).filter((id) => !chosen.includes(id));
    const finish = (moves: string[]) => {
      this.team[i] = { ...p, moves };
      this.save();
      this.scene.restart({});
    };
    if (chosen.length >= MAX_MOVES || !pool.length) return finish(chosen);
    openPicker(this, {
      title: `Move ${chosen.length + 1} of ${MAX_MOVES}`,
      subtitle: chosen.length ? `Chosen: ${chosen.map((id) => MOVES[id].name).join(', ')}` : `${arenaName(p.speciesId, p.stage)} can learn these by Lv ${ARENA_LEVEL}.`,
      options: [
        ...pool.map((id) => {
          const d = MOVES[id];
          return { label: d.name, sub: `${d.element} · ${moveSummary(d, 1)} · ${maxUsesText(d)}`, color: Phaser.Display.Color.ValueToColor(ELEMENT_COLORS[d.element]).darken(45).color };
        }),
        ...(chosen.length ? [{ label: `Done (keep ${chosen.length})`, color: 0x3b6d4a }] : []),
      ],
      onPick: (k) => (k < pool.length ? this.chooseMoves(i, [...chosen, pool[k]]) : finish(chosen)),
      onCancel: () => (chosen.length ? finish(chosen) : undefined),
      cancelLabel: chosen.length ? 'Done' : 'Cancel',
      rowHeight: 62,
    });
  }

  // ------------------------------------------------------------ ladder

  private startLadder(l: Ladder) {
    const opp = arenaOpponent(l.round, l.seed);
    openPicker(this, {
      title: `Round ${l.round + 1} of ${ARENA_ROUNDS}`,
      subtitle: `${opp.name} sends out ${opp.team.length} creatures. Your team is fully healed.`,
      rows: opp.team.map((c) => ({ creature: c, text: `${creatureName(c)} · Lv ${c.level}` })),
      options: [{ label: 'Fight!', color: 0x8a2c2c }],
      onPick: () => {
        const match: BattleMatch = {
          team: this.team.map(makeArenaCreature),
          enemies: opp.team,
          seed: l.seed + l.round,
          title: `ARENA ${l.round + 1}/${ARENA_ROUNDS}`,
          opponent: opp.name,
          randomness: opp.randomness,
          background: 0x1a1430,
          onEnd: (won) => this.roundOver(l, won),
        };
        this.scene.start('Battle', { kind: 'elite', match });
      },
      onCancel: () => this.scene.start('Arena', {}),
      cancelLabel: l.round ? 'Leave the ladder' : 'Back',
    });
  }

  /** Runs in the Battle scene when a round ends. */
  private roundOver(l: Ladder, won: boolean) {
    const meta = state.meta;
    const battle = this.scene.get('Battle');
    const wins = l.round + (won ? 1 : 0);
    const record = wins > (meta.arenaBest ?? 0);
    if (record) {
      meta.arenaBest = wins;
      saveMeta(meta);
    }
    const best = record ? `\n\nNew best: ${wins}/${ARENA_ROUNDS}!` : '';
    if (won && wins >= ARENA_ROUNDS) {
      return showMessage(battle, 'Arena Champion!', `You beat all ${ARENA_ROUNDS} rounds.${best}`, () => battle.scene.start('Arena', {}));
    }
    if (won) {
      return showMessage(battle, `Round ${l.round + 1} won!`, `On to round ${l.round + 2}.${best}`, () =>
        battle.scene.start('Arena', { ladder: { round: l.round + 1, seed: l.seed } }),
      );
    }
    showMessage(battle, 'Defeated', `You won ${wins} of ${ARENA_ROUNDS} rounds.${best}`, () => battle.scene.start('Arena', {}));
  }
}
