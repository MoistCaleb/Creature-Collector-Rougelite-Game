import Phaser from 'phaser';
import { HELD, type HeldId } from '../data/held';
import { ensureIcon, type IconId } from './icons';
import { sfx } from './sound';
import { button, COLORS, fullRect, H, LANDSCAPE, text, W } from './widgets';

interface RevealOpts {
  /** One icon per thing gained (up to 3 are shown). */
  icons: IconId[];
  title: string;
  titleColor: string;
  sub: string;
  /** Colors for the light rays / glow and the Continue button. */
  ray: number;
  glow: number;
  buttonColor: number;
}

/**
 * Full-screen "you got something" moment: the reward pops in with a glow, light rays and sparkles,
 * a chime plays, and a short line says what it's for. Continue (or a tap anywhere, Enter, Space or
 * Escape, once it has appeared) moves on. Laid out for the board's height, so it fits sideways too
 * (phones turned over, and Mac and PC windows).
 */
function rewardReveal(scene: Phaser.Scene, o: RevealOpts, onDone: () => void) {
  const root = scene.add.container(0, 0).setDepth(1100);
  const dim = fullRect(scene, 0x0a0614, 0.86).setInteractive();
  root.add(dim);
  const cx = W / 2;
  // Upright: the reward high, words and button below. Sideways (450 tall): everything closer together.
  const cy = LANDSCAPE ? 130 : 300;
  const iconScale = LANDSCAPE ? 0.75 : 1;

  // Slowly turning light rays behind the reward.
  const rays = scene.add.graphics({ x: cx, y: cy });
  rays.fillStyle(o.ray, 0.18);
  for (let i = 0; i < 12; i++) {
    const a = (i / 12) * Math.PI * 2;
    rays.fillTriangle(0, 0, Math.cos(a - 0.12) * 220, Math.sin(a - 0.12) * 220, Math.cos(a + 0.12) * 220, Math.sin(a + 0.12) * 220);
  }
  rays.setScale(0).setAlpha(0);
  root.add(rays);
  scene.tweens.add({ targets: rays, scale: 1, alpha: 1, duration: 450, ease: 'Back.easeOut' });
  scene.tweens.add({ targets: rays, angle: 360, duration: 14000, repeat: -1 });

  const glow = scene.add.circle(cx, cy, 70, o.glow, 0.35).setScale(0);
  root.add(glow);
  scene.tweens.add({ targets: glow, scale: 1, duration: 400, ease: 'Back.easeOut' });
  scene.tweens.add({ targets: glow, scale: 1.18, alpha: 0.2, yoyo: true, repeat: -1, duration: 900, ease: 'Sine.easeInOut', delay: 400 });

  // The reward itself (several if you got more than one).
  const shown = o.icons.slice(0, 3);
  shown.forEach((id, i) => {
    const x = cx + (i - (shown.length - 1) / 2) * 96;
    const img = scene.add.image(x, cy - 160, ensureIcon(scene, id)).setScale(0).setAngle(-30);
    root.add(img);
    scene.tweens.add({ targets: img, y: cy, scale: (shown.length > 1 ? 6 : 8) * iconScale, angle: 0, duration: 520, delay: 120 + i * 140, ease: 'Back.easeOut' });
    scene.tweens.add({ targets: img, y: cy - 8, yoyo: true, repeat: -1, duration: 1100, delay: 700 + i * 140, ease: 'Sine.easeInOut' });
  });

  // Sparkles drifting up around it.
  scene.time.addEvent({
    delay: 140,
    repeat: 40,
    callback: () => {
      if (!root.active) return;
      const s = scene.add.star(cx + Phaser.Math.Between(-110, 110), cy + Phaser.Math.Between(-30, 70), 4, 2, 6, 0xffffff).setAlpha(0.9);
      root.add(s);
      scene.tweens.add({ targets: s, y: s.y - Phaser.Math.Between(50, 110), alpha: 0, angle: 180, duration: 1100, onComplete: () => s.destroy() });
    },
  });

  const textW = LANDSCAPE ? 560 : W - 40;
  const t = text(scene, cx, LANDSCAPE ? 248 : 430, o.title, LANDSCAPE ? 26 : 30, o.titleColor, { fontStyle: 'bold', align: 'center', wordWrap: { width: textW } })
    .setOrigin(0.5)
    .setAlpha(0);
  const sub = text(scene, cx, LANDSCAPE ? 274 : 480, o.sub, LANDSCAPE ? 14 : 15, COLORS.text, { align: 'center', wordWrap: { width: textW - 30 }, lineSpacing: 4 })
    .setOrigin(0.5, 0)
    .setAlpha(0);
  root.add([t, sub]);
  scene.tweens.add({ targets: [t, sub], alpha: 1, duration: 350, delay: 450 });
  scene.time.delayedCall(150, () => sfx.stone());

  let closed = false;
  let ready = false;
  const keys = scene.input.keyboard;
  const close = () => {
    if (closed) return;
    closed = true;
    keys?.off('keydown', onKey);
    root.destroy();
    onDone();
  };
  const onKey = (e: KeyboardEvent) => {
    if (ready && (e.key === 'Enter' || e.key === ' ' || e.key === 'Escape')) close();
  };
  keys?.on('keydown', onKey);
  root.once('destroy', () => keys?.off('keydown', onKey));
  // Always on screen: under the words (they shrink if they'd run into it), never past the bottom edge.
  const bh = LANDSCAPE ? 50 : 60;
  const by = Math.min(H - bh / 2 - 10, Math.max(LANDSCAPE ? 400 : 680, sub.y + sub.height + 14 + bh / 2));
  const room = by - bh / 2 - 12 - sub.y;
  if (sub.height > room) sub.setScale(room / sub.height);
  const btn = button(scene, cx, by, LANDSCAPE ? 300 : W - 80, bh, 'Continue', close, { color: o.buttonColor, fontSize: 20 });
  btn.setAlpha(0);
  root.add(btn);
  scene.tweens.add({ targets: btn, alpha: 1, duration: 300, delay: 700, onComplete: () => (ready = true) });
  // A tap anywhere also continues, once the button has appeared.
  dim.on('pointerup', () => ready && close());
  return root;
}

