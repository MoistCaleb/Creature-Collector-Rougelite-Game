import Phaser from 'phaser';
import { accText, maxUses, MOVES, moveSummary } from '../data/moves';
import { SPECIES_BY_ID } from '../data/species';
import { ELEMENT_COLORS } from '../data/types';
import {
  activeTeamIndex,
  ARENA_LEVEL,
  arenaForms,
  arenaMovePool,
  defaultArenaMoves,
  savedTeams,
  validArenaTeam,
  applyLoadout,
  loadoutsFor,
  type ArenaPick,
} from '../logic/arena';
import { createCreature, creatureTypes, getFloorCeiling, MAX_MOVES, setFloorCeiling, stats } from '../logic/creature';
import { saveMeta } from '../logic/run';
import { state } from '../state';
import { openPicker } from '../ui/picker';
import { playMusic } from '../ui/sound';
import { ensureCreatureTexture, SPRITE_FIT } from '../ui/sprites';
import { background, button, clipList, COLORS, H, LANDSCAPE, text, typeChips, W } from '../ui/widgets';

const KIND_LABEL: Record<string, string> = { attack: 'Attack', buff: 'Boost', debuff: 'Hinder', heal: 'Heal' };
const ROW = 42;

/**
 * Edit one creature of the active Arena team on a single screen: its form (tabs), its four move
 * slots, and everything it can learn. Tap a slot to select it, then tap a move to swap it in.
 */
export class ArenaEditScene extends Phaser.Scene {
  private slot = 0;
  /** The selected move slot (to swap), or null. */
  private sel: number | null = null;

  constructor() {
    super('ArenaEdit');
  }

  init(data: { slot?: number; sel?: number | null }) {
    this.slot = data.slot ?? 0;
    this.sel = data.sel ?? null;
  }

  private picks(): ArenaPick[] {
    const meta = state.meta;
    return validArenaTeam(meta, savedTeams(meta)[activeTeamIndex(meta)].picks);
  }

  private save(picks: ArenaPick[], sel: number | null = null) {
    const meta = state.meta;
    savedTeams(meta)[activeTeamIndex(meta)].picks = picks;
    saveMeta(meta);
    this.scene.restart({ slot: this.slot, sel });
  }

