import Phaser from 'phaser';
import { knockedOut, roundName } from '../logic/bracket';
import { drawBracket, drawChampion } from '../ui/bracketView';
import { addRoyaleWin } from '../logic/titles';
import { saveMeta } from '../logic/run';
import { titleNews } from '../logic/cosmetics';
import { lookForName } from '../data/trainerLook';
import { leaveDuelRoyale } from '../net/runtime';
import { royale, royaleQuit } from '../net/royale';
import { myPid, session } from '../net/session';
import { state } from '../state';
import { showMessage } from '../ui/picker';
import { playMusic, sfx } from '../ui/sound';
import { background, button, COLORS, H, LANDSCAPE, text, W } from '../ui/widgets';

/**
 * Battle royale bracket: every match, who's through, and the champion. Your own matches start
 * from here by themselves (the host sends them); between them you watch the rest play out.
 */
export class BracketScene extends Phaser.Scene {
  constructor() {
    super('Bracket');
  }

  create() {
    background(this);
    playMusic('arena');
    // Not while your match is starting: the battle screen is taking over (a restart here would
    // bring the bracket back on top of it).
    const redraw = () => {
      if (royale.match || !this.scene.isActive()) return;
      this.scene.restart({});
    };
    royale.onChange = redraw;
    this.events.once('shutdown', () => {
      if (royale.onChange === redraw) royale.onChange = null;
    });

    text(this, W / 2, LANDSCAPE ? 8 : 16, 'Battle royale', LANDSCAPE ? 22 : 26, '#ffc94d', { fontStyle: 'bold' }).setOrigin(0.5, 0);
    const status = text(this, W / 2, LANDSCAPE ? 36 : 52, this.statusText(), 13, COLORS.text, { align: 'center', wordWrap: { width: W - 40 } }).setOrigin(0.5, 0);

    const b = royale.bracket;
    const top = status.y + status.height + (LANDSCAPE ? 22 : 30);
    const champ = royale.champion;
    // Room for the champion: a column on the right (sideways) or a strip under the bracket (upright).
    const bottom = H - (LANDSCAPE ? 56 : 70) - (champ && !LANDSCAPE && b ? 120 : 0);
    const width = champ && LANDSCAPE ? W - 160 : W;
    if (b) drawBracket(this, b, { top, bottom, width }, { nameOf: (id) => this.nameOf(id), me: myPid });
    if (champ) {
      const p = royale.players.find((x) => x.pid === champ);
      drawChampion(this, p?.name ?? 'Champion', p?.look ?? lookForName(p?.name ?? 'Champion'), b ? bottom + 70 : (top + bottom) / 2);
    }

    const done = !!royale.champion || !!royale.ended || !session.connected;
    button(this, W / 2, H - (LANDSCAPE ? 28 : 36), 260, LANDSCAPE ? 42 : 48, done ? 'Back to the lobby' : 'Leave the battle royale', () => this.leave(done), {
      color: done ? 0x3b6d4a : 0x5a2a2a,
      fontSize: 16,
    });
  }

  private nameOf(pid: string | null): string {
    if (!pid) return '';
    return royale.players.find((p) => p.pid === pid)?.name ?? 'Player';
  }

  private statusText(): string {
    const b = royale.bracket;
    if (royale.ended) return royale.ended;
    if (!session.connected) return 'Lost the connection to the game.';
    if (royale.champion) {
      if (royale.champion !== myPid) return `${this.nameOf(royale.champion)} wins the battle royale!`;
      let news = '';
      if (!royale.winCounted) {
        royale.winCounted = true;
        news = titleNews(addRoyaleWin(state.meta, royale.players.length)).replace(/^\n+/, ' ');
        saveMeta(state.meta);
        sfx.victory();
      }
      return `You win the battle royale!${news}`;
    }
    if (!b) return 'Setting up the bracket…';
    const inIt = b.rounds[0].some((m) => m.a === myPid || m.b === myPid);
    if (!inIt) return 'Your team fell in the stage, so you’re watching the bracket.';
    if (knockedOut(b, myPid)) return 'You’re out. Watch the rest, or head back to the lobby.';
    // Your next match: who against (or who you're waiting for).
    for (let r = 0; r < b.rounds.length; r++) {
      const i = b.rounds[r].findIndex((m) => (m.a === myPid || m.b === myPid) && !m.winner);
      if (i < 0) continue;
      const m = b.rounds[r][i];
      const opp = m.a === myPid ? m.b : m.a;
      if (opp) return `${roundName(b, r)}: you vs ${this.nameOf(opp)}. Your battle is starting…`;
      // Waiting on the match that decides your opponent.
      const feeder = b.rounds[r - 1]?.[i * 2 + (m.a === myPid ? 1 : 0)];
      const who = feeder && feeder.a && feeder.b ? `${this.nameOf(feeder.a)} vs ${this.nameOf(feeder.b)}` : 'the other match';
      return `You’re through to the ${roundName(b, r)}! Waiting for ${who} to finish.`;
    }
    return 'Waiting…';
  }

  private leave(done: boolean) {
    const go = () => {
      royale.reset();
      state.run = null;
      this.scene.start(session.connected ? 'Duel' : 'Title', {});
    };
    if (done) return go();
    if (session.role === 'host')
      return showMessage(this, 'End the battle royale?', 'You’re the host, so leaving ends it for everyone.', () => {
        leaveDuelRoyale();
        go();
      });
    showMessage(this, 'Leave the battle royale?', 'Any match you still have will count as a loss.', () => {
      royaleQuit();
      go();
    });
  }
}
