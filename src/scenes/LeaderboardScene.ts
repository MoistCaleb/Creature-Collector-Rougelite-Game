import Phaser from 'phaser';
import { BOARDS, showScore } from '../logic/leaderboard';
import { friendsAvailable, loadProfile, myProfile } from '../net/friends';
import { fetchBoard, onLeaderboard, postMyScores, setOnLeaderboard, type BoardRow } from '../net/leaderboard';
import { state } from '../state';
import { openPicker } from '../ui/picker';
import { Scroller } from '../ui/scroll';
import { openSettings } from '../ui/settings';
import { playMusic, sfx } from '../ui/sound';
import { titleBadge } from '../ui/titleBadge';
import { trainerFx } from '../ui/trainerFx';
import { ensureTrainerTexture } from '../ui/trainerSprite';
import { background, button, clipList, COLORS, H, LANDSCAPE, text, W } from '../ui/widgets';

const MEDALS = [0xffc94d, 0xc9d3e0, 0xd08a4a];
const ROW_H = 54;

/** All-time Top 10s: pick a board, everyone or just friends, and see where you stand. */
export class LeaderboardScene extends Phaser.Scene {
  private from = 'Records';
  private board = 0;
  private friendsOnly = false;
  private list!: Phaser.GameObjects.Container;
  private status!: Phaser.GameObjects.Text;
  private scroller: Scroller | null = null;
  private alive = false;
  /** Which fetch is current (a newer one makes older results stale). */
  private ticket = 0;
  private top = 0;

  constructor() {
    super('Leaderboard');
  }

  init(data: { from?: string; board?: number; friendsOnly?: boolean }) {
    this.from = data.from ?? this.from;
    this.board = data.board ?? this.board;
    this.friendsOnly = data.friendsOnly ?? this.friendsOnly;
  }

  create() {
    this.alive = true;
    this.events.once('shutdown', () => (this.alive = false));
    background(this);
    playMusic('title');
    button(this, 40, 28, 64, 36, '', () => this.scene.start(this.from, {}), { fontSize: 15, glyph: 'back' });
    text(this, W / 2, 12, 'Top 10', 26, '#ffc94d', { fontStyle: 'bold' }).setOrigin(0.5, 0);
    text(this, W / 2, 44, 'All-time best of every trainer', 12, COLORS.textDim).setOrigin(0.5, 0);

    if (!friendsAvailable()) {
      text(this, W / 2, 110, 'Sign in to see the leaderboards and get your name on them.', 14, COLORS.textDim, {
        align: 'center',
        wordWrap: { width: W - 60 },
      }).setOrigin(0.5, 0);
      button(this, W / 2, 190, 280, 52, 'Sign in', () => openSettings(this, () => this.scene.restart()), {
        color: 0x3b6d4a,
        fontSize: 18,
        sub: 'Settings › Account & saves',
      });
      return;
    }

    // Board picker: arrows either side, or tap the name for the full list.
    const cw = Math.min(W - 24, 560);
    const cx = W / 2;
    const step = (d: number) => this.scene.restart({ board: (this.board + d + BOARDS.length) % BOARDS.length });
    button(this, cx - cw / 2 + 22, 92, 44, 44, '‹', () => step(-1), { fontSize: 24 });
    button(this, cx + cw / 2 - 22, 92, 44, 44, '›', () => step(1), { fontSize: 24 });
    button(this, cx, 92, cw - 104, 44, BOARDS[this.board].name, () => this.pickBoard(), { fontSize: 17, color: 0x2f4a6b, oneLine: true });

    // Everyone or friends.
    const half = (cw - 104) / 2 - 3;
    const tab = (dx: number, label: string, on: boolean, fo: boolean) =>
      button(this, cx + dx, 140, half, 34, label, () => on || this.scene.restart({ friendsOnly: fo }), {
        fontSize: 14,
        color: on ? 0x8a6a1a : COLORS.panel,
        textColor: on ? '#ffffff' : COLORS.textDim,
      });
    tab(-half / 2 - 3, 'Everyone', !this.friendsOnly, false);
    tab(half / 2 + 3, 'Friends', this.friendsOnly, true);

    this.top = 166;
    this.list = this.add.container(0, this.top);
    clipList(this, this.list, this.top, H);
    this.status = text(this, W / 2, this.top + 30, 'Loading…', 14, COLORS.textDim, { align: 'center', wordWrap: { width: W - 60 } }).setOrigin(0.5, 0);
    void this.fetchBoard();
  }

  private pickBoard() {
    openPicker(this, {
      title: 'Leaderboards',
      options: BOARDS.map((b, i) => ({ label: b.name, color: i === this.board ? 0x8a6a1a : undefined })),
      rowHeight: 48,
      onPick: (i) => i !== this.board && this.scene.restart({ board: i }),
    });
  }