  create() {
    const ceiling = getFloorCeiling();
    setFloorCeiling(Infinity);
    this.events.once('shutdown', () => setFloorCeiling(ceiling));
    background(this);
    const firstFixed = this.children.list.length;
    playMusic('arena');
    const picks = this.picks();
    const p = picks[this.slot];
    if (!p) return void this.scene.start('Arena', {});
    const sp = SPECIES_BY_ID[p.speciesId];
    const c = createCreature(p.speciesId, ARENA_LEVEL, p.stage);
    const s = stats(c);

    button(this, 40, 28, 64, 36, '', () => this.scene.start('Arena', {}), { fontSize: 15, glyph: 'back' });
    if (LANDSCAPE) {
      // Sideways the title sits above the left-column card.
      const t = text(this, 80, 8, `Slot ${this.slot + 1}: ${sp.names[p.stage]}`, 20, '#ffc94d', { fontStyle: 'bold' });
      if (t.width > 220) t.setScale(220 / t.width);
      text(this, 80, 34, 'Changes save as you go', 11, COLORS.textDim);
    } else {
      text(this, W / 2 + 10, 14, `Slot ${this.slot + 1}: ${sp.names[p.stage]}`, 22, '#ffc94d', { fontStyle: 'bold' }).setOrigin(0.5, 0);
      text(this, W / 2 + 10, 44, 'Changes save as you go', 12, COLORS.textDim).setOrigin(0.5, 0);
    }
    button(this, W - 44, 28, 72, 32, 'Remove', () =>
      openPicker(this, {
        title: `Remove ${sp.names[p.stage]}?`,
        subtitle: 'It leaves this team (you can add it again any time).',
        options: [{ label: 'Remove', color: 0x8a2c2c }],
        onPick: () => {
          picks.splice(this.slot, 1);
          const meta = state.meta;
          savedTeams(meta)[activeTeamIndex(meta)].picks = picks;
          saveMeta(meta);
          this.scene.start('Arena', {});
        },
        onCancel: () => {},
      }), { fontSize: 12, color: 0x5a2a2a });

    // Creature card: sprite, types, stats, and a tab for each form. Upright: across the top.
    // Sideways: a tall card in a left column, with the moves scrolling on the right.
    const wide = LANDSCAPE;
    this.lx = wide ? 312 : 0;
    this.lw = W - this.lx;
    if (wide) this.add.rectangle(12, 56, 288, 386, COLORS.panel).setOrigin(0).setStrokeStyle(2, COLORS.stroke);
    else this.add.rectangle(12, 66, W - 24, 176, COLORS.panel).setOrigin(0).setStrokeStyle(2, COLORS.stroke);
    this.add.image(wide ? 66 : 76, wide ? 116 : 132, ensureCreatureTexture(this, p.speciesId, p.stage)).setScale((wide ? 3 : 3.4) * SPRITE_FIT);
    const ix = wide ? 128 : 150;
    text(this, ix, wide ? 68 : 78, `${sp.names[p.stage]}  Lv ${ARENA_LEVEL}`, wide ? 15 : 18, COLORS.text, { fontStyle: 'bold', wordWrap: { width: wide ? 166 : W } });
    typeChips(this, ix, wide ? 110 : 112, creatureTypes(c), true);
    text(this, ix, wide ? 126 : 130, `HP ${s.hp}   ATK ${s.atk}\nDEF ${s.def}   SPD ${s.spd}`, wide ? 12 : 14, COLORS.textDim, { lineSpacing: 3 });
    button(this, wide ? 156 : W - 74, wide ? 186 : 92, wide ? 264 : 104, 30, 'Change', () => this.scene.start('ArenaPick', { slot: this.slot }), { fontSize: 13, color: 0x2f4a6b, sub: undefined });
    // Loadouts saved from runs for this species.
    const saved = loadoutsFor(state.meta, p.speciesId);
    button(this, wide ? 156 : W - 74, wide ? 222 : 130, wide ? 264 : 104, 30, `Loadouts (${saved.length})`, () => this.openLoadouts(picks), {
      fontSize: 12,
      color: saved.length ? 0x5b3c8a : 0x2a2440,
      enabled: saved.length > 0,
    });
    const forms = arenaForms(state.meta, p.speciesId);
    const tw = wide ? 264 : (W - 48) / 3;
    [0, 1, 2].forEach((st) => {
      const seen = forms.includes(st);
      const on = st === p.stage;
      button(
        this,
        wide ? 156 : 24 + tw / 2 + st * (tw + 6),
        wide ? 282 + st * 50 : 214,
        tw,
        wide ? 44 : 38,
        seen ? sp.names[st] : '???',
        () => {
          if (on || !seen) return;
          const pool = arenaMovePool(p.speciesId, st);
          const kept = p.moves.filter((id) => pool.includes(id));
          picks[this.slot] = { ...p, stage: st, moves: kept.length ? kept : defaultArenaMoves(p.speciesId, st) };
          this.save(picks);
        },
        { fontSize: 13, color: on ? 0x5b3c8a : 0x2a2440, enabled: seen, sub: seen ? `Stage ${st + 1}` : 'not seen yet' },
      );
    });

    // Header and card stay put above everything that scrolls under them.
    this.children.list.slice(firstFixed).forEach((o) => (o as unknown as Phaser.GameObjects.Components.Depth).setDepth(3));
    if (wide) {
      this.add.rectangle(0, 0, this.lx - 6, H, COLORS.bg).setOrigin(0).setDepth(2);
      this.add.rectangle(this.lx - 6, 0, W, 52, COLORS.bg).setOrigin(0).setDepth(2);
    } else this.add.rectangle(0, 0, W, 246, COLORS.bg).setOrigin(0).setDepth(2);
    const LX = this.lx;
    const LW = this.lw;
    const top = wide ? 58 : 254;

    // Below the card everything scrolls (drag), so long move lists fit.
    const list = this.add.container(0, 0).setDepth(1);
    clipList(this, list, wide ? 52 : 246);
    const addTo = <T extends Phaser.GameObjects.GameObject>(o: T) => (list.add(o), o);
    const tap = (o: Phaser.GameObjects.Rectangle, f: () => void) =>
      o.setInteractive({ useHandCursor: true }).on('pointerup', () => {
        if (!this.dragged) f();
      });

    // The four move slots.
    const sel = this.sel;
    addTo(text(this, LX + 16, top, `Moves (${p.moves.length}/${MAX_MOVES})`, 15, COLORS.text, { fontStyle: 'bold' }));
    addTo(text(this, LX + LW - 16, top + 2, sel !== null ? 'Tap a move below to swap it in · tap again to remove' : 'Tap a slot to swap or remove it', 11, sel !== null ? '#ffc94d' : COLORS.textDim).setOrigin(1, 0));
    for (let k = 0; k < MAX_MOVES; k++) {
      const y = top + 24 + k * ROW;
      const id = p.moves[k];
      const isSel = sel === k;
      const bg = addTo(
        this.add
          .rectangle(LX + 12, y, LW - 24, ROW - 4, id ? 0x2a2440 : 0x18141f)
          .setOrigin(0)
          .setStrokeStyle(2, isSel ? COLORS.accent : COLORS.stroke),
      );
      tap(bg, () => {
        if (!id) return;
        if (isSel) {
          // Tap the selected move again to remove it (always keep at least one).
          if (p.moves.length <= 1) return;
          picks[this.slot] = { ...p, moves: p.moves.filter((_, j) => j !== k) };
          return this.save(picks);
        }
        this.scene.restart({ slot: this.slot, sel: k });
      });
      if (id) this.moveRow(list, y, id, isSel ? 'TAP AGAIN TO REMOVE' : '');
      else addTo(text(this, LX + 28, y + 11, 'Empty: tap a move below to add it', 13, COLORS.textDim));
    }

    // Everything else it can learn.
    const pool = arenaMovePool(p.speciesId, p.stage).filter((id) => !p.moves.includes(id));
    const ly = top + 24 + MAX_MOVES * ROW + 10;
    addTo(text(this, LX + 16, ly, `Can learn (${pool.length})`, 15, COLORS.text, { fontStyle: 'bold' }));
    pool.forEach((id, k) => {
      const y = ly + 24 + k * ROW;
      const bg = addTo(this.add.rectangle(LX + 12, y, LW - 24, ROW - 4, COLORS.panel).setOrigin(0).setStrokeStyle(1, COLORS.stroke));
      tap(bg, () => this.addMove(picks, p, id));
      this.moveRow(list, y, id, sel !== null ? 'SWAP IN' : p.moves.length < MAX_MOVES ? 'ADD' : 'REPLACE…');
    });
    if (!pool.length) addTo(text(this, LX + 16, ly + 26, 'It knows everything it can learn.', 13, COLORS.textDim));

    // Drag to scroll when it doesn't fit; the card above stays put and covers what scrolls under it.
    const bottom = ly + 24 + pool.length * ROW + 10;
    const minY = Math.min(0, H - bottom);
    this.dragged = false;
    let startY = 0;
    this.input.on('pointerdown', (ptr: Phaser.Input.Pointer) => {
      this.dragged = false;
      startY = ptr.y;
    });
    if (minY < 0) {
      this.input.on('pointermove', (ptr: Phaser.Input.Pointer) => {
        if (!ptr.isDown) return;
        if (Math.abs(ptr.y - startY) > 8) this.dragged = true;
        list.y = Phaser.Math.Clamp(list.y + (ptr.y - ptr.prevPosition.y) / this.cameras.main.zoom, minY, 0);
      });
      text(this, LANDSCAPE ? 156 : LX + LW / 2, H - 4, 'Drag to see more', 11, COLORS.textDim).setOrigin(0.5, 1).setDepth(6);
    }
  }

