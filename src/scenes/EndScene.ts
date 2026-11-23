import { SPECIES_BY_ID } from '../data/species';
import Phaser from 'phaser';
import { workshopProgress } from '../logic/workshop';
import { huntRewardLines, nextHuntMilestone } from '../logic/huntMilestones';
import { camp, payRunBond, payRunEmbers } from '../logic/camp';
import { BOONS } from '../data/boons';
import { takeNewMilestones } from '../logic/gilded';
import { takeNewTitles } from '../logic/titles';
import { unlocksOf } from '../logic/cosmetics';
import { finishRunClock, formatDuration } from '../logic/runClock';
import { recordWeekly, TWISTS, weeklyRecord } from '../logic/run';
import { ACHIEVEMENTS } from '../logic/achievements';
import { allCreatures, clearSavedRun, dailyRecord, describeDaily, HUNT_MAX_STARS, HUNT_SHINY_IN, huntShinyIn, noteHunt, recordDaily, recordRun, runMvp, saveMeta, startHunt } from '../logic/run';
import { persist, state } from '../state';
import { type Creature } from '../logic/creature';
import { hasLoadout, saveLoadout } from '../logic/arena';
import { MOVES } from '../data/moves';
import { MAP_BY_ID } from '../data/maps';
import { openPicker } from '../ui/picker';
import { playMusic, sfx } from '../ui/sound';
import { ensureCreatureTexture, SPRITE_FIT } from '../ui/sprites';
import { background, button, COLORS, LANDSCAPE, text, W } from '../ui/widgets';

/** Runs whose daily result is already recorded (so re-laying out the screen doesn't count it twice). */
const recordedRuns = new WeakSet<object>();
const historyRuns = new WeakSet<object>();

/** End of a run: what happened, who carried the team, who made it and who didn't. */
/** Gilded Hunt odds for wild Hexlings at a Heat: "1 in 12", "5 in 12", "9 in 12". */
const oddsText = (heat: number) => `${Math.round(HUNT_SHINY_IN.wild / huntShinyIn(heat).wild)} in ${HUNT_SHINY_IN.wild}`;

export class EndScene extends Phaser.Scene {
  /** This win was your fastest yet. */
  private newBest = false;
  constructor() {
    super('End');
  }

