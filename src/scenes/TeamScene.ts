import Phaser from 'phaser';
import { moveSummary } from '../data/moves';
import { ELEMENT_COLORS, elementTextColor } from '../data/types';
import { SYNERGY_LABEL, teamSynergy } from '../logic/synergy';
import { BANK_LEVELS, bankedLevels, floorCapped, getFloorCeiling, bankLimit, canEvolve, creatureName, creatureTypes, levelCap, moveDef, species, stats, xpToNext, type Creature } from '../logic/creature';
import { playEvolution } from '../ui/fx';
import { cry } from '../ui/cries';
import { ensureCreatureTexture, SPRITE_FIT } from '../ui/sprites';
import { allCreatures, BENCH_MAX, dexComplete, equipHeld, needsPotion, usePotion, evolveTracked, releaseNote, TEAM_MAX, unclaimedTypes, unequipHeld } from '../logic/run';
import { HELD, heldName, type HeldId } from '../data/held';
import { formName } from '../logic/dex';
import { dex, persist, state } from '../state';
import { openPicker, showMessage } from '../ui/picker';
import { background, button, COLORS, creatureRow, stars, text, W } from '../ui/widgets';

type Ref = { list: 'team' | 'bench'; i: number };

export class TeamScene extends Phaser.Scene {
  private selected: Ref | null = null;

  constructor() {
    super('Team');
  }

  init(data: { selected?: Ref | null }) {
    this.selected = data.selected ?? null;
    // Never keep a selection that points at an empty slot (creatures can leave between visits).
    if (this.selected && !state.run?.[this.selected.list][this.selected.i]) this.selected = null;
  }

  create() {
    const run = state.run!;
    background(this);
    text(this, 16, 14, 'Your Creatures', 24, '#ffc94d', { fontStyle: 'bold' });
    button(this, W - 60, 30, 100, 42, 'Map', () => this.scene.start('Map', {}), { color: 0x3b6d4a, fontSize: 17, glyph: 'play' });
    // Team synergy: shared elements on the main team boost everyone.
    const syn = teamSynergy(run.team, run.passive === 'harmonist' ? 2 : 1);
    if (syn.length) {
      text(this, 16, 50, 'Synergy:', 12, '#8fe08a', { fontStyle: 'bold' });
      let sx = 74;
      for (const s of syn.slice(0, 3)) {
        const label = `${s.element} ×${s.count} ${SYNERGY_LABEL[s.stat]} +${Math.round(s.bonus * 100)}%`;
        const t = text(this, sx + 5, 58, label, 11, elementTextColor(s.element), { fontStyle: 'bold' }).setOrigin(0, 0.5).setDepth(1);
        this.add.rectangle(sx, 58, t.width + 10, 16, ELEMENT_COLORS[s.element]).setOrigin(0, 0.5);
        sx += t.width + 16;
      }
    } else {
      const hint = dexComplete(run)
        ? `★ Type bonus left: ${unclaimedTypes(run).join(', ') || 'none'}`
        : 'Tap two creatures to swap. 2+ of an element on the team = synergy.';
      text(this, 16, 50, hint, 12, dexComplete(run) ? '#ffc94d' : COLORS.textDim);
    }

    const rowW = W - 32;
    text(this, 16, 70, `Main team  ${run.team.length}/${TEAM_MAX}`, 15, COLORS.text);
    if (Number.isFinite(getFloorCeiling())) text(this, W - 16, 72, `Floor level cap: ${getFloorCeiling()}`, 12, '#c9a3dd').setOrigin(1, 0);
    run.team.forEach((c, i) => this.row(16, 90 + i * 68, rowW, c, { list: 'team', i }));
    const benchY = 90 + TEAM_MAX * 68 + 6;
    text(this, 16, benchY, `Bench  ${run.bench.length}/${BENCH_MAX}  (second life + prestige fuel)`, 15, COLORS.text);
    run.bench.forEach((c, i) => this.row(16, benchY + 20 + i * 68, rowW, c, { list: 'bench', i }));

    const sel = this.selectedCreature();
    if (sel) this.details(sel);
  }

