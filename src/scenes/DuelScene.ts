import Phaser from 'phaser';
import { myTitle } from '../logic/titles';
import { titleBadge } from '../ui/titleBadge';
import { lookForName, myLook, myName } from '../data/trainerLook';
import { ensureTrainerTexture } from '../ui/trainerSprite';
import { trainerFx } from '../ui/trainerFx';
import { SPECIES_BY_ID } from '../data/species';
import { activeTeamIndex, savedTeams, validArenaTeam } from '../logic/arena';
import { SETTING_CHOICES, type DuelSettings } from '../net/duel';
import { duel, hostSetSettings, hostStartRace, hostStartSeries, leaveDuel, sendHello, submitPick } from '../net/runtime';
import { MAPS, mapUnlocked } from '../data/maps';
import { CODE_LENGTH, session } from '../net/session';
import { state } from '../state';
import { openPicker, showMessage } from '../ui/picker';
import { playMusic } from '../ui/sound';
import { ensureCreatureTexture, SPRITE_FIT } from '../ui/sprites';
import { background, button, COLORS, LANDSCAPE, text, W } from '../ui/widgets';

/**
 * Duel a friend: one phone hosts and shows a 5-digit code, the other types it in. Both bring
 * their Battle Arena team (Lv 50). Battles run live, phone to phone.
 */
