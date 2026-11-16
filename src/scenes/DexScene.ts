import Phaser from 'phaser';
import { allMoveIds, elementPool, MOVES, moveSummary } from '../data/moves';
import { SPECIES } from '../data/species';
import { ELEMENT_COLORS, elementTextColor, ELEMENTS, STRONG_AGAINST, type Element } from '../data/types';
import { Scroller } from '../ui/scroll';
import { formName, hasSeenForm } from '../logic/dex';
import { state } from '../state';
import { ensureCreatureTexture, SPRITE_FIT } from '../ui/sprites';
import { background, button, COLORS, H, text, typeChip, W } from '../ui/widgets';
import { createCreature, levelCap, stats } from '../logic/creature';
import { cry } from '../ui/cries';
import { toggleFavorite } from '../logic/run';
import { icon } from '../ui/icons';

type Tab = 'creatures' | 'moves' | 'elements';
/** Content starts below the header, tabs and the jump-to-element bar. */
const TOP = 196;
/** Creature rows: collapsed, and expanded into a big card. */
const ROW_H = 124;
const CARD_H = 478;
const STAGE_LABEL = ['Base form', 'First evolution', 'Final form'];

export class DexScene extends Phaser.Scene {
  private from = 'Title';
  private tab: Tab = 'creatures';
  private content!: Phaser.GameObjects.Container;
  private contentH = 0;
  private scroller!: Scroller;
  /** Where each element's rows start in the current tab, for the jump bar. */
  private anchors: Partial<Record<Element, number[]>> = {};
  /** Every row of the current tab: where it sits and how to draw it. Only rows near the screen exist. */
  private rows: { y: number; h: number; build: (c: Phaser.GameObjects.Container) => void }[] = [];
  private live = new Map<number, Phaser.GameObjects.Container>();
  /** The creature row shown as a big card, if any. */
  private expanded: number | null = null;

  constructor() {
    super('Dex');
  }

  init(data: { from?: string; tab?: Tab }) {
    this.from = data.from ?? this.from;
    this.tab = data.tab ?? 'creatures';
    this.expanded = null;
  }

  create() {
    background(this);
    const dex = state.meta.dex;

    this.content = this.add.container(0, TOP);
    this.rows = [];
    this.live = new Map();
    this.anchors = {};
    const maskShape = this.make.graphics({}).fillRect(0, TOP, W, H - TOP);
    this.content.setMask(maskShape.createGeometryMask());

    if (this.tab === 'creatures') this.drawCreatures();
    else if (this.tab === 'moves') this.drawMoves();
    else this.drawElements();
    this.refreshRows();

    // Header drawn last so it sits on top (and catches taps meant for it, not rows scrolled under it).
    this.add.rectangle(0, 0, W, TOP, COLORS.bg).setOrigin(0).setInteractive();
    text(this, 16, 14, 'Creature Dex', 24, '#ffc94d', { fontStyle: 'bold' });
    button(this, W - 56, 30, 92, 40, 'Back', () => this.scene.start(this.from), { fontSize: 16 });
    const totalForms = SPECIES.length * 3;
    text(
      this,
      16,
      48,
      `Forms ${dex.forms.length}/${totalForms}  Caught ${dex.caught.length}/${SPECIES.length}  Moves ${dex.moves.length}/${allMoveIds().length}  Elements ${dex.elements.length}/${ELEMENTS.length}`,
      13,
      COLORS.textDim,
    );
    const tabs: [Tab, string][] = [
      ['creatures', 'Creatures'],
      ['moves', 'Moves'],
      ['elements', 'Elements'],
    ];
    tabs.forEach(([t, label], i) => {
      const bw = (W - 40) / 3;
      button(this, 16 + bw / 2 + i * (bw + 4), 98, bw, 40, label, () => this.scene.restart({ from: this.from, tab: t }), {
        color: this.tab === t ? 0x5b4a8a : COLORS.panelLight,
        fontSize: 16,
      });
    });

    this.drawJumpBar();

    // Drag to scroll, with flick momentum.
    this.scroller = new Scroller(this, {
      get: () => this.content.y,
      set: (y) => {
        this.content.y = y;
        this.refreshRows();
      },
      min: () => Math.min(TOP, H - this.contentH - 20),
      max: () => TOP,
    });
  }

