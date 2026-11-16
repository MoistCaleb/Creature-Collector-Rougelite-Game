import Phaser from 'phaser';
import { ensureIcon } from './icons';
import { sfx } from './sound';
import { button, COLORS, H, text, W } from './widgets';

/**
 * Full-screen "you got an Evolution Stone" moment: the stone pops in with a glow, light rays and
 * sparkles, a chime plays, and a short line says what it's for. Tap Continue to move on.
 */
export function stoneReveal(scene: Phaser.Scene, gained: number, total: number, onDone: () => void) {
  const root = scene.add.container(0, 0).setDepth(1100);
  const dim = scene.add.rectangle(0, 0, W, H, 0x0a0614, 0.86).setOrigin(0).setInteractive();
  root.add(dim);
  const cx = W / 2;
  const cy = 300;

  // Slowly turning light rays behind the stone.
  const rays = scene.add.graphics({ x: cx, y: cy });
  rays.fillStyle(0xb05ae0, 0.18);
  for (let i = 0; i < 12; i++) {
    const a = (i / 12) * Math.PI * 2;
    rays.fillTriangle(0, 0, Math.cos(a - 0.12) * 220, Math.sin(a - 0.12) * 220, Math.cos(a + 0.12) * 220, Math.sin(a + 0.12) * 220);
  }
  rays.setScale(0).setAlpha(0);
  root.add(rays);
  scene.tweens.add({ targets: rays, scale: 1, alpha: 1, duration: 450, ease: 'Back.easeOut' });
  scene.tweens.add({ targets: rays, angle: 360, duration: 14000, repeat: -1 });

  const glow = scene.add.circle(cx, cy, 70, 0xd08af0, 0.35).setScale(0);
  root.add(glow);
  scene.tweens.add({ targets: glow, scale: 1, duration: 400, ease: 'Back.easeOut' });
  scene.tweens.add({ targets: glow, scale: 1.18, alpha: 0.2, yoyo: true, repeat: -1, duration: 900, ease: 'Sine.easeInOut', delay: 400 });

  // The stone itself (several if you got more than one).
  const key = ensureIcon(scene, 'stone');
  const count = Math.min(gained, 3);
  for (let i = 0; i < count; i++) {
    const x = cx + (i - (count - 1) / 2) * 96;
    const img = scene.add.image(x, cy - 160, key).setScale(0).setAngle(-30);
    root.add(img);
    scene.tweens.add({ targets: img, y: cy, scale: count > 1 ? 6 : 8, angle: 0, duration: 520, delay: 120 + i * 140, ease: 'Back.easeOut' });
    scene.tweens.add({ targets: img, y: cy - 8, yoyo: true, repeat: -1, duration: 1100, delay: 700 + i * 140, ease: 'Sine.easeInOut' });
  }

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

  const title = gained > 1 ? `${gained} Evolution Stones!` : 'Evolution Stone!';
  const t = text(scene, cx, 430, title, 30, '#e0a8ff', { fontStyle: 'bold', align: 'center' }).setOrigin(0.5).setAlpha(0);
  const sub = text(
    scene,
    cx,
    490,
    `You now have ${total}.\nOn the Team screen, use one to evolve a creature that has reached its level cap.`,
    15,
    COLORS.text,
    { align: 'center', wordWrap: { width: W - 70 }, lineSpacing: 4 },
  )
    .setOrigin(0.5, 0)
    .setAlpha(0);
  root.add([t, sub]);
  scene.tweens.add({ targets: [t, sub], alpha: 1, duration: 350, delay: 450 });
  scene.time.delayedCall(150, () => sfx.stone());

  let closed = false;
  const btn = button(scene, cx, 660, W - 80, 60, 'Continue', () => {
    if (closed) return;
    closed = true;
    root.destroy();
    onDone();
  }, { color: 0x5b3c8a, fontSize: 20 });
  btn.setAlpha(0);
  root.add(btn);
  scene.tweens.add({ targets: btn, alpha: 1, duration: 300, delay: 700 });
  return root;
}