  private selectedCreature(): Creature | null {
    if (!this.selected) return null;
    const run = state.run!;
    return run[this.selected.list][this.selected.i] ?? null;
  }

  private row(x: number, y: number, w: number, c: Creature, ref: Ref) {
    const isSel = this.selected?.list === ref.list && this.selected.i === ref.i;
    const cont = creatureRow(this, x, y, w, c, {
      highlight: isSel,
      onClick: () => this.tap(ref),
    });
    cont.setScale(1, 62 / 64);
  }

  private tap(ref: Ref) {
    const run = state.run!;
    if (!this.selected || (this.selected.list === ref.list && this.selected.i === ref.i)) {
      this.scene.restart({ selected: this.selected && this.selected.i === ref.i && this.selected.list === ref.list ? null : ref });
      return;
    }
    const a = this.selected;
    const ca = run[a.list][a.i];
    const cb = run[ref.list][ref.i];
    if (!ca || !cb) {
      this.scene.restart({ selected: cb ? ref : null });
      return;
    }
    run[a.list][a.i] = cb;
    run[ref.list][ref.i] = ca;
    this.scene.restart({ selected: null });
  }

  private details(c: Creature) {
    const run = state.run!;
    const y0 = 600;
    this.add.rectangle(8, y0, W - 16, 192, COLORS.panel).setOrigin(0).setStrokeStyle(2, COLORS.accent);
    const s = stats(c);
    const sp = species(c);
    const cap = levelCap(c);
    text(this, 18, y0 + 8, `${creatureName(c)} ${stars(c.stars)}`, 18, COLORS.text, { fontStyle: 'bold' });
    const next = c.stage < 2 ? `next: ${formName(state.meta.dex, sp.id, c.stage + 1)}` : 'final form';
    text(this, W - 18, y0 + 12, `Stage ${c.stage + 1}/3 · ${next}`, 12, COLORS.textDim).setOrigin(1, 0);
    const stored = c.banked ?? 0;
    const full = stored >= bankLimit(c);
    const xpLine =
      c.level < cap
        ? `XP ${c.xp}/${xpToNext(c.level)}`
        : stored
          ? `${floorCapped(c) ? 'Floor cap' : 'MAX'} · Stored ${full ? BANK_LEVELS : bankedLevels(c).toFixed(1)}/${BANK_LEVELS} lv${full ? ' (full)' : ''}`
          : floorCapped(c)
            ? 'Floor cap · XP is stored for the next floor'
            : 'MAX · XP is stored and pays coins';
    text(this, 18, y0 + 31, `Lv ${c.level}/${cap}  ·  ${xpLine}`, 12, COLORS.textDim);
    text(this, 18, y0 + 47, `HP ${s.hp}  ATK ${s.atk}  DEF ${s.def}  SPD ${s.spd}`, 13, COLORS.text);
    c.moves.forEach((m, i) => {
      const d = moveDef(m);
      // One move per row, full width; long effect lists shrink to fit rather than overlap.
      const y = y0 + 68 + i * 16;
      this.add.rectangle(18, y + 7, 8, 8, ELEMENT_COLORS[d.element]).setOrigin(0, 0.5);
      const line = text(this, 30, y, `${d.name} · ${moveSummary(d, m.tier)} · T${m.tier}`, 11, COLORS.text);
      const room = W - 48;
      if (line.width > room) line.setScale(room / line.width, 1);
    });

    // Held item.
    const bag = run.bag ?? [];
    button(
      this,
      116,
      y0 + 145,
      196,
      24,
      c.held ? heldName(c.held) : bag.length ? `Give item (${bag.length})` : 'No items',
      () => this.itemPicker(c),
      { enabled: !!c.held || bag.length > 0, fontSize: 13, color: 0x3a3a5a, glyph: c.held ? HELD[c.held].icon : 'bag' },
    );

    const by = y0 + 176;
    const stoneOk = run.evoStones > 0 && canEvolve(c) && c.level >= cap;
    button(
      this,
      58,
      by,
      100,
      28,
      'Evolve',
      () => {
        run.evoStones -= 1;
        const from = creatureName(c);
        const fromKey = ensureCreatureTexture(this, c.speciesId, c.stage);
        const lv = c.level;
        evolveTracked(run, c);
        const note = releaseNote(c, lv);
        dex.creature(c, true);
        const toKey = ensureCreatureTexture(this, c.speciesId, c.stage);
        playEvolution(this, fromKey, toKey, 5 * SPRITE_FIT, ELEMENT_COLORS[creatureTypes(c)[0]], () => {
          cry(c.speciesId, c.stage);
          showMessage(this, 'Evolution!', `${from} evolved into ${creatureName(c)}!${note}`, () => this.scene.restart({ selected: this.selected }));
        });
      },
      { enabled: stoneOk, fontSize: 15, color: 0x5b3c8a, glyph: 'stone' },
    );
    const ref = this.selected!;
    const canMove = ref.list === 'team' ? run.bench.length < BENCH_MAX && run.team.length > 1 : run.team.length < TEAM_MAX;
    button(
      this,
      166,
      by,
      104,
      28,
      ref.list === 'team' ? 'To bench' : 'To team',
      () => {
        const from = run[ref.list];
        const to = ref.list === 'team' ? run.bench : run.team;
        to.push(from.splice(ref.i, 1)[0]);
        this.scene.restart({ selected: null });
      },
      { enabled: canMove, fontSize: 15 },
    );
    button(
      this,
      270,
      by,
      92,
      28,
      'Release',
      () =>
        openPicker(this, {
          title: `Release ${creatureName(c)}?`,
          subtitle: 'It will leave your party for good.',
          options: [{ label: 'Release', color: 0x8a2c2c }],
          onPick: () => {
            unequipHeld(run, c);
            run[ref.list].splice(ref.i, 1);
            if (run.team.length === 0 && run.bench.length) run.team.push(run.bench.shift()!);
            this.scene.restart({ selected: null });
          },
          onCancel: () => {},
        }),
      { enabled: allCreatures(run).length > 1, fontSize: 15, color: 0x5a2a2a },
    );
    const potions = run.potions ?? 0;
    button(
      this,
      374,
      by,
      100,
      28,
      `Potion ${potions}`,
      () => {
        usePotion(run, c);
        persist();
        this.scene.restart({ selected: this.selected });
      },
      { enabled: potions > 0 && needsPotion(c), fontSize: 14, color: 0x2f5a4a, glyph: 'potion' },
    );
    if (!stoneOk && run.evoStones > 0 && canEvolve(c))
      text(this, 226, y0 + 145, 'Reach the level cap to use a stone.', 11, '#ffc94d', { wordWrap: { width: W - 244 } }).setOrigin(0, 0.5);
  }