  create(data: { won: boolean; byDefault?: boolean }) {
    // Online races (stage battle, battle royale): no end screen. Stay on the map and watch the
    // others still climbing until the final duel or the bracket.
    const r = state.run;
    if (r?.race) {
      r.race.done ??= { won: data.won, byDefault: data.byDefault };
      if (data.won) sfx.victory();
      else sfx.defeat();
      const msg = data.won
        ? data.byDefault
          ? r.race.royale
            ? 'Every other team was wiped out. You’re the last trainer standing!'
            : `${r.race.opponent}’s team was wiped out. The stage is yours!`
          : r.race.royale
            ? 'You reached the boss! Watch the others while they finish.'
            : `You reached the boss! Watch ${r.race.opponent} while they finish.`
        : 'Your team fell. You can still watch the others climb.';
      this.scene.start('Map', { banner: msg });
      return;
    }
    background(this);
    playMusic(data.won ? 'win' : 'lose');
    if (data.won) sfx.victory();
    else sfx.defeat();
    const run = state.run!;
    clearSavedRun(run);
    // History, streaks and most-used Hexlings: once per run (the screen re-lays out when the phone turns).
    // A Shiny Hunt was already recorded as a won run when it began; just keep the hunt's bests.
    const hunt = run.hunt;
    if (!historyRuns.has(run)) {
      historyRuns.add(run);
      if (hunt) {
        noteHunt(state.meta, hunt.depth, run.heat ?? 0);
        state.meta.bestHuntShinies = Math.max(state.meta.bestHuntShinies ?? 0, hunt.shinies);
        saveMeta(state.meta);
      } else {
        this.newBest = finishRunClock(state.meta, run, data.won);
        recordRun(run, data.won);
      }
    }
    const sprite = (x: number, y: number, speciesId: string, stage: number, scale: number) =>
      this.add.image(x, y, ensureCreatureTexture(this, speciesId, stage)).setScale(scale * SPRITE_FIT);

    const race = run.race;
    const title = hunt ? 'HUNT OVER' : race ? (data.won ? 'STAGE CLEARED' : 'STAGE LOST') : data.won ? 'VICTORY!' : 'RUN OVER';
    const sub = hunt
      ? `Your team fell on Gilded Hunt floor ${hunt.depth}. ${hunt.shinies} gilded Hexling${hunt.shinies === 1 ? '' : 's'} caught on the hunt.`
      : race
      ? data.won
        ? data.byDefault
          ? race.royale
            ? 'Every other team was wiped out before the boss. You\u2019re the last trainer standing!'
            : `${race.opponent}\u2019s team was wiped out before the boss. The stage is yours!`
          : race.royale
            ? 'You reached the boss. Next: the tournament bracket against the other survivors!'
            : `You reached the boss. Your team now faces ${race.opponent}!`
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
      hunt ? ['Hunt floor', String(hunt.depth)] : race ? ['Stage', data.won ? 'Cleared' : 'Lost'] : ['Floors cleared', String(data.won ? 3 : run.floor)],
      ...((hunt || race
        ? [
            ['Caught', String(run.log.caught)],
            ['Lost', String(run.log.lost)],
          ]
        : [
            ['Caught · lost', `${run.log.caught} · ${run.log.lost}`],
            ['Run time', `${formatDuration(run.playMs ?? 0)}${this.newBest ? ' ★ best' : ''}`],
          ]) as [string, string][]),
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
    if (run.weekly && run.twist) {
      const best = recordedRuns.has(run) ? false : recordWeekly(run, data.won);
      recordedRuns.add(run);
      const rec = weeklyRecord(state.meta, run.weekly);
      extra.push(`Weekly ${TWISTS[run.twist].name}: ${best ? 'new best!' : `best this week: ${describeDaily(rec.best!)}`} (attempt ${rec.attempts})`);
    }
    if (run.unlockedThisRun.length) extra.push(`New starters: ${run.unlockedThisRun.join(', ')}`);
    const earned = state.meta.newAchievements.splice(0);
    if (earned.length) {
      saveMeta(state.meta);
      extra.push(`Achievements: ${earned.map((id) => ACHIEVEMENTS.find((a) => a.id === id)!.name).join(', ')}`);
    }
    const milestones = takeNewMilestones(state.meta);
    if (milestones.length) {
      saveMeta(state.meta);
      extra.push(`Gilded milestone: ${milestones.map((m) => m.title ?? `${m.count} Gilded`).join(', ')} (new outfit pieces)`);
    }
    // Embers (2.0): every run pays some, win or lose (races and dailies too).
    if (!race || !data.won) {
      const em = payRunEmbers(state.meta, run, data.won);
      saveMeta(state.meta);
      const have = camp(state.meta).embers;
      // The next goal: the cheapest Workshop upgrade still to build.
      const next = workshopProgress(state.meta).next;
      const goal = next ? (have >= next.cost ? ` · ready to build ${next.name} in the Workshop` : ` · ${have}/${next.cost} to ${next.name}`) : '';
      if (em.total) extra.unshift(`Embers +${em.total} (${em.lines.join(', ')}) · ${have} at camp${goal}`);
    }
    // Camp bond (2.0): every run builds it with the Hexlings who came along (races and dailies too).
    const bond = payRunBond(state.meta, run, data.won);
    if (bond.length) {
      saveMeta(state.meta);
      const shown = bond.slice(0, 3).map((b) => `${SPECIES_BY_ID[b.speciesId].names[0]} +${b.points}${b.after > b.before ? ` (new ${'♥'.repeat(b.after)})` : ''}`);
      const more = bond.length > 3 ? ` +${bond.length - 3} more` : '';
      extra.push(`Camp bond: ${shown.join(', ')}${more}`);
    }
    // Gilded Hunt (2.0): the next milestone to dive for.
    if (hunt) {
      const nm = nextHuntMilestone(state.meta);
      extra.push(`Next Gilded Hunt milestone: floor ${nm.floor} (${huntRewardLines(nm).join(', ')})`);
    }
    // The boons this run was built on.
    const held = run.boons?.held ?? [];
    if (held.length) extra.unshift(`Boons: ${held.map((id) => `${BOONS[id].rarity === 'curse' ? '☠ ' : BOONS[id].rarity === 'mythic' ? '✦ ' : ''}${BOONS[id].name}`).join(', ')}`);
    const titles = takeNewTitles(state.meta);
    if (titles.length || milestones.length) saveMeta(state.meta);
    if (titles.length) {
      const u = unlocksOf(titles);
      extra.push(`New title${titles.length > 1 ? 's' : ''}: ${titles.map((t) => t.name).join(', ')}${u ? ` · unlocks ${u}` : ''} (Edit trainer)`);
    }
    const huntRoom = data.won && !run.daily && !run.weekly && !hunt && !run.race;
    if (extra.length && y < (LANDSCAPE ? (run.race ? 290 : huntRoom ? 262 : 310) : run.race ? 610 : huntRoom ? 594 : 640)) {
      text(this, cx0 + colW / 2, y + 4, extra.join('\n'), 13, '#8fe08a', { align: 'center', wordWrap: { width: colW - 8 }, lineSpacing: 4 }).setOrigin(0.5, 0);
    }

    // Keep a good creature: save its form and moves for the team builder.
    const alive = allCreatures(run).filter((c) => c.hp > 0);
    // Won a normal run: keep climbing as a Shiny Hunt.
    const canHunt = data.won && !run.daily && !run.weekly && !hunt;
    if (canHunt) {
      const hb = button(this, LANDSCAPE ? cx0 + colW / 2 : W / 2, LANDSCAPE ? 296 : 630, 320, 52, 'Gilded Hunt', () => this.confirmHunt(run), {
        fontSize: 20,
        color: 0x7a5a1c,
        glyph: 'sparkle',
        badge: 'ENDLESS',
        sub: 'Keep climbing · gilded Hexlings everywhere',
      });
      this.tweens.add({ targets: hb, scale: 1.04, yoyo: true, repeat: -1, duration: 700, ease: 'Sine.easeInOut' });
    }
    if (alive.length) {
      const label = `${hunt ? `Hunt ${hunt.depth}` : data.won ? 'Win' : `Floor ${run.floor + 1}`} · ${MAP_BY_ID[run.mapId]?.name ?? run.map.biome}`;
      button(this, LANDSCAPE ? cx0 + colW / 2 : W / 2, LANDSCAPE ? 352 : 692, 320, 44, 'Save a loadout', () => this.saveLoadouts(alive, label), {
        fontSize: 16,
        color: 0x2f4a6b,
        glyph: 'star',
        sub: 'Keep its form and moves for the team builder',
      });
    }
    // Run again (2.0): straight back to the starter pick on the same map (normal runs only).
    const again = !run.race && !run.daily && !run.weekly && !hunt;
    const bx = LANDSCAPE ? cx0 + colW / 2 : W / 2;
    const by = LANDSCAPE ? 410 : 756;
    const bw = again ? 150 : 260;
    button(this, again ? bx - 80 : bx, by, bw, 52, 'Back to camp', () => {
      state.run = null;
      this.scene.start('Camp', {});
    }, { color: 0x3b6d4a, fontSize: again ? 16 : 20 });
    if (again) {
      const mapId = run.mapId;
      button(this, bx + 80, by, bw, 52, 'Run again', () => {
        state.run = null;
        this.scene.start('Starter', { mapId });
      }, { color: 0x5b3c8a, fontSize: 16, glyph: 'play' });
    }
  }

