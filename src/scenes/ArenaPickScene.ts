import Phaser from 'phaser';
import { Scroller } from '../ui/scroll';
import { SPECIES_BY_ID } from '../data/species';
import { ELEMENT_COLORS, ELEMENTS, elementTextColor, type Element } from '../data/types';
import { activeTeamIndex, ARENA_TEAM, arenaForms, arenaRoster, defaultArenaMoves, loadoutsFor, savedTeams, validArenaTeam, ownsShiny } from '../logic/arena';
import { saveMeta } from '../logic/run';
import { state } from '../state';
import { playMusic } from '../ui/sound';
import { ensureCreatureTexture, SPRITE_FIT } from '../ui/sprites';
import { background, button, clipList, COLORS, H, LANDSCAPE, text, W } from '../ui/widgets';
import { searchBox } from '../ui/searchBox';

const CELL_H = 118;
/**
 * Upright: search and filters on top, a 3-column grid below. Sideways: search and filters in a
 * left column, a 4-column grid scrolling on the right.
 */
const G = () =>
  LANDSCAPE
    ? { top: 12, x: 300, cols: 4, cell: (W - 312) / 4, side: 288 }
    : { top: 214, x: 12, cols: 3, cell: (W - 24) / 3, side: W };

/** Search text and element filters survive leaving and coming back. */
let lastQuery = '';
let lastElements: Element[] = [];

/**
 * Choose a creature for an Arena team slot: search by name (any of its forms), filter by
 * element (pick several), tap one to put it in the slot and open the editor.
 */
export class ArenaPickScene extends Phaser.Scene {
  private slot = 0;
  private query = '';
  private elements: Element[] = [];
  private grid!: Phaser.GameObjects.Container;
  private countText!: Phaser.GameObjects.Text;
  private chips!: Phaser.GameObjects.Container;
  private input$: HTMLInputElement | null = null;
  private scroller: Scroller | null = null;

  constructor() {
    super('ArenaPick');
  }

  init(data: { slot?: number }) {
    this.slot = data.slot ?? 0;
    this.query = lastQuery;
    this.elements = [...lastElements];
  }

  create() {
    background(this);
    playMusic('arena');
    const fixedFrom = this.children.list.length;

    button(this, 40, 28, 64, 36, '', () => this.back(), { fontSize: 15, glyph: 'back' });
    const g = G();
    const hx = LANDSCAPE ? g.side / 2 + 20 : W / 2 + 20;
    if (LANDSCAPE) text(this, 80, 14, 'Choose a Hexling', 20, '#ffc94d', { fontStyle: 'bold' });
    else text(this, hx, 16, 'Choose a Hexling', 24, '#ffc94d', { fontStyle: 'bold' }).setOrigin(0.5, 0);
    text(this, LANDSCAPE ? 16 : hx, 46, 'Hexlings you have caught · most evolved form you have seen', 11, COLORS.textDim, { wordWrap: { width: g.side - 32 } }).setOrigin(LANDSCAPE ? 0 : 0.5, 0);
    // The search box is a real text field laid over the canvas (so the phone keyboard works).
    this.add.rectangle(16, 66 + this.dy(), g.side - 32, 38, 0x0f0c18).setOrigin(0).setStrokeStyle(2, COLORS.stroke);
    this.makeSearchBox();

    this.chips = this.add.container(0, 0);
    this.drawChips();
    this.countText = text(this, 16, LANDSCAPE ? 240 : 192, '', 12, COLORS.textDim, { wordWrap: { width: g.side - 110 } });
    button(this, g.side - 54, LANDSCAPE ? 246 : 198, 84, 24, 'Clear', () => {
      this.query = '';
      this.elements = [];
      if (this.input$) this.input$.value = '';
      this.drawChips();
      this.drawGrid();
    }, { fontSize: 12 });

    // Fixed header above the scrolling grid.
    this.children.list.slice(fixedFrom).forEach((o) => (o as unknown as Phaser.GameObjects.Components.Depth).setDepth(3));
    if (LANDSCAPE) this.add.rectangle(0, 0, g.x - 6, H, COLORS.bg).setOrigin(0).setDepth(2);
    else this.add.rectangle(0, 0, W, g.top - 6, COLORS.bg).setOrigin(0).setDepth(2);
    this.grid = this.add.container(0, 0).setDepth(1);
    clipList(this, this.grid, LANDSCAPE ? 0 : g.top - 6);
    this.drawGrid();

    // Drag (or the mouse wheel) to scroll the grid; a drag isn't a tap.
    this.scroller = new Scroller(this, {
      get: () => this.grid.y,
      set: (v) => {
        this.grid.setY(v);
        this.buildVisible();
      },
      min: () => Math.min(0, H - this.gridBottom),
      max: () => 0,
      area: (p) => (LANDSCAPE ? p.x >= this.toScreen(g.x) : p.y >= this.toScreen(g.top)),
    });
    this.events.once('shutdown', () => {
      lastQuery = this.query;
      lastElements = [...this.elements];
      this.input$?.remove();
      this.input$ = null;
    });
  }

