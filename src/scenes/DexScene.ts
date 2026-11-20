import { DEX_FORMS, DEX_SPECIES, dexStages, isLegend } from '../data/legends';
import Phaser from 'phaser';
import { campHearts } from '../logic/camp';
import { openGildedMilestones } from '../ui/gildedUi';
import { accText, allMoveIds, BULWARK_ID, elementPool, fastId, moveColor, MOVES, moveSummary, NEUTRAL_COLOR, slowId, WARP_ID } from '../data/moves';
import { SPECIES } from '../data/species';
import { ELEMENT_COLORS, elementTextColor, ELEMENTS, STRONG_AGAINST, type Element } from '../data/types';
import { Scroller } from '../ui/scroll';
import { formName, hasSeenForm } from '../logic/dex';
import { state } from '../state';
import { ensureCreatureTexture, ensureGrayTexture, SPRITE_FIT } from '../ui/sprites';
import { background, button, COLORS, H, LANDSCAPE, text, typeChip, W } from '../ui/widgets';
import { createCreature, stageCap, stats } from '../logic/creature';
import { cry } from '../ui/cries';
import { toggleFavorite } from '../logic/run';
import { icon } from '../ui/icons';
import { openElementChart } from '../ui/elementChart';
import { shinySparkle } from '../ui/shiny';
import { searchBox } from '../ui/searchBox';

type Tab = 'creatures' | 'moves' | 'elements';
/** Content starts below the header, tabs and the jump-to-element bar. */
/** Where the list starts, under the header (a shorter header on the wide board). */
let TOP = 196;
/** Creature rows: collapsed, and expanded into a big card. */
const ROW_H = 124;
const CARD_H = 478;
const STAGE_LABEL = ['Base form', 'First evolution', 'Final form'];

/** Hexlings tab: search text and which lines to show (kept while you browse). */
let dexQuery = '';
type DexFilter = 'all' | 'caught' | 'gilded';
let dexFilter: DexFilter = 'all';
/** Moves tab: search text and which kind of move to show. */
let moveQuery = '';
type MoveFilter = 'all' | 'attack' | 'status';
let moveFilter: MoveFilter = 'all';