  /** Explain Shiny Hunting, then start it: the run continues on endless floors. */
  private confirmHunt(run: NonNullable<typeof state.run>) {
    openPicker(this, {
      title: 'Gilded Hunt',
      subtitle:
        'Your win is already counted. Keep climbing with this team through endless floors of random elements.\n\n' +
        `• Gilded Hexlings are everywhere: about ${oddsText(run.heat ?? 0)} wild Hexlings${run.heat ? ` (Heat ${run.heat} bonus)` : ''}, and trainers' and guardians' Hexlings can be gilded too.\n` +
        '• Your team is fully healed to start, and your Hexlings can reach their full level cap.\n' +
        `• Enemies are final forms that grow every floor, with higher levels than yours and up to ${HUNT_MAX_STARS}★.\n` +
        '• It ends when your team falls. How deep can you go?',
      options: [{ label: 'Start the hunt', color: 0x7a5a1c, glyph: 'sparkle' }],
      onPick: () => {
        const el = startHunt(run);
        persist();
        this.scene.start('Map', { banner: `The Gilded Hunt begins in the ${el} lands. Your team is fully healed.` });
      },
      onCancel: () => {},
    });
  }

  /** Pick survivors to save as loadouts (several can be saved; saved ones are marked). */
  private saveLoadouts(survivors: Creature[], label: string) {
    const meta = state.meta;
    openPicker(this, {
      title: 'Save a loadout',
      subtitle: 'Its form and moves are saved. In the team builder, open this Hexling and tap Loadouts to use them.',
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
}
