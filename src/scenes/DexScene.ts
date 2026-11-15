import Phaser from 'phaser';
import { ALL_MOVE_IDS, MOVES, moveSummary } from '../data/moves';
import { SPECIES } from '../data/species';
import { ELEMENT_COLORS, ELEMENTS, STRONG_AGAINST, type Element } from '../data/types';
import { formName, hasSeenForm } from '../logic/dex';
import { state } from '../state';
import { ensureCreatureTexture, SPRITE_FIT } from '../ui/sprites';
import { background, button, COLORS, H, text, typeChip, W } from '../ui/widgets';

type Tab = 'creatures' | 'moves' | 'elements';
const TOP = 132;

export class DexScene extends Phaser.Scene {
  private from = 'Title';
  private tab: Tab = 'creatures';
  private content!: Phaser.GameObjects.Container;
  private contentH = 0;
  private dragStart = 0;
  private startY = 0;

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
    const maskShape = this.make.graphics({}).fillRect(0, TOP, W, H - TOP);
    this.content.setMask(maskShape.createGeometryMask());

    if (this.tab === 'creatures') this.drawCreatures();
    else if (this.tab === 'moves') this.drawMoves();
    else this.drawElements();

    // Header drawn last so it sits on top.
    this.add.rectangle(0, 0, W, TOP, COLORS.bg).setOrigin(0);
    text(this, 16, 14, 'Creature Dex', 24, '#ffc94d', { fontStyle: 'bold' });
    button(this, W - 56, 30, 92, 40, 'Back', () => this.scene.start(this.from), { fontSize: 16 });
    const totalForms = SPECIES.length * 3;
    text(
      this,
      16,
      48,
      `Forms ${dex.forms.length}/${totalForms}   Caught ${dex.caught.length}/${SPECIES.length}   Moves ${dex.moves.length}/${ALL_MOVE_IDS.length}   Elements ${dex.elements.length}/${ELEMENTS.length}`,
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

    // Drag to scroll
    this.input.on('pointerdown', (p: Phaser.Input.Pointer) => {
      this.dragStart = p.y;
      this.startY = this.content.y;
    });
    this.input.on('pointermove', (p: Phaser.Input.Pointer) => {
      if (!p.isDown) return;
      const min = Math.min(TOP, H - this.contentH - 20);
      this.content.y = Phaser.Math.Clamp(this.startY + p.y - this.dragStart, min, TOP);
    });
    this.input.on('wheel', (_p: unknown, _o: unknown, _dx: number, dy: number) => {
      const min = Math.min(TOP, H - this.contentH - 20);
      this.content.y = Phaser.Math.Clamp(this.content.y - dy, min, TOP);
    });
  }

  private drawCreatures() {
    const dex = state.meta.dex;
    const rowH = 110;
    SPECIES.forEach((sp, i) => {
      const y = i * rowH + 8;
      const anySeen = [0, 1, 2].some((s) => hasSeenForm(dex, sp.id, s));
      this.content.add(this.add.rectangle(12, y, W - 24, rowH - 8, COLORS.panel).setOrigin(0).setStrokeStyle(1, COLORS.stroke));
      this.content.add(text(this, 22, y + 6, `#${String(i + 1).padStart(3, '0')}`, 11, COLORS.textDim));
      if (dex.caught.includes(sp.id)) this.content.add(text(this, W - 24, y + 6, '● Caught', 11, '#8fe08a').setOrigin(1, 0));
      if (anySeen) {
        const t = sp.types;
        (t[0] === t[1] ? [t[0]] : t).forEach((el, k) => this.content.add(typeChip(this, 70 + k * 54, y + 14, el, true)));
      }
      for (let s = 0; s < 3; s++) {
        const cx = 70 + s * 130;
        const cy = y + 54;
        if (hasSeenForm(dex, sp.id, s)) {
          this.content.add(this.add.image(cx, cy, ensureCreatureTexture(this, sp.id, s)).setScale(1.7 * SPRITE_FIT));
        } else {
          this.content.add(this.add.rectangle(cx, cy, 52, 52, 0x15111f).setStrokeStyle(1, COLORS.stroke));
          this.content.add(text(this, cx, cy, '?', 24, '#4a4068', { fontStyle: 'bold' }).setOrigin(0.5));
        }
        this.content.add(text(this, cx, y + 86, formName(dex, sp.id, s), 12, hasSeenForm(dex, sp.id, s) ? COLORS.text : '#4a4068').setOrigin(0.5, 0));
        if (s < 2) this.content.add(text(this, cx + 65, cy, '›', 20, '#4a4068').setOrigin(0.5));
      }
    });
    this.contentH = SPECIES.length * rowH + 16;
  }

  private drawMoves() {
    const dex = state.meta.dex;
    let y = 8;
    for (const el of ELEMENTS) {
      const elSeen = dex.elements.includes(el);
      if (elSeen) this.content.add(typeChip(this, 16, y + 12, el));
      else this.content.add(text(this, 16, y + 2, '??? element', 14, '#4a4068'));
      y += 30;
      const ids = ALL_MOVE_IDS.filter((id) => MOVES[id].element === el);
      for (const id of ids) {
        const m = MOVES[id];
        const seen = dex.moves.includes(id);
        this.content.add(this.add.rectangle(12, y, W - 24, 34, COLORS.panel).setOrigin(0).setStrokeStyle(1, COLORS.stroke));
        if (seen) {
          const kind = m.kind === 'attack' ? 'Attack' : m.kind === 'buff' ? 'Boost' : 'Hinder';
          this.content.add(this.add.rectangle(22, y + 17, 8, 8, ELEMENT_COLORS[el]));
          this.content.add(text(this, 34, y + 9, m.name, 14, COLORS.text));
          this.content.add(text(this, 170, y + 10, kind, 12, COLORS.textDim));
          this.content.add(text(this, W - 22, y + 10, `${moveSummary(m, 1)} · ${m.accuracy}%`, 12, COLORS.textDim).setOrigin(1, 0));
        } else {
          this.content.add(text(this, 34, y + 9, '???', 14, '#4a4068'));
        }
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
      this.content.add(this.add.rectangle(12, y, W - 24, 86, COLORS.panel).setOrigin(0).setStrokeStyle(1, COLORS.stroke));
      if (!dex.elements.includes(el)) {
        this.content.add(text(this, 24, y + 32, '??? Not yet encountered', 15, '#4a4068'));
        return;
      }
      this.content.add(typeChip(this, 24, y + 20, el));
      const weakTo = ELEMENTS.filter((a) => STRONG_AGAINST[a].includes(el));
      this.content.add(text(this, 24, y + 40, `Strong against: ${STRONG_AGAINST[el].map(name).join(', ')}`, 14, '#8fe08a'));
      this.content.add(text(this, 24, y + 60, `Weak to: ${weakTo.map(name).join(', ')}`, 14, '#f08a80'));
    });
    this.contentH = ELEMENTS.length * 96 + 16;
  }
}
