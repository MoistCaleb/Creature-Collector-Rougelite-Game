import Phaser from 'phaser';
import { ACHIEVEMENTS } from '../logic/achievements';
import { allCreatures, clearSavedRun, dailyRecord, describeDaily, recordDaily, runMvp, saveMeta } from '../logic/run';
import { state } from '../state';
import { isAlive, type Creature } from '../logic/creature';
import { hasLoadout, saveLoadout } from '../logic/arena';
import { MOVES } from '../data/moves';
import { MAP_BY_ID } from '../data/maps';
import { openPicker } from '../ui/picker';
import { duel, endRace, raceVerdict, sendProgress } from '../net/runtime';
import { session } from '../net/session';
import { playMusic, sfx } from '../ui/sound';
import { ensureCreatureTexture, SPRITE_FIT } from '../ui/sprites';
import { background, button, COLORS, LANDSCAPE, text, W } from '../ui/widgets';

/** Runs whose daily result is already recorded (so re-laying out the screen doesn't count it twice). */
const recordedRuns = new WeakSet<object>();

/** End of a run: what happened, who carried the team, who made it and who didn't. */
export class EndScene extends Phaser.Scene {
  constructor() {
    super('End');
  }

  create(data: { won: boolean }) {
    background(this);
    playMusic(data.won ? 'title' : null);
    if (data.won) sfx.victory();
    else sfx.defeat();
    const run = state.run!;
    clearSavedRun();
    const sprite = (x: number, y: number, speciesId: string, stage: number, scale: number) =>
      this.add.image(x, y, ensureCreatureTexture(this, speciesId, stage)).setScale(scale * SPRITE_FIT);

    const race = run.race;
    const title = race ? (data.won ? 'STAGE CLEARED' : 'STAGE LOST') : data.won ? 'VICTORY!' : 'RUN OVER';
    const sub = race
      ? data.won
        ? `You reached the boss. Your team now faces ${race.opponent}!`
        : `Your team fell in the ${run.map.biome} lands before reaching the boss.`
      : data.won
        ? `${run.map.biome} lands conquered. All three floors cleared.`
        : `Fell on floor ${run.floor + 1}, in the ${run.map.biome} lands.`;
    text(this, W / 2, LANDSCAPE ? 28 : 46, title, race ? 34 : 40, data.won ? '#ffc94d' : '#e0524a', { fontStyle: 'bold' }).setOrigin(0.5);
    text(
      this,
      W / 2,
      LANDSCAPE ? 54 : 86,
      sub + (run.heat ? `  ·  Heat ${run.heat}` : ''),
      15,
      COLORS.textDim,
      { align: 'center', wordWrap: { width: W - 40 } },
    ).setOrigin(0.5, 0);

    // Upright: one column. Sideways: the summary on the left, who made it (and the buttons) on the right.
    let y = LANDSCAPE ? 84 : 118;
    let cx0 = 16;
    const colW = LANDSCAPE ? (W - 48) / 2 : W - 32;
    const card = (h: number, stroke: number) => this.add.rectangle(cx0, y, colW, h, COLORS.panel).setOrigin(0).setStrokeStyle(2, stroke, 0.8);

    // What ended the run.
    const ended = run.log.endedBy;
    if (!data.won && ended) {
      card(64, 0xe0524a);
      sprite(52, y + 30, ended.speciesId, ended.stage, 2.2).setFlipX(true);
      text(this, 92, y + 12, 'Defeated by', 12, '#ff8a7a', { fontStyle: 'bold' });
      text(this, 92, y + 30, ended.label, 16, COLORS.text, { wordWrap: { width: colW - 98 } });
      y += 76;
    }

    // MVP: the creature that dealt the most damage.
    const mvp = runMvp(run);
    if (mvp && mvp.dealt > 0) {
      card(92, 0xffc94d);
      sprite(64, y + 42, mvp.speciesId, mvp.stage, 2.6);
      text(this, 112, y + 12, '★ MVP', 13, '#ffc94d', { fontStyle: 'bold' });
      text(this, 112, y + 30, `${mvp.name}  Lv ${mvp.level}${mvp.fallen ? '  (fallen)' : ''}`, 18, COLORS.text, { fontStyle: 'bold' });
      text(this, 112, y + 58, `${mvp.dealt.toLocaleString()} damage · ${mvp.kos} knockout${mvp.kos === 1 ? '' : 's'}`, 14, COLORS.textDim);
      y += 104;
    }

    // Numbers, two columns.
    const totalDamage = [...allCreatures(run), ...(run.log.fallen ?? [])].reduce((n, c) => n + (c.dealt ?? 0), 0);
    const stats: [string, string][] = [
      ['Battles won', String(run.log.battlesWon)],
      race ? ['Stage', data.won ? 'Cleared' : 'Lost'] : ['Floors cleared', String(data.won ? 3 : run.floor)],
      ['Caught', String(run.log.caught)],
      ['Lost', String(run.log.lost)],
      ['Coins earned', String(run.log.coins ?? 0)],
      ['Damage dealt', totalDamage.toLocaleString()],
    ];
    const halfW = colW / 2;
    stats.forEach(([label, value], i) => {
      const x = cx0 + (i % 2) * halfW;
      const yy = y + Math.floor(i / 2) * 44;
      this.add.rectangle(x + 4, yy, halfW - 8, 38, COLORS.panelLight).setOrigin(0);
      text(this, x + 14, yy + 19, label, 13, COLORS.textDim).setOrigin(0, 0.5);
      text(this, x + halfW - 16, yy + 19, value, 17, COLORS.text, { fontStyle: 'bold' }).setOrigin(1, 0.5);
    });
    y += 3 * 44 + 10;
    if (LANDSCAPE) {
      cx0 = 32 + colW;
      y = 84;
    }

    // Who made it, and who didn't.
    const roster = (title: string, list: { speciesId: string; stage: number; level: number }[], dim: boolean) => {
      if (!list.length) return;
      text(this, cx0 + 4, y, title, 15, dim ? '#ff8a7a' : '#ffc94d', { fontStyle: 'bold' });
      y += 24;
      const per = 7;
      const cell = colW / per;
      list.slice(0, per * 2).forEach((c, i) => {
        const x = cx0 + cell / 2 + (i % per) * cell;
        const yy = y + Math.floor(i / per) * 62 + 22;
        const img = sprite(x, yy, c.speciesId, c.stage, 1.6);
        if (dim) img.setTint(0xa49ac0).setAlpha(0.75);
        text(this, x, yy + 26, `Lv${c.level}`, 11, COLORS.textDim).setOrigin(0.5);
      });
      if (list.length > per * 2) text(this, cx0 + colW - 4, y - 22, `+${list.length - per * 2} more`, 12, COLORS.textDim).setOrigin(1, 0);
      y += Math.ceil(Math.min(list.length, per * 2) / per) * 62 + 6;
    };
    const survivors = allCreatures(run);
    roster(data.won ? 'Champions' : 'Survivors', survivors, false);
    roster('Fallen', run.log.fallen ?? [], true);

    const extra: string[] = [];
    if (run.daily) {
      // Record once per run (the screen lays itself out again when the phone turns).
      const best = recordedRuns.has(run) ? false : recordDaily(run, data.won);
      recordedRuns.add(run);
      const rec = dailyRecord(state.meta, run.daily);
      extra.push(`Daily ${run.daily}: ${best ? 'new best!' : `best today: ${describeDaily(rec.best!)}`} (attempt ${rec.attempts})`);
    }
    if (run.unlockedThisRun.length) extra.push(`New starters: ${run.unlockedThisRun.join(', ')}`);
    const earned = state.meta.newAchievements.splice(0);
    if (earned.length) {
      saveMeta(state.meta);
      extra.push(`Achievements: ${earned.map((id) => ACHIEVEMENTS.find((a) => a.id === id)!.name).join(', ')}`);
    }
    if (extra.length && y < (LANDSCAPE ? (run.race ? 290 : 310) : run.race ? 610 : 640)) {
      text(this, cx0 + colW / 2, y + 4, extra.join('\n'), 13, '#8fe08a', { align: 'center', wordWrap: { width: colW - 8 }, lineSpacing: 4 }).setOrigin(0.5, 0);
    }

    if (run.race) return this.raceFinish(run, data.won);
    // Keep a good creature: save its form and moves for the team builder.
    const alive = allCreatures(run).filter((c) => c.hp > 0);
    if (alive.length) {
      const label = `${data.won ? 'Win' : `Floor ${run.floor + 1}`} · ${MAP_BY_ID[run.mapId]?.name ?? run.map.biome}`;
      button(this, LANDSCAPE ? cx0 + colW / 2 : W / 2, LANDSCAPE ? 352 : 692, 320, 44, 'Save a loadout', () => this.saveLoadouts(alive, label), {
        fontSize: 16,
        color: 0x2f4a6b,
        glyph: 'star',
        sub: 'Keep its form and moves for the team builder',
      });
    }
    button(this, LANDSCAPE ? cx0 + colW / 2 : W / 2, LANDSCAPE ? 410 : 756, 260, 52, 'Back to title', () => {
      state.run = null;
      this.scene.start('Title', {});
    }, { color: 0x3b6d4a, fontSize: 20 });
  }