/** Header layout: where the jump bar starts, and where the list starts under it. */
function layout(tab: Tab) {
  const searchable = tab === 'creatures' || tab === 'moves';
  if (LANDSCAPE) return { stats: 50, tabsY: 84, tabsH: 30, search: searchable ? { y: 69, h: 30 } : null, jumpY: 117, top: 134 };
  const creatures = searchable;
  return { stats: 58, tabsY: 98, tabsH: 36, search: creatures ? { y: 122, h: 34 } : null, jumpY: creatures ? 172 : 136, top: creatures ? 220 : 184 };
}

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
  /** Hexlings tab: species index -> its row (rows skip lines the search or filter hides). */
  private rowOf = new Map<number, number>();
  private jumpBar: Phaser.GameObjects.Container | null = null;
  /** The search field (a page element over the canvas): hidden while a panel is open on top. */
  private search$: HTMLInputElement | null = null;

  /** Open a panel over the Hexlidex, hiding the search field until it closes. */
  private overlay(open: (done: () => void) => void) {
    const el = this.search$;
    if (el) el.style.display = 'none';
    open(() => {
      if (el) el.style.display = '';
    });
  }

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
    this.search$ = null;
    const L = layout(this.tab);
    TOP = L.top;
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
    const hx = text(this, 16, 14, 'Hexlidex', 24, '#ffc94d', { fontStyle: 'bold' });
    // Shinies unlocked (any form of a line unlocks the whole line).
    const nShiny = (state.meta.shinyOwned ?? []).length;
    icon(this, hx.x + hx.width + 16, 28, 'sparkle', 16);
    // Tap for the Gilded milestones (titles and outfits).
    text(this, hx.x + hx.width + 28, 20, `${nShiny}/${SPECIES.length} gilded ›`, 14, nShiny ? '#ffd86b' : COLORS.textDim, { fontStyle: 'bold' })
      .setPadding(6, 8, 6, 8)
      .setPosition(hx.x + hx.width + 22, 12)
      .setInteractive({ useHandCursor: true })
      .on('pointerup', () => this.overlay((done) => openGildedMilestones(this, state.meta, done)));
    button(this, W - 56, 30, 92, 40, 'Back', () => this.scene.start(this.from), { fontSize: 16 });
    button(this, W - 156, 30, 96, 40, 'Chart', () => this.overlay((done) => openElementChart(this, [], done)), { fontSize: 15, glyph: 'sparkle', color: 0x2f4a6b });
    const totalForms = DEX_FORMS;
    text(
      this,
      16,
      L.stats,
      `Forms ${dex.forms.length}/${totalForms}  Caught ${dex.caught.length}/${DEX_SPECIES.length}  Moves ${dex.moves.length}/${allMoveIds().length}  Elements ${dex.elements.length}/${ELEMENTS.length}`,
      13,
      COLORS.textDim,
    );
    const tabs: [Tab, string][] = [
      ['creatures', 'Hexlings'],
      ['moves', 'Moves'],
      ['elements', 'Elements'],
    ];
    // Sideways on the Hexlings tab, the tabs take the left half and the search the right half.
    const tabsW = LANDSCAPE && L.search ? W / 2 - 24 : W - 32;
    tabs.forEach(([t, label], i) => {
      const bw = (tabsW - 8) / 3;
      button(this, 16 + bw / 2 + i * (bw + 4), L.tabsY, bw, L.tabsH, label, () => this.scene.restart({ from: this.from, tab: t }), {
        color: this.tab === t ? 0x5b4a8a : COLORS.panelLight,
        fontSize: 16,
      });
    });
    if (L.search) this.drawSearch(L.search.y, L.search.h);

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
    this.jumpBar?.destroy();
    const bar = (this.jumpBar = this.add.container(0, 0));
    const y0 = layout(this.tab).jumpY;
    const cols = LANDSCAPE ? 12 : 6;
    const bw = (W - 32 - (cols - 1) * 4) / cols;
    ELEMENTS.forEach((el, i) => {
      const seen = dex.elements.includes(el);
      const x = 16 + bw / 2 + (i % cols) * (bw + 4);
      const y = y0 + Math.floor(i / cols) * 30;
      bar.add(button(this, x, y, bw, LANDSCAPE ? 24 : 26, seen ? el : '???', () => this.jumpTo(el), {
        color: seen ? ELEMENT_COLORS[el] : COLORS.panelLight,
        textColor: seen ? elementTextColor(el) : '#6d6588',
        fontSize: 11,
        enabled: (this.anchors[el]?.length ?? 0) > 0,
      }));
    });
  }

  /**
   * Hexlings and Moves tabs: a search box and two filters. Hexlings: names of forms you've seen
   * (or a number), Caught / Gilded. Moves: names, elements and kinds of moves you've seen,
   * Attacks / Status.
   */
  private drawSearch(y: number, h: number) {
    const moves = this.tab === 'moves';
    const x0 = LANDSCAPE ? W / 2 + 4 : 16;
    const fw = LANDSCAPE ? 80 : 78;
    const boxW = W - 16 - x0 - 2 * (fw + 6);
    this.add.rectangle(x0, y, boxW, h, 0x0f0c18).setOrigin(0).setStrokeStyle(2, COLORS.stroke);
    this.search$ = searchBox(this, x0 + 2, y + 2, boxW - 4, h - 4, {
      value: moves ? moveQuery : dexQuery,
      placeholder: moves ? 'Search moves…' : 'Search Hexlings…',
      onInput: (v) => {
        if (moves) moveQuery = v;
        else dexQuery = v;
        this.relist();
      },
    });
    const chip = (i: number, on: boolean, label: string, color: number, flip: () => void) =>
      button(this, x0 + boxW + 6 + fw / 2 + i * (fw + 6), y + h / 2, fw, h, label, () => {
        flip();
        this.scene.restart({ from: this.from, tab: this.tab });
      }, { fontSize: 13, color: on ? color : COLORS.panelLight });
    if (moves) {
      chip(0, moveFilter === 'attack', 'Attacks', 0x8a3a2a, () => (moveFilter = moveFilter === 'attack' ? 'all' : 'attack'));
      chip(1, moveFilter === 'status', 'Status', 0x2f4a6b, () => (moveFilter = moveFilter === 'status' ? 'all' : 'status'));
    } else {
      chip(0, dexFilter === 'caught', 'Caught', 0x3b6d4a, () => (dexFilter = dexFilter === 'caught' ? 'all' : 'caught'));
      chip(1, dexFilter === 'gilded', '✦ Gilded', 0x7a5a1c, () => (dexFilter = dexFilter === 'gilded' ? 'all' : 'gilded'));
    }
  }

  /** Search changed: rebuild the list in place (the search box keeps the keyboard). */
  private relist() {
    this.expanded = null;
    for (const c of this.live.values()) c.destroy();
    this.live.clear();
    if (this.tab === 'moves') this.drawMoves();
    else this.drawCreatures();
    this.content.y = TOP;
    this.refreshRows();
    this.drawJumpBar();
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
    this.rowOf = new Map();
    const dex = state.meta.dex;
    const owned = state.meta.shinyOwned ?? [];
    const q = dexQuery.trim().toLowerCase().replace(/^#/, '');
    let y = 8;
    DEX_SPECIES.forEach((sp, i) => {
      if (dexFilter === 'caught' && !dex.caught.includes(sp.id)) return;
      if (dexFilter === 'gilded' && !owned.includes(sp.id)) return;
      // Search: names of forms you've seen (unseen names stay secret), or the number.
      if (q && !(/^\d+$/.test(q) ? Number(q) === i + 1 : sp.names.some((n, st) => hasSeenForm(dex, sp.id, st) && n.toLowerCase().includes(q)))) return;
      this.rowOf.set(i, this.rows.length);
      const h = this.expanded === i ? CARD_H : ROW_H;
      const yy = y;
      this.addRow(yy, h, (row) => (this.expanded === i ? this.drawCreatureCard(row, sp, i, yy, h) : this.drawCreatureRow(row, sp, i, yy, h)));
      for (const el of new Set(sp.types)) this.anchor(el, yy);
      y += h;
    });
    if (!this.rows.length) {
      const msg = dexFilter === 'gilded' && !owned.length ? 'No Gilded Hexlings yet. Catch one to unlock its whole line!' : 'Nothing matches. Try another name or filter.';
      this.addRow(8, 80, (row) => row.add(text(this, W / 2, 40, msg, 14, COLORS.textDim, { align: 'center', wordWrap: { width: W - 60 } }).setOrigin(0.5)));
      y = 88;
    }
    this.contentH = y + 8;
  }

  /** Tap a creature to open it as a big card (tap again to close). Keeps the row where it was on screen. */
  private toggle(i: number) {
    if (this.scroller.moved) return;
    const r0 = this.rowOf.get(i);
    if (r0 === undefined) return;
    const screenY = this.content.y + this.rows[r0].y;
    this.expanded = this.expanded === i ? null : i;
    for (const c of this.live.values()) c.destroy();
    this.live.clear();
    this.drawCreatures();
    const r = this.rowOf.get(i)!;
    const min = Math.min(TOP, H - this.contentH - 20);
    this.content.y = Phaser.Math.Clamp(screenY - this.rows[r].y, min, TOP);
    // An opened card should be fully visible if it fits.
    if (this.expanded === i) {
      const bottom = this.content.y + this.rows[r].y + CARD_H;
      if (bottom > H - 10) this.content.y = Phaser.Math.Clamp(this.content.y - (bottom - (H - 10)), min, TOP);
    }
    this.refreshRows();
  }

  /** Row background that opens/closes the card when tapped (but not when dragged). */
  private tapArea(row: Phaser.GameObjects.Container, y: number, h: number, i: number, enabled: boolean, shiny = false) {
    // Shiny-unlocked lines get a gold frame.
    const bg = this.add
      .rectangle(12, y, W - 24, h - 8, shiny ? 0x2c2236 : COLORS.panel)
      .setOrigin(0)
      .setStrokeStyle(shiny ? 2 : 1, shiny ? 0xffd86b : this.expanded === i ? COLORS.accent : COLORS.stroke, shiny ? 0.9 : 1);
    if (enabled) bg.setInteractive({ useHandCursor: true }).on('pointerup', () => this.toggle(i));
    row.add(bg);
  }

  /** An opened creature: every form large, with its stats at Lv 50 and its cry. */
  private drawCreatureCard(row: Phaser.GameObjects.Container, sp: (typeof SPECIES)[number], i: number, y: number, h: number) {
    const dex = state.meta.dex;
    const owned = (state.meta.shinyOwned ?? []).includes(sp.id);
    this.tapArea(row, y, h, i, true, owned);
    row.add(text(this, 22, y + 8, `#${String(i + 1).padStart(3, '0')}`, 12, COLORS.textDim));
    if (owned) row.add(text(this, W - 138, y + 26, '✦ Gilded unlocked: every form', 11, '#ffd86b', { fontStyle: 'bold' }).setOrigin(1, 0));
    const t = sp.types;
    (t[0] === t[1] ? [t[0]] : t).forEach((el, k) => row.add(typeChip(this, 70 + k * 64, y + 16, el)));
    const caught = dex.caught.includes(sp.id);
    const bond = campHearts(state.meta, sp.id);
    row.add(text(this, W - 138, y + 10, caught ? `● Caught${bond ? ` · camp bond ${'♥'.repeat(bond)}` : ''}` : '○ Seen · not caught yet', 12, caught ? '#8fe08a' : '#8e86ad').setOrigin(1, 0));
    // Favorite: this line always shows up among your starter choices.
    const meta = state.meta;
    const fav = meta.favorite === sp.id;
    const canFav = meta.unlockedStarters.includes(sp.id);
    row.add(
      button(this, W - 74, y + 20, 104, 28, fav ? 'Favorite' : canFav ? 'Set favorite' : isLegend(sp.id) ? 'Never a starter' : 'Catch to favorite', () => {
        toggleFavorite(meta, sp.id);
        for (const c of this.live.values()) c.destroy();
        this.live.clear();
        this.refreshRows();
      }, { fontSize: 12, glyph: 'star', color: fav ? 0x7a5a1c : 0x3a3450, enabled: canFav || fav }),
    );
    const shinySeen = (meta.shinySeen ?? []).includes(sp.id);
    const stages = dexStages(sp.id);
    stages.forEach((s, k) => {
      const sy = y + 38 + k * 136;
      const seen = hasSeenForm(dex, sp.id, s);
      row.add(this.add.rectangle(24, sy, 112, 124, 0x15111f).setOrigin(0).setStrokeStyle(1, COLORS.stroke));
      if (seen) {
        // Shiny unlocked: the big picture is the shiny, its normal colours in the corner.
        // Only seen shiny: normal big, the shiny in the corner.
        // Seen but never caught: grayed out.
        const big = caught ? ensureCreatureTexture(this, sp.id, s, owned) : ensureGrayTexture(this, sp.id, s);
        row.add(this.add.image(80, sy + 62, big).setScale(3.4 * SPRITE_FIT));
        if (owned) row.add(shinySparkle(this, 36, sy + 14, 14));
        if (shinySeen || owned) {
          row.add(this.add.rectangle(112, sy + 100, 44, 44, 0x2a2244).setStrokeStyle(1, owned ? COLORS.stroke : 0xffc94d, 0.7));
          row.add(this.add.image(112, sy + 100, ensureCreatureTexture(this, sp.id, s, !owned)).setScale(1 * SPRITE_FIT));
          if (!owned) row.add(icon(this, 128, sy + 84, 'sparkle', 10));
        }
        row.add(text(this, 150, sy + 6, formName(dex, sp.id, s), 20, COLORS.text, { fontStyle: 'bold' }));
        row.add(text(this, 150, sy + 34, isLegend(sp.id) ? 'Legendary' : STAGE_LABEL[s], 12, isLegend(sp.id) ? '#e0c8ff' : '#8e86ad'));
        if (caught) {
          // Stats at this form's level cap (no prestige stars): only once you've caught the line.
          const c = createCreature(sp.id, 1, s);
          c.level = stageCap(c);
          const st = stats(c);
          row.add(text(this, 150, sy + 54, `At level cap (Lv ${c.level}):\nHP ${st.hp}   ATK ${st.atk}\nDEF ${st.def}   SPD ${st.spd}`, 13, COLORS.textDim, { lineSpacing: 2 }));
        } else row.add(text(this, 150, sy + 58, 'Catch one to see its stats.', 13, '#6d6588', { fontStyle: 'italic' }));
        row.add(button(this, W - 70, sy + 18, 80, 30, 'Cry', () => cry(sp.id, s), { fontSize: 13, glyph: 'sound', color: 0x2f4a6b }));
      } else {
        row.add(text(this, 80, sy + 62, '?', 40, '#4a4068', { fontStyle: 'bold' }).setOrigin(0.5));
        row.add(text(this, 150, sy + 6, '???', 20, '#4a4068', { fontStyle: 'bold' }));
        row.add(text(this, 150, sy + 34, `${isLegend(sp.id) ? 'Legendary' : STAGE_LABEL[s]} · not yet seen`, 12, '#4a4068'));
      }
      if (k < stages.length - 1) row.add(icon(this, 80, sy + 130, 'arrowUp', 12).setAngle(180).setAlpha(0.5));
    });
    const sig = MOVES[sp.signature];
    const seenSig = dex.moves.includes(sig.id);
    row.add(
      text(this, 22, y + h - 32, seenSig ? `Signature: ${sig.name} · ${moveSummary(sig, 1)} · ${accText(sig)}` : 'Signature: ???', 12, seenSig ? '#ffc94d' : '#4a4068', {
        wordWrap: { width: W - 50 },
      }),
    );
  }

  private drawCreatureRow(row: Phaser.GameObjects.Container, sp: (typeof SPECIES)[number], i: number, y: number, rowH: number) {
    const dex = state.meta.dex;
    {
      const anySeen = [0, 1, 2].some((s) => hasSeenForm(dex, sp.id, s));
      const owned = (state.meta.shinyOwned ?? []).includes(sp.id);
      this.tapArea(row, y, rowH, i, anySeen, owned);
      if (anySeen) row.add(icon(this, W - 30, y + rowH - 22, 'arrowUp', 12).setAngle(180).setAlpha(0.45));
      if (state.meta.favorite === sp.id) row.add(icon(this, W - 100, y + 13, 'star', 14));
      if (!owned && (state.meta.shinySeen ?? []).includes(sp.id)) row.add(icon(this, W - 120, y + 13, 'sparkle', 14));
      row.add(text(this, 22, y + 6, `#${String(i + 1).padStart(3, '0')}`, 11, COLORS.textDim));
      const caught = dex.caught.includes(sp.id);
      if (caught) row.add(text(this, W - 24, y + 6, '● Caught', 11, '#8fe08a').setOrigin(1, 0));
      else if (anySeen) row.add(text(this, W - 24, y + 6, '○ Seen', 11, '#8e86ad').setOrigin(1, 0));
      // Caught shiny: it can be brought shiny to the Arena and online duels.
      if (owned) {
        // Beside the element chips.
        const tx = 70 + (sp.types[0] === sp.types[1] ? 1 : 2) * 54 + 6;
        const tag = text(this, tx + 6, y + 14, '✦ GILDED UNLOCKED', 10, '#2a1a00', { fontStyle: 'bold' }).setOrigin(0, 0.5);
        row.add(this.add.rectangle(tx, y + 14, tag.width + 12, 16, 0xffd86b).setOrigin(0, 0.5));
        row.add(tag);
      }
      if (anySeen) {
        const t = sp.types;
        (t[0] === t[1] ? [t[0]] : t).forEach((el, k) => row.add(typeChip(this, 70 + k * 54, y + 14, el, true)));
      }
      const stages = dexStages(sp.id);
      stages.forEach((s, k) => {
        const cx = 70 + k * 130;
        const cy = y + 54;
        if (hasSeenForm(dex, sp.id, s)) {
          // Seen but never caught: grayed out.
          row.add(this.add.image(cx, cy, caught ? ensureCreatureTexture(this, sp.id, s, owned) : ensureGrayTexture(this, sp.id, s)).setScale(1.7 * SPRITE_FIT));
          if (owned) row.add(shinySparkle(this, cx + 26, cy - 24, 11));
        } else {
          row.add(this.add.rectangle(cx, cy, 52, 52, 0x15111f).setStrokeStyle(1, COLORS.stroke));
          row.add(text(this, cx, cy, '?', 24, '#4a4068', { fontStyle: 'bold' }).setOrigin(0.5));
        }
        row.add(text(this, cx, y + 86, formName(dex, sp.id, s), 12, hasSeenForm(dex, sp.id, s) ? COLORS.text : '#4a4068').setOrigin(0.5, 0));
        if (s === 2) {
          const sig = MOVES[sp.signature];
          const seenSig = dex.moves.includes(sig.id);
          // Sideways: in the free space right of the forms. Upright: under them, inside the row.
          const sigT = LANDSCAPE
            ? text(this, 480, y + 44, seenSig ? `Signature: ${sig.name}\n${moveSummary(sig, 1)} · ${accText(sig)}` : 'Signature: ???', 12, seenSig ? '#ffc94d' : '#4a4068', {
                wordWrap: { width: W - 520 },
                lineSpacing: 3,
              })
            : text(this, 22, y + 99, seenSig ? `Signature: ${sig.name} · ${moveSummary(sig, 1)} · ${accText(sig)}` : 'Signature: ???', 11, seenSig ? '#ffc94d' : '#4a4068');
          if (!LANDSCAPE && sigT.width > W - 50) sigT.setScale((W - 50) / sigT.width);
          row.add(sigT);
        }
        if (k < stages.length - 1) row.add(text(this, cx + 65, cy, '›', 20, '#4a4068').setOrigin(0.5));
      });
      if (isLegend(sp.id)) row.add(text(this, 70 + 130 - 30, y + 46, 'LEGENDARY · roams floors 2-3', 11, '#e0c8ff', { fontStyle: 'bold' }));
    }
  }

  private drawMoves() {
    const dex = state.meta.dex;
    this.rows = [];
    this.anchors = {};
    const q = moveQuery.trim().toLowerCase();
    const KIND: Record<string, string> = { attack: 'Attack', buff: 'Boost', debuff: 'Hinder', heal: 'Heal' };
    const kindOf = (id: string) => KIND[MOVES[id].kind] ?? 'Move';
    // A filter or a search only shows moves you've seen (unseen ones have nothing to match).
    const shows = (id: string, el: Element | 'Neutral') => {
      const seen = dex.moves.includes(id);
      if (!q && moveFilter === 'all') return true;
      if (!seen) return false;
      if (moveFilter === 'attack' && MOVES[id].kind !== 'attack') return false;
      if (moveFilter === 'status' && MOVES[id].kind === 'attack') return false;
      if (!q) return true;
      return MOVES[id].name.toLowerCase().includes(q) || kindOf(id).toLowerCase().includes(q) || ((el === 'Neutral' || dex.elements.includes(el)) && el.toLowerCase().includes(q));
    };
    let y = 8;
    // Each element's moves (with its Blitz and Crush), then the Neutral ones.
    const groups: [Element | 'Neutral', string[]][] = [
      ...ELEMENTS.map((el): [Element, string[]] => [el, [...elementPool(el), fastId(el), slowId(el)]]),
      ['Neutral', [BULWARK_ID, WARP_ID]],
    ];
    for (const [el, pool] of groups) {
      const neutral = el === 'Neutral';
      const elSeen = neutral || dex.elements.includes(el);
      const ids = pool.filter((id) => shows(id, el));
      if (!ids.length) continue;
      const hy = y;
      if (!neutral) this.anchor(el, hy);
      this.addRow(hy, 30, (row) => {
        if (neutral) {
          const t = text(this, 22, hy + 4, 'NEUTRAL', 12, '#1a1426', { fontStyle: 'bold' });
          row.add(this.add.rectangle(16, hy + 2, t.width + 12, 20, NEUTRAL_COLOR).setOrigin(0));
          row.add(t);
        } else if (elSeen) row.add(typeChip(this, 16, hy + 12, el));
        else row.add(text(this, 16, hy + 2, '??? element', 14, '#4a4068'));
      });
      y += 30;
      for (const id of ids) {
        const m = MOVES[id];
        const seen = dex.moves.includes(id);
        const my = y;
        this.addRow(my, 38, (row) => {
          row.add(this.add.rectangle(12, my, W - 24, 34, COLORS.panel).setOrigin(0).setStrokeStyle(1, COLORS.stroke));
          if (seen) {
            const kind = kindOf(id);
            row.add(this.add.rectangle(22, my + 17, 8, 8, moveColor(el)));
            row.add(text(this, 34, my + 9, m.name, 14, COLORS.text));
            row.add(text(this, 170, my + 10, kind, 12, COLORS.textDim));
            row.add(text(this, W - 22, my + 10, `${moveSummary(m, 1)} · ${accText(m)}`, 12, COLORS.textDim).setOrigin(1, 0));
          } else {
            row.add(text(this, 34, my + 9, '???', 14, '#4a4068'));
          }
        });
        y += 38;
      }
      y += 12;
    }
    if (!this.rows.length) {
      this.addRow(8, 80, (row) => row.add(text(this, W / 2, 40, 'Nothing matches. Try another name, element or filter.', 14, COLORS.textDim, { align: 'center', wordWrap: { width: W - 60 } }).setOrigin(0.5)));
      y = 96;
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
