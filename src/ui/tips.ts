import type Phaser from 'phaser';
import { prefs } from './prefs';
import { button, COLORS, fullRect, H, LANDSCAPE, text, W } from './widgets';

/** First-time tips: each shows once, the first time you reach that part of the game. */
export const TIPS = {
  map: {
    title: 'Climb the map',
    body: 'Tap a glowing hex above yours to move there. Drag to scroll. Every route to the guardian at the top is the same length, so choose the stops you want.\n\nTap your team to see stats and moves, or to swap members with the bench.',
  },
  battle: {
    title: 'Your first battle',
    body: 'Tap a move to attack. ▲ on a move means it’s strong against the foe, ▼ means it’s resisted.\n\nSwitching and potions use your turn. Auto and the speed button are next to Switch.',
  },
  catch: {
    title: 'Catch it?',
    body: 'The last wild Hexling can’t faint: it’s down to 1 HP. Catch it to make it join your team (you give up this battle’s XP and coins), or Continue to finish it for the rewards.\n\nEvery Hexling that joins you becomes a starter for future runs.',
  },
  boss: {
    title: 'A guardian!',
    body: 'Each floor ends with a guardian. Its rule is shown on screen for the whole fight, so plan around it.\n\nWin and you choose a reward, then climb to the next floor.',
  },
  shop: {
    title: 'Shop',
    body: 'Coins only last for this run, so spend them. Items take effect right away. Rerolling shows new stock for a rising fee.',
  },
  event: {
    title: 'Events',
    body: 'Events are risks and rewards. Read each choice: some cost HP, coins or a Hexling, and some are a gamble.',
  },
  prestige: {
    title: 'Prestige ★',
    body: 'Prestige gives a Hexling a big stat boost and raises its level cap. It costs a bench Hexling that shares one of its elements.',
  },
  titles: {
    title: 'Trainer titles',
    body: 'You’ve earned a trainer title! Titles show under your name, to your opponent online too, and many unlock gear with special effects.\n\nSee them all in Edit trainer (top-left) › your name › Titles.',
  },
  bench: {
    title: 'The bench',
    body: 'Up to 4 Hexlings fight and up to 3 wait on the bench. Bench Hexlings still earn XP, and if your whole team falls, the bench steps in as your second life.',
  },
} as const;

export type TipId = keyof typeof TIPS;

/** Has this tip been shown already (or are tips off)? */
export const tipDone = (id: TipId) => !prefs.tips || prefs.tipsSeen.includes(id);

/**
 * Show a tip once, on top of everything else on screen. Returns false if it was already seen.
 * `onDone` runs when it's dismissed (right away if it isn't shown).
 */
export function tip(scene: Phaser.Scene, id: TipId, onDone: () => void = () => {}): boolean {
  if (tipDone(id)) {
    onDone();
    return false;
  }
  prefs.tipsSeen = [...prefs.tipsSeen, id];
  const t = TIPS[id];
  const root = scene.add.container(0, 0).setDepth(2000);
  root.add(fullRect(scene, 0x000000, 0.55).setInteractive());
  const w = LANDSCAPE ? 460 : W - 40;
  const body = text(scene, W / 2, 0, t.body, 15, COLORS.text, { wordWrap: { width: w - 40 }, lineSpacing: 4, align: 'left' }).setOrigin(0.5, 0);
  const h = 52 + body.height + 92;
  const y = (H - h) / 2;
  root.add(scene.add.rectangle(W / 2, y, w, h, 0x2a2244).setOrigin(0.5, 0).setStrokeStyle(3, 0xffc94d));
  root.add(text(scene, W / 2 - w / 2 + 18, y + 14, 'TIP', 11, '#1a1426', { fontStyle: 'bold', backgroundColor: '#ffc94d', padding: { x: 5, y: 2 } }));
  root.add(text(scene, W / 2, y + 16, t.title, 20, '#ffc94d', { fontStyle: 'bold' }).setOrigin(0.5, 0));
  body.setY(y + 52);
  root.add(body);
  const done = () => {
    root.destroy();
    onDone();
  };
  root.add(button(scene, W / 2 + 70, y + h - 38, 150, 44, 'Got it', done, { fontSize: 16, color: 0x3b6d4a }));
  root.add(
    button(scene, W / 2 - 90, y + h - 38, 110, 44, 'No more tips', () => {
      prefs.tips = false;
      done();
    }, { fontSize: 12 }),
  );
  root.setAlpha(0);
  scene.tweens.add({ targets: root, alpha: 1, duration: 180 });
  return true;
}
