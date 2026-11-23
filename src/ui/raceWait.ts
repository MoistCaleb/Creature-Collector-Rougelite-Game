import type Phaser from 'phaser';
import { titleNews } from '../logic/cosmetics';
import { potionHeal, raceTeam, saveMeta, type Run } from '../logic/run';
import { addOnlineLoss, addOnlineWin, addRoyaleWin } from '../logic/titles';
import { duel, endRace, leaveDuelRoyale, raceVerdict, sendProgress } from '../net/runtime';
import { climbsToWatch, countRoyaleLoss, royale, royaleQuit, royaleSummary, watchClimb } from '../net/royale';
import { myPid, session } from '../net/session';
import { state } from '../state';
import { openPicker, showMessage } from './picker';
import { playMusic } from './sound';
import { button, text } from './widgets';

/**
 * The end of your part of an online race (stage battle or battle royale): hand in your finished
 * team once, then a panel says what's happening while the others are still climbing, until the
 * final duel or the bracket starts (or it's decided without one).
 */

/** Runs whose finished team was already handed in. */
const handedIn = new WeakSet<object>();
/** Title news for a race won without a final duel, once per race. */
const winNews = new WeakMap<object, string>();

function handIn(run: Run, won: boolean) {
  if (handedIn.has(run)) return;
  handedIn.add(run);
  const team = raceTeam(run).map((c) => JSON.parse(JSON.stringify(c)) as typeof c);
  sendProgress({ floor: run.floor, finished: true, won, team, potions: run.potions ?? 0, heal: potionHeal(run), boons: run.boons?.held ?? [] });
}

/** Stage battles whose result (win or loss) is already counted. */
const counted = new WeakSet<object>();

/** Count a stage battle's result once (from the final duel, or decided without one). Returns title news for a win. */
export function countStage(run: Run | null, won: boolean): string {
  if (run && counted.has(run)) return run ? (winNews.get(run) ?? '') : '';
  if (run) counted.add(run);
  let news = '';
  if (won) news = titleNews(addOnlineWin(state.meta)).replace(/^\n+/, '\n');
  else addOnlineLoss(state.meta);
  if (run && won) winNews.set(run, news);
  saveMeta(state.meta);
  return news;
}

const stageWinNews = (run: Run) => countStage(run, true);

function royaleWinNews(): string {
  if (royale.winCounted) return '';
  royale.winCounted = true;
  const news = titleNews(addRoyaleWin(state.meta, royale.players.length)).replace(/^\n+/, '\n');
  saveMeta(state.meta);
  return news;
}

export interface WaitBox {
  x: number;
  y: number;
  w: number;
  h: number;
  depth?: number;
}

