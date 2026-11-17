import Phaser from 'phaser';
import { SPECIES_BY_ID } from '../data/species';
import { TWISTS, twistShort, weekId, weeklyInfo, weeklyPlayed } from '../logic/run';
import { MAP_BY_ID } from '../data/maps';
import { clearSavedRun, dailyPassives, dailyPlayed, dailyStarters, describeDaily, hasSavedRun, PASSIVES, todayUtc } from '../logic/run';
import { state } from '../state';
import { openPicker } from '../ui/picker';
import { playMusic } from '../ui/sound';
import { background, button, COLORS, LANDSCAPE, text, W } from '../ui/widgets';

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
    // Upright: header, calendar, totals and the play button stacked. Sideways: header, totals and
    // play button in a left column, the calendar on the right.
    const wide = LANDSCAPE;
    const hx = wide ? 140 : W / 2 + 20;
    const gx = wide ? 272 : 12;
    const gw = wide ? W - gx - 12 : W - 24;
    text(this, hx, wide ? 66 : 16, 'Daily & weekly', 26, '#ffc94d', { fontStyle: 'bold' }).setOrigin(0.5, 0);
    text(this, hx, wide ? 100 : 50, 'A new run every day, the same for everyone.\nPlay today’s or go back to any day you missed.', 12, COLORS.textDim, { align: 'center', wordWrap: { width: wide ? 240 : W } }).setOrigin(0.5, 0);

    // Month header with arrows.
    const first = FIRST_DAY.split('-').map(Number);
    const [ty, tm] = today.split('-').map(Number);
    const canPrev = this.year > first[0] || (this.year === first[0] && this.month > first[1] - 1);
    const canNext = this.year < ty || (this.year === ty && this.month < tm - 1);
    const go = (dm: number) => {
      const d = new Date(Date.UTC(this.year, this.month + dm, 1));
      this.scene.restart({ year: d.getUTCFullYear(), month: d.getUTCMonth() });
    };
    const my = wide ? 26 : 112;
    button(this, gx + 28, my, 56, wide ? 34 : 40, '‹', () => go(-1), { fontSize: 22, enabled: canPrev });
    button(this, gx + gw - 28, my, 56, wide ? 34 : 40, '›', () => go(1), { fontSize: 22, enabled: canNext });
    text(this, gx + gw / 2, my, `${MONTHS[this.month]} ${this.year}`, 20, COLORS.text, { fontStyle: 'bold' }).setOrigin(0.5);

    // Weekday labels and the day grid.
    const cw = gw / 7;
    const ch = wide ? 62 : 70;
    const top = wide ? 50 : 160;
    WEEKDAYS.forEach((d, i) => text(this, gx + cw * i + cw / 2, top, d, 12, COLORS.textDim).setOrigin(0.5, 0));
    const startDow = new Date(Date.UTC(this.year, this.month, 1)).getUTCDay();
    const days = new Date(Date.UTC(this.year, this.month + 1, 0)).getUTCDate();
    let played = 0;
    let won = 0;
    for (let d = 1; d <= days; d++) {
      const date = ymd(this.year, this.month, d);
      const cell = startDow + d - 1;
      const x = gx + (cell % 7) * cw;
      const y = top + (wide ? 18 : 22) + Math.floor(cell / 7) * ch;
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
    text(this, hx, wide ? 160 : 640, `This month: ${played} played${won ? ` · ${won} won` : ''}`, 14, COLORS.textDim).setOrigin(0.5, 0);
    if (!(this.year === ty && this.month === tm - 1)) {
      button(this, hx, wide ? 220 : 700, 200, 44, 'Back to today', () => this.scene.restart({}), { fontSize: 15 });
    } else {
      button(this, hx, wide ? 220 : 700, wide ? 240 : 260, 52, 'Play today’s run', () => this.pickDay(today), { fontSize: 18, color: 0x2f4a6b, glyph: 'calendar' });
    }

    // This week's challenge: a fixed run with a twist.
    const week = weeklyInfo(weekId());
    const wrec = weeklyPlayed(meta, week.week);
    button(this, hx, wide ? 300 : 758, wide ? 240 : 380, wide ? 64 : 54, `Weekly: ${TWISTS[week.twist].name}`, () => this.pickWeekly(), {
      fontSize: 17,
      color: 0x5a3a7a,
      glyph: 'crown',
      sub: wrec?.best ? `Your best: ${describeDaily(wrec.best)}` : twistShort(week),
    });
  }

  private pickDay(date: string) {
    const rec = dailyPlayed(state.meta, date);
    const pv = dailyPassives(date);
    const starters = dailyStarters(date).map((id) => `${SPECIES_BY_ID[id].names[0]} (${PASSIVES[pv[id]].name})`).join('\n');
    const [y, m, d] = date.split('-').map(Number);
    const when = date === todayUtc() ? 'Today' : `${MONTHS[m - 1]} ${d}, ${y}`;
    openPicker(this, {
      title: `Daily run · ${when}`,
      subtitle: `Starters, each with a passive that suits it:\n${starters}\nHeat 0.\n${rec?.best ? `Your best: ${describeDaily(rec.best)} (${rec.attempts} attempt${rec.attempts === 1 ? '' : 's'})` : 'Not played yet.'}`,
      options: [{ label: rec ? 'Play again' : 'Play', color: 0x3b6d4a, glyph: 'play' }],
      onPick: () => this.play(date),
      onCancel: () => {},
    });
  }

  private pickWeekly() {
    const meta = state.meta;
    const week = weeklyInfo(weekId());
    const rec = weeklyPlayed(meta, week.week);
    const [y, m, d] = week.week.split('-').map(Number);
    const left = 7 - Math.floor((Date.now() - Date.UTC(y, m - 1, d)) / 86400000);
    const starters = week.starters.map((id) => `${SPECIES_BY_ID[id].names[0]} (${PASSIVES[week.passives[id]].name})`).join('\n');
    openPicker(this, {
      title: `Weekly: ${TWISTS[week.twist].name}`,
      subtitle:
        `${TWISTS[week.twist].desc}\n\nWeek of ${MONTHS[m - 1]} ${d} · ${MAP_BY_ID[week.mapId]?.name ?? 'Wildlands'} · Heat 0 · ${left <= 1 ? 'last day!' : `${left} days left`}\n` +
        `Starters:\n${starters}\n` +
        (rec?.best ? `Your best: ${describeDaily(rec.best)} (${rec.attempts} attempt${rec.attempts === 1 ? '' : 's'})` : 'Not played yet.'),
      options: [{ label: rec ? 'Play again' : 'Play', color: 0x3b6d4a, glyph: 'play' }],
      onPick: () => this.go(() => this.scene.start('Starter', { weekly: week.week }), 'Starting the weekly challenge ends your current run.', 'Abandon and play the weekly'),
      onCancel: () => {},
    });
  }

  private go(start: () => void, subtitle: string, label: string) {
    if (!hasSavedRun()) return start();
    openPicker(this, {
      title: 'Abandon your run?',
      subtitle,
      options: [{ label, color: 0x8a2c2c }],
      onPick: () => {
        clearSavedRun();
        start();
      },
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