/** "Evolution Stone!" */
export function stoneReveal(scene: Phaser.Scene, gained: number, total: number, onDone: () => void) {
  return rewardReveal(
    scene,
    {
      icons: Array(gained).fill('stone'),
      title: gained > 1 ? `${gained} Evolution Stones!` : 'Evolution Stone!',
      titleColor: '#e0a8ff',
      sub: `You now have ${total}.\nOn the Team screen, use one to evolve a Hexling at Lv 30 (or Lv 65 for its final form).`,
      ray: 0xb05ae0,
      glow: 0xd08af0,
      buttonColor: 0x5b3c8a,
    },
    onDone,
  );
}

/** "New held item!" — names each item and what it does. */
export function itemReveal(scene: Phaser.Scene, items: HeldId[], onDone: () => void) {
  const one = items.length === 1;
  const lines = items.slice(0, 3).map((id) => (one ? HELD[id].desc : `${HELD[id].name}: ${HELD[id].desc}`));
  if (items.length > 3) lines.push(`…and ${items.length - 3} more`);
  return rewardReveal(
    scene,
    {
      icons: items.map((id) => HELD[id].icon),
      title: one ? HELD[items[0]].name : `${items.length} held items!`,
      titleColor: '#ffc94d',
      sub: `${lines.join('\n')}\n\nIt's in your Bag: give it to a Hexling from the Bag or the Team screen.`,
      ray: 0xffc94d,
      glow: 0xffe08a,
      buttonColor: 0x2f4a6b,
    },
    onDone,
  );
}
