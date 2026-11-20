import { editTrainerName } from '../ui/friendsUi';
import Phaser from 'phaser';
import {
  CLOTH_COLORS,
  cleanLook,
  EYE_COLORS,
  HAIR_COLORS,
  DEFAULT_LOOK,
  LOOK_PARTS,
  myLook,
  myName,
  randomLook,
  SKIN_TONES,
  type TrainerLook,
} from '../data/trainerLook';
import { Rng } from '../logic/rng';
import { gildedCount, nextMilestone } from '../logic/gilded';
import { itemId, lockOf, markSeen, newItems, newTitles, unlockedExtras } from '../logic/cosmetics';
import { newTag } from '../ui/newTag';
import { shinyBurst } from '../ui/shiny';
import { earnedTitles, myTitle, TIER_INFO, TITLES } from '../logic/titles';
import { openTitles } from '../ui/titlesUi';
import { titleInButton, titleSub } from '../ui/titleBadge';
import { openGildedMilestones } from '../ui/gildedUi';
import { openPicker, showMessage } from '../ui/picker';
import { icon as pixelIcon } from '../ui/icons';
import { saveMeta } from '../logic/run';
import { state } from '../state';
import { playMusic, sfx } from '../ui/sound';
import { ensureTrainerTexture, type TrainerPose } from '../ui/trainerSprite';
import { trainerFx } from '../ui/trainerFx';
import { background, button, COLORS, fullRect, H, LANDSCAPE, text, W } from '../ui/widgets';

type Part = (typeof LOOK_PARTS)[number];

const TILE_H = 50;
const TILE_GAP = 6;
/** Part tiles: two columns under the preview (upright), or three beside it (sideways). */
const tiles = () =>
  LANDSCAPE
    ? { x0: 196, top: 60, cols: 3, w: (W - 196 - 16 - 12) / 3 }
    : { x0: 16, top: 288, cols: 2, w: (W - 38) / 2 };

/** Which preview pose is showing (kept while you edit). */
let previewPose: TrainerPose = 'stand';
/** Set when you put something on: the preview greets it with a burst of sparkles. */
let tryOn = false;

/** The swatch color for a part, when the part is a color. */
function swatch(key: keyof TrainerLook, v: number): number | null {
  if (key === 'skin') return SKIN_TONES[v];
  if (key === 'hairColor') return HAIR_COLORS[v];
  if (key === 'eyes') return EYE_COLORS[v];
  if (key === 'hatColor' || key === 'topColor' || key === 'accent' || key === 'bottomColor' || key === 'shoeColor') return CLOTH_COLORS[v];
  return null;
}

/**
 * Trainer editor: your name and how your trainer looks. Each part is a tile; tapping it opens a
 * picker that shows your trainer wearing every option. Your trainer stands beside your team in
 * every battle, and online your opponent sees it (and you see theirs).
 */
export class TrainerScene extends Phaser.Scene {
  private from = 'Title';

  constructor() {
    super('Trainer');
  }

  init(data: { from?: string }) {
    this.from = data.from ?? 'Title';
  }

  private set(next: TrainerLook) {
    state.meta.trainerLook = cleanLook(next);
    saveMeta(state.meta);
    this.scene.restart({ from: this.from });
  }

