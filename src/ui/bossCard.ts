import Phaser from 'phaser';
import type { BossDef, BossRule } from '../data/trainers';
import { icon } from './icons';
import { sfx } from './sound';
import { button, COLORS, fullRect, H, LANDSCAPE, text, W } from './widgets';

/** Each guardian rule in a few words, and whether it works against you or powers up the guardian. */
export const RULE_TAGS: Record<BossRule, { tag: string; against: 'you' | 'foe' }> = {
  scorch: { tag: 'YOUR HEXLING BURNS EVERY TURN', against: 'you' },
  whiteout: { tag: '−1 SPEED WHEN YOU SEND ONE IN', against: 'you' },
  thorns: { tag: 'YOUR HITS RECOIL 15%', against: 'you' },
  bulwark: { tag: 'THEIR HEXLINGS +1 DEFENSE', against: 'foe' },
  tailwind: { tag: 'THEY ALWAYS MOVE FIRST', against: 'foe' },
  riptide: { tag: '−1/8 HP WHEN YOU SEND ONE IN', against: 'you' },
  overclock: { tag: 'THEY GAIN +1 ATTACK EVERY TURN', against: 'foe' },
  miasma: { tag: 'POISONED WHEN YOU SEND ONE IN', against: 'you' },
  dread: { tag: '−1 ATTACK WHEN YOU SEND ONE IN', against: 'you' },
  sanctuary: { tag: 'THEY HEAL EVERY TURN', against: 'foe' },
  curse: { tag: 'EACH FAINT OF THEIRS HITS YOU HARD', against: 'you' },
  pride: { tag: 'THEIR ACE +1 ATTACK, +1 SPEED', against: 'foe' },
};

/**
 * The guardian's rule, before the fight: a warning card that makes the rule impossible to miss.
 * A hazard-striped header, the rule's name in big red, a short summary of what it does, whether it
 * hurts your Hexlings or powers up theirs, and the full description. "Fight!" closes it.
 */
