import Phaser from 'phaser';
import { TIER_POWER } from '../data/moves';
import { ELEMENT_COLORS } from '../data/types';
import { canEvolve, creatureName, evolve, levelCap, moveDef, species, stats, xpToNext, type Creature } from '../logic/creature';
import { allCreatures, BENCH_MAX, TEAM_MAX } from '../logic/run';
import { state } from '../state';
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
  }

  create() {
    const run = state.run!;
    background(this);
    text(this, 16, 14, 'Your Creatures', 24, '#ffc94d', { fontStyle: 'bold' });
    button(this, W - 60, 30, 100, 42, 'Map ▶', () => this.scene.start('Map'), { color: 0x3b6d4a, fontSize: 17 });
    text(this, 16, 50, 'Tap one creature, then another to swap them.', 12, COLORS.textDim);

    const rowW = W - 32;
    text(this, 16, 70, `Main team  ${run.team.length}/${TEAM_MAX}`, 15, COLORS.text);
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
    text(this, W - 18, y0 + 10, `Stage ${c.stage + 1}/3`, 13, COLORS.textDim).setOrigin(1, 0);
    const xpLine = c.level >= cap ? 'MAX (evolve or prestige to raise)' : `XP ${c.xp}/${xpToNext(c.level)}`;
    text(this, 18, y0 + 32, `Lv ${c.level}/${cap}  ·  ${xpLine}`, 12, COLORS.textDim);
    text(this, 18, y0 + 50, `HP ${s.hp}  ATK ${s.atk}  DEF ${s.def}  SPD ${s.spd}`, 13, COLORS.text);
    c.moves.forEach((m, i) => {
      const d = moveDef(m);
      const x = 18 + (i % 2) * 210;
      const y = y0 + 72 + Math.floor(i / 2) * 20;
      this.add.rectangle(x, y + 7, 8, 8, ELEMENT_COLORS[d.element]).setOrigin(0, 0.5);
      text(this, x + 12, y, `${d.name} ${Math.round(d.power * TIER_POWER[m.tier])} T${m.tier}`, 12, COLORS.text);
    });
    const next = c.stage < 2 ? `Evolves into ${sp.names[c.stage + 1]}` : 'Final form';
    text(this, 18, y0 + 116, next, 12, '#8e86ad');

    const bx = 70;
    const by = y0 + 168;
    const stoneOk = run.evoStones > 0 && canEvolve(c) && c.level >= cap;
    button(
      this,
      bx,
      by,
      120,
      36,
      'Evolve ◆',
      () => {
        run.evoStones -= 1;
        const from = creatureName(c);
        evolve(c);
        showMessage(this, 'Evolution!', `${from} evolved into ${creatureName(c)}!`, () => this.scene.restart({ selected: this.selected }));
      },
      { enabled: stoneOk, fontSize: 15, color: 0x5b3c8a },
    );
    const ref = this.selected!;
    const canMove = ref.list === 'team' ? run.bench.length < BENCH_MAX && run.team.length > 1 : run.team.length < TEAM_MAX;
    button(
      this,
      bx + 130,
      by,
      130,
      36,
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
      bx + 260,
      by,
      110,
      36,
      'Release',
      () =>
        openPicker(this, {
          title: `Release ${creatureName(c)}?`,
          subtitle: 'It will leave your party for good.',
          options: [{ label: 'Release', color: 0x8a2c2c }],
          onPick: () => {
            run[ref.list].splice(ref.i, 1);
            if (run.team.length === 0 && run.bench.length) run.team.push(run.bench.shift()!);
            this.scene.restart({ selected: null });
          },
          onCancel: () => {},
        }),
      { enabled: allCreatures(run).length > 1, fontSize: 15, color: 0x5a2a2a },
    );
    if (!stoneOk && run.evoStones > 0 && canEvolve(c))
      text(this, 18, y0 + 132, 'Reach the level cap to use an Evolution Stone.', 11, '#ffc94d');
  }
}
