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
  brittle: { tag: '−1 DEFENSE WHEN YOU SEND ONE IN', against: 'you' },
  fog: { tag: 'YOUR MOVES −15% ACCURACY', against: 'you' },
  keeneye: { tag: 'THEIR MOVES NEVER MISS', against: 'foe' },
  leech: { tag: 'THEY DRAIN YOU EVERY TURN', against: 'you' },
  vengeance: { tag: '+1 ATTACK AFTER EACH FAINT', against: 'foe' },
  static: { tag: 'MAY BE PARALYSED WHEN YOU SEND ONE IN', against: 'you' },
  ironhide: { tag: 'SUPER-EFFECTIVE HITS WEAKER', against: 'foe' },
  secondwind: { tag: 'THEY HEAL ONCE WHEN LOW', against: 'foe' },
};

export interface RuleInfo {
  rule: BossRule;
  name: string;
  desc: string;
}

/**
 * The guardian's rule, before the fight: a warning card that makes the rule impossible to miss.
 * A hazard-striped header, the rule's name in big red, a short summary of what it does, whether it
 * hurts your Hexlings or powers up theirs, and the full description. "Fight!" closes it.
 */
export function bossRuleCard(scene: Phaser.Scene, boss: BossDef, rules: RuleInfo[], onFight: () => void) {
  const n = rules.length;
  const root = scene.add.container(0, 0).setDepth(1000);
  root.add(fullRect(scene, 0x000000, 0.8).setInteractive());
  // One rule: a big box. Two or three (higher Heat): stacked upright, side by side sideways.
  const pw = LANDSCAPE ? (n > 1 ? 780 : 640) : W - 24;
  const boxH = n === 1 ? (LANDSCAPE ? 200 : 250) : LANDSCAPE ? 206 : n === 2 ? 168 : 158;
  const headH = 34 + 14 + 30 + 40;
  const ph = LANDSCAPE ? 430 : n === 1 ? 470 : headH + n * (boxH + 8) + 80;
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
  panel.add(text(scene, 0, top + hh / 2, n > 1 ? `${n} GUARDIAN RULES` : 'GUARDIAN RULE', 16, '#ff6a5a', { fontStyle: 'bold' }).setOrigin(0.5));

  // Who and their quote.
  let y = top + hh + 14;
  panel.add(text(scene, 0, y, `${boss.name}, ${boss.title}`, 20, '#ffc94d', { fontStyle: 'bold', align: 'center', wordWrap: { width: pw - 30 } }).setOrigin(0.5, 0));
  y += 30;
  const quote = text(scene, 0, y, `"${boss.quote}"`, 13, COLORS.textDim, { fontStyle: 'italic', align: 'center', wordWrap: { width: pw - 50 } }).setOrigin(0.5, 0);
  panel.add(quote);
  y += quote.height + 14;

  // The rules.
  const boxW = LANDSCAPE && n > 1 ? (pw - 28 - (n - 1) * 8) / n : pw - 28;
  rules.forEach((r, i) => {
    const bx = LANDSCAPE && n > 1 ? -pw / 2 + 14 + boxW / 2 + i * (boxW + 8) : 0;
    const byTop = LANDSCAPE && n > 1 ? y : y + i * (boxH + 8);
    ruleBox(scene, panel, bx, byTop, boxW, boxH, r, n === 1, i > 0);
  });

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
      scene.tweens.add({ targets: panel, x: { from: W / 2 - 6, to: W / 2 + 6 }, yoyo: true, repeat: 2, duration: 40, onComplete: () => panel.setX(W / 2) });
    },
  });
  return root;
}

/** One rule in its pulsing red box: name, who it hits, a short summary and the full description. */
function ruleBox(scene: Phaser.Scene, panel: Phaser.GameObjects.Container, x: number, y: number, w: number, h: number, r: RuleInfo, big: boolean, extra: boolean) {
  const info = RULE_TAGS[r.rule];
  const box = scene.add.rectangle(x, y, w, h, 0x3a0d14).setOrigin(0.5, 0).setStrokeStyle(3, 0xff4d4d);
  panel.add(box);
  scene.tweens.add({ targets: box, strokeAlpha: 0.35, yoyo: true, repeat: -1, duration: 520, ease: 'Sine.easeInOut' });
  if (extra) {
    const t = text(scene, x - w / 2 + 8, y + 6, 'HEAT', 10, '#1a0a0e', { fontStyle: 'bold', backgroundColor: '#ffa04d', padding: { x: 4, y: 1 } });
    panel.add(t);
  }
  const ww = w - 24;
  let by = y + (big ? 14 : 10);
  const name = text(scene, x, by, r.name.toUpperCase(), big ? (LANDSCAPE ? 30 : 32) : 22, '#ffffff', {
    fontStyle: 'bold',
    stroke: '#8a1c1c',
    strokeThickness: big ? 6 : 5,
    align: 'center',
    wordWrap: { width: ww },
  }).setOrigin(0.5, 0);
  panel.add(name);
  by += name.height + (big ? 8 : 4);
  // Against you (red) or powering them up (orange).
  const against = info.against === 'you';
  const who = against ? 'HURTS YOUR HEXLINGS' : 'POWERS UP THEIR HEXLINGS';
  const chipT = text(scene, x, by + 11, who, big ? 12 : 10, '#1a0a0e', { fontStyle: 'bold' }).setOrigin(0.5);
  panel.add([scene.add.rectangle(x, by + 11, chipT.width + 16, big ? 22 : 18, against ? 0xff6a5a : 0xffa04d), chipT]);
  by += big ? 30 : 26;
  // The summary, big.
  const tag = text(scene, x, by, info.tag, big ? (LANDSCAPE ? 20 : 21) : 15, against ? '#ff8a7a' : '#ffc06a', {
    fontStyle: 'bold',
    align: 'center',
    wordWrap: { width: ww },
  }).setOrigin(0.5, 0);
  panel.add(tag);
  scene.tweens.add({ targets: tag, scale: 1.05, yoyo: true, repeat: -1, duration: 600, ease: 'Sine.easeInOut' });
  by += tag.height + (big ? 14 : 8);
  panel.add(scene.add.rectangle(x, by, w - 50, 1, 0xff6a5a, 0.5));
  by += big ? 10 : 6;
  panel.add(text(scene, x, by, r.desc, big ? 15 : 12, COLORS.text, { align: 'center', wordWrap: { width: ww }, lineSpacing: 2 }).setOrigin(0.5, 0));
  if (big) panel.add(text(scene, x, y + h - 22, 'Shown on screen for the whole fight', 11, COLORS.textDim).setOrigin(0.5, 0));
}