  /** Give, swap or take off a held item. */
  private itemPicker(c: Creature) {
    const run = state.run!;
    const bag = [...new Set(run.bag ?? [])] as HeldId[];
    const count = (id: HeldId) => (run.bag ?? []).filter((x) => x === id).length;
    const restart = () => this.scene.restart({ selected: this.selected });
    openPicker(this, {
      title: c.held ? `${creatureName(c)} holds ${HELD[c.held].name}` : `Give ${creatureName(c)} an item`,
      subtitle: c.held ? HELD[c.held].desc : 'Each creature can hold one item. Items come back to your bag if it falls.',
      rows: [{ creature: c, text: `${creatureName(c)} · Lv ${c.level}`, big: true }],
      options: [
        ...bag.map((id) => ({
          label: `${heldName(id)}${count(id) > 1 ? ` ×${count(id)}` : ''}`,
          sub: HELD[id].desc,
          color: 0x2f4a6b,
          glyph: HELD[id].icon,
        })),
        ...(c.held ? [{ label: 'Take it off', sub: 'Put it back in the bag', color: 0x3a3450, glyph: 'bag' as const }] : []),
      ],
      onPick: (i) => {
        if (i < bag.length) equipHeld(run, c, bag[i]);
        else unequipHeld(run, c);
        restart();
      },
      onCancel: () => {},
    });
  }
}