  /** Two rows of element buttons: tap to glide to that element; tap again for the next one. */
  private drawJumpBar() {
    const dex = state.meta.dex;
    const cols = 6;
    const bw = (W - 32 - (cols - 1) * 4) / cols;
    ELEMENTS.forEach((el, i) => {
      const seen = dex.elements.includes(el);
      const x = 16 + bw / 2 + (i % cols) * (bw + 4);
      const y = 136 + Math.floor(i / cols) * 30;
      button(this, x, y, bw, 26, seen ? el : '???', () => this.jumpTo(el), {
        color: seen ? ELEMENT_COLORS[el] : COLORS.panelLight,
        textColor: seen ? elementTextColor(el) : '#6d6588',
        fontSize: 11,
        enabled: (this.anchors[el]?.length ?? 0) > 0,
      });
    });
  }

  /** Glide to the next row for this element below the current view (wrapping to the first). */
  private jumpTo(el: Element) {
    const ys = this.anchors[el] ?? [];
    if (!ys.length) return;
    const viewTop = TOP - this.content.y; // content-space y at the top of the view
    const next = ys.find((y) => y > viewTop + 4) ?? ys[0];
    this.scroller.glideTo(TOP - next + 4, () => this.refreshRows());
  }

  private anchor(el: Element, y: number) {
    (this.anchors[el] ??= []).push(y);
  }

  /** Builds rows that are on (or near) the screen and removes ones that scrolled far away. */
  private refreshRows() {
    const margin = 400;
    this.rows.forEach((r, i) => {
      const top = this.content.y + r.y;
      const near = top + r.h > TOP - margin && top < H + margin;
      const row = this.live.get(i);
      if (near && !row) {
        const c = this.add.container(0, 0);
        r.build(c);
        this.content.add(c);
        this.live.set(i, c);
      } else if (!near && row) {
        row.destroy();
        this.live.delete(i);
      }
    });
  }

  private addRow(y: number, h: number, build: (c: Phaser.GameObjects.Container) => void) {
    this.rows.push({ y, h, build });
  }

  private drawCreatures() {
    this.rows = [];
    this.anchors = {};
    let y = 8;
    SPECIES.forEach((sp, i) => {
      const h = this.expanded === i ? CARD_H : ROW_H;
      const yy = y;
      this.addRow(yy, h, (row) => (this.expanded === i ? this.drawCreatureCard(row, sp, i, yy, h) : this.drawCreatureRow(row, sp, i, yy, h)));
      for (const el of new Set(sp.types)) this.anchor(el, yy);
      y += h;
    });
    this.contentH = y + 8;
  }

  /** Tap a creature to open it as a big card (tap again to close). Keeps the row where it was on screen. */
  private toggle(i: number) {
    if (this.scroller.moved) return;
    const screenY = this.content.y + this.rows[i].y;
    this.expanded = this.expanded === i ? null : i;
    for (const c of this.live.values()) c.destroy();
    this.live.clear();
    this.drawCreatures();
    const min = Math.min(TOP, H - this.contentH - 20);
    this.content.y = Phaser.Math.Clamp(screenY - this.rows[i].y, min, TOP);
    // An opened card should be fully visible if it fits.
    if (this.expanded === i) {
      const bottom = this.content.y + this.rows[i].y + CARD_H;
      if (bottom > H - 10) this.content.y = Phaser.Math.Clamp(this.content.y - (bottom - (H - 10)), min, TOP);
    }
    this.refreshRows();
  }

  /** Row background that opens/closes the card when tapped (but not when dragged). */
  private tapArea(row: Phaser.GameObjects.Container, y: number, h: number, i: number, enabled: boolean) {
    const bg = this.add.rectangle(12, y, W - 24, h - 8, COLORS.panel).setOrigin(0).setStrokeStyle(1, this.expanded === i ? COLORS.accent : COLORS.stroke);
    if (enabled) bg.setInteractive({ useHandCursor: true }).on('pointerup', () => this.toggle(i));
    row.add(bg);
  }