  create() {
    background(this);
    playMusic('title');
    const meta = state.meta;
    const look = myLook(meta);

    button(this, 40, 28, 64, 36, '', () => this.scene.start(this.from, {}), { fontSize: 15, glyph: 'back' });
    text(this, W / 2 + 20, 14, 'Your trainer', 26, '#ffc94d', { fontStyle: 'bold' }).setOrigin(0.5, 0);

    // Preview: tap it to see how you look in battle (from behind, giving an order).
    const py = LANDSCAPE ? -6 : 0;
    const panel = this.add.rectangle(16, 62 + py, 160, 212, COLORS.panel).setOrigin(0).setStrokeStyle(2, COLORS.stroke);
    this.add.ellipse(96, 248 + py, 110, 22, 0x000000, 0.35);
    const pose: TrainerPose = previewPose === 'stand' ? 'stand' : 'backCommand';
    const img = this.add.image(pose === 'backCommand' ? 105 : 96, 164 + py, ensureTrainerTexture(this, look, pose)).setScale(5);
    trainerFx(this, img, look, { back: pose === 'backCommand' });
    if (tryOn) {
      tryOn = false;
      shinyBurst(this, img.x, img.y, 80, 10, 12);
    }
    this.tweens.add({ targets: img, y: 160 + py, yoyo: true, repeat: -1, duration: 900, ease: 'Sine.easeInOut' });
    text(this, 96, 266 + py, pose === 'backCommand' ? 'In battle (from behind) · tap' : 'Tap to see it in battle', 10, COLORS.textDim).setOrigin(0.5, 1);
    panel.setInteractive({ useHandCursor: true }).on('pointerup', () => {
      previewPose = previewPose === 'stand' ? 'back' : 'stand';
      this.scene.restart({ from: this.from });
    });

    // Name, shuffle and a note on where the trainer shows up.
    const nx = LANDSCAPE ? 96 : 307;
    const nw = LANDSCAPE ? 160 : 262;
    const title = myTitle(meta);
    const nb = button(this, nx, LANDSCAPE ? 306 : 92, nw, 56, myName(meta), () => this.nameMenu(), {
      fontSize: 20,
      sub: title ? titleSub(title) : LANDSCAPE ? 'Name and title' : 'Your name and title · tap to change',
      color: 0x2f4a6b,
      badge: newTitles(meta).length ? 'NEW' : undefined,
    });
    if (title) titleInButton(this, nb, title, 13);
    // Shuffle: everyday clothes only, or mixing in the gear you've unlocked.
    const hw = (nw - 6) / 2;
    button(this, nx - hw / 2 - 3, LANDSCAPE ? 364 : 158, hw, 44, 'Shuffle', () => {
      sfx.coin();
      this.set(randomLook(new Rng((Math.random() * 2 ** 31) | 0)));
    }, { fontSize: LANDSCAPE ? 14 : 16 });
    const extras = unlockedExtras(meta);
    button(this, nx + hw / 2 + 3, LANDSCAPE ? 364 : 158, hw, 44, LANDSCAPE ? '+ gear' : 'Shuffle + gear', () => {
      const rng = new Rng((Math.random() * 2 ** 31) | 0);
      const next = randomLook(rng);
      // Each part with unlocked gear wears some of it about half the time (always one piece at least).
      const keys = [...new Set(extras.map((e) => e.key))];
      keys.forEach((k, i) => {
        if (rng.next() < 0.5 || i === keys.length - 1) {
          const pool = extras.filter((e) => e.key === k);
          (next as unknown as Record<string, number>)[k] = pool[rng.int(0, pool.length - 1)].value;
        }
      });
      sfx.coin();
      tryOn = true;
      this.set(next);
    }, { fontSize: LANDSCAPE ? 14 : 15, enabled: extras.length > 0, color: 0x4a3a1c });
    // Upright only: sideways, the part tiles fill that space.
    if (!LANDSCAPE)
      text(
        this,
        180,
        192,
        'Your trainer stands beside your team in every battle. Online, your opponent sees your trainer and name, and you see theirs.',
        12,
        COLORS.textDim,
        { wordWrap: { width: 256 }, lineSpacing: 3 },
      );

    // One tile per part, two columns; tap to choose from a grid of previews.
    const t = tiles();
    const TILE_W = t.w;
    const fresh = newItems(meta);
    LOOK_PARTS.forEach((part, i) => {
      const x = t.x0 + (i % t.cols) * (TILE_W + 6);
      const y = t.top + Math.floor(i / t.cols) * (TILE_H + TILE_GAP);
      const v = look[part.key];
      const bg = this.add.rectangle(x, y, TILE_W, TILE_H, COLORS.panel).setOrigin(0).setStrokeStyle(1, COLORS.stroke);
      text(this, x + 10, y + 6, part.label, 11, COLORS.textDim);
      const sw = swatch(part.key, v);
      if (sw !== null) this.add.rectangle(x + 10, y + 26, 16, 16, sw).setOrigin(0).setStrokeStyle(2, 0xffffff, 0.5);
      text(this, x + (sw !== null ? 32 : 10), y + 24, part.names[v], 15, COLORS.text, { fontStyle: 'bold' });
      text(this, x + TILE_W - 12, y + TILE_H / 2, '▾', 16, COLORS.textDim).setOrigin(1, 0.5);
      if (fresh.some((f) => f.key === part.key)) newTag(this, x + TILE_W - 4, y + 4);
      bg.setInteractive({ useHandCursor: true }).on('pointerup', () => this.openPart(part, look));
    });
  }

