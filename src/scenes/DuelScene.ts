import Phaser from 'phaser';
import { SPECIES_BY_ID } from '../data/species';
import { validArenaTeam } from '../logic/arena';
import { saveMeta } from '../logic/run';
import { duel, hostStartDuel, leaveDuel, sendHello } from '../net/runtime';
import { CODE_LENGTH, session } from '../net/session';
import { state } from '../state';
import { showMessage } from '../ui/picker';
import { playMusic } from '../ui/sound';
import { ensureCreatureTexture, SPRITE_FIT } from '../ui/sprites';
import { background, button, COLORS, text, W } from '../ui/widgets';

/**
 * Duel a friend: one phone hosts and shows a 5-digit code, the other types it in. Both bring
 * their Battle Arena team (Lv 50). Battles run live, phone to phone.
 */
export class DuelScene extends Phaser.Scene {
  /** Join screen: digits typed so far (null = not on the keypad). */
  private typed: string | null = null;
  private busyText = '';

  constructor() {
    super('Duel');
  }

  init(data: { typed?: string | null; busy?: string }) {
    this.typed = data.typed ?? null;
    this.busyText = data.busy ?? '';
  }

  create() {
    const meta = state.meta;
    duel.game = this.game;
    // Handy for debugging in the browser console, like `game` and `state`.
    Object.assign(window, { duelSession: session });
    const team = validArenaTeam(meta, meta.arenaTeam);
    duel.me = { name: meta.duelName || 'Trainer', team };
    background(this);
    playMusic('title');
    const redraw = () => this.scene.isActive() && this.scene.restart({ typed: this.typed });
    duel.onChange = redraw;
    const off = session.onStatus(redraw);
    this.events.once('shutdown', () => {
      off();
      if (duel.onChange === redraw) duel.onChange = null;
    });

    button(this, 40, 28, 64, 36, '', () => this.leave(), { fontSize: 15, glyph: 'back' });
    text(this, W / 2 + 20, 18, 'Duel a friend', 26, '#ffc94d', { fontStyle: 'bold' }).setOrigin(0.5, 0);
    text(this, W / 2 + 20, 54, 'Live Lv 50 battle, phone to phone', 13, COLORS.textDim).setOrigin(0.5, 0);

    // Your name and team.
    button(this, W / 2, 104, W - 40, 44, `Your name: ${duel.me.name}`, () => this.rename(), { fontSize: 15, sub: 'Tap to change' });
    text(this, 20, 136, 'Your team (from the Battle Arena):', 13, COLORS.textDim);
    this.drawTeam(160, team.map((p) => [p.speciesId, p.stage] as [string, number]));
    if (!team.length) {
      text(this, W / 2, 190, 'Build a team in the Battle Arena first.', 15, '#ffc94d').setOrigin(0.5);
      button(this, W / 2, 250, 240, 50, 'Go to the Arena', () => this.scene.start('Arena', {}), { fontSize: 16 });
      return;
    }

    if (this.typed !== null) return this.drawKeypad();
    const s = session.status;
    const y = 250;
    if (this.busyText) {
      text(this, W / 2, y + 20, this.busyText, 16, '#ffc94d', { align: 'center', wordWrap: { width: W - 60 } }).setOrigin(0.5, 0);
    } else if (session.connected && duel.opponent) {
      this.drawConnected(y);
    } else if (session.role === 'host') {
      text(this, W / 2, y, 'Your duel code', 16, COLORS.textDim).setOrigin(0.5, 0);
      text(this, W / 2, y + 28, session.code.split('').join(' '), 54, '#ffc94d', { fontStyle: 'bold' }).setOrigin(0.5, 0);
      const wait = text(this, W / 2, y + 110, 'Waiting for your friend to join…', 16, COLORS.text).setOrigin(0.5, 0);
      this.tweens.add({ targets: wait, alpha: 0.4, yoyo: true, repeat: -1, duration: 700 });
      text(this, W / 2, y + 144, 'On their phone: Battle Arena → Duel a friend → Join, then enter this code.\nKeep the game open on both phones.', 13, COLORS.textDim, {
        align: 'center',
        wordWrap: { width: W - 60 },
      }).setOrigin(0.5, 0);
      button(this, W / 2, y + 250, 200, 44, 'Cancel', () => this.leave(true), { fontSize: 15 });
    } else {
      if (s === 'error' && session.error) text(this, W / 2, y - 6, session.error, 13, '#ff8a7a', { align: 'center', wordWrap: { width: W - 60 } }).setOrigin(0.5, 1);
      button(this, W / 2, y + 40, W - 60, 70, 'Host a duel', () => this.host(), { color: 0x3b6d4a, fontSize: 20, sub: 'Get a code to share with a friend' });
      button(this, W / 2, y + 126, W - 60, 70, 'Join with a code', () => this.scene.restart({ typed: '' }), { color: 0x2f4a6b, fontSize: 20, sub: 'Enter the code from your friend’s screen' });
      text(this, W / 2, y + 190, 'Works best on the same Wi-Fi. On mobile data some networks may not connect.', 12, COLORS.textDim, {
        align: 'center',
        wordWrap: { width: W - 60 },
      }).setOrigin(0.5, 0);
    }
  }