  /** Set while the current touch is a scroll drag, so it doesn't also tap a row. */
  private dragged = false;

  /** Loadouts saved from runs: apply one (form + moves), or delete it. */
  private openLoadouts(picks: ArenaPick[]) {
    const meta = state.meta;
    const p = picks[this.slot];
    const list = loadoutsFor(meta, p.speciesId);
    const sp = SPECIES_BY_ID[p.speciesId];
    openPicker(this, {
      title: `${sp.names[0]} loadouts`,
      subtitle: 'Saved at the end of your runs. Moves the Arena doesn\u2019t allow are swapped for defaults.',
      options: list.map((l) => ({
        label: `${sp.names[l.stage]} · ${l.label}`,
        sub: l.moves.map((id) => MOVES[id]?.name ?? '?').join(', '),
        color: 0x2f4a6b,
      })),
      onPick: (k) => {
        const l = list[k];
        openPicker(this, {
          title: `${sp.names[l.stage]} · ${l.label}`,
          subtitle: l.moves.map((id) => MOVES[id]?.name ?? '?').join(', '),
          options: [
            { label: 'Use this loadout', color: 0x3b6d4a, glyph: 'play' },
            { label: 'Delete it', color: 0x5a2a2a },
          ],
          onPick: (i) => {
            if (i === 0) {
              picks[this.slot] = applyLoadout(meta, l);
              this.save(picks);
            } else {
              meta.loadouts = (meta.loadouts ?? []).filter((x) => x.id !== l.id);
              saveMeta(meta);
              this.scene.restart({ slot: this.slot });
            }
          },
          onCancel: () => this.openLoadouts(picks),
          cancelLabel: 'Back',
        });
      },
      onCancel: () => {},
      cancelLabel: 'Close',
    });
  }