  private toScreen(y: number) {
    return y * this.cameras.main.zoom;
  }

  /** Sideways the header sits a little lower (the subtitle wraps). */
  private dy() {
    return LANDSCAPE ? 14 : 0;
  }

  private makeSearchBox() {
    this.input$ = searchBox(this, 18, 68 + this.dy(), G().side - 36, 34, {
      value: this.query,
      onInput: (v) => {
        this.query = v;
        this.drawGrid();
      },
    });
  }

  /** Element filter chips: tap to toggle; several can be on at once. */
  private drawChips() {
    this.chips.removeAll(true);
    const per = LANDSCAPE ? 4 : 6;
    const cw = (G().side - 32 - (per - 1) * 6) / per;
    ELEMENTS.forEach((el, i) => {
      const on = this.elements.includes(el);
      const x = 16 + (i % per) * (cw + 6);
      const y = 112 + this.dy() + Math.floor(i / per) * 34;
      const r = this.add.rectangle(x, y, cw, 28, ELEMENT_COLORS[el], on ? 1 : 0.25).setOrigin(0).setStrokeStyle(2, on ? 0xffffff : COLORS.stroke, on ? 0.9 : 0.6);
      r.setInteractive({ useHandCursor: true }).on('pointerup', () => {
        this.elements = on ? this.elements.filter((e) => e !== el) : [...this.elements, el];
        this.drawChips();
        this.drawGrid();
      });
      this.chips.add(r);
      this.chips.add(text(this, x + cw / 2, y + 14, el.toUpperCase(), 10, on ? elementTextColor(el) : COLORS.text, { fontStyle: 'bold' }).setOrigin(0.5));
    });
  }

  private gridBottom = 0;

  private drawGrid() {
    this.grid.removeAll(true);
    this.grid.y = 0;
    const meta = state.meta;
    const team = validArenaTeam(meta, savedTeams(meta)[activeTeamIndex(meta)].picks);
    const taken = team.filter((_, k) => k !== this.slot).map((p) => p.speciesId);
    const q = this.query.trim().toLowerCase();
    const list = arenaRoster(meta).filter((id) => {
      const sp = SPECIES_BY_ID[id];
      if (q && !sp.names.some((n) => n.toLowerCase().includes(q))) return false;
      if (this.elements.length && !sp.types.some((t) => this.elements.includes(t))) return false;
      return true;
    });
    const filters = [q ? `"${this.query.trim()}"` : '', this.elements.length ? this.elements.join(' / ') : ''].filter(Boolean).join(' · ');
    this.countText.setText(`${list.length} Hexling${list.length === 1 ? '' : 's'}${filters ? ` matching ${filters}` : ''}`);
    if (!list.length) {
      this.grid.add(text(this, G().x + (W - G().x) / 2, G().top + 40, 'Nothing matches. Try another name or element.', 14, COLORS.textDim).setOrigin(0.5, 0));
    }
    // Cards are built a row at a time as they scroll into view (a big roster opens instantly).
    this.cells = list;
    this.taken = taken;
    this.builtRows = new Set();
    this.gridBottom = G().top + Math.ceil(list.length / G().cols) * CELL_H + 10;
    this.buildVisible();
  }

  private cells: string[] = [];
  private taken: string[] = [];
  private builtRows = new Set<number>();

