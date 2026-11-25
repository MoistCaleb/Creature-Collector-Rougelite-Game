import { benchMax } from '../logic/workshop';
import { teamMax } from '../logic/boons';
import { traitDescOf, traitTag } from '../ui/traitText';
import { traitOf } from '../data/traits';
import { bondHearts, natureShort, NATURES } from '../data/natures';
import Phaser from 'phaser';
import { accText, maxUses, moveSummary } from '../data/moves';
import { ELEMENT_COLORS, elementTextColor } from '../data/types';
import { SYNERGY_LABEL, teamSynergy } from '../logic/synergy';
import { usesLeft, evolveLevel, readyToEvolve, BANK_LEVELS, bankedLevels, floorCapped, getFloorCeiling, bankLimit, canEvolve, creatureName, creatureTypes, levelCap, moveDef, species, stats, xpToNext, type Creature } from '../logic/creature';
import { playEvolution } from '../ui/fx';
import { cry } from '../ui/cries';
import { colours, ensureCreatureTexture, SPRITE_FIT } from '../ui/sprites';
import { allCreatures, bagHasNew, dexComplete, equipHeld, needsPotion, usePotion, evolveTracked, releaseNote, unclaimedTypes, unequipHeld } from '../logic/run';
import { HELD, heldName, type HeldId } from '../data/held';
import { formName } from '../logic/dex';
import { dex, persist, state } from '../state';
import { openPicker, showMessage } from '../ui/picker';
import { background, button, COLORS, creatureRow, H, LANDSCAPE, stars, text, W } from '../ui/widgets';
import { elementIcon } from '../ui/elementIcons';

type Ref = { list: 'team' | 'bench'; i: number };

export class TeamScene extends Phaser.Scene {
  private selected: Ref | null = null;
  /** Order mode: tapping two Hexlings swaps them. Otherwise a tap just shows that Hexling. */
  private ordering = false;

  constructor() {
    super('Team');
  }

  init(data: { selected?: Ref | null; ordering?: boolean }) {
    this.selected = data.selected ?? null;
    this.ordering = !!data.ordering;
    // Never keep a selection that points at an empty slot (creatures can leave between visits).
    if (this.selected && !state.run?.[this.selected.list][this.selected.i]) this.selected = null;
  }

  create() {
    const run = state.run!;
    background(this);
    const title = text(this, 16, 14, 'Your Hexlings', 24, '#ffc94d', { fontStyle: 'bold' });
    // Upright the title shares the top row with three buttons.
    if (!LANDSCAPE && title.width > 140) title.setScale(140 / title.width);
    const ordW = LANDSCAPE ? 140 : 96;
    button(this, W - 184 - 8 - ordW / 2, 30, ordW, 42, this.ordering ? 'Done ordering' : 'Order Hexlings', () => this.scene.restart({ ordering: !this.ordering, selected: null }), {
      fontSize: LANDSCAPE ? 14 : 12,
      color: this.ordering ? 0x7a5a1c : 0x2f4a6b,
    });
    button(this, W - 60, 30, 100, 42, 'Map', () => this.scene.start('Map', {}), { color: 0x3b6d4a, fontSize: 17, glyph: 'play' });
    const bagBtn = button(this, W - 150, 30, 68, 42, 'Bag', () => this.scene.start('Bag', { from: 'Team' }), { fontSize: 16, glyph: 'bag' });
    if (bagHasNew(run)) bagBtn.add(this.add.circle(28, -15, 5, 0xffc94d));
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
        : '2+ of an element on the main team = synergy.';
      text(this, 16, 50, hint, 12, dexComplete(run) ? '#ffc94d' : COLORS.textDim);
    }

