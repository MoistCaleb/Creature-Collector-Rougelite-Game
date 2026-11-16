import Phaser from 'phaser';
import { allMoveIds, elementPool, MOVES, moveSummary } from '../data/moves';
import { SPECIES } from '../data/species';
import { ELEMENT_COLORS, elementTextColor, ELEMENTS, STRONG_AGAINST, type Element } from '../data/types';
import { Scroller } from '../ui/scroll';
import { formName, hasSeenForm } from '../logic/dex';
import { state } from '../state';
import { ensureCreatureTexture, SPRITE_FIT } from '../ui/sprites';
import { background, button, COLORS, H, text, typeChip, W } from '../ui/widgets';

type Tab = 'creatures' | 'moves' | 'elements';
/** Content starts below the header, tabs and the jump-to-element bar. */
const TOP = 196;

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

  constructor() {
    super('Dex');
  }

  init(data: { from?: string; tab?: Tab }) {
    this.from = data.from ?? this.from;
    this.tab = data.tab ?? 'creatures';
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

    // Header drawn last so it sits on top.
    this.add.rectangle(0, 0, W, TOP, COLORS.bg).setOrigin(0);
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
    const rowH = 124;
    SPECIES.forEach((sp, i) => {
      const y = i * rowH + 8;
      this.addRow(y, rowH, (row) => this.drawCreatureRow(row, sp, i, y, rowH));
      for (const el of new Set(sp.types)) this.anchor(el, y);
    });
    this.contentH = SPECIES.length * rowH + 16;
  }

  private drawCreatureRow(row: Phaser.GameObjects.Container, sp: (typeof SPECIES)[number], i: number, y: number, rowH: number) {
    const dex = state.meta.dex;
    {
      const anySeen = [0, 1, 2].some((s) => hasSeenForm(dex, sp.id, s));
      row.add(this.add.rectangle(12, y, W - 24, rowH - 8, COLORS.panel).setOrigin(0).setStrokeStyle(1, COLORS.stroke));
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
