import Phaser from 'phaser';
import { myBuddy } from '../logic/camp';
import { myLook, myName, nameProblem } from '../data/trainerLook';
import { editTrainerName, startFriends } from '../ui/friendsUi';
import { myTitle } from '../logic/titles';
import { GAME_MODES, type GameMode } from '../net/duel';
import {
  blockPlayer,
  claimUsername,
  findPlayer,
  friendsAvailable,
  listFriends,
  loadProfile,
  myProfile,
  normalizeCode,
  pingPresence,
  removeFriend,
  respond,
  sendInvite,
  sendRequest,
  shareLook,
  statusLine,
  type Friend,
} from '../net/friends';
import { session } from '../net/session';
import { duel } from '../net/runtime';
import { state } from '../state';
import { card } from '../ui/accountUi';
import { openPicker, showMessage } from '../ui/picker';
import { Scroller } from '../ui/scroll';
import { openSettings } from '../ui/settings';
import { playMusic, sfx } from '../ui/sound';
import { copyText } from '../ui/textBox';
import { titleBadge } from '../ui/titleBadge';
import { trainerFx } from '../ui/trainerFx';
import { ensureTrainerTexture } from '../ui/trainerSprite';
import { background, button, clipList, COLORS, H, LANDSCAPE, text, W } from '../ui/widgets';

/**
 * Friends: your username and friend code, adding friends, requests, who's online, and invites
 * to your online lobby (hosting one first if you aren't).
 */
export class FriendsScene extends Phaser.Scene {
  private from = 'Title';
  private list!: Phaser.GameObjects.Container;
  private status!: Phaser.GameObjects.Text;
  private friends: Friend[] = [];
  private top = 0;
  private scroller: Scroller | null = null;

  constructor() {
    super('Friends');
  }

  init(data: { from?: string }) {
    this.from = data.from ?? this.from;
  }

  /** False once you've left the screen (async work checks it before drawing). */
  private alive = false;

  create() {
    this.alive = true;
    this.events.once('shutdown', () => (this.alive = false));
    background(this);
    playMusic('title');
    button(this, 40, 28, 64, 36, '', () => this.scene.start(this.from, {}), { fontSize: 15, glyph: 'back' });
    text(this, W / 2, 16, 'Friends', 26, '#ffc94d', { fontStyle: 'bold' }).setOrigin(0.5, 0);
    this.status = text(this, W / 2, 56, '', 13, COLORS.textDim, { align: 'center', wordWrap: { width: W - 40 } }).setOrigin(0.5, 0);

    if (!friendsAvailable()) {
      this.status.setText('Sign in to add friends, see who’s online and invite them to play.');
      button(this, W / 2, 140, 280, 52, 'Sign in', () => openSettings(this, () => this.scene.restart()), { color: 0x3b6d4a, fontSize: 18, sub: 'Settings › Account & saves' });
      return;
    }
    this.status.setText('Loading…');
    void this.fetchFriends();
  }

  private async fetchFriends() {
    try {
      const p = myProfile() ?? (await loadProfile());
      if (!this.alive) return;
      if (!p) return this.pickUsername();
      // Make sure you show as online (and hear invites), even if you only just got your username.
      void startFriends();
      pingPresence();
      void shareLook(myLook(state.meta), myTitle(state.meta) ?? null, myBuddy(state.meta)).catch(() => {});
      this.friends = await listFriends();
      if (!this.alive) return;
      this.draw();
      // Keep "online" fresh while you look.
      this.time.addEvent({
        delay: 30000,
        loop: true,
        callback: async () => {
          try {
            this.friends = await listFriends();
            if (this.alive) this.draw();
          } catch {
            /* try again next time */
          }
        },
      });
    } catch (e) {
      if (this.alive) this.status.setText(e instanceof Error ? e.message : 'Couldn’t load your friends.');
    }
  }

  /**
   * First time here: your trainer name becomes your username. Only when it can't (still the
   * default "Trainer", or someone has it) do you choose one, and that renames your trainer too.
   */
  private async pickUsername() {
    const name = myName(state.meta);
    if (name !== 'Trainer' && !nameProblem(name)) {
      try {
        await claimUsername(name);
        if (this.alive) this.scene.restart();
        return;
      } catch (e) {
        if (!this.alive) return;
        return this.chooseName(e instanceof Error ? `“${name}” can’t be your username: ${e.message}` : undefined);
      }
    }
    this.chooseName(name === 'Trainer' ? 'Give your trainer a name. It’s also your username: friends find you by it.' : undefined);
  }

