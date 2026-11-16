import Phaser from 'phaser';
import { SPECIES_BY_ID } from '../data/species';
import { activeTeamIndex, savedTeams, validArenaTeam } from '../logic/arena';
import { SETTING_CHOICES, type DuelSettings } from '../net/duel';
import { saveMeta } from '../logic/run';
import { duel, hostSetSettings, hostStartRace, hostStartSeries, leaveDuel, sendHello, submitPick } from '../net/runtime';
import { MAPS, mapUnlocked } from '../data/maps';
import { CODE_LENGTH, session } from '../net/session';
import { state } from '../state';
import { openPicker, showMessage } from '../ui/picker';
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
  /** Picking a team for the next battle of a series. */
  private picking = false;
  /** The hello we last sent, so we only resend when our teams change. */
  private static lastHello = '';

  constructor() {
    super('Duel');
  }

  init(data: { typed?: string | null; busy?: string; pick?: boolean }) {
    this.typed = data.typed ?? null;
    this.busyText = data.busy ?? '';
    this.picking = !!data.pick;
  }

  /** The saved teams we're bringing, as many as the session asks for. */
  private broughtTeams() {
    const meta = state.meta;
    const teams = savedTeams(meta);
    const n = duel.settings.teamsPerPlayer;
    if (!duel.bring.length) duel.bring = [activeTeamIndex(meta)];
    while (duel.bring.length < n) duel.bring.push((duel.bring[duel.bring.length - 1] + 1) % teams.length);
    duel.bring = duel.bring.slice(0, n).map((i) => Math.min(i, teams.length - 1));
    return duel.bring.map((i) => ({ name: teams[i].name, picks: validArenaTeam(meta, teams[i].picks) }));
  }

  create() {
    const meta = state.meta;
    duel.game = this.game;
    // Handy for debugging in the browser console, like `game` and `state`.
    Object.assign(window, { duelSession: session });
    const brought = this.broughtTeams();
    const team = brought[0]?.picks ?? [];
    duel.me = { name: meta.duelName || 'Trainer', teams: brought };
    const hello = JSON.stringify(duel.me);
    if (session.connected && hello !== DuelScene.lastHello) sendHello();
    DuelScene.lastHello = session.connected ? hello : '';
    background(this);
    playMusic('title');
    const redraw = () => this.scene.isActive() && this.scene.restart({ typed: this.typed, pick: this.picking });
    duel.onChange = redraw;
    const off = session.onStatus(redraw);
    this.events.once('shutdown', () => {
      off();
      if (duel.onChange === redraw) duel.onChange = null;
    });

    button(this, 40, 28, 64, 36, '', () => this.leave(), { fontSize: 15, glyph: 'back' });
    text(this, W / 2 + 20, 18, 'Duel a friend', 26, '#ffc94d', { fontStyle: 'bold' }).setOrigin(0.5, 0);
    text(this, W / 2 + 20, 54, 'Live battles, phone to phone', 13, COLORS.textDim).setOrigin(0.5, 0);
    if (this.picking && duel.series) return this.drawPick();

    // Your name and team.
    button(this, W / 2, 104, W - 40, 44, `Your name: ${duel.me.name}`, () => this.rename(), { fontSize: 15, sub: 'Tap to change' });
    if (session.connected && duel.opponent && !this.busyText && this.typed === null) return this.drawConnected();
    text(this, 20, 136, 'Your team (active team from the Battle Arena):', 13, COLORS.textDim);
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

  /** Connected: session settings (host edits, guest sees), the teams each side brings, and Start. */
  private drawConnected() {
    const opp = duel.opponent!;
    const host = session.role === 'host';
    const s = duel.settings;
    text(this, W / 2, 132, `Connected to ${opp.name}`, 18, '#8fe08a', { fontStyle: 'bold' }).setOrigin(0.5, 0);

    // Session settings: tap to cycle (host only).
    text(this, 20, 160, host ? 'Session settings · tap to change' : `Session settings · set by ${opp.name}`, 13, COLORS.textDim);
    const labels: [keyof DuelSettings, string][] = [
      ['bestOf', s.bestOf === 1 ? 'Single battle' : `Best of ${s.bestOf}`],
      ['teamsPerPlayer', `${s.teamsPerPlayer} team${s.teamsPerPlayer > 1 ? 's' : ''} each`],
      ['teamSize', `${s.teamSize} creature${s.teamSize > 1 ? 's' : ''} per battle`],
      ['level', `Everyone Lv ${s.level}`],
    ];
    const bw = (W - 48) / 2;
    labels.forEach(([key, label], i) => {
      const x = 20 + bw / 2 + (i % 2) * (bw + 8);
      const y = 202 + Math.floor(i / 2) * 50;
      button(
        this,
        x,
        y,
        bw,
        42,
        label,
        () => {
          const opts = SETTING_CHOICES[key];
          hostSetSettings({ ...s, [key]: opts[(opts.indexOf(s[key]) + 1) % opts.length] });
        },
        { fontSize: 14, color: host ? 0x3a3a5a : 0x24203a, enabled: host },
      );
    });

    // The teams you bring: tap one to swap in another saved team.
    const teams = savedTeams(state.meta);
    const mine = duel.me!.teams;
    text(this, 20, 278, `You bring ${mine.length === 1 ? 'this team' : `these ${mine.length} teams`} · tap to change`, 13, COLORS.textDim);
    const tw = (W - 40 - (mine.length - 1) * 8) / mine.length;
    mine.forEach((t, i) => {
      const x = 20 + tw / 2 + i * (tw + 8);
      button(this, x, 322, tw, 52, t.name, () => {
        duel.bring[i] = (duel.bring[i] + 1) % teams.length;
        this.scene.restart({});
      }, { fontSize: 14, color: t.picks.length ? 0x2f4a6b : 0x5a2a2a, sub: t.picks.length ? `${Math.min(t.picks.length, s.teamSize)} will fight` : 'Empty team' });
      // Its creatures, under the button (the ones that will fight are bright).
      const shown = t.picks.slice(0, 4);
      shown.forEach((p, k) => {
        const img = this.add.image(x + (k - (shown.length - 1) / 2) * Math.min(44, tw / 4), 366, ensureCreatureTexture(this, p.speciesId, p.stage)).setScale(1.1 * SPRITE_FIT);
        if (k >= s.teamSize) img.setAlpha(0.3);
      });
    });

    // What they bring.
    const theirs = opp.teams;
    text(this, 20, 394, `${opp.name} brings:`, 13, COLORS.textDim);
    theirs.forEach((t, i) => {
      const y = 418 + i * 34;
      text(this, 20, y, t.name, 13, COLORS.text, { fontStyle: 'bold' });
      t.picks.slice(0, 4).forEach((p, k) => this.add.image(170 + k * 44, y + 8, ensureCreatureTexture(this, p.speciesId, p.stage)).setScale(1 * SPRITE_FIT));
    });

    const ready = mine.length === s.teamsPerPlayer && mine.every((t) => t.picks.length) && theirs.length === s.teamsPerPlayer && theirs.every((t) => t.picks.length);
    const by = 540;
    if (host) {
      button(this, W / 2, by, W - 60, 58, s.bestOf === 1 ? 'Start duel' : `Start best of ${s.bestOf}`, () => hostStartSeries(), {
        color: 0x8a2c2c,
        fontSize: 20,
        glyph: 'swords',
        enabled: ready,
        sub: ready ? `Lv ${s.level} · ${s.teamSize} per side` : `Waiting for both players to bring ${s.teamsPerPlayer} team${s.teamsPerPlayer > 1 ? 's' : ''} with creatures`,
      });
      button(this, W / 2, by + 66, W - 60, 58, 'Stage race', () => this.pickRaceMap(), {
        color: 0x2f4a6b,
        fontSize: 20,
        sub: 'Both play the same map · double rewards · final duel',
      });
    } else {
      const wait = text(this, W / 2, by - 10, `Waiting for ${opp.name} to start a duel or a race…`, 16, COLORS.text, { align: 'center', wordWrap: { width: W - 60 } }).setOrigin(0.5, 0);
      this.tweens.add({ targets: wait, alpha: 0.4, yoyo: true, repeat: -1, duration: 700 });
    }
    button(this, W / 2, by + 132, 200, 40, 'Leave', () => this.leave(true), { fontSize: 15, color: 0x5a2a2a });
  }

  /** Before each battle of a series: choose which of your teams fights. */
  private drawPick() {
    const sr = duel.series!;
    const opp = duel.opponent?.name ?? 'Your friend';
    const s = sr.settings;
    const head = s.bestOf === 1 ? 'Duel' : `Battle ${sr.game} of best of ${s.bestOf}`;
    text(this, W / 2, 96, head, 22, '#ffc94d', { fontStyle: 'bold' }).setOrigin(0.5, 0);
    if (s.bestOf > 1) text(this, W / 2, 128, `You ${sr.mine} – ${sr.theirs} ${opp}`, 18, COLORS.text).setOrigin(0.5, 0);
    if (sr.myPick !== null) {
      const t = duel.me!.teams[sr.myPick];
      text(this, W / 2, 200, `You picked ${t?.name ?? 'your team'}.`, 16, COLORS.text).setOrigin(0.5, 0);
      const wait = text(this, W / 2, 240, `Waiting for ${opp} to pick…`, 16, '#ffc94d').setOrigin(0.5, 0);
      this.tweens.add({ targets: wait, alpha: 0.4, yoyo: true, repeat: -1, duration: 700 });
      return;
    }
    text(this, W / 2, 170, `Which team fights? (${s.teamSize} creature${s.teamSize > 1 ? 's' : ''}, Lv ${s.level})`, 15, COLORS.textDim).setOrigin(0.5, 0);
    duel.me!.teams.forEach((t, i) => {
      const y = 240 + i * 110;
      const c = button(this, W / 2, y, W - 40, 96, '', () => submitPick(i), { color: 0x2f4a6b, fontSize: 18 });
      c.add(text(this, 0, -30, t.name, 18, COLORS.text, { fontStyle: 'bold' }).setOrigin(0.5));
      const fighters = t.picks.slice(0, s.teamSize);
      fighters.forEach((p, k) => {
        c.add(this.add.image((k - (fighters.length - 1) / 2) * 70, 14, ensureCreatureTexture(this, p.speciesId, p.stage)).setScale(1.5 * SPRITE_FIT));
      });
    });
  }

  /** Host: choose the map for a stage race. */
  private pickRaceMap() {
    const open = MAPS.filter((m) => mapUnlocked(m, state.meta.wins));
    openPicker(this, {
      title: 'Stage race',
      subtitle: `You and ${duel.opponent?.name ?? 'your friend'} play this map from the same start, with double battle rewards and no passives or Heat. When you're both done, your teams duel.`,
      options: open.map((m) => ({ label: m.name, sub: m.desc })),
      onPick: (i) => hostStartRace(open[i].id),
      onCancel: () => {},
    });
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