  /** An opened creature: every form large, with its stats at Lv 50 and its cry. */
  private drawCreatureCard(row: Phaser.GameObjects.Container, sp: (typeof SPECIES)[number], i: number, y: number, h: number) {
    const dex = state.meta.dex;
    this.tapArea(row, y, h, i, true);
    row.add(text(this, 22, y + 8, `#${String(i + 1).padStart(3, '0')}`, 12, COLORS.textDim));
    const t = sp.types;
    (t[0] === t[1] ? [t[0]] : t).forEach((el, k) => row.add(typeChip(this, 70 + k * 64, y + 16, el)));
    if (dex.caught.includes(sp.id)) row.add(text(this, W - 138, y + 10, '● Caught', 12, '#8fe08a').setOrigin(1, 0));
    // Favorite: this line always shows up among your starter choices.
    const meta = state.meta;
    const fav = meta.favorite === sp.id;
    const canFav = meta.unlockedStarters.includes(sp.id);
    row.add(
      button(this, W - 74, y + 20, 104, 28, fav ? 'Favorite' : canFav ? 'Set favorite' : 'Catch to favorite', () => {
        toggleFavorite(meta, sp.id);
        for (const c of this.live.values()) c.destroy();
        this.live.clear();
        this.refreshRows();
      }, { fontSize: 12, glyph: 'star', color: fav ? 0x7a5a1c : 0x3a3450, enabled: canFav || fav }),
    );
    for (let s = 0; s < 3; s++) {
      const sy = y + 38 + s * 136;
      const seen = hasSeenForm(dex, sp.id, s);
      row.add(this.add.rectangle(24, sy, 112, 124, 0x15111f).setOrigin(0).setStrokeStyle(1, COLORS.stroke));
      if (seen) {
        row.add(this.add.image(80, sy + 62, ensureCreatureTexture(this, sp.id, s)).setScale(3.4 * SPRITE_FIT));
        // Stats at this form's level cap (no prestige stars).
        const c = createCreature(sp.id, 1, s);
        c.level = levelCap(c);
        const st = stats(c);
        row.add(text(this, 150, sy + 6, formName(dex, sp.id, s), 20, COLORS.text, { fontStyle: 'bold' }));
        row.add(text(this, 150, sy + 34, STAGE_LABEL[s], 12, '#8e86ad'));
        row.add(text(this, 150, sy + 54, `At level cap (Lv ${c.level}):\nHP ${st.hp}   ATK ${st.atk}\nDEF ${st.def}   SPD ${st.spd}`, 13, COLORS.textDim, { lineSpacing: 2 }));
        row.add(button(this, W - 70, sy + 18, 80, 30, 'Cry', () => cry(sp.id, s), { fontSize: 13, glyph: 'sound', color: 0x2f4a6b }));
      } else {
        row.add(text(this, 80, sy + 62, '?', 40, '#4a4068', { fontStyle: 'bold' }).setOrigin(0.5));
        row.add(text(this, 150, sy + 6, '???', 20, '#4a4068', { fontStyle: 'bold' }));
        row.add(text(this, 150, sy + 34, `${STAGE_LABEL[s]} · not yet seen`, 12, '#4a4068'));
      }
      if (s < 2) row.add(icon(this, 80, sy + 130, 'arrowUp', 12).setAngle(180).setAlpha(0.5));
    }
    const sig = MOVES[sp.signature];
    const seenSig = dex.moves.includes(sig.id);
    row.add(
      text(this, 22, y + h - 32, seenSig ? `Signature: ${sig.name} · ${moveSummary(sig, 1)}` : 'Signature: ???', 12, seenSig ? '#ffc94d' : '#4a4068', {
        wordWrap: { width: W - 50 },
      }),
    );
  }

