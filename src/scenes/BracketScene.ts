import Phaser from 'phaser';
import { knockedOut, roundName, type Bracket } from '../logic/bracket';
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
import { trainerFx } from '../ui/trainerFx';
import { ensureTrainerTexture } from '../ui/trainerSprite';
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
    if (b) this.drawBracket(b, top, bottom, width);
    if (champ) this.drawChampion(champ, b ? bottom + 70 : (top + bottom) / 2);

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

  /** The bracket: a column per round, matches spread evenly, lines to the next round. */
  private drawBracket(b: Bracket, top: number, bottom: number, width: number) {
    const R = b.rounds.length;
    const colW = (width - 24) / R;
    const boxW = Math.min(colW - 18, 220);
    const boxH = 40;
    // Drawn first, so the match boxes sit over the line ends.
    const lines = this.add.graphics().lineStyle(2, 0x5a5480, 1);
    const head = 18;
    const centers: { x: number; y: number }[][] = [];
    b.rounds.forEach((round, r) => {
      const cx = 12 + colW * r + colW / 2;
      text(this, cx, top - head, roundName(b, r), 12, COLORS.textDim, { fontStyle: 'bold' }).setOrigin(0.5, 0);
      const slot = (bottom - top) / round.length;
      centers.push(
        round.map((m, i) => {
          const cy = top + slot * i + slot / 2;
          this.drawMatch(cx, cy, boxW, boxH, m.a, m.b, m.winner, !!m.bye, r === 0);
          return { x: cx, y: cy };
        }),
      );
    });
    // Connectors from each pair of matches to the one they feed.
    for (let r = 0; r + 1 < R; r++) {
      centers[r].forEach((c, i) => {
        const to = centers[r + 1][Math.floor(i / 2)];
        const x0 = c.x + boxW / 2;
        const xm = (x0 + to.x - boxW / 2) / 2;
        lines.lineBetween(x0, c.y, xm, c.y);
        lines.lineBetween(xm, c.y, xm, to.y);
        lines.lineBetween(xm, to.y, to.x - boxW / 2, to.y);
      });
    }
  }

  private drawMatch(cx: number, cy: number, w: number, h: number, a: string | null, b: string | null, winner: string | undefined, bye: boolean, firstRound: boolean) {
    const mine = a === myPid || b === myPid;
    const live = !!a && !!b && !winner;
    this.add.rectangle(cx, cy, w, h, live ? 0x2a2a48 : COLORS.panel).setStrokeStyle(2, mine ? COLORS.accent : live ? 0x8fd0ff : COLORS.stroke);
    const row = (pid: string | null, dy: number) => {
      const won = !!winner && pid === winner;
      const lost = !!winner && !!pid && pid !== winner;
      const label = pid ? this.nameOf(pid) : bye && firstRound ? 'bye' : '?';
      const t = text(this, cx - w / 2 + 8, cy + dy, label, 12, won ? '#ffc94d' : pid === myPid ? '#8fe08a' : pid ? COLORS.text : COLORS.textDim, {
        fontStyle: won ? 'bold' : 'normal',
      }).setOrigin(0, 0.5);
      if (lost) t.setAlpha(0.4);
      if (t.width > w - 26) t.setScale((w - 26) / t.width);
      if (won) text(this, cx + w / 2 - 6, cy + dy, '✓', 12, '#ffc94d').setOrigin(1, 0.5);
    };
    row(a, -h / 4);
    row(b, h / 4);
    this.add.rectangle(cx, cy, w - 8, 1, COLORS.stroke);
  }

  /** The champion's trainer, effects and all, with their name. */
  private drawChampion(pid: string, y: number) {
    const p = royale.players.find((x) => x.pid === pid);
    const look = p?.look ?? lookForName(p?.name ?? 'Champion');
    const x = LANDSCAPE ? W - 80 : W / 2;
    const cy = LANDSCAPE ? H / 2 - 10 : y - 30;
    const img = this.add.image(x, cy, ensureTrainerTexture(this, look, 'command')).setScale(2.4).setDepth(5);
    trainerFx(this, img, look);
    text(this, x, cy + 48, `${p?.name ?? 'Champion'} · CHAMPION`, 14, '#ffc94d', { fontStyle: 'bold' }).setOrigin(0.5, 0).setDepth(5);
    this.tweens.add({ targets: img, y: cy - 4, yoyo: true, repeat: -1, duration: 600, ease: 'Sine.easeInOut' });
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
