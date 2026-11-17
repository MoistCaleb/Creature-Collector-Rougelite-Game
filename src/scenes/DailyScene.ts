import Phaser from 'phaser';
import { SPECIES_BY_ID } from '../data/species';
import { clearSavedRun, dailyPlayed, dailyStarters, describeDaily, hasSavedRun, todayUtc } from '../logic/run';
import { state } from '../state';
import { openPicker } from '../ui/picker';
import { playMusic } from '../ui/sound';
import { background, button, COLORS, text, W } from '../ui/widgets';

/** The first day you can go back to. */
const FIRST_DAY = '2026-01-01';
const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
const WEEKDAYS = ['S', 'M', 'T', 'W', 'T', 'F', 'S'];

const ymd = (y: number, m: number, d: number) => `${y}-${String(m + 1).padStart(2, '0')}-${String(d).padStart(2, '0')}`;

/**
 * Daily runs calendar: today's run plus every past day's. Each day has its own fixed starters and
 * map (the same for everyone), and your best result per day is marked.
 */
export class DailyScene extends Phaser.Scene {
  private year = 0;
  private month = 0;

  constructor() {
    super('Daily');
  }

  init(data: { year?: number; month?: number }) {
    const [ty, tm] = todayUtc().split('-').map(Number);
    this.year = data.year ?? ty;
    this.month = data.month ?? tm - 1;
  }

  create() {
    background(this);
    playMusic('title');
    const today = todayUtc();
    const meta = state.meta;
    button(this, 40, 28, 64, 36, '', () => this.scene.start('Title', {}), { fontSize: 15, glyph: 'back' });
    text(this, W / 2 + 20, 16, 'Daily runs', 26, '#ffc94d', { fontStyle: 'bold' }).setOrigin(0.5, 0);
    text(this, W / 2 + 20, 50, 'A new run every day, the same for everyone.\nPlay today’s or go back to any day you missed.', 12, COLORS.textDim, { align: 'center' }).setOrigin(0.5, 0);

    // Month header with arrows.
    const first = FIRST_DAY.split('-').map(Number);
    const [ty, tm] = today.split('-').map(Number);
    const canPrev = this.year > first[0] || (this.year === first[0] && this.month > first[1] - 1);
    const canNext = this.year < ty || (this.year === ty && this.month < tm - 1);
    const go = (dm: number) => {
      const d = new Date(Date.UTC(this.year, this.month + dm, 1));
      this.scene.restart({ year: d.getUTCFullYear(), month: d.getUTCMonth() });
    };
    button(this, 40, 112, 56, 40, '‹', () => go(-1), { fontSize: 22, enabled: canPrev });
    button(this, W - 40, 112, 56, 40, '›', () => go(1), { fontSize: 22, enabled: canNext });
    text(this, W / 2, 112, `${MONTHS[this.month]} ${this.year}`, 20, COLORS.text, { fontStyle: 'bold' }).setOrigin(0.5);

    // Weekday labels and the day grid.
    const cw = (W - 24) / 7;
    const ch = 70;
    const top = 160;
    WEEKDAYS.forEach((d, i) => text(this, 12 + cw * i + cw / 2, top, d, 12, COLORS.textDim).setOrigin(0.5, 0));
    const startDow = new Date(Date.UTC(this.year, this.month, 1)).getUTCDay();
    const days = new Date(Date.UTC(this.year, this.month + 1, 0)).getUTCDate();
    let played = 0;
    let won = 0;
    for (let d = 1; d <= days; d++) {
      const date = ymd(this.year, this.month, d);
      const cell = startDow + d - 1;
      const x = 12 + (cell % 7) * cw;
      const y = top + 22 + Math.floor(cell / 7) * ch;
      const future = date > today;
      const tooOld = date < FIRST_DAY;
      const rec = dailyPlayed(meta, date);
      if (rec) played++;
      if (rec?.best?.won) won++;
      const isToday = date === today;
      const bg = this.add
        .rectangle(x + 2, y, cw - 4, ch - 6, future || tooOld ? 0x15121e : rec ? 0x1f3a2a : COLORS.panel)
        .setOrigin(0)
        .setStrokeStyle(2, isToday ? COLORS.accent : COLORS.stroke, isToday ? 1 : 0.6);
      text(this, x + cw / 2, y + 8, String(d), 16, future || tooOld ? '#4a4068' : COLORS.text, { fontStyle: isToday ? 'bold' : 'normal' }).setOrigin(0.5, 0);
      if (isToday) text(this, x + cw / 2, y + ch - 22, 'TODAY', 9, '#ffc94d', { fontStyle: 'bold' }).setOrigin(0.5, 0);
      else if (rec?.best) text(this, x + cw / 2, y + ch - 24, rec.best.won ? 'WON' : `F${rec.best.floor + 1}`, 10, rec.best.won ? '#ffc94d' : '#8fe08a', { fontStyle: 'bold' }).setOrigin(0.5, 0);
      if (future || tooOld) continue;
      bg.setInteractive({ useHandCursor: true }).on('pointerup', () => this.pickDay(date));
    }
    text(this, W / 2, 640, `This month: ${played} played${won ? ` · ${won} won` : ''}`, 14, COLORS.textDim).setOrigin(0.5, 0);
    if (!(this.year === ty && this.month === tm - 1)) {
      button(this, W / 2, 700, 200, 44, 'Back to today', () => this.scene.restart({}), { fontSize: 15 });
    } else {
      button(this, W / 2, 700, 260, 52, 'Play today’s run', () => this.pickDay(today), { fontSize: 18, color: 0x2f4a6b, glyph: 'calendar' });
    }
  }

  private pickDay(date: string) {
    const rec = dailyPlayed(state.meta, date);
    const starters = dailyStarters(date).map((id) => SPECIES_BY_ID[id].names[0]).join(', ');
    const [y, m, d] = date.split('-').map(Number);
    const when = date === todayUtc() ? 'Today' : `${MONTHS[m - 1]} ${d}, ${y}`;
    openPicker(this, {
      title: `Daily run · ${when}`,
      subtitle: `Starters: ${starters}\nNo passives, Heat 0.\n${rec?.best ? `Your best: ${describeDaily(rec.best)} (${rec.attempts} attempt${rec.attempts === 1 ? '' : 's'})` : 'Not played yet.'}`,
      options: [{ label: rec ? 'Play again' : 'Play', color: 0x3b6d4a, glyph: 'play' }],
      onPick: () => this.play(date),
      onCancel: () => {},
    });
  }

  private play(date: string) {
    const go = () => this.scene.start('Starter', { daily: date });
    if (!hasSavedRun()) return go();
    openPicker(this, {
      title: 'Abandon your run?',
      subtitle: 'Starting a daily run ends your current run.',
      options: [{ label: 'Abandon and play the daily', color: 0x8a2c2c }],
      onPick: () => {
        clearSavedRun();
        go();
      },
      onCancel: () => {},
    });
  }
}
