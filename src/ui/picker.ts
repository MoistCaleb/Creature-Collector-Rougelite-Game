import Phaser from 'phaser';
import { holdScroll } from './scroll';
import type { Creature } from '../logic/creature';
import { button, COLORS, creatureRow, creatureSprite, fullRect, H, LANDSCAPE, OX, OY, text, W } from './widgets';

export interface PickOption {
  label?: string;
  sub?: string;
  creature?: Creature;
  note?: string;
  disabled?: boolean;
  color?: number;
  /** Creature sprite shown at the left of a plain option. */
  icon?: Creature;
  /** Small gold tag on the option, e.g. "RECOMMENDED". */
  badge?: string;
  /** Pixel icon next to the label. */
  glyph?: import('./icons').IconId;
}

/** A read-only line with a creature sprite, listed above the options. */
export interface PickRow {
  creature: Creature;
  text: string;
  /** Taller row with a bigger sprite, for prompts about a single creature. */
  big?: boolean;
}

export interface PickConfig {
  title: string;
  subtitle?: string;
  rows?: PickRow[];
  options: PickOption[];
  onPick: (index: number) => void;
  cancelLabel?: string;
  onCancel?: () => void;
  /** Height of each option row (default 76; smaller fits long lists). */
  rowHeight?: number;
}