  /** One move line: element dot, name, kind, what it does, uses. */
  /** The move list's left edge and width (it sits in a right column on the wide board). */
  private lx = 0;
  private lw = 450;

  private moveRow(list: Phaser.GameObjects.Container, y: number, id: string, tag: string) {
    const d = MOVES[id];
    const x = this.lx;
    const right = this.lx + this.lw - 22;
    list.add(this.add.rectangle(x + 24, y + 19, 10, 10, ELEMENT_COLORS[d.element]));
    list.add(text(this, x + 36, y + 4, d.name, 14, COLORS.text, { fontStyle: 'bold' }));
    list.add(text(this, x + 36, y + 21, `${d.team ? 'Team' : KIND_LABEL[d.kind] ?? ''} · ${moveSummary(d, 1)} · ${accText(d)}`, 11, COLORS.textDim));
    const max = maxUses(d);
    list.add(text(this, right, y + 4, max === null ? '∞ uses' : `${max} uses`, 11, COLORS.textDim).setOrigin(1, 0));
    if (tag) list.add(text(this, right, y + 21, tag, 11, '#ffc94d', { fontStyle: 'bold' }).setOrigin(1, 0));
  }

  private addMove(picks: ArenaPick[], p: ArenaPick, id: string) {
    const moves = [...p.moves];
    if (this.sel !== null) moves[this.sel] = id;
    else if (moves.length < MAX_MOVES) moves.push(id);
    else {
      // Full and nothing selected: ask which one it replaces.
      return openPicker(this, {
        title: `Learn ${MOVES[id].name}?`,
        subtitle: 'Choose a move to replace.',
        options: moves.map((m) => ({ label: MOVES[m].name, sub: `${moveSummary(MOVES[m], 1)} · ${accText(MOVES[m])}` })),
        onPick: (k) => {
          moves[k] = id;
          picks[this.slot] = { ...p, moves };
          this.save(picks);
        },
        onCancel: () => {},
      });
    }
    picks[this.slot] = { ...p, moves };
    this.save(picks);
  }
}