  /** Build the rows within a screen of the view that aren't built yet. */
  private buildVisible() {
    const g = G();
    const rows = Math.ceil(this.cells.length / g.cols);
    const from = Math.max(0, Math.floor((-this.grid.y - g.top) / CELL_H) - 1);
    const to = Math.min(rows - 1, Math.ceil((-this.grid.y + H - g.top) / CELL_H) + 1);
    for (let r = from; r <= to; r++) {
      if (this.builtRows.has(r)) continue;
      this.builtRows.add(r);
      for (let i = r * g.cols; i < Math.min(this.cells.length, (r + 1) * g.cols); i++) this.drawCell(this.cells[i], i);
    }
  }

  private drawCell(id: string, i: number) {
    const meta = state.meta;
    const taken = this.taken;
    const sp = SPECIES_BY_ID[id];
    const forms = arenaForms(meta, id);
    const stage = forms[forms.length - 1];
    const g = G();
    const CELL_W = g.cell;
    const x = g.x + (i % g.cols) * CELL_W;
    const y = g.top + Math.floor(i / g.cols) * CELL_H;
    const inTeam = taken.includes(id);
    const bg = this.add.rectangle(x + 3, y, CELL_W - 6, CELL_H - 8, COLORS.panel).setOrigin(0).setStrokeStyle(2, COLORS.stroke);
    this.grid.add(bg);
    const shiny = ownsShiny(meta, id);
    const img = this.add.image(x + CELL_W / 2, y + 40, ensureCreatureTexture(this, id, stage, shiny)).setScale(1.9 * SPRITE_FIT);
    this.grid.add(img);
    if (shiny) this.grid.add(text(this, x + CELL_W - 10, y + 22, '✦ GILDED', 10, '#ffd86b', { fontStyle: 'bold' }).setOrigin(1, 0));
    this.grid.add(text(this, x + CELL_W / 2, y + 68, sp.names[stage], 13, COLORS.text, { fontStyle: 'bold' }).setOrigin(0.5, 0));
    const chips = this.add.container(0, 0);
    typeChipsInto(this, chips, x + CELL_W / 2, y + 96, sp.types);
    this.grid.add(chips);
    const nSaved = loadoutsFor(meta, id).length;
    if (nSaved) this.grid.add(text(this, x + 12, y + 6, `${nSaved} SAVED`, 10, '#c9a3ff', { fontStyle: 'bold' }));
    if (inTeam) {
      [bg, img].forEach((o) => o.setAlpha(0.4));
      this.grid.add(text(this, x + CELL_W - 10, y + 6, 'IN TEAM', 10, '#ffc94d', { fontStyle: 'bold' }).setOrigin(1, 0));
      return;
    }
    bg.setInteractive({ useHandCursor: true }).on('pointerup', () => {
      if (!this.scroller?.moved) this.choose(id, stage);
    });
  }

  private choose(speciesId: string, stage: number) {
    const meta = state.meta;
    const t = savedTeams(meta)[activeTeamIndex(meta)];
    const picks = validArenaTeam(meta, t.picks);
    const slot = Math.min(this.slot, picks.length, ARENA_TEAM - 1);
    // A species you've caught shiny comes in shiny (switch it off in the editor).
    picks[slot] = { speciesId, stage, moves: defaultArenaMoves(speciesId, stage), ...(ownsShiny(state.meta, speciesId) ? { shiny: true } : {}) };
    t.picks = picks;
    saveMeta(meta);
    this.scene.start('ArenaEdit', { slot });
  }

  private back() {
    const meta = state.meta;
    const picks = validArenaTeam(meta, savedTeams(meta)[activeTeamIndex(meta)].picks);
    this.scene.start(picks[this.slot] ? 'ArenaEdit' : 'Arena', { slot: this.slot });
  }
}

/** Small type chips centred on x (one per distinct type). */
function typeChipsInto(scene: Phaser.Scene, into: Phaser.GameObjects.Container, cx: number, y: number, types: readonly Element[]) {
  const unique = types[0] === types[1] ? [types[0]] : [...types];
  const w = 48;
  const gap = 4;
  const total = unique.length * w + (unique.length - 1) * gap;
  unique.forEach((t, i) => {
    const x = cx - total / 2 + i * (w + gap);
    into.add(scene.add.rectangle(x, y, w, 16, ELEMENT_COLORS[t]).setOrigin(0, 0.5));
    into.add(text(scene, x + w / 2, y, t.toUpperCase(), 9, elementTextColor(t), { fontStyle: 'bold' }).setOrigin(0.5));
  });
}