    // Upright: team then bench, details at the bottom. Sideways: team, bench and details in three columns.
    const rowW = LANDSCAPE ? 256 : W - 32;
    const benchX = LANDSCAPE ? 280 : 16;
    text(this, 16, 70, `Main team  ${run.team.length}/${teamMax(run)}`, 15, COLORS.text);
    if (Number.isFinite(getFloorCeiling())) text(this, LANDSCAPE ? 530 : W - 16, 72, `Floor level cap: ${getFloorCeiling()}`, 12, '#c9a3dd').setOrigin(1, 0);
    run.team.forEach((c, i) => this.row(16, 90 + i * 68, rowW, c, { list: 'team', i }));
    const benchY = LANDSCAPE ? 70 : 90 + teamMax(run) * 68 + 6;
    text(this, benchX, benchY, LANDSCAPE ? `Bench  ${run.bench.length}/${benchMax(run)}` : `Bench  ${run.bench.length}/${benchMax(run)}  (second life + prestige fuel)`, 15, COLORS.text);
    run.bench.forEach((c, i) => this.row(benchX, benchY + 20 + i * 68, rowW, c, { list: 'bench', i }));
    if (this.ordering) {
      const a = this.selectedCreature();
      const msg = a
        ? `Now tap where ${creatureName(a)} should go (or tap it again to cancel).`
        : 'Tap a Hexling, then tap another to swap their places (team \u2194 bench too).';
      if (LANDSCAPE) text(this, 552, 90, `Ordering\n\n${msg}\n\nTap Done ordering when finished.`, 13, '#ffc94d', { wordWrap: { width: 232 }, lineSpacing: 3 });
      else {
        const y = 90 + teamMax(run) * 68 + 26 + benchMax(run) * 68 + 8;
        text(this, W / 2, Math.min(y, H - 40), msg, 14, '#ffc94d', { wordWrap: { width: W - 40 }, align: 'center' }).setOrigin(0.5, 0);
      }
      return;
    }
    if (LANDSCAPE && !this.selectedCreature()) {
      text(this, 552, 90, 'Tap a Hexling to see its moves, items and options.\n\nTo change who\u2019s on the team or the order, tap Order Hexlings.\n\nThe bench is a second life and prestige fuel.', 13, COLORS.textDim, { wordWrap: { width: 232 }, lineSpacing: 3 });
    }

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
    const same = !!this.selected && this.selected.list === ref.list && this.selected.i === ref.i;
    // Not ordering: a tap shows that Hexling (tap it again to close).
    if (!this.ordering || !this.selected || same) {
      this.scene.restart({ selected: same ? null : ref, ordering: this.ordering });
      return;
    }
    const a = this.selected;
    const ca = run[a.list][a.i];
    const cb = run[ref.list][ref.i];
    if (!ca || !cb) {
      this.scene.restart({ selected: cb ? ref : null, ordering: true });
      return;
    }
    run[a.list][a.i] = cb;
    run[ref.list][ref.i] = ca;
    this.scene.restart({ selected: null, ordering: true });
  }

  private details(c: Creature) {
    const run = state.run!;
    // Upright: a wide panel at the bottom. Sideways: a tall panel in the right column.
    const wide = LANDSCAPE;
    const px = wide ? 544 : 8;
    const pw = wide ? W - 552 : W - 16;
    const y0 = wide ? 66 : 600;
    const lx = px + 10;
    this.add.rectangle(px, y0, pw, wide ? H - 74 : 192, COLORS.panel).setOrigin(0).setStrokeStyle(2, COLORS.accent);
    const s = stats(c);
    const sp = species(c);
    const cap = levelCap(c);
    text(this, lx, y0 + 8, `${creatureName(c)} ${stars(c.stars)}`, 18, COLORS.text, { fontStyle: 'bold' });
    const next = c.stage < 2 ? `next: ${formName(state.meta.dex, sp.id, c.stage + 1)}` : 'final form';
    if (wide) text(this, lx, y0 + 30, `Stage ${c.stage + 1}/3 · ${next}`, 12, COLORS.textDim);
    else text(this, W - 18, y0 + 12, `Stage ${c.stage + 1}/3 · ${next}`, 12, COLORS.textDim).setOrigin(1, 0);
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
    const dy = wide ? 18 : 0;
    const fit = (t: Phaser.GameObjects.Text, room: number) => (t.width > room ? t.setScale(room / t.width, 1) : t);
    fit(text(this, lx, y0 + 31 + dy, `Lv ${c.level}/${cap}  ·  ${xpLine}`, 12, COLORS.textDim), pw - 20);
    const nat = c.nature ? `  ·  ${NATURES[c.nature].name} (${natureShort(c.nature)})` : '';
    const hearts = bondHearts(c.bond);
    fit(text(this, lx, y0 + 47 + dy, `HP ${s.hp}  ATK ${s.atk}  DEF ${s.def}  SPD ${s.spd}${nat}${hearts ? `  ·  ${'♥'.repeat(hearts)}` : ''}`, 13, COLORS.text), pw - 20);
    c.moves.forEach((m, i) => {
      const d = moveDef(m);
      const left = usesLeft(m);
      const uses = Number.isFinite(left) ? ` · ${left}/${maxUses(d)} uses` : '';
      const color = left === 0 ? '#e0524a' : COLORS.text;
      if (wide) {
        // Two lines per move: name, then what it does.
        const y = y0 + 90 + i * 32;
        elementIcon(this, lx + 4, y + 7, d.element, 11);
        fit(text(this, lx + 12, y, `${d.name} · T${m.tier}${uses}`, 12, color, { fontStyle: 'bold' }), pw - 32);
        fit(text(this, lx + 12, y + 15, `${moveSummary(d, m.tier)} · ${accText(d)}`, 11, COLORS.textDim), pw - 32);
        return;
      }
      // One move per row, full width; long effect lists shrink to fit rather than overlap.
      const y = y0 + 68 + i * 16;
      elementIcon(this, 22, y + 7, d.element, 11);
      fit(text(this, 30, y, `${d.name} · ${moveSummary(d, m.tier)} · ${accText(d)} · T${m.tier}${uses}`, 11, color), W - 48);
    });

    // Held item.
    const bag = run.bag ?? [];
    button(
      this,
      wide ? px + pw / 2 : 116,
      wide ? y0 + 232 : y0 + 145,
      wide ? pw - 20 : 196,
      24,
      c.held ? heldName(c.held) : bag.length ? `Give item (${bag.length})` : 'No items',
      () => this.itemPicker(c),
      { enabled: !!c.held || bag.length > 0, fontSize: 13, color: 0x3a3a5a, glyph: c.held ? HELD[c.held].icon : 'bag' },
    );

    // Trait: its own button (tap to read what it does); sideways there's room to show it too.
    const tid = traitOf(c);
    if (tid) {
      const desc = traitDescOf(tid, c.stage >= 2);
      const read = () => showMessage(this, traitTag(c), desc);
      const tx = wide ? px + pw / 2 : (222 + W - 18) / 2;
      const ty = wide ? y0 + 266 : y0 + 145;
      const tw = wide ? pw - 20 : W - 18 - 222;
      const tb = button(this, tx, ty, tw, wide ? 30 : 24, `${traitTag(c)}  ⓘ`, read, { fontSize: 13, color: 0x2f4a6b, glyph: 'gem' });
      const lab = tb.list.find((o): o is Phaser.GameObjects.Text => o instanceof Phaser.GameObjects.Text);
      if (lab && lab.width > tw - 40) lab.setScale((tw - 40) / lab.width, 1);
      if (wide) text(this, lx, ty + 22, desc, 12, COLORS.textDim, { wordWrap: { width: pw - 20 }, lineSpacing: 3 });
    }

    // Actions: a row of four (upright) or a 2x2 grid (sideways).
    const bw = wide ? (pw - 26) / 2 : 0;
    const slot = (k: number, x: number, w: number) =>
      wide ? { x: px + 10 + bw / 2 + (k % 2) * (bw + 6), y: y0 + 300 + Math.floor(k / 2) * 36, w: bw } : { x, y: y0 + 176, w };
    const stoneOk = run.evoStones > 0 && readyToEvolve(c);
    // Holding a stone but not there yet: the button says when (it used to be a line the trait button covered).
    const waitLv = !stoneOk && run.evoStones > 0 && canEvolve(c) ? evolveLevel(c) : 0;
    const b0 = slot(0, 58, 100);
    button(
      this,
      b0.x,
      b0.y,
      b0.w,
      28,
      waitLv ? `Evolve Lv ${waitLv}` : 'Evolve',
      () => {
        run.evoStones -= 1;
        const from = creatureName(c);
        const fromKey = ensureCreatureTexture(this, c.speciesId, c.stage, colours(c));
        const lv = c.level;
        evolveTracked(run, c);
        const note = releaseNote(c, lv);
        dex.creature(c, true);
        const toKey = ensureCreatureTexture(this, c.speciesId, c.stage, colours(c));
        playEvolution(this, fromKey, toKey, 5 * SPRITE_FIT, ELEMENT_COLORS[creatureTypes(c)[0]], () => {
          cry(c.speciesId, c.stage);
          showMessage(this, 'Evolution!', `${from} evolved into ${creatureName(c)}!${note}`, () => this.scene.restart({ selected: this.selected }));
        });
      },
      { enabled: stoneOk, fontSize: waitLv ? 12 : 15, color: 0x5b3c8a, glyph: 'stone' },
    );
    const ref = this.selected!;
    const canMove = ref.list === 'team' ? run.bench.length < benchMax(run) && run.team.length > 1 : run.team.length < teamMax(run);
    const b1 = slot(1, 166, 104);
    button(
      this,
      b1.x,
      b1.y,
      b1.w,
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
    const b2 = slot(2, 270, 92);
    button(
      this,
      b2.x,
      b2.y,
      b2.w,
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
    const b3 = slot(3, 374, 100);
    button(
      this,
      b3.x,
      b3.y,
      b3.w,
      28,
      `Potion ${potions}`,
      () => {
        usePotion(run, c);
        persist();
        this.scene.restart({ selected: this.selected });
      },
      { enabled: potions > 0 && needsPotion(c), fontSize: 14, color: 0x2f5a4a, glyph: 'potion' },
    );
  }

  /** Give, swap or take off a held item. */
  private itemPicker(c: Creature) {
    const run = state.run!;
    const bag = [...new Set(run.bag ?? [])] as HeldId[];
    const count = (id: HeldId) => (run.bag ?? []).filter((x) => x === id).length;
    const restart = () => this.scene.restart({ selected: this.selected });
    openPicker(this, {
      title: c.held ? `${creatureName(c)} holds ${HELD[c.held].name}` : `Give ${creatureName(c)} an item`,
      subtitle: c.held ? HELD[c.held].desc : 'Each Hexling can hold one item. Items come back to your bag if it falls.',
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