  private drawCreatureRow(row: Phaser.GameObjects.Container, sp: (typeof SPECIES)[number], i: number, y: number, rowH: number) {
    const dex = state.meta.dex;
    {
      const anySeen = [0, 1, 2].some((s) => hasSeenForm(dex, sp.id, s));
      this.tapArea(row, y, rowH, i, anySeen);
      if (anySeen) row.add(icon(this, W - 30, y + rowH - 22, 'arrowUp', 12).setAngle(180).setAlpha(0.45));
      if (state.meta.favorite === sp.id) row.add(icon(this, W - 100, y + 13, 'star', 14));
      row.add(text(this, 22, y + 6, `#${String(i + 1).padStart(3, '0')}`, 11, COLORS.textDim));
      if (dex.caught.includes(sp.id)) row.add(text(this, W - 24, y + 6, '● Caught', 11, '#8fe08a').setOrigin(1, 0));
      if (anySeen) {
        const t = sp.types;
        (t[0] === t[1] ? [t[0]] : t).forEach((el, k) => row.add(typeChip(this, 70 + k * 54, y + 14, el, true)));
      }
      for (let s = 0; s < 3; s++) {
        const cx = 70 + s * 130;
        const cy = y + 54;
        if (hasSeenForm(dex, sp.id, s)) {
          row.add(this.add.image(cx, cy, ensureCreatureTexture(this, sp.id, s)).setScale(1.7 * SPRITE_FIT));
        } else {
          row.add(this.add.rectangle(cx, cy, 52, 52, 0x15111f).setStrokeStyle(1, COLORS.stroke));
          row.add(text(this, cx, cy, '?', 24, '#4a4068', { fontStyle: 'bold' }).setOrigin(0.5));
        }
        row.add(text(this, cx, y + 86, formName(dex, sp.id, s), 12, hasSeenForm(dex, sp.id, s) ? COLORS.text : '#4a4068').setOrigin(0.5, 0));
        if (s === 2) {
          const sig = MOVES[sp.signature];
          const seenSig = dex.moves.includes(sig.id);
          row.add(
            text(this, 22, y + 102, seenSig ? `Signature: ${sig.name} · ${moveSummary(sig, 1)}` : 'Signature: ???', 11, seenSig ? '#ffc94d' : '#4a4068'),
          );
        }
        if (s < 2) row.add(text(this, cx + 65, cy, '›', 20, '#4a4068').setOrigin(0.5));
      }
    }
  }

  private drawMoves() {
    const dex = state.meta.dex;
    let y = 8;
    for (const el of ELEMENTS) {
      const elSeen = dex.elements.includes(el);
      const hy = y;
      this.anchor(el, hy);
      this.addRow(hy, 30, (row) => {
        if (elSeen) row.add(typeChip(this, 16, hy + 12, el));
        else row.add(text(this, 16, hy + 2, '??? element', 14, '#4a4068'));
      });
      y += 30;
      const ids = elementPool(el);
      for (const id of ids) {
        const m = MOVES[id];
        const seen = dex.moves.includes(id);
        const my = y;
        this.addRow(my, 38, (row) => {
          row.add(this.add.rectangle(12, my, W - 24, 34, COLORS.panel).setOrigin(0).setStrokeStyle(1, COLORS.stroke));
          if (seen) {
            const kind = m.kind === 'attack' ? 'Attack' : m.kind === 'buff' ? 'Boost' : 'Hinder';
            row.add(this.add.rectangle(22, my + 17, 8, 8, ELEMENT_COLORS[el]));
            row.add(text(this, 34, my + 9, m.name, 14, COLORS.text));
            row.add(text(this, 170, my + 10, kind, 12, COLORS.textDim));
            row.add(text(this, W - 22, my + 10, `${moveSummary(m, 1)} · ${m.accuracy}%`, 12, COLORS.textDim).setOrigin(1, 0));
          } else {
            row.add(text(this, 34, my + 9, '???', 14, '#4a4068'));
          }
        });
        y += 38;
      }
      y += 12;
    }
    this.contentH = y;
  }

  private drawElements() {
    const dex = state.meta.dex;
    const name = (e: Element) => (dex.elements.includes(e) ? e : '???');
    ELEMENTS.forEach((el, i) => {
      const y = 8 + i * 96;
      this.anchor(el, y);
      this.addRow(y, 96, (row) => {
        row.add(this.add.rectangle(12, y, W - 24, 86, COLORS.panel).setOrigin(0).setStrokeStyle(1, COLORS.stroke));
        if (!dex.elements.includes(el)) {
          row.add(text(this, 24, y + 32, '??? Not yet encountered', 15, '#4a4068'));
          return;
        }
        row.add(typeChip(this, 24, y + 20, el));
        const weakTo = ELEMENTS.filter((a) => STRONG_AGAINST[a].includes(el));
        row.add(text(this, 24, y + 40, `Strong against: ${STRONG_AGAINST[el].map(name).join(', ')}`, 14, '#8fe08a'));
        row.add(text(this, 24, y + 60, `Weak to: ${weakTo.map(name).join(', ')}`, 14, '#f08a80'));
      });
    });
    this.contentH = ELEMENTS.length * 96 + 16;
  }
}
