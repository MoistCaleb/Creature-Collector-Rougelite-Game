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
import { background, button, COLORS, text, typeChips, W } from '../ui/widgets';

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
    playMusic('title');
    const picks = this.picks();
    const p = picks[this.slot];
    if (!p) return void this.scene.start('Arena', {});
    const sp = SPECIES_BY_ID[p.speciesId];
    const c = createCreature(p.speciesId, ARENA_LEVEL, p.stage);
    const s = stats(c);

    button(this, 40, 28, 64, 36, '', () => this.scene.start('Arena', {}), { fontSize: 15, glyph: 'back' });
    text(this, W / 2 + 10, 14, `Slot ${this.slot + 1}: ${sp.names[p.stage]}`, 22, '#ffc94d', { fontStyle: 'bold' }).setOrigin(0.5, 0);
    text(this, W / 2 + 10, 44, 'Changes save as you go', 12, COLORS.textDim).setOrigin(0.5, 0);
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

    // Creature card: sprite, types, stats, and a tab for each form.
    this.add.rectangle(12, 66, W - 24, 176, COLORS.panel).setOrigin(0).setStrokeStyle(2, COLORS.stroke);
    this.add.image(76, 132, ensureCreatureTexture(this, p.speciesId, p.stage)).setScale(3.4 * SPRITE_FIT);
    text(this, 150, 78, `${sp.names[p.stage]}  Lv ${ARENA_LEVEL}`, 18, COLORS.text, { fontStyle: 'bold' });
    typeChips(this, 150, 112, creatureTypes(c), true);
    text(this, 150, 130, `HP ${s.hp}   ATK ${s.atk}\nDEF ${s.def}   SPD ${s.spd}`, 14, COLORS.textDim, { lineSpacing: 3 });
    button(this, W - 74, 92, 104, 30, 'Change', () => this.scene.start('ArenaPick', { slot: this.slot }), { fontSize: 13, color: 0x2f4a6b, sub: undefined });
    // Loadouts saved from runs for this species.
    const saved = loadoutsFor(state.meta, p.speciesId);
    button(this, W - 74, 130, 104, 30, `Loadouts (${saved.length})`, () => this.openLoadouts(picks), {
      fontSize: 12,
      color: saved.length ? 0x5b3c8a : 0x2a2440,
      enabled: saved.length > 0,
    });
    const forms = arenaForms(state.meta, p.speciesId);
    const tw = (W - 48) / 3;
    [0, 1, 2].forEach((st) => {
      const seen = forms.includes(st);
      const on = st === p.stage;
      button(
        this,
        24 + tw / 2 + st * (tw + 6),
        214,
        tw,
        38,
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
    this.add.rectangle(0, 0, W, 246, COLORS.bg).setOrigin(0).setDepth(2);

    // Below the card everything scrolls (drag), so long move lists fit.
    const list = this.add.container(0, 0).setDepth(1);
    const addTo = <T extends Phaser.GameObjects.GameObject>(o: T) => (list.add(o), o);
    const tap = (o: Phaser.GameObjects.Rectangle, f: () => void) =>
      o.setInteractive({ useHandCursor: true }).on('pointerup', () => {
        if (!this.dragged) f();
      });

    // The four move slots.
    const sel = this.sel;
    addTo(text(this, 16, 254, `Moves (${p.moves.length}/${MAX_MOVES})`, 15, COLORS.text, { fontStyle: 'bold' }));
    addTo(text(this, W - 16, 256, sel !== null ? 'Tap a move below to swap it in · tap again to remove' : 'Tap a slot to swap or remove it', 11, sel !== null ? '#ffc94d' : COLORS.textDim).setOrigin(1, 0));
    for (let k = 0; k < MAX_MOVES; k++) {
      const y = 278 + k * ROW;
      const id = p.moves[k];
      const isSel = sel === k;
      const bg = addTo(
        this.add
          .rectangle(12, y, W - 24, ROW - 4, id ? 0x2a2440 : 0x18141f)
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
      else addTo(text(this, 28, y + 11, 'Empty: tap a move below to add it', 13, COLORS.textDim));
    }

    // Everything else it can learn.
    const pool = arenaMovePool(p.speciesId, p.stage).filter((id) => !p.moves.includes(id));
    const ly = 278 + MAX_MOVES * ROW + 10;
    addTo(text(this, 16, ly, `Can learn (${pool.length})`, 15, COLORS.text, { fontStyle: 'bold' }));
    pool.forEach((id, k) => {
      const y = ly + 24 + k * ROW;
      const bg = addTo(this.add.rectangle(12, y, W - 24, ROW - 4, COLORS.panel).setOrigin(0).setStrokeStyle(1, COLORS.stroke));
      tap(bg, () => this.addMove(picks, p, id));
      this.moveRow(list, y, id, sel !== null ? 'SWAP IN' : p.moves.length < MAX_MOVES ? 'ADD' : 'REPLACE…');
    });
    if (!pool.length) addTo(text(this, 16, ly + 26, 'It knows everything it can learn.', 13, COLORS.textDim));

    // Drag to scroll when it doesn't fit; the card above stays put and covers what scrolls under it.
    const bottom = ly + 24 + pool.length * ROW + 10;
    const minY = Math.min(0, 800 - bottom);
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
      text(this, W / 2, 790, 'Drag to see more', 11, COLORS.textDim).setOrigin(0.5, 1).setDepth(6);
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
  private moveRow(list: Phaser.GameObjects.Container, y: number, id: string, tag: string) {
    const d = MOVES[id];
    list.add(this.add.rectangle(24, y + 19, 10, 10, ELEMENT_COLORS[d.element]));
    list.add(text(this, 36, y + 4, d.name, 14, COLORS.text, { fontStyle: 'bold' }));
    list.add(text(this, 36, y + 21, `${d.team ? 'Team' : KIND_LABEL[d.kind] ?? ''} · ${moveSummary(d, 1)} · ${accText(d)}`, 11, COLORS.textDim));
    const max = maxUses(d);
    list.add(text(this, W - 22, y + 4, max === null ? '∞ uses' : `${max} uses`, 11, COLORS.textDim).setOrigin(1, 0));
    if (tag) list.add(text(this, W - 22, y + 21, tag, 11, '#ffc94d', { fontStyle: 'bold' }).setOrigin(1, 0));
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