  /** Pick survivors to save as loadouts (several can be saved; saved ones are marked). */
  private saveLoadouts(survivors: Creature[], label: string) {
    const meta = state.meta;
    openPicker(this, {
      title: 'Save a loadout',
      subtitle: 'Its form and moves are saved. In the team builder, open this creature and tap Loadouts to use them.',
      options: survivors.map((c) => ({
        creature: c,
        disabled: hasLoadout(meta, c),
        note: hasLoadout(meta, c) ? 'Saved ✓' : c.moves.map((m) => MOVES[m.id].name).join(', '),
      })),
      onPick: (k) => {
        saveLoadout(meta, survivors[k], label);
        saveMeta(meta);
        sfx.coin();
        this.saveLoadouts(survivors, label);
      },
      onCancel: () => {},
      cancelLabel: 'Done',
    });
  }

  /** Stage race: hand in the finished team and wait for the other racer; the final duel starts itself. */
  private raceFinish(run: NonNullable<typeof state.run>, won: boolean) {
    const team = run.team.filter(isAlive).map((c) => JSON.parse(JSON.stringify(c)) as typeof c);
    sendProgress({ floor: run.floor, finished: true, won, team });
    const opp = run.race!.opponent;
    // Upright: under the summary. Sideways: at the bottom of the right column.
    const bx = LANDSCAPE ? 32 + (W - 48) / 2 : 16;
    const bw = LANDSCAPE ? (W - 48) / 2 : W - 32;
    const by = LANDSCAPE ? 300 : 640;
    this.add.rectangle(bx, by, bw, 76, 0x14223a).setOrigin(0).setStrokeStyle(2, 0x8fd0ff, 0.8);
    const status = text(this, bx + bw / 2, by + 12, '', 15, '#8fd0ff', { align: 'center', wordWrap: { width: bw - 28 } }).setOrigin(0.5, 0);
    let leave: Phaser.GameObjects.Container | null = null;
    const finish = (label: string) => {
      leave?.destroy();
      leave = button(this, bx + bw / 2, LANDSCAPE ? 412 : 752, 260, 56, label, () => {
        endRace();
        state.run = null;
        this.scene.start(session.connected ? 'Duel' : 'Title', {});
      }, { color: 0x3b6d4a, fontSize: 20 });
    };
    const draw = () => {
      if (!status.active) return;
      const them = duel.race?.theirs;
      const verdict = raceVerdict();
      if (!session.connected && verdict !== 'win' && verdict !== 'lose' && verdict !== 'draw') {
        status.setText(`Lost the connection to ${opp}. If they come back, the final duel still happens.`);
        finish('Leave the stage battle');
      } else if (!verdict) {
        status.setText(`Stage battle vs ${opp}: waiting for them to reach the boss (${them ? (them.finished ? 'done' : them.steps !== undefined ? `${them.steps} steps to go` : 'on the way') : 'starting'})…\nYour team is ready.`);
        finish('Give up the stage battle');
      } else if (verdict === 'duel') {
        status.setText(`${opp} is done too. The final duel is starting…`);
        leave?.destroy();
      } else {
        status.setText(
          verdict === 'win'
            ? `${opp} has no team left. You win the stage battle!`
            : verdict === 'lose'
              ? `You have no team left, so ${opp} wins the stage battle.`
              : 'Neither of you has a team left. It\u2019s a draw.',
        );
        finish('Done');
      }
    };
    draw();
    duel.onRaceChange = draw;
    this.events.once('shutdown', () => {
      if (duel.onRaceChange === draw) duel.onRaceChange = null;
    });
  }
}