  /** A grid of every option for one part, each shown on your trainer; tap one to wear it. */
  private openPart(part: Part, look: TrainerLook) {
    const layer = this.add.container(0, 0).setDepth(50);
    layer.add(fullRect(this, 0x000000, 0.65).setInteractive());
    const pm = LANDSCAPE ? 10 : 30;
    layer.add(this.add.rectangle(10, pm, W - 20, H - 2 * pm, COLORS.bg).setOrigin(0).setStrokeStyle(2, COLORS.stroke));
    layer.add(text(this, W / 2, pm + 10, part.label, 22, '#ffc94d', { fontStyle: 'bold' }).setOrigin(0.5, 0));
    const n = part.names.length;
    const cols = LANDSCAPE ? 7 : 4;
    const cellW = (W - 36) / cols;
    const rows = Math.ceil(n / cols);
    const top = LANDSCAPE ? 50 : 84;
    const cellH = Math.min(118, (H - top - (LANDSCAPE ? 62 : 146)) / rows);
    // Colors of a hat you aren't wearing would show nothing: preview them on a cap.
    const base: TrainerLook = part.key === 'hatColor' && look.hat === 0 ? { ...look, hat: 1 } : look;
    const close = () => layer.destroy();
    // Unlocked gear you haven't seen yet gets a NEW tag, once: opening the grid counts as seeing it.
    const unseen = new Set(newItems(state.meta).filter((i) => i.key === part.key).map((i) => i.value));
    if (unseen.size && markSeen(state.meta, 'seenItems', [...unseen].map((v) => itemId(part.key, v)))) saveMeta(state.meta);
    part.names.forEach((name, v) => {
      const x = 18 + (v % cols) * cellW;
      const y = top + Math.floor(v / cols) * cellH;
      const current = look[part.key] === v;
      const cell = this.add
        .rectangle(x + 2, y, cellW - 4, cellH - 6, current ? 0x3a2f58 : COLORS.panel)
        .setOrigin(0)
        .setStrokeStyle(2, current ? 0xffc94d : COLORS.stroke, current ? 1 : 0.6);
      layer.add(cell);
      const preview = { ...base, [part.key]: v } as TrainerLook;
      const scale = Math.min(2.4, (cellH - 30) / 34);
      // Title and Gilded milestone rewards stay locked (dimmed, with what unlocks them) until you earn them.
      const lock = lockOf(state.meta, part.key, v);
      const pimg = this.add.image(x + cellW / 2, y + (cellH - 22) / 2, ensureTrainerTexture(this, preview, 'stand')).setScale(scale).setAlpha(lock ? 0.3 : 1);
      layer.add(pimg);
      // Effects on this option's preview (only for the part that has them, so the grid stays calm).
      if (['aura', 'back', 'hat', 'shoes', 'top'].includes(part.key)) trainerFx(this, pimg, { ...DEFAULT_LOOK, [part.key]: v });
      if (lock) {
        layer.add(pixelIcon(this, x + cellW / 2, y + (cellH - 22) / 2, 'lock', 22));
        const need = text(this, x + cellW / 2, y + 8, lock.short, 10, lock.title ? TIER_INFO[lock.title.tier].color : '#ffd86b', {
          fontStyle: 'bold',
          stroke: '#120e1c',
          strokeThickness: 3,
        }).setOrigin(0.5, 0);
        if (need.width > cellW - 8) need.setScale((cellW - 8) / need.width);
        layer.add(need);
      } else if (unseen.has(v)) layer.add(newTag(this, x + cellW - 4, y + 4));
      else if (v >= (part.free ?? part.names.length)) layer.add(text(this, x + cellW - 8, y + 6, '✦', 13, '#ffd86b').setOrigin(1, 0));
      const sw = swatch(part.key, v);
      if (sw !== null) layer.add(this.add.rectangle(x + 8, y + 6, 12, 12, sw).setOrigin(0).setStrokeStyle(1, 0xffffff, 0.6));
      const label = text(this, x + cellW / 2, y + cellH - 18, name, 11, current ? '#ffc94d' : COLORS.text, { fontStyle: current ? 'bold' : 'normal' }).setOrigin(0.5);
      if (label.width > cellW - 10) label.setScale((cellW - 10) / label.width);
      layer.add(label);
      cell.setInteractive({ useHandCursor: true }).on('pointerup', () => {
        if (current) return close();
        if (lock) return showMessage(this, `✦ ${name}`, lock.long);
        sfx.coin();
        tryOn = true;
        this.set({ ...look, [part.key]: v });
      });
    });
    layer.add(button(this, W / 2, LANDSCAPE ? H - 34 : H - 62, 200, LANDSCAPE ? 36 : 44, 'Close', close, { fontSize: 16 }));
  }

  /** Change your name, or the title shown under it. */
  private nameMenu() {
    const meta = state.meta;
    const titles = earnedTitles(meta);
    const next = nextMilestone(meta);
    openPicker(this, {
      title: myName(meta),
      subtitle: myTitle(meta) ? titleSub(myTitle(meta)!) : undefined,
      options: [
        { label: 'Change name', glyph: 'book' },
        {
          label: 'Titles',
          glyph: 'crown',
          sub: `${titles.length}/${TITLES.length} earned${newTitles(meta).length ? ` · ${newTitles(meta).length} new!` : ' · shown to your opponent online'}`,
          badge: newTitles(meta).length ? 'NEW' : undefined,
        },
        { label: 'Gilded milestones', glyph: 'sparkle', sub: next ? `Next: ${next.count} Gilded species (you have ${gildedCount(meta)})` : 'All reached!' },
      ],
      onPick: (i) => (i === 0 ? this.rename() : i === 1 ? openTitles(this, meta, () => this.scene.restart({ from: this.from })) : openGildedMilestones(this, meta)),
      onCancel: () => {},
    });
  }

  private rename() {
    editTrainerName({ onDone: () => this.scene.restart({ from: this.from }) });
  }
}