  private chooseName(why?: string) {
    this.status.setText('Choose your trainer name to get started.');
    editTrainerName({
      title: 'Your trainer name',
      body: `${why ?? 'Your trainer name is your username: friends find you by it.'}\n\n3 to 16 letters, numbers, spaces, _ - or .`,
      onDone: () => this.scene.restart(),
      onCancel: () => this.scene.start(this.from, {}),
    });
  }

  private draw() {
    const p = myProfile()!;
    this.list?.destroy();
    this.children.list.filter((o) => o.getData?.('mine')).forEach((o) => o.destroy());
    const mine = (o: Phaser.GameObjects.GameObject) => o.setData('mine', true);
    const online = this.friends.filter((f) => f.status === 'accepted' && f.online).length;
    const total = this.friends.filter((f) => f.status === 'accepted').length;
    this.status.setText(total ? `${online} of ${total} friend${total === 1 ? '' : 's'} online` : 'No friends yet. Add one with their friend code.');

    // You: your name and friend code (tap to copy), and Add a friend.
    const bw = LANDSCAPE ? 300 : (W - 36) / 2;
    const y = 104;
    mine(
      button(this, W / 2 - bw / 2 - 6, y, bw, 52, p.username, () => this.myCode(), { color: 0x2f4a6b, fontSize: 16, sub: `${p.friendCode} · tap to share` }),
    );
    mine(button(this, W / 2 + bw / 2 + 6, y, bw, 52, 'Add a friend', () => this.addFriend(), { color: 0x3b6d4a, fontSize: 16, sub: 'With their friend code' }));

    // The list: requests first, then friends (online first).
    this.top = y + 40;
    const rowH = 64;
    this.list = this.add.container(0, this.top);
    clipList(this, this.list, this.top, H);
    const rows = [...this.friends.filter((f) => f.status === 'pending' && f.incoming), ...this.friends.filter((f) => f.status === 'accepted'), ...this.friends.filter((f) => f.status === 'pending' && !f.incoming)];
    const x0 = LANDSCAPE ? W / 2 - 330 : 12;
    const rw = LANDSCAPE ? 660 : W - 24;
    rows.forEach((f, i) => this.row(f, x0, i * rowH + 6, rw, rowH - 6));
    const height = rows.length * rowH + 20;
    const min = Math.min(this.top, H - height);
    this.scroller ??= new Scroller(this, { get: () => this.list.y, set: (v) => this.list.setY(v), min: () => Math.min(this.top, H - (this.friends.length * 64 + 20)), max: () => this.top });
    this.list.setY(Math.max(min, Math.min(this.top, this.list.y)));
  }

  private row(f: Friend, x: number, y: number, w: number, h: number) {
    const c = this.list;
    const pendingIn = f.status === 'pending' && f.incoming;
    c.add(this.add.rectangle(x, y, w, h, pendingIn ? 0x2a2a48 : COLORS.panel).setOrigin(0).setStrokeStyle(1, pendingIn ? 0x8fd0ff : COLORS.stroke));
    const img = this.add.image(x + 30, y + h / 2 + 2, ensureTrainerTexture(this, f.look, 'stand')).setScale(1.2);
    c.add(img);
    trainerFx(this, img, f.look);
    c.add(text(this, x + 58, y + 7, f.username, 16, COLORS.text, { fontStyle: 'bold' }));
    const dot = f.status === 'accepted' ? (f.online ? 0x5ad06a : 0x5a5470) : 0x8fd0ff;
    c.add(this.add.circle(x + 63, y + 36, 4, dot));
    c.add(text(this, x + 72, y + 29, statusLine(f), 12, f.online ? '#8fe08a' : COLORS.textDim));
    if (f.title) c.add(titleBadge(this, x + 58, y + h - 10, f.title, 10, { maxW: w - 220, originX: 0 }));
    const bx = x + w - 8;
    const btn = (dx: number, bwid: number, label: string, fn: () => void, color: number, enabled = true) =>
      c.add(button(this, bx - dx - bwid / 2, y + h / 2, bwid, 36, label, () => !this.scroller?.moved && fn(), { fontSize: 13, color, enabled }));
    if (pendingIn) {
      btn(0, 78, 'Accept', () => this.act(() => respond(f.userId, true), `You and ${f.username} are friends now!`), 0x3b6d4a);
      btn(84, 78, 'Decline', () => this.act(() => respond(f.userId, false)), 0x5a2a2a);
    } else if (f.status === 'pending') {
      btn(0, 86, 'Cancel', () => this.act(() => removeFriend(f.userId)), 0x3a3352);
    } else {
      btn(0, 40, '⋯', () => this.manage(f), 0x3a3352);
      btn(46, 86, 'Invite', () => this.invite(f), 0x8a2c2c, f.online);
    }
  }

