import Phaser from 'phaser';
import { SPECIES_BY_ID } from '../data/species';
import { ELEMENT_COLORS, ELEMENTS, elementTextColor, type Element } from '../data/types';
import { activeTeamIndex, ARENA_TEAM, arenaForms, arenaRoster, defaultArenaMoves, loadoutsFor, savedTeams, validArenaTeam } from '../logic/arena';
import { saveMeta } from '../logic/run';
import { state } from '../state';
import { playMusic } from '../ui/sound';
import { ensureCreatureTexture, SPRITE_FIT } from '../ui/sprites';
import { background, button, COLORS, FONT, text, W } from '../ui/widgets';

const GRID_TOP = 214;
const CELL_W = (W - 24) / 3;
const CELL_H = 118;

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
  private dragged = false;

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
    playMusic('title');
    const fixedFrom = this.children.list.length;

    button(this, 40, 28, 64, 36, '', () => this.back(), { fontSize: 15, glyph: 'back' });
    text(this, W / 2 + 20, 16, 'Choose a creature', 24, '#ffc94d', { fontStyle: 'bold' }).setOrigin(0.5, 0);
    text(this, W / 2 + 20, 46, 'Creatures you have caught · most evolved form you have seen', 11, COLORS.textDim).setOrigin(0.5, 0);
    // The search box is a real text field laid over the canvas (so the phone keyboard works).
    this.add.rectangle(16, 66, W - 32, 38, 0x0f0c18).setOrigin(0).setStrokeStyle(2, COLORS.stroke);
    this.makeSearchBox();

    this.chips = this.add.container(0, 0);
    this.drawChips();
    this.countText = text(this, 16, 192, '', 12, COLORS.textDim);
    button(this, W - 54, 198, 84, 24, 'Clear', () => {
      this.query = '';
      this.elements = [];
      if (this.input$) this.input$.value = '';
      this.drawChips();
      this.drawGrid();
    }, { fontSize: 12 });

    // Fixed header above the scrolling grid.
    this.children.list.slice(fixedFrom).forEach((o) => (o as unknown as Phaser.GameObjects.Components.Depth).setDepth(3));
    this.add.rectangle(0, 0, W, GRID_TOP - 6, COLORS.bg).setOrigin(0).setDepth(2);
    this.grid = this.add.container(0, 0).setDepth(1);
    this.drawGrid();

    // Drag to scroll; a drag isn't a tap.
    let startY = 0;
    this.input.on('pointerdown', (p: Phaser.Input.Pointer) => {
      this.dragged = false;
      startY = p.y;
    });
    this.input.on('pointermove', (p: Phaser.Input.Pointer) => {
      if (!p.isDown || p.y < this.toScreen(GRID_TOP)) return;
      if (Math.abs(p.y - startY) > 8) this.dragged = true;
      const minY = Math.min(0, 800 - this.gridBottom);
      this.grid.y = Phaser.Math.Clamp(this.grid.y + (p.y - p.prevPosition.y) / this.cameras.main.zoom, minY, 0);
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

  private makeSearchBox() {
    const el = document.createElement('input');
    el.type = 'search';
    el.placeholder = 'Search by name…';
    el.value = this.query;
    el.autocomplete = 'off';
    Object.assign(el.style, {
      position: 'fixed',
      border: 'none',
      outline: 'none',
      background: 'transparent',
      color: '#f0eaff',
      fontFamily: FONT,
      padding: '0 10px',
      zIndex: '10',
    } as CSSStyleDeclaration);
    const place = () => {
      const r = this.game.canvas.getBoundingClientRect();
      const k = r.width / W;
      Object.assign(el.style, {
        left: `${r.left + 18 * k}px`,
        top: `${r.top + 68 * k}px`,
        width: `${(W - 36) * k}px`,
        height: `${34 * k}px`,
        fontSize: `${Math.round(16 * k)}px`,
      });
    };
    place();
    el.addEventListener('input', () => {
      this.query = el.value;
      this.drawGrid();
    });
    window.addEventListener('resize', place);
    window.addEventListener('game-layout', place);
    this.events.once('shutdown', () => {
      window.removeEventListener('resize', place);
      window.removeEventListener('game-layout', place);
    });
    document.body.appendChild(el);
    this.input$ = el;
  }

  /** Element filter chips: tap to toggle; several can be on at once. */
  private drawChips() {
    this.chips.removeAll(true);
    const cw = (W - 32 - 5 * 6) / 6;
    ELEMENTS.forEach((el, i) => {
      const on = this.elements.includes(el);
      const x = 16 + (i % 6) * (cw + 6);
      const y = 112 + Math.floor(i / 6) * 34;
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
    this.countText.setText(`${list.length} creature${list.length === 1 ? '' : 's'}${filters ? ` matching ${filters}` : ''}`);
    if (!list.length) {
      this.grid.add(text(this, W / 2, GRID_TOP + 40, 'Nothing matches. Try another name or element.', 14, COLORS.textDim).setOrigin(0.5, 0));
    }
    list.forEach((id, i) => {
      const sp = SPECIES_BY_ID[id];
      const forms = arenaForms(meta, id);
      const stage = forms[forms.length - 1];
      const x = 12 + (i % 3) * CELL_W;
      const y = GRID_TOP + Math.floor(i / 3) * CELL_H;
      const inTeam = taken.includes(id);
      const bg = this.add.rectangle(x + 3, y, CELL_W - 6, CELL_H - 8, COLORS.panel).setOrigin(0).setStrokeStyle(2, COLORS.stroke);
      this.grid.add(bg);
      const img = this.add.image(x + CELL_W / 2, y + 40, ensureCreatureTexture(this, id, stage)).setScale(1.9 * SPRITE_FIT);
      this.grid.add(img);
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
        if (!this.dragged) this.choose(id, stage);
      });
    });
    this.gridBottom = GRID_TOP + Math.ceil(list.length / 3) * CELL_H + 10;
  }

  private choose(speciesId: string, stage: number) {
    const meta = state.meta;
    const t = savedTeams(meta)[activeTeamIndex(meta)];
    const picks = validArenaTeam(meta, t.picks);
    const slot = Math.min(this.slot, picks.length, ARENA_TEAM - 1);
    picks[slot] = { speciesId, stage, moves: defaultArenaMoves(speciesId, stage) };
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