  private drawTeam(y: number, picks: [string, number][]) {
    picks.forEach(([id, stage], i) => {
      const x = 56 + i * 100;
      this.add.image(x, y + 20, ensureCreatureTexture(this, id, stage)).setScale(1.3 * SPRITE_FIT);
      text(this, x, y + 46, SPECIES_BY_ID[id].names[stage], 11, COLORS.text).setOrigin(0.5, 0);
    });
  }

  private drawConnected(y: number) {
    const opp = duel.opponent!;
    text(this, W / 2, y, `Connected to ${opp.name}`, 20, '#8fe08a', { fontStyle: 'bold' }).setOrigin(0.5, 0);
    text(this, 20, y + 34, `${opp.name}'s team:`, 13, COLORS.textDim);
    this.drawTeam(y + 58, opp.team.map((p) => [p.speciesId, p.stage] as [string, number]));
    if (session.role === 'host') {
      button(this, W / 2, y + 170, W - 60, 66, 'Start duel', () => hostStartDuel(), { color: 0x8a2c2c, fontSize: 22, glyph: 'swords' });
    } else {
      const wait = text(this, W / 2, y + 160, `Waiting for ${opp.name} to start the duel…`, 16, COLORS.text).setOrigin(0.5, 0);
      this.tweens.add({ targets: wait, alpha: 0.4, yoyo: true, repeat: -1, duration: 700 });
    }
    button(this, W / 2, y + 250, 200, 44, 'Leave', () => this.leave(true), { fontSize: 15, color: 0x5a2a2a });
  }

  /** Number pad for typing a friend's code. */
  private drawKeypad() {
    const code = this.typed ?? '';
    text(this, W / 2, 236, 'Enter your friend’s code', 16, COLORS.textDim).setOrigin(0.5, 0);
    const shown = code.padEnd(CODE_LENGTH, '_').split('').join(' ');
    text(this, W / 2, 262, shown, 48, '#ffc94d', { fontStyle: 'bold' }).setOrigin(0.5, 0);
    const keys = ['1', '2', '3', '4', '5', '6', '7', '8', '9', '⌫', '0', 'Join'];
    keys.forEach((k, i) => {
      const x = W / 2 + ((i % 3) - 1) * 116;
      const y = 380 + Math.floor(i / 3) * 76;
      const isJoin = k === 'Join';
      button(
        this,
        x,
        y,
        104,
        64,
        k,
        () => {
          if (isJoin) return this.join(code);
          const next = k === '⌫' ? code.slice(0, -1) : (code + k).slice(0, CODE_LENGTH);
          this.scene.restart({ typed: next });
        },
        { fontSize: isJoin ? 20 : 26, color: isJoin ? 0x3b6d4a : undefined, enabled: !isJoin || code.length === CODE_LENGTH },
      );
    });
    button(this, W / 2, 700, 200, 44, 'Back', () => this.scene.restart({ typed: null }), { fontSize: 15 });
  }

  private async host() {
    this.scene.restart({ busy: 'Getting a code…' });
    await session.host();
  }

  private async join(code: string) {
    this.scene.restart({ busy: `Connecting to ${code}…` });
    const ok = await session.join(code);
    if (ok) sendHello();
    if (this.scene.isActive()) this.scene.restart({});
  }

  private rename() {
    const meta = state.meta;
    const name = window.prompt('Your name for duels', meta.duelName || 'Trainer');
    if (name === null) return;
    meta.duelName = name.trim().slice(0, 16) || 'Trainer';
    saveMeta(meta);
    if (session.connected) sendHello();
    this.scene.restart({});
  }

  private leave(stay = false) {
    const go = () => {
      leaveDuel();
      if (stay) this.scene.restart({});
      else this.scene.start('Arena', {});
    };
    if (!session.role) return go();
    if (stay) return go();
    showMessage(this, 'Leave the duel?', 'This closes the connection.', go);
  }
}