/** Upright: one centered column. Sideways: you (name, team, settings) on the left, the session on the right. */
const cols = () =>
  LANDSCAPE ? { lx: 190, lw: 340, rx: 600, rw: 340 } : { lx: W / 2, lw: W - 40, rx: W / 2, rw: W - 60 };

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
    duel.me = { name: myName(meta), look: myLook(meta), title: myTitle(meta) ?? undefined, teams: brought };
    const hello = JSON.stringify(duel.me);
    if (session.connected && hello !== DuelScene.lastHello) sendHello();
    DuelScene.lastHello = session.connected ? hello : '';
    background(this);
    playMusic('arena');
    const redraw = () => this.scene.isActive() && this.scene.restart({ typed: this.typed, pick: this.picking });
    duel.onChange = redraw;
    const off = session.onStatus(redraw);
    this.events.once('shutdown', () => {
      off();
      if (duel.onChange === redraw) duel.onChange = null;
    });

    button(this, 40, 28, 64, 36, '', () => this.leave(), { fontSize: 15, glyph: 'back' });
    const { lx, lw } = cols();
    text(this, lx + 20, 18, 'Play with a friend', 26, '#ffc94d', { fontStyle: 'bold' }).setOrigin(0.5, 0);
    text(this, lx + 20, 54, 'Live battles, phone to phone', 13, COLORS.textDim).setOrigin(0.5, 0);
    if (this.picking && duel.series) return this.drawPick();

    // Your name and team.
    button(this, lx, 104, lw, 44, `Your trainer: ${duel.me.name}`, () => this.scene.start('Trainer', { from: 'Duel' }), { fontSize: 15, sub: 'Tap to change your name and look' });
    if (session.connected && duel.opponent && !this.busyText && this.typed === null) return this.drawConnected();
    text(this, 20, 136, 'Your team (active team from the Battle Arena):', 13, COLORS.textDim);
    this.drawTeam(160, team.map((p) => [p.speciesId, p.stage] as [string, number]));
    if (!team.length) {
      // Only Arena duels need a saved team; Stage battles use your run's team.
      text(this, lx, 170, 'No Arena team yet (only needed for Arena duels).', 13, '#ffc94d', { align: 'center', wordWrap: { width: lw } }).setOrigin(0.5, 0);
      button(this, lx, 210, 200, 34, 'Build one in the Arena', () => this.scene.start('Arena', {}), { fontSize: 13 });
    }

    if (this.typed !== null) return this.drawKeypad();
    const s = session.status;
    // Upright: under your team. Sideways: in the right column.
    const { rx, rw } = cols();
    const y = LANDSCAPE ? 20 : 250;
    if (this.busyText) {
      text(this, rx, y + 20, this.busyText, 16, '#ffc94d', { align: 'center', wordWrap: { width: rw } }).setOrigin(0.5, 0);
    } else if (session.role === 'host') {
      text(this, rx, y, 'Your duel code', 16, COLORS.textDim).setOrigin(0.5, 0);
      text(this, rx, y + 28, session.code.split('').join(' '), 54, '#ffc94d', { fontStyle: 'bold' }).setOrigin(0.5, 0);
      const wait = text(this, rx, y + 110, 'Waiting for your friend to join…', 16, COLORS.text).setOrigin(0.5, 0);
      this.tweens.add({ targets: wait, alpha: 0.4, yoyo: true, repeat: -1, duration: 700 });
      text(this, rx, y + 144, 'On their phone or computer: Battle Arena → Duel a friend → Join, then enter this code.\nKeep the game open on both.', 13, COLORS.textDim, {
        align: 'center',
        wordWrap: { width: rw },
      }).setOrigin(0.5, 0);
      button(this, rx, y + 250, 200, 44, 'Cancel', () => this.leave(true), { fontSize: 15 });
    } else {
      if (s === 'error' && session.error) text(this, rx, y - 6, session.error, 13, '#ff8a7a', { align: 'center', wordWrap: { width: rw } }).setOrigin(0.5, 1);
      button(this, rx, y + 40, rw, LANDSCAPE ? 64 : 70, 'Host a game', () => this.host(), { color: 0x3b6d4a, fontSize: 20, sub: 'Get a code to share with a friend' });
      button(this, rx, LANDSCAPE ? y + 112 : y + 126, rw, LANDSCAPE ? 64 : 70, 'Join with a code', () => this.scene.restart({ typed: '' }), { color: 0x2f4a6b, fontSize: 20, sub: 'Enter the code from your friend’s screen' });
      text(this, rx, LANDSCAPE ? y + 152 : y + 190, 'Works best on the same Wi-Fi. On mobile data some networks may not connect.', 12, COLORS.textDim, {
        align: 'center',
        wordWrap: { width: rw },
      }).setOrigin(0.5, 0);
      // What you can play once connected (the host chooses).
      const py = LANDSCAPE ? y + 196 : y + 236;
      const px = rx - rw / 2 - 14;
      this.add.rectangle(px, py, rw + 28, LANDSCAPE ? 214 : 188, COLORS.panel).setOrigin(0).setStrokeStyle(2, COLORS.stroke);
      text(this, px + 14, py + 12, 'Two ways to play together', 15, '#ffc94d', { fontStyle: 'bold' });
      text(this, px + 14, py + 40, 'Arena duel', 14, COLORS.text, { fontStyle: 'bold' });
      text(this, px + 14, py + 60, 'Your saved Lv 50 teams battle live. Best of 1, 3 or 5.', 12, COLORS.textDim, { wordWrap: { width: rw } });
      text(this, px + 14, py + 94, 'Stage battle', 14, COLORS.text, { fontStyle: 'bold' });
      text(this, px + 14, py + 114, 'Both of you play the same stage with double rewards. The boss at the end is the other player: whoever\u2019s run team wins takes it.', 12, COLORS.textDim, { wordWrap: { width: rw } });
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
    const { lx, lw, rx, rw } = cols();
    text(this, lx, opp.title ? 129 : 132, `Connected to ${opp.name}`, opp.title ? 16 : 18, '#8fe08a', { fontStyle: 'bold' }).setOrigin(0.5, 0);
    // Their title, in its tier's color and effect.
    if (opp.title) titleBadge(this, lx, 155, opp.title, 12, { maxW: lw });
    // Their trainer, gear and effects included, at the right of the line.
    const look = opp.look ?? lookForName(opp.name);
    const them = this.add.image(lx + lw / 2 - 22, 152, ensureTrainerTexture(this, look, 'stand')).setScale(1.25);
    trainerFx(this, them, look);
    this.tweens.add({ targets: them, y: 149, yoyo: true, repeat: -1, duration: 800, ease: 'Sine.easeInOut' });

    // Session settings: tap to cycle (host only).
    text(this, 20, opp.title ? 167 : 160, host ? 'Session settings · tap to change' : `Session settings · set by ${opp.name}`, 13, COLORS.textDim);
    const labels: [keyof DuelSettings, string][] = [
      ['bestOf', s.bestOf === 1 ? 'Single battle' : `Best of ${s.bestOf}`],
      ['teamsPerPlayer', `${s.teamsPerPlayer} team${s.teamsPerPlayer > 1 ? 's' : ''} each`],
      ['teamSize', `${s.teamSize} Hexling${s.teamSize > 1 ? 's' : ''} per battle`],
      ['level', `Everyone Lv ${s.level}`],
    ];
    const bw = (lw - 8) / 2;
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
    const tw = (lw - (mine.length - 1) * 8) / mine.length;
    mine.forEach((t, i) => {
      const x = 20 + tw / 2 + i * (tw + 8);
      button(this, x, 322, tw, 52, t.name, () => {
        duel.bring[i] = (duel.bring[i] + 1) % teams.length;
        this.scene.restart({});
      }, { fontSize: 14, color: t.picks.length ? 0x2f4a6b : 0x5a2a2a, sub: t.picks.length ? `${Math.min(t.picks.length, s.teamSize)} will fight` : 'Empty team' });
      // Its creatures, under the button (the ones that will fight are bright).
      const shown = t.picks.slice(0, 4);
      shown.forEach((p, k) => {
        const img = this.add.image(x + (k - (shown.length - 1) / 2) * Math.min(44, tw / 4), 366, ensureCreatureTexture(this, p.speciesId, p.stage, p.shiny)).setScale(1.1 * SPRITE_FIT);
        if (k >= s.teamSize) img.setAlpha(0.3);
      });
    });

    // What they bring.
    const theirs = opp.teams;
    // What they bring: under yours (upright) or at the top of the right column (sideways).
    const ox = LANDSCAPE ? rx - rw / 2 : 20;
    text(this, ox, LANDSCAPE ? 20 : 394, `${opp.name} brings:`, 13, COLORS.textDim);
    theirs.forEach((t, i) => {
      const y = (LANDSCAPE ? 44 : 418) + i * 34;
      text(this, ox, y, t.name, 13, COLORS.text, { fontStyle: 'bold' });
      t.picks.slice(0, 4).forEach((p, k) => this.add.image(ox + 150 + k * 44, y + 8, ensureCreatureTexture(this, p.speciesId, p.stage, p.shiny)).setScale(1 * SPRITE_FIT));
    });

    const ready = mine.length === s.teamsPerPlayer && mine.every((t) => t.picks.length) && theirs.length === s.teamsPerPlayer && theirs.every((t) => t.picks.length);
    const by = LANDSCAPE ? 210 : 540;
    if (host) {
      button(this, rx, by, rw, 58, s.bestOf === 1 ? 'Start duel' : `Start best of ${s.bestOf}`, () => hostStartSeries(), {
        color: 0x8a2c2c,
        fontSize: 20,
        glyph: 'swords',
        enabled: ready,
        sub: ready ? `Lv ${s.level} · ${s.teamSize} per side` : `Waiting for both players to bring ${s.teamsPerPlayer} team${s.teamsPerPlayer > 1 ? 's' : ''} with Hexlings`,
      });
      button(this, rx, by + 66, rw, 58, 'Stage battle', () => this.pickRaceMap(), {
        color: 0x2f4a6b,
        fontSize: 20,
        sub: 'Both play one stage · double rewards · you are each other\u2019s boss',
      });
    } else {
      const wait = text(this, rx, by - 10, `Waiting for ${opp.name} to start an Arena duel or a Stage battle…`, 16, COLORS.text, { align: 'center', wordWrap: { width: rw } }).setOrigin(0.5, 0);
      this.tweens.add({ targets: wait, alpha: 0.4, yoyo: true, repeat: -1, duration: 700 });
    }
    button(this, rx, by + 132, 200, 40, 'Leave', () => this.leave(true), { fontSize: 15, color: 0x5a2a2a });
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
    text(this, W / 2, 170, `Which team fights? (${s.teamSize} Hexling${s.teamSize > 1 ? 's' : ''}, Lv ${s.level})`, 15, COLORS.textDim).setOrigin(0.5, 0);
    const n = duel.me!.teams.length;
    duel.me!.teams.forEach((t, i) => {
      // Upright: stacked. Sideways: side by side.
      const y = LANDSCAPE ? 290 : 240 + i * 110;
      const x = LANDSCAPE ? W / 2 + (i - (n - 1) / 2) * 252 : W / 2;
      const c = button(this, x, y, LANDSCAPE ? 240 : W - 40, LANDSCAPE ? 110 : 96, '', () => submitPick(i), { color: 0x2f4a6b, fontSize: 18 });
      c.add(text(this, 0, -30, t.name, 18, COLORS.text, { fontStyle: 'bold' }).setOrigin(0.5));
      const fighters = t.picks.slice(0, s.teamSize);
      fighters.forEach((p, k) => {
        c.add(this.add.image((k - (fighters.length - 1) / 2) * 70, 14, ensureCreatureTexture(this, p.speciesId, p.stage, p.shiny)).setScale(1.5 * SPRITE_FIT));
      });
    });
  }

  /** Host: choose the map for a stage race. */
  private pickRaceMap() {
    const open = MAPS.filter((m) => mapUnlocked(m, state.meta.wins));
    openPicker(this, {
      title: 'Stage battle',
      subtitle: `You and ${duel.opponent?.name ?? 'your friend'} each play the first stage of this map from the same start, with double battle rewards (no passives or Heat). The boss at the end is the other player: your teams battle live.`,
      options: open.map((m) => ({ label: m.name, sub: m.desc })),
      onPick: (i) => hostStartRace(open[i].id),
      onCancel: () => {},
    });
  }

  /** Number pad for typing a friend's code. */
  private drawKeypad() {
    const code = this.typed ?? '';
    const { rx } = cols();
    text(this, rx, LANDSCAPE ? 10 : 236, 'Enter your friend’s code', 16, COLORS.textDim).setOrigin(0.5, 0);
    const shown = code.padEnd(CODE_LENGTH, '_').split('').join(' ');
    text(this, rx, LANDSCAPE ? 32 : 262, shown, 48, '#ffc94d', { fontStyle: 'bold' }).setOrigin(0.5, 0);
    const keys = ['1', '2', '3', '4', '5', '6', '7', '8', '9', '⌫', '0', 'Join'];
    keys.forEach((k, i) => {
      const x = rx + ((i % 3) - 1) * 116;
      const y = (LANDSCAPE ? 132 : 380) + Math.floor(i / 3) * (LANDSCAPE ? 70 : 76);
      const isJoin = k === 'Join';
      button(
        this,
        x,
        y,
        104,
        LANDSCAPE ? 60 : 64,
        k,
        () => {
          if (isJoin) return this.join(code);
          const next = k === '⌫' ? code.slice(0, -1) : (code + k).slice(0, CODE_LENGTH);
          this.scene.restart({ typed: next });
        },
        { fontSize: isJoin ? 20 : 26, color: isJoin ? 0x3b6d4a : undefined, enabled: !isJoin || code.length === CODE_LENGTH },
      );
    });
    button(this, LANDSCAPE ? cols().lx : W / 2, LANDSCAPE ? 260 : 700, 200, 44, 'Back', () => this.scene.restart({ typed: null }), { fontSize: 15 });
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

  private leave(stay = false) {
    const go = () => {
      leaveDuel();
      if (stay) this.scene.restart({});
      else this.scene.start('Title', {});
    };
    if (!session.role) return go();
    if (stay) return go();
    showMessage(this, 'Leave the duel?', 'This closes the connection.', go);
  }
}