export function bossRuleCard(scene: Phaser.Scene, boss: BossDef, onFight: () => void) {
  const info = RULE_TAGS[boss.rule];
  const root = scene.add.container(0, 0).setDepth(1000);
  root.add(fullRect(scene, 0x000000, 0.8).setInteractive());
  const pw = LANDSCAPE ? 640 : W - 24;
  const ph = LANDSCAPE ? 420 : 470;
  const panel = scene.add.container(W / 2, H / 2);
  root.add(panel);
  // Panel-local coordinates: the panel's top-left corner is (left, top).
  const left = -pw / 2;
  const top = -ph / 2;
  panel.add(scene.add.rectangle(0, 0, pw, ph, 0x1c1424).setStrokeStyle(3, 0xe0524a));

  // Hazard header: red and black stripes.
  const hh = 34;
  const stripes = scene.add.graphics();
  stripes.fillStyle(0xe0524a, 1).fillRect(left, top, pw, hh);
  stripes.fillStyle(0x1a0a0e, 1);
  for (let x = 0; x < pw + hh; x += 26) {
    if (left + x - hh >= left + pw) break;
    const x0 = Math.max(left, left + x - hh);
    stripes.fillPoints(
      [
        new Phaser.Math.Vector2(Math.min(left + pw, left + x), top),
        new Phaser.Math.Vector2(Math.min(left + pw, left + x + 12), top),
        new Phaser.Math.Vector2(Math.max(left, left + x + 12 - hh), top + hh),
        new Phaser.Math.Vector2(x0, top + hh),
      ],
      true,
    );
  }
  panel.add(stripes);
  panel.add(scene.add.rectangle(0, top + hh / 2, LANDSCAPE ? 250 : 236, 26, 0x1a0a0e).setStrokeStyle(2, 0xe0524a));
  panel.add(icon(scene, -(LANDSCAPE ? 104 : 98), top + hh / 2, 'skull', 16));
  panel.add(icon(scene, LANDSCAPE ? 104 : 98, top + hh / 2, 'skull', 16));
  panel.add(text(scene, 0, top + hh / 2, 'GUARDIAN RULE', 16, '#ff6a5a', { fontStyle: 'bold' }).setOrigin(0.5));

  // Who and their quote.
  let y = top + hh + 14;
  panel.add(text(scene, 0, y, `${boss.name}, ${boss.title}`, 20, '#ffc94d', { fontStyle: 'bold', align: 'center', wordWrap: { width: pw - 30 } }).setOrigin(0.5, 0));
  y += 30;
  const quote = text(scene, 0, y, `"${boss.quote}"`, 13, COLORS.textDim, { fontStyle: 'italic', align: 'center', wordWrap: { width: pw - 50 } }).setOrigin(0.5, 0);
  panel.add(quote);
  y += quote.height + 14;

  // The rule itself.
  const boxH = LANDSCAPE ? 200 : 250;
  const box = scene.add.rectangle(0, y, pw - 28, boxH, 0x3a0d14).setOrigin(0.5, 0).setStrokeStyle(3, 0xff4d4d);
  panel.add(box);
  scene.tweens.add({ targets: box, strokeAlpha: 0.35, yoyo: true, repeat: -1, duration: 520, ease: 'Sine.easeInOut' });
  let by = y + 14;
  panel.add(text(scene, 0, by, boss.ruleName.toUpperCase(), LANDSCAPE ? 30 : 32, '#ffffff', { fontStyle: 'bold', stroke: '#8a1c1c', strokeThickness: 6 }).setOrigin(0.5, 0));
  by += LANDSCAPE ? 50 : 58;
  // Against you (red) or powering them up (orange).
  const against = info.against === 'you';
  const who = against ? 'HURTS YOUR HEXLINGS' : 'POWERS UP THEIR HEXLINGS';
  const whoChip = scene.add.container(0, by);
  const whoT = text(scene, 0, 0, who, 12, '#1a0a0e', { fontStyle: 'bold' }).setOrigin(0.5);
  whoChip.add([scene.add.rectangle(0, 0, whoT.width + 20, 22, against ? 0xff6a5a : 0xffa04d), whoT]);
  panel.add(whoChip);
  by += 24;
  // The summary, big.
  const tag = text(scene, 0, by, info.tag, LANDSCAPE ? 20 : 21, against ? '#ff8a7a' : '#ffc06a', { fontStyle: 'bold', align: 'center', wordWrap: { width: pw - 70 } }).setOrigin(0.5, 0);
  panel.add(tag);
  scene.tweens.add({ targets: tag, scale: 1.05, yoyo: true, repeat: -1, duration: 600, ease: 'Sine.easeInOut' });
  by += tag.height + 14;
  panel.add(scene.add.rectangle(0, by, pw - 80, 1, 0xff6a5a, 0.5));
  by += 10;
  panel.add(text(scene, 0, by, boss.ruleDesc, 15, COLORS.text, { align: 'center', wordWrap: { width: pw - 70 }, lineSpacing: 3 }).setOrigin(0.5, 0));
  panel.add(text(scene, 0, y + boxH - 22, 'Shown on screen for the whole fight', 11, COLORS.textDim).setOrigin(0.5, 0));

  const close = () => {
    root.destroy();
    onFight();
  };
  panel.add(button(scene, 0, top + ph - 38, LANDSCAPE ? 260 : 300, 50, 'Fight!', close, { color: 0x8a2c2c, fontSize: 20, glyph: 'swords' }));

  // It slams in.
  panel.setScale(1.25).setAlpha(0);
  scene.tweens.add({
    targets: panel,
    scale: 1,
    alpha: 1,
    duration: 220,
    ease: 'Back.easeOut',
    onComplete: () => {
      sfx.statDown();
      scene.cameras.main.shake(180, 0.006);
      scene.tweens.add({ targets: box, x: { from: -6, to: 6 }, yoyo: true, repeat: 2, duration: 40, onComplete: () => box.setX(0) });
    },
  });
  return root;
}