  private async act(fn: () => Promise<unknown>, done?: string) {
    try {
      await fn();
      sfx.click();
      this.friends = await listFriends();
      this.draw();
      if (done) showMessage(this, 'Done', done, () => {});
    } catch (e) {
      showMessage(this, 'Couldn’t do that', e instanceof Error ? e.message : 'Try again in a moment.', () => {});
    }
  }

  private myCode() {
    const p = myProfile()!;
    openPicker(this, {
      title: p.username,
      subtitle: `Your friend code is ${p.friendCode}. Send it to friends so they can add you.`,
      options: [
        { label: 'Copy my friend code', color: 0x2f4a6b },
        { label: 'Change my trainer name', color: 0x3a3352, sub: 'It’s your username too' },
      ],
      onPick: async (i) => {
        if (i === 1) return editTrainerName({ onDone: () => this.scene.restart() });
        const ok = await copyText(p.friendCode);
        showMessage(this, ok ? 'Copied' : 'Your friend code', ok ? `${p.friendCode} is copied. Send it to a friend.` : p.friendCode, () => {});
      },
      onCancel: () => {},
    });
  }

  private addFriend() {
    card({
      title: 'Add a friend',
      body: 'Type their friend code (like HEX-4K9P2). They’ll find it at the top of their Friends screen. They get a request to accept.',
      field: { type: 'text', placeholder: 'HEX-…' },
      buttons: [
        { label: 'Cancel', onClick: (c) => c.close() },
        {
          label: 'Send request',
          primary: true,
          onClick: async (c) => {
            const q = normalizeCode(c.value());
            if (!q) return c.status('Friend codes look like HEX-4K9P2.', 'error');
            c.busy(true);
            try {
              const who = await findPlayer(q);
              if (!who) {
                c.busy(false);
                return c.status('No player with that friend code.', 'error');
              }
              const out = await sendRequest(who.userId);
              c.close();
              await this.act(async () => {}, out === 'friends' ? `You and ${who.username} are friends now!` : `Request sent to ${who.username}. You’ll be friends once they accept.`);
            } catch (e) {
              c.busy(false);
              c.status(e instanceof Error ? e.message : 'Couldn’t send it.', 'error');
            }
          },
        },
      ],
    });
  }

  private manage(f: Friend) {
    openPicker(this, {
      title: f.username,
      subtitle: `${statusLine(f)} · ${f.friendCode}`,
      options: [
        { label: 'Remove friend', color: 0x5a2a2a },
        { label: 'Block', color: 0x5a2a2a, sub: 'Removes them and stops requests and invites from them' },
      ],
      onPick: (i) =>
        openPicker(this, {
          title: i === 0 ? `Remove ${f.username}?` : `Block ${f.username}?`,
          subtitle: i === 0 ? 'You can add each other again later.' : 'They can’t find you, send you requests or invite you.',
          options: [{ label: i === 0 ? 'Remove' : 'Block', color: 0x8a2c2c }],
          onPick: () => void this.act(() => (i === 0 ? removeFriend(f.userId) : blockPlayer(f.userId))),
          onCancel: () => {},
        }),
      onCancel: () => {},
    });
  }

  /** Invite a friend: to the lobby you're hosting, or host one first (choose what to play). */
  private invite(f: Friend) {
    if (session.role === 'host' && session.code) {
      return void this.act(() => sendInvite(f.userId, duel.mode, session.code), `Invited ${f.username} to your ${GAME_MODES[duel.mode].name}. Their game will ask them to join.`);
    }
    const modes = Object.entries(GAME_MODES) as [GameMode, (typeof GAME_MODES)[GameMode]][];
    openPicker(this, {
      title: `Play with ${f.username}`,
      subtitle: 'Choose what to play. You’ll host the game and they get an invite to join.',
      options: modes.map(([, m]) => ({ label: `${m.name} · ${m.min === m.max ? `${m.min} players` : `${m.min}-${m.max} players`}`, sub: m.desc })),
      onPick: (i) => this.scene.start('Duel', { hostFor: { mode: modes[i][0], invite: [{ userId: f.userId, username: f.username }] } }),
      onCancel: () => {},
    });
  }
}