  private async fetchBoard() {
    const ticket = ++this.ticket;
    const board = BOARDS[this.board];
    try {
      if (!myProfile()) await loadProfile();
      // Your latest numbers first, so you see yourself where you really are.
      await postMyScores(state.meta).catch(() => {});
      const [rows, shown] = await Promise.all([fetchBoard(board.id, this.friendsOnly), onLeaderboard()]);
      if (!this.alive || ticket !== this.ticket) return;
      this.draw(rows, shown);
    } catch (e) {
      if (!this.alive || ticket !== this.ticket) return;
      this.status.setText(e instanceof Error ? e.message : 'Couldn’t load the leaderboard.');
    }
  }

  private draw(rows: BoardRow[], shown: boolean) {
    const board = BOARDS[this.board];
    const cw = Math.min(W - 24, 560);
    const x = (W - cw) / 2;
    let y = 0;
    this.status.setText('');
    const top = rows.filter((r) => r.place <= 10);
    const mine = rows.find((r) => r.me && r.place > 10);

    if (!top.length) {
      const note = this.friendsOnly ? 'No one here yet. Play some runs, or add friends!' : 'No one on this board yet. Be the first!';
      this.list.add(text(this, W / 2, y + 20, note, 14, COLORS.textDim, { align: 'center', wordWrap: { width: cw - 20 } }).setOrigin(0.5, 0));
      y += 70;
    }
    for (const r of top) y = this.row(r, x, y, cw, board.show ? showScore(board, r.value) : r.value.toLocaleString());
    if (mine) {
      this.list.add(text(this, W / 2, y + 2, '⋯', 18, COLORS.textDim).setOrigin(0.5, 0));
      y += 26;
      y = this.row(mine, x, y, cw, showScore(board, mine.value));
    }

    // Where you stand, if you're not on the board.
    y += 8;
    const meOnBoard = rows.some((r) => r.me);
    if (!myProfile()) {
      this.list.add(text(this, W / 2, y, 'Pick a trainer name in Friends to get on the boards.', 12, COLORS.textDim, { align: 'center', wordWrap: { width: cw } }).setOrigin(0.5, 0));
      y += 40;
    } else if (!shown) {
      this.list.add(text(this, W / 2, y, 'You’re hidden from the leaderboards.', 12, COLORS.textDim).setOrigin(0.5, 0));
      y += 26;
    } else if (!meOnBoard) {
      const v = board.get(state.meta);
      if (board.low && !v) {
        this.list.add(text(this, W / 2, y, 'Win a run to set your time.', 12, COLORS.textDim).setOrigin(0.5, 0));
        y += 26;
      } else {
      this.list.add(text(this, W / 2, y, `You: ${showScore(board, Math.max(0, v))}${v > 0 ? '' : ' (get going to make the board!)'}`, 12, COLORS.textDim).setOrigin(0.5, 0));
      y += 26;
      }
    }

    // Show or hide yourself.
    if (myProfile()) {
      const label = shown ? 'Hide me from leaderboards' : 'Show me on leaderboards';
      this.list.add(
        button(this, W / 2, y + 22, Math.min(cw, 300), 40, label, () => {
          if (this.scroller?.moved) return;
          void setOnLeaderboard(!shown)
            .then(() => (sfx.click(), this.alive && this.scene.restart()))
            .catch((e: Error) => this.alive && this.status.setText(e.message));
        }, { fontSize: 14, color: COLORS.panel }),
      );
      y += 54;
    }

    const min = Math.min(0, H - this.top - y - 12) + this.top;
    this.scroller = new Scroller(this, { get: () => this.list.y, set: (v) => this.list.setY(v), min: () => min, max: () => this.top });
  }

  private row(r: BoardRow, x: number, y: number, w: number, value: string): number {
    const c = this.list;
    const medal = r.place <= 3 ? MEDALS[r.place - 1] : null;
    c.add(this.add.rectangle(x, y, w, ROW_H, r.me ? 0x2f3f2a : COLORS.panel).setOrigin(0).setStrokeStyle(r.me ? 2 : 1, r.me ? 0x8fe08a : (medal ?? COLORS.stroke), r.me || medal ? 0.9 : 1));
    // Place: a medal for the top three.
    if (medal) c.add(this.add.circle(x + 22, y + ROW_H / 2, 15, medal).setStrokeStyle(2, 0xffffff, 0.5));
    c.add(text(this, x + 22, y + ROW_H / 2, String(r.place), r.place > 99 ? 12 : 16, medal ? '#2a1a08' : COLORS.textDim, { fontStyle: 'bold' }).setOrigin(0.5));
    const img = this.add.image(x + 62, y + ROW_H / 2 + 2, ensureTrainerTexture(this, r.look, 'stand')).setScale(LANDSCAPE ? 1 : 1.05);
    c.add(img);
    trainerFx(this, img, r.look);
    c.add(text(this, x + 88, y + (r.title ? 8 : 17), r.me ? `${r.username} (you)` : r.username, 15, COLORS.text, { fontStyle: 'bold' }));
    if (r.title) c.add(titleBadge(this, x + 88, y + ROW_H - 12, r.title, 10, { maxW: w - 200, originX: 0 }));
    c.add(text(this, x + w - 12, y + ROW_H / 2, value, 17, medal ? '#ffe08a' : COLORS.text, { fontStyle: 'bold' }).setOrigin(1, 0.5));
    return y + ROW_H + 4;
  }
}
