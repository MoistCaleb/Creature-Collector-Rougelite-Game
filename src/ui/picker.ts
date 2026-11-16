import Phaser from 'phaser';
import type { Creature } from '../logic/creature';
import { button, COLORS, creatureRow, creatureSprite, H, text, W } from './widgets';

export interface PickOption {
  label?: string;
  sub?: string;
  creature?: Creature;
  note?: string;
  disabled?: boolean;
  color?: number;
  /** Creature sprite shown at the left of a plain option. */
  icon?: Creature;
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
}

/** Full-screen modal list of choices, drawn on top of the current scene. */
export function openPicker(scene: Phaser.Scene, cfg: PickConfig): Phaser.GameObjects.Container {
  const root = scene.add.container(0, 0).setDepth(1000);
  const dim = scene.add.rectangle(0, 0, W, H, 0x000000, 0.78).setOrigin(0).setInteractive();
  root.add(dim);

  const close = () => root.destroy();

  const rowH = cfg.options.some((o) => o.creature) ? 72 : 76;
  const rowHeight = (r: PickRow) => (r.big ? 84 : 48);
  const infoH = (cfg.rows ?? []).reduce((h, r) => h + rowHeight(r), 0) + (cfg.rows?.length ? 10 : 0);
  const listH = cfg.options.length * rowH + infoH;
  const title = text(scene, W / 2, 0, cfg.title, 22, '#ffc94d', { fontStyle: 'bold', align: 'center', wordWrap: { width: W - 60 } }).setOrigin(0.5, 0);
  const sub = cfg.subtitle
    ? text(scene, W / 2, 0, cfg.subtitle, 15, COLORS.text, { align: 'center', wordWrap: { width: W - 70 }, lineSpacing: 4 }).setOrigin(0.5, 0)
    : null;
  const headerH = 18 + title.height + 12 + (sub ? sub.height + 18 : 0);
  const footerH = cfg.onCancel ? 70 : 10;
  const panelH = Math.min(H - 40, headerH + listH + footerH + 10);
  const top = Math.max(20, (H - panelH) / 2);

  root.add(scene.add.rectangle(W / 2, top, W - 24, panelH, COLORS.panel).setOrigin(0.5, 0).setStrokeStyle(2, COLORS.stroke));
  title.setY(top + 18);
  root.add(title);
  if (sub) {
    sub.setY(top + 30 + title.height);
    root.add(sub);
  }

  let y = top + headerH;
  for (const r of cfg.rows ?? []) {
    const h = rowHeight(r) - 6;
    root.add(scene.add.rectangle(30, y, W - 60, h, COLORS.panelLight).setOrigin(0));
    root.add(creatureSprite(scene, r.big ? 76 : 58, y + h / 2 - (r.big ? 12 : 7), r.creature, r.big ? 2.6 : 1.3));
    root.add(
      text(scene, r.big ? 124 : 88, y + h / 2, r.text, r.big ? 18 : 15, COLORS.text, { wordWrap: { width: W - (r.big ? 170 : 130) } }).setOrigin(0, 0.5),
    );
    y += rowHeight(r);
  }
  if (cfg.rows?.length) y += 10;
  cfg.options.forEach((o, i) => {
    const pick = () => {
      close();
      cfg.onPick(i);
    };
    if (o.creature) {
      root.add(
        creatureRow(scene, 30, y, W - 60, o.creature, {
          onClick: o.disabled ? undefined : pick,
          dim: o.disabled,
          note: o.note,
        }),
      );
    } else {
      root.add(
        button(scene, W / 2, y + (rowH - 8) / 2, W - 60, rowH - 10, o.label ?? '', pick, {
          sub: o.sub,
          enabled: !o.disabled,
          color: o.color,
          fontSize: 17,
          icon: o.icon,
        }),
      );
    }
    y += rowH;
  });

  if (cfg.onCancel) {
    root.add(
      button(scene, W / 2, top + panelH - 40, 200, 46, cfg.cancelLabel ?? 'Cancel', () => {
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