/** Full-screen modal list of choices, drawn on top of the current scene. */
export function openPicker(scene: Phaser.Scene, cfg: PickConfig): Phaser.GameObjects.Container {
  // Upright: the full width. Sideways (wide windows, Mac and PC): a wide panel with the options in two
  // columns, so a long list fits on one page instead of paging one at a time.
  const PW = LANDSCAPE ? Math.min(W - 30, 760) : Math.min(W, 480);
  const cols = LANDSCAPE && cfg.options.length > 2 ? 2 : 1;
  const colW = (PW - 60 - (cols - 1) * 10) / cols;
  // Sideways, a creature's info row stays compact.
  const big = (r: PickRow) => !!r.big && !LANDSCAPE;
  const root = scene.add.container((W - PW) / 2, 0).setDepth(1000);
  holdScroll(root);
  const dim = fullRect(scene, 0x000000, 0.78).setPosition(-(W - PW) / 2 - OX, -OY).setInteractive();
  root.add(dim);

  const close = () => root.destroy();

  // Small info rows shrink (down to 34) when they'd push a short list of choices off the panel.
  let smallH = 48;
  const rowHeight = (r: PickRow) => (big(r) ? 84 : smallH);
  const title = text(scene, PW / 2, 0, cfg.title, 22, '#ffc94d', { fontStyle: 'bold', align: 'center', wordWrap: { width: PW - 60 } }).setOrigin(0.5, 0);
  const sub = cfg.subtitle
    ? text(scene, PW / 2, 0, cfg.subtitle, 15, COLORS.text, { align: 'center', wordWrap: { width: PW - 70 }, lineSpacing: 4 }).setOrigin(0.5, 0)
    : null;
  const headerH = 18 + title.height + 12 + (sub ? sub.height + 18 : 0);
  const rows = cfg.rows ?? [];
  if (rows.length && !rows.some(big) && cfg.options.length <= cols) {
    const spare = H - 40 - headerH - (cfg.rowHeight ?? 76) - (cfg.onCancel ? 70 : 10) - 20 - 10;
    if (rows.length * smallH > spare) smallH = Math.max(34, Math.floor(spare / rows.length));
  }
  const infoH = rows.reduce((h, r) => h + rowHeight(r), 0) + (rows.length ? 10 : 0);

  // Long lists: shrink rows a little, then split into pages.
  const n = cfg.options.length;
  const lines = Math.ceil(n / cols);
  const hasCreatures = cfg.options.some((o) => o.creature);
  let rowH = cfg.rowHeight ?? (hasCreatures ? 72 : 76);
  const room = (footer: number) => H - 40 - headerH - infoH - footer - 10;
  if (!cfg.rowHeight && !hasCreatures && lines * rowH > room(cfg.onCancel ? 70 : 10)) rowH = Math.max(60, Math.floor(room(70) / lines));
  const paged = lines * rowH > room(cfg.onCancel ? 70 : 10);
  const footerH = cfg.onCancel || paged ? 70 : 10;
  const perPage = paged ? Math.max(1, Math.floor(room(footerH) / rowH)) * cols : n;
  const pages = Math.ceil(n / perPage);
  const listH = Math.ceil(Math.min(n, perPage) / cols) * rowH + infoH;
  const panelH = Math.min(H - 40, headerH + listH + footerH + 10);
  const top = Math.max(20, (H - panelH) / 2);

  root.add(scene.add.rectangle(PW / 2, top, PW - 24, panelH, COLORS.panel).setOrigin(0.5, 0).setStrokeStyle(2, COLORS.stroke));
  title.setY(top + 18);
  root.add(title);
  if (sub) {
    sub.setY(top + 30 + title.height);
    root.add(sub);
  }

  let y = top + headerH;
  for (const r of cfg.rows ?? []) {
    const h = rowHeight(r) - 6;
    const b = big(r);
    root.add(scene.add.rectangle(30, y, PW - 60, h, COLORS.panelLight).setOrigin(0));
    const tight = !b && smallH < 48;
    root.add(creatureSprite(scene, b ? 76 : 58, y + h / 2 - (b ? 12 : tight ? 4 : 7), r.creature, b ? 2.6 : tight ? 0.95 : 1.3));
    root.add(text(scene, b ? 124 : 88, y + h / 2, r.text, b ? 18 : 15, COLORS.text, { wordWrap: { width: PW - (b ? 170 : 130) } }).setOrigin(0, 0.5));
    y += rowHeight(r);
  }
  if (cfg.rows?.length) y += 10;
  const listTop = y;
  const list = scene.add.container(0, 0);
  root.add(list);

  let page = 0;
  const pageLabel = paged ? text(scene, PW / 2, top + panelH - 76, '', 12, COLORS.textDim).setOrigin(0.5) : null;
  if (pageLabel) root.add(pageLabel);
  const drawPage = () => {
    list.removeAll(true);
    for (let i = page * perPage; i < Math.min(n, (page + 1) * perPage); i++) {
      const o = cfg.options[i];
      const k = i - page * perPage;
      const x0 = 30 + (k % cols) * (colW + 10);
      const yy = listTop + Math.floor(k / cols) * rowH;
      const pick = () => {
        close();
        cfg.onPick(i);
      };
      if (o.creature) {
        list.add(creatureRow(scene, x0, yy, colW, o.creature, { onClick: o.disabled ? undefined : pick, dim: o.disabled, note: o.note }));
      } else {
        list.add(
          button(scene, x0 + colW / 2, yy + (rowH - 8) / 2, colW, rowH - 10, o.label ?? '', pick, {
            sub: o.sub,
            enabled: !o.disabled,
            color: o.color,
            fontSize: rowH < 70 ? 15 : 17,
            icon: o.icon,
            badge: o.badge,
            glyph: o.glyph,
          }),
        );
      }
    }
    pageLabel?.setText(`Page ${page + 1} of ${pages}`);
  };
  drawPage();

  const fy = top + panelH - 40;
  if (paged) {
    const turn = (d: number) => {
      page = (page + d + pages) % pages;
      drawPage();
    };
    root.add(button(scene, 66, fy, 76, 46, '', () => turn(-1), { glyph: 'back', fontSize: 16 }));
    root.add(button(scene, PW - 66, fy, 76, 46, '', () => turn(1), { glyph: 'play', fontSize: 16 }));
  }
  if (cfg.onCancel) {
    root.add(
      button(scene, PW / 2, fy, paged ? 180 : 200, 46, cfg.cancelLabel ?? 'Cancel', () => {
        close();
        cfg.onCancel!();
      }),
    );
  }
  return root;
}

export function showMessage(scene: Phaser.Scene, title: string, body: string, onDone: () => void = () => {}) {
  openPicker(scene, { title, subtitle: body, options: [{ label: 'Continue', color: 0x3b6d4a }], onPick: onDone });
}
