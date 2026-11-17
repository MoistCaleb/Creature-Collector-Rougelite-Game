import { takeNewTitles} from '../logic/titles';
import { titleNews } from '../logic/cosmetics';
import Phaser from 'phaser';
import { MOVES } from '../data/moves';
import { ELEMENT_COLORS } from '../data/types';
import {
  ARENA_LEVEL,
  ARENA_ROUNDS,
  ARENA_TEAM,
  arenaOpponent,
  makeArenaCreature,
  activeTeam,
  activeTeamIndex,
  savedTeams,
  type ArenaPick,
} from '../logic/arena';
import { createCreature, creatureName, creatureTypes, getFloorCeiling, setFloorCeiling } from '../logic/creature';
import { saveMeta } from '../logic/run';
import { state } from '../state';
import { openPicker, showMessage } from '../ui/picker';
import { playMusic } from '../ui/sound';
import { ensureCreatureTexture, SPRITE_FIT } from '../ui/sprites';
import { background, button, COLORS, LANDSCAPE, text, typeChips, W } from '../ui/widgets';
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
    this.team = activeTeam(meta);
    background(this);
    playMusic('arena');
    button(this, 40, 28, 64, 36, '', () => this.scene.start('Title', {}), { fontSize: 15, glyph: 'back' });
    text(this, W / 2 + 20, 18, 'Battle Arena', 26, '#ffc94d', { fontStyle: 'bold' }).setOrigin(0.5, 0);
    text(this, W / 2 + 20, 54, `Everyone Lv ${ARENA_LEVEL} · no stars or items · best ${meta.arenaBest ?? 0}/${ARENA_ROUNDS}`, 13, COLORS.textDim).setOrigin(0.5, 0);
    const name = savedTeams(meta)[activeTeamIndex(meta)].name;
    text(this, 16, 78, `${name} (${this.team.length}/${ARENA_TEAM}) · tap to edit`, 14, COLORS.text);
    button(this, W - 60, 86, 96, 28, `Teams (${savedTeams(meta).length})`, () => this.scene.start('Teams', {}), { fontSize: 13, color: 0x2f4a6b });

    for (let i = 0; i < ARENA_TEAM; i++) this.drawSlot(i);

    // Upright: slots stacked, buttons below. Sideways: a 2x2 grid of slots, the buttons side by side under it.
    const y = LANDSCAPE ? SLOT_Y + 2 * SLOT_H - 2 : SLOT_Y + ARENA_TEAM * SLOT_H + 14;
    const bw = LANDSCAPE ? (W - 36) / 2 : W - 40;
    button(this, LANDSCAPE ? 12 + bw / 2 : W / 2, y + 30, bw, 60, `Start ladder (${ARENA_ROUNDS} rounds)`, () => this.startLadder({ round: 0, seed: Date.now() % 1e9 }), {
      color: 0x3b6d4a,
      fontSize: 20,
      enabled: this.team.length > 0,
      sub: this.team.length ? 'Full heal before every round' : 'Add at least one Hexling',
      glyph: 'swords',
    });

    button(this, LANDSCAPE ? 24 + bw * 1.5 : W / 2, LANDSCAPE ? y + 30 : y + 106, bw, LANDSCAPE ? 60 : 56, 'Play with a friend', () => this.scene.start('Duel', {}), {
      color: 0x2f4a6b,
      fontSize: 19,
      sub: 'Live, phone to phone, with a 5-digit code',
    });

    if (data.ladder) this.time.delayedCall(50, () => this.startLadder(data.ladder!));
  }

  private save() {
    const meta = state.meta;
    savedTeams(meta)[activeTeamIndex(meta)].picks = this.team;
    saveMeta(meta);
  }

  // ------------------------------------------------------------ team slots

  private drawSlot(i: number) {
    const sw = LANDSCAPE ? (W - 36) / 2 : W - 24;
    const x = LANDSCAPE ? 12 + (i % 2) * (sw + 12) : 12;
    const y = LANDSCAPE ? SLOT_Y + Math.floor(i / 2) * SLOT_H : SLOT_Y + i * SLOT_H;
    const p = this.team[i];
    const bg = this.add.rectangle(x, y, sw, SLOT_H - 8, p ? COLORS.panel : 0x18141f).setOrigin(0).setStrokeStyle(2, COLORS.stroke);
    bg.setInteractive({ useHandCursor: true }).on('pointerup', () => (p ? this.scene.start('ArenaEdit', { slot: i }) : this.scene.start('ArenaPick', { slot: this.team.length })));
    if (!p) {
      text(this, x + sw / 2, y + (SLOT_H - 8) / 2, '+ Add a Hexling', 16, COLORS.textDim).setOrigin(0.5);
      return;
    }
    const key = ensureCreatureTexture(this, p.speciesId, p.stage, p.shiny);
    this.add.image(x + 42, y + 46, key).setScale(2.2 * SPRITE_FIT);
    const c = createCreature(p.speciesId, ARENA_LEVEL, p.stage);
    text(this, x + 88, y + 8, `${creatureName(c)}  Lv ${ARENA_LEVEL}`, 16, COLORS.text, { fontStyle: 'bold' });
    typeChips(this, x + 88, y + 38, creatureTypes(c), true);
    p.moves.forEach((id, k) => {
      const d = MOVES[id];
      const mx = x + 88 + (k % 2) * 140;
      const my = y + 58 + Math.floor(k / 2) * 18;
      this.add.rectangle(mx, my + 7, 7, 7, ELEMENT_COLORS[d.element]).setOrigin(0, 0.5);
      text(this, mx + 11, my, d.name, 12, COLORS.text);
    });
    text(this, x + sw - 14, y + 8, 'Edit ›', 13, '#ffc94d', { fontStyle: 'bold' }).setOrigin(1, 0);
    // Reorder: in duels the first creatures in the team are the ones that fight.
    const move = (to: number) => {
      const t = [...this.team];
      [t[i], t[to]] = [t[to], t[i]];
      this.team = t;
      this.save();
      this.scene.restart({});
    };
    if (i > 0) button(this, x + sw - 28, y + 46, 40, 28, '▲', () => move(i - 1), { fontSize: 14 });
    if (i < this.team.length - 1) button(this, x + sw - 28, y + 80, 40, 28, '▼', () => move(i + 1), { fontSize: 14 });
  }

  // ------------------------------------------------------------ ladder

  private startLadder(l: Ladder) {
    const opp = arenaOpponent(l.round, l.seed);
    openPicker(this, {
      title: `Round ${l.round + 1} of ${ARENA_ROUNDS}`,
      subtitle: `${opp.name} sends out ${opp.team.length} Hexlings. Your team is fully healed.`,
      rows: opp.team.map((c) => ({ creature: c, text: `${creatureName(c)} · Lv ${c.level}` })),
      options: [{ label: 'Fight!', color: 0x8a2c2c }],
      onPick: () => {
        const match: BattleMatch = {
          team: this.team.map((p) => makeArenaCreature(p)),
          enemies: opp.team,
          seed: l.seed + l.round,
          title: `ARENA ${l.round + 1}/${ARENA_ROUNDS}`,
          opponent: opp.name,
          randomness: opp.randomness,
          // From round 3, ladder trainers switch out of bad matchups and carry potions.
          tactics: l.round >= 2 ? { potions: l.round >= 4 ? 2 : 1 } : undefined,
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
    const fresh = takeNewTitles(meta);
    if (fresh.length) saveMeta(meta);
    const best = (record ? `\n\nNew best: ${wins}/${ARENA_ROUNDS}!` : '') + titleNews(fresh);
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