/** Draw the panel in `box` and keep it up to date until the scene closes. */
export function raceWaitPanel(scene: Phaser.Scene, run: Run, won: boolean, box: WaitBox) {
  handIn(run, won);
  playMusic('showdown');
  const depth = box.depth ?? 0;
  scene.add.rectangle(box.x, box.y, box.w, box.h, 0x14223a, 0.95).setOrigin(0).setStrokeStyle(2, 0x8fd0ff, 0.8).setDepth(depth).setInteractive();
  const status = text(scene, box.x + box.w / 2, box.y + 10, '', 13, '#8fd0ff', { align: 'center', wordWrap: { width: box.w - 24 } }).setOrigin(0.5, 0).setDepth(depth);
  let btn: Phaser.GameObjects.Container | null = null;
  let label = '';
  // Out of a battle royale with others still climbing: a second button to watch their battles.
  let watchBtn: Phaser.GameObjects.Container | null = null;
  let watchLabel = '';
  const setButton = (l: string | null, onClick: () => void = () => {}, force = false) => {
    if (label === (l ?? '') && !force) return;
    label = l ?? '';
    btn?.destroy();
    const half = !!watchBtn;
    const w = half ? Math.min(200, (box.w - 36) / 2) : Math.min(280, box.w - 24);
    const x = half ? box.x + box.w / 2 + w / 2 + 6 : box.x + box.w / 2;
    btn = l ? button(scene, x, box.y + box.h - 28, w, 40, l, onClick, { color: 0x3b6d4a, fontSize: 16 }).setDepth(depth) : null;
  };
  /** Show (n > 0) or hide the watch button. True if it appeared or went away (the other button moves). */
  const setWatch = (n: number, onClick: () => void): boolean => {
    const l = n ? `Watch a battle (${n})` : '';
    if (watchLabel === l) return false;
    const moved = !watchLabel !== !l;
    watchLabel = l;
    watchBtn?.destroy();
    const w = Math.min(200, (box.w - 36) / 2);
    watchBtn = l ? button(scene, box.x + box.w / 2 - w / 2 - 6, box.y + box.h - 28, w, 40, l, onClick, { color: 0x2a4a7a, fontSize: 15, glyph: 'swords' }).setDepth(depth) : null;
    return moved;
  };
  const toLobby = () => {
    state.run = null;
    scene.scene.start(session.connected ? 'Duel' : 'Title', {});
  };

  if (run.race?.royale) {
    let toBracket = false;
    const leave = (confirm: boolean) => () => {
      // The host is everyone's link: leaving early ends it for all.
      if (confirm && session.role === 'host') return showMessage(scene, 'End the battle royale?', 'You’re the host, so leaving ends it for everyone.', () => (leaveDuelRoyale(), royale.reset(), toLobby()));
      if (confirm) {
        countRoyaleLoss();
        royaleQuit();
      }
      royale.reset();
      toLobby();
    };
    const draw = () => {
      if (!status.active) return;
      if (royale.ended) {
        status.setText(royale.ended);
        setButton('Back to the lobby', leave(false));
      } else if (royale.champion === myPid && !royale.bracket) {
        status.setText(`You’re the last trainer standing. You win the battle royale!${royaleWinNews()}`);
        setButton('Back to the lobby', leave(false));
      } else if (royale.bracket || royale.champion) {
        status.setText('Everyone’s done. The tournament bracket is set!');
        setButton(null);
        // (Unless your own first match has already taken over the screen.)
        if (!toBracket && !royale.match) {
          toBracket = true;
          scene.time.delayedCall(1400, () => !royale.match && scene.scene.isActive() && scene.scene.start('Bracket', {}));
        }
      } else {
        if (!won) countRoyaleLoss();
        status.setText(`${won ? 'Your team is ready for the bracket.' : 'Your team fell, but you can watch the bracket.'} Watching the others climb: ${royaleSummary()}`);
        // Out during the climb (3 or more players): watch any battle still going on.
        const moved = setWatch(won ? 0 : climbsToWatch().length, () => pickClimb());
        setButton(won ? 'Give up the battle royale' : 'Leave', leave(true), moved);
        return;
      }
      if (setWatch(0, () => {}) && label) setButton(label, leave(false), true);
    };
    const pickClimb = () => {
      const list = climbsToWatch();
      if (!list.length) return draw();
      openPicker(scene, {
        title: 'Watch a battle',
        subtitle: 'Battles going on right now on the others’ climbs.',
        options: list.map((c) => ({ label: c.name, sub: 'In a battle', glyph: 'swords' })),
        onPick: (i) => watchClimb(list[i].pid),
        onCancel: () => {},
      });
    };
    draw();
    const prev = royale.onChange;
    royale.onChange = () => (prev?.(), draw());
    scene.events.once('shutdown', () => (royale.onChange = null));
    return;
  }

  const opp = run.race!.opponent;
  const done = (l: string) =>
    setButton(l, () => {
      // Leaving before it's decided gives it up.
      const v = raceVerdict();
      if (v !== 'win' && v !== 'draw') countStage(run, false);
      endRace();
      toLobby();
    });
  const draw = () => {
    if (!status.active) return;
    const them = duel.race?.theirs;
    const verdict = raceVerdict();
    if (!session.connected && verdict !== 'win' && verdict !== 'lose' && verdict !== 'draw') {
      status.setText(`Lost the connection to ${opp}. If they come back, the final duel still happens.`);
      done('Leave the stage battle');
    } else if (!verdict) {
      const where = them ? (them.finished ? 'done' : them.steps !== undefined ? `${them.steps} steps to go` : 'on the way') : 'starting';
      status.setText(`${won ? 'Your team is ready.' : 'Your team fell.'} Watching ${opp} climb (${where})…`);
      done(won ? 'Give up the stage battle' : 'Leave');
    } else if (verdict === 'duel') {
      status.setText(`${opp} is done too. The final duel is starting…`);
      setButton(null);
    } else {
      status.setText(
        verdict === 'win'
          ? `${opp} has no team left. You win the stage battle!${stageWinNews(run)}`
          : verdict === 'lose'
            ? (countStage(run, false), `You have no team left, so ${opp} wins the stage battle.`)
            : 'Neither of you has a team left. It’s a draw.',
      );
      done('Done');
    }
  };
  draw();
  const prev = duel.onRaceChange;
  duel.onRaceChange = () => (prev?.(), draw());
  scene.events.once('shutdown', () => (duel.onRaceChange = null));
}
