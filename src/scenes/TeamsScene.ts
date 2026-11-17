import Phaser from 'phaser';
import { SPECIES_BY_ID } from '../data/species';
import { activeTeamIndex, ARENA_TEAM, MAX_SAVED_TEAMS, nextTeamName, savedTeams, validArenaTeam } from '../logic/arena';
import { saveMeta } from '../logic/run';
import { state } from '../state';
import { openPicker } from '../ui/picker';
import { playMusic } from '../ui/sound';
import { ensureCreatureTexture, SPRITE_FIT } from '../ui/sprites';
import { background, button, COLORS, LANDSCAPE, text, W } from '../ui/widgets';

const ROW_H = 96;

/**
 * Team builder: save several Lv 50 teams for the Arena and duels. Tap a team to edit it in the
 * Arena; the menu renames, copies or deletes it.
 */
export class TeamsScene extends Phaser.Scene {
  constructor() {
    super('Teams');
  }

  create() {
    const meta = state.meta;
    const teams = savedTeams(meta);
    const active = activeTeamIndex(meta);
    background(this);
    playMusic('title');
    button(this, 40, 28, 64, 36, '', () => this.scene.start('Arena', {}), { fontSize: 15, glyph: 'back' });
    text(this, W / 2 + 20, 18, 'Your teams', 26, '#ffc94d', { fontStyle: 'bold' }).setOrigin(0.5, 0);
    text(this, W / 2 + 20, 54, `Up to ${MAX_SAVED_TEAMS} teams · tap one to edit it`, 13, COLORS.textDim).setOrigin(0.5, 0);

    // Sideways: a 3-column grid of teams (the new-team button takes the next cell).
    const cols = LANDSCAPE ? 3 : 1;
    const cw = (W - 24 - (cols - 1) * 12) / cols;
    const cell = (i: number) => ({ x: 12 + (i % cols) * (cw + 12), y: 84 + Math.floor(i / cols) * ROW_H });
    teams.forEach((t, i) => {
      const { x: cx, y } = cell(i);
      const picks = validArenaTeam(meta, t.picks);
      const bg = this.add
        .rectangle(cx, y, cw, ROW_H - 8, COLORS.panel)
        .setOrigin(0)
        .setStrokeStyle(2, i === active ? COLORS.accent : COLORS.stroke);
      bg.setInteractive({ useHandCursor: true }).on('pointerup', () => this.edit(i));
      text(this, cx + 12, y + 8, t.name, 17, COLORS.text, { fontStyle: 'bold' });
      if (i === active) text(this, cx + 12, y + 30, LANDSCAPE ? 'ACTIVE · Arena ladder' : 'ACTIVE · used by the Arena ladder', 11, '#ffc94d', { fontStyle: 'bold' });
      else text(this, cx + 12, y + 30, `${picks.length}/${ARENA_TEAM} Hexlings`, 11, COLORS.textDim);
      picks.forEach((p, k) => {
        const x = cx + 34 + k * 56;
        this.add.image(x, y + 64, ensureCreatureTexture(this, p.speciesId, p.stage)).setScale(1.1 * SPRITE_FIT);
      });
      if (!picks.length) text(this, cx + 12, y + 54, 'Empty', 13, COLORS.textDim);
      button(this, cx + cw - 40, LANDSCAPE ? y + 24 : y + ROW_H / 2 - 4, LANDSCAPE ? 56 : 72, LANDSCAPE ? 30 : 34, '•••', () => this.menu(i), { fontSize: 16 });
    });

    const next = cell(teams.length);
    const y = LANDSCAPE ? next.y + (ROW_H - 8) / 2 - 26 : 84 + teams.length * ROW_H + 6;
    if (teams.length < MAX_SAVED_TEAMS) {
      button(this, LANDSCAPE ? next.x + cw / 2 : W / 2, y + 26, LANDSCAPE ? cw : W - 40, 52, '+ New team', () => {
        teams.push({ name: nextTeamName(meta), picks: [] });
        meta.arenaTeamIndex = teams.length - 1;
        saveMeta(meta);
        this.scene.start('Arena', {});
      }, { color: 0x3b6d4a, fontSize: 18 });
    }
  }

  /** Make this team active and open it in the Arena editor. */
  private edit(i: number) {
    state.meta.arenaTeamIndex = i;
    saveMeta(state.meta);
    this.scene.start('Arena', {});
  }

  private menu(i: number) {
    const meta = state.meta;
    const teams = savedTeams(meta);
    const t = teams[i];
    openPicker(this, {
      title: t.name,
      subtitle: validArenaTeam(meta, t.picks).map((p) => SPECIES_BY_ID[p.speciesId].names[p.stage]).join(', ') || 'Empty team',
      options: [
        { label: 'Edit', sub: 'Open it in the Arena (and make it active)', color: 0x2f4a6b },
        { label: 'Rename' },
        { label: 'Copy', sub: 'Start a new team from this one', disabled: teams.length >= MAX_SAVED_TEAMS },
        { label: 'Delete', color: 0x5a2a2a, disabled: teams.length <= 1, sub: teams.length <= 1 ? 'You need at least one team' : undefined },
      ],
      onPick: (k) => {
        if (k === 0) return this.edit(i);
        if (k === 1) {
          const name = window.prompt('Team name', t.name);
          if (name !== null && name.trim()) t.name = name.trim().slice(0, 18);
        } else if (k === 2) {
          teams.splice(i + 1, 0, { name: `${t.name} copy`.slice(0, 18), picks: t.picks.map((p) => ({ ...p, moves: [...p.moves] })) });
        } else {
          teams.splice(i, 1);
          const a = meta.arenaTeamIndex ?? 0;
          meta.arenaTeamIndex = a > i ? a - 1 : a === i ? 0 : a;
        }
        saveMeta(meta);
        this.scene.restart({});
      },
      onCancel: () => {},
    });
  }
}
