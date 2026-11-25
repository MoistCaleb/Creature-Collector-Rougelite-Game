import type Phaser from 'phaser';
import type { IconId } from './icons';
import { openElementChart } from './elementChart';
import { openPanel } from './panel';
import { button, COLORS, LANDSCAPE, text } from './widgets';
import { icon } from './icons';

interface Page {
  title: string;
  glyph: IconId;
  lines: string[];
}

export const HOW_TO_PLAY: Page[] = [
  {
    title: 'The goal',
    glyph: 'crown',
    lines: [
      'Pick a map and a starter Hexling, then climb 3 floors.',
      'Each floor ends with a guardian. Beat the floor 3 guardian to win the run and unlock a new map.',
      'A Hexling that faints is gone for the rest of the run. If your whole team falls, the run is over.',
      'Between runs you keep what you unlocked: starters, Hexlidex entries, maps and trainer passives.',
      'Win a run and you can go on a Gilded Hunt: endless floors where gilded Hexlings are everywhere and enemies keep getting stronger.',
      'Each new deepest hunt floor can pay a one-time milestone: embers on floor 3, the Gilded campfire on 5, Gilded starter offers on 7, a camp totem on 10, then more embers and titles every few floors.',
    ],
  },
  {
    title: 'The map',
    glyph: 'arrowUp',
    lines: [
      'Each step climbs one row: tap a glowing hex touching yours from above.',
      'Every route to the guardian is the same length, so the choice is which stops you make.',
      'Battle and Trainer fights give XP and coins. Rest heals. Level Up, Skill and Prestige (★) make a Hexling stronger. Shops sell items. Treasure is free loot. ? is an event: a risk or a reward. Each floor has one Revival (♥): bring back a fallen Hexling at 60% of its level.',
      'Your run saves after every step. Leave any time and tap Continue run.',
    ],
  },
  {
    title: 'Battles',
    glyph: 'swords',
    lines: [
      'Tap a move to attack. ▲ means it’s strong against the foe, ▼ means it’s resisted.',
      'Switch sends in another team member (it uses your turn). Potions heal mid-battle (also your turn).',
      'Auto picks the best move for you; the speed button plays battles at 1×, 2× or 3×.',
      'Up to 4 Hexlings fight; up to 3 wait on the bench. If your team falls, the bench steps in as a second life.',
      'Fatigue: after 30 turns, all damage is doubled and all healing halved, so no battle lasts forever.',
    ],
  },
  {
    title: 'Catching',
    glyph: 'crystal',
    lines: [
      'In a wild battle the last wild Hexling can’t faint: it’s left at 1 HP.',
      'Then choose: Continue to finish it for XP and coins, or Catch it to make it join your team instead.',
      'A catch keeps its level, evolution, moves and ★. Your first catch of a kind gets +1 ★.',
      'Every Hexling that joins you becomes a starter for future runs, even if the run is lost.',
    ],
  },
  {
    title: 'Growing stronger',
    glyph: 'star',
    lines: [
      'Levels: win battles. Each floor has a level ceiling, so you can’t outgrow it.',
      'Evolve: at Lv 30 (and again at 65), use an Evolution Stone to evolve a Hexling into a bigger form.',
      'Prestige ★: a big stat boost and a higher level cap. At a ★ node it costs a bench Hexling that shares an element.',
      'Skills: Skill nodes upgrade a move. Held items give one Hexling a passive bonus.',
      'Land moves: now and then a Hexling learns a move of the land\u2019s element instead of its usual next move.',
    ],
  },
  {
    title: 'Boons',
    glyph: 'sparkle',
    lines: [
      'After each guardian (and on Boon hexes ✦), choose a boon: a perk that bends the rules for the rest of the run.',
      'The first card helps an element on your team; the second is general (now and then a golden mythic); the third is sometimes a curse.',
      'Curses cost something (no healing at rests, less HP…) but pay you back with more or better boons.',
      'Guardians gain a level for each boon you hold. See yours from the ✦ on the map bar or the menu.',
      'Online, your boons come with you into the stage battle duel and the royale bracket.',
    ],
  },
  {
    title: 'Traits',
    glyph: 'gem',
    lines: [
      'Every Hexling has a trait: a passive that works on its own, in battle or on the map.',
      'Each line has three possible traits: two common and one rare (◆, about 1 in 7). Legendaries each have their own.',
      'Evolving keeps the trait, and the final form makes it stronger.',
      'Tap a trait on the starter pick, team screen or Hexlidex to read it. The Hexlidex shows which of a line\'s traits you\'ve found.',
      'In the Arena you can give a Hexling any trait you\'ve found for its line.',
    ],
  },
  {
    title: 'Rare surprises',
    glyph: 'star',
    lines: [
      'Now and then a run brings a surprise: an omen for the whole run, a strange floor, an Elder guardian, a hidden hex (???) or a rare encounter.',
      'About half of runs meet at least one, and you never go more than 3 runs in a row without.',
      'Elder guardians are older and tougher, with every Hexling carrying its rare ◆ trait. Beat one for a mythic boon offer.',
      'Hidden hexes include a wishing well, a cursed altar, a secret boon shop, a hatchery egg and a three-trainer dojo.',
      'Daily and weekly runs and online races share the same surprises for everyone; their omen shows at the starter pick.',
      'The Hexlidex lists the surprises you’ve found, with hints for the rest.',
    ],
  },
  {
    title: 'Embers and the Workshop',
    glyph: 'flame',
    lines: [
      'Every run pays embers, win or lose: more for floors, guardians, wins, Gilded and Heat.',
      'Spend them at camp: decorations at the Ember stall, lasting upgrades in the Workshop.',
      'The Workshop has four branches (Supplies, Training, Fortune, Lore), each built in order and ending in a capstone.',
      'Lore adds more boons and surprises to your runs: variety, not power. The Hexlidex Boons tab shows which Lore tier each locked one needs, with a hint.',
      'Daily and weekly runs and online races ignore the Workshop, so they stay fair for everyone.',
      'Played before 2.0? Your first camp visit pays welcome-back embers for the runs you\'ve already won and played.',
    ],
  },
  {
    title: 'Camp bond',
    glyph: 'heart',
    lines: [
      'Each line you play builds a bond, up to 5 hearts: finishing a run together, winning, being MVP, beating guardians, and petting, feeding and playing at camp after each run (wins or losses; not online or the Battle Arena).',
      'Hearts 1 and 2 evolve it at camp. Heart 3: it starts your runs with a bond heart.',
      'Heart 4: as your starter, tap its trait to choose any trait you\'ve found on its line.',
      'Heart 5: it starts 2 levels higher as your starter, wears its bond colours, and visits your camp.',
      'Daily and weekly runs and online races still build bond, but skip the starting bonuses.',
    ],
  },
  {
    title: 'Eggs and the Nest',
    glyph: 'heart',
    lines: [
      'At camp, open the Nest and choose two parents: camp crew Hexlings with 3 or more hearts, or one of them and a legendary you’ve caught.',
      'The egg hatches after 3 to 7 finished runs. The longer it takes, the stronger the baby: better odds of its line’s rare trait, and up to ★★.',
      'The baby is one parent’s line (never a legendary’s), wearing the other parent’s colour and one of its parts, with a name from both. Each move it learns comes from one parent’s moves or the other’s.',
      'Hatchlings wait in the Nursery (up to 6). On the starter screen, tap From the nest to start a normal run with one. Release ones you don’t want for embers.',
      'A Hatchery egg found on a run works the same way, counted in won battles, with two parents of its own.',
      'Every pair you hatch gets a card in the Hexlidex’s Hatched tab.',
    ],
  },
  {
    title: 'Elements',
    glyph: 'sparkle',
    lines: [
      'There are 12 elements. Each is strong against 3 others: its attacks deal ×1.5.',
      'Moves that match the user’s element hit harder.',
      'Team members sharing an element give the whole team a synergy bonus.',
      'The element chart shows every matchup.',
    ],
  },
];

/** A few pages on how to play, with arrows to turn the page. */
export function openHowToPlay(scene: Phaser.Scene, onClose: () => void = () => {}) {
  const p = openPanel(scene, 'How to play', { w: LANDSCAPE ? 700 : 430, h: LANDSCAPE ? 430 : 620, onClose });
  const body = scene.add.container(0, 0);
  p.root.add(body);
  let page = 0;
  const draw = () => {
    body.removeAll(true);
    const pg = HOW_TO_PLAY[page];
    const y0 = p.top + 4;
    body.add(icon(scene, p.x + 34, y0 + 14, pg.glyph, 28));
    body.add(text(scene, p.x + 58, y0 + 14, pg.title, 20, COLORS.text, { fontStyle: 'bold' }).setOrigin(0, 0.5));
    body.add(text(scene, p.x + p.w - 20, y0 + 14, `${page + 1} / ${HOW_TO_PLAY.length}`, 13, COLORS.textDim).setOrigin(1, 0.5));
    let y = y0 + 42;
    const ww = p.w - 64;
    for (const line of pg.lines) {
      body.add(text(scene, p.x + 24, y, '•', 16, '#ffc94d'));
      const t = text(scene, p.x + 42, y, line, LANDSCAPE ? 15 : 16, COLORS.text, { wordWrap: { width: ww }, lineSpacing: 4 });
      body.add(t);
      y += t.height + (LANDSCAPE ? 10 : 16);
    }
    if (pg.title === 'Elements') body.add(button(scene, p.x + p.w / 2, y + 26, 220, 44, 'Open element chart', () => openElementChart(scene), { fontSize: 15, color: 0x2f4a6b }));
    // Page arrows beside Close.
    const fy = p.y + p.h - 30;
    const turn = (d: number) => {
      page = (page + d + HOW_TO_PLAY.length) % HOW_TO_PLAY.length;
      draw();
    };
    body.add(button(scene, p.x + 56, fy, 76, 40, '', () => turn(-1), { glyph: 'back', fontSize: 16 }));
    body.add(button(scene, p.x + p.w - 56, fy, 76, 40, '', () => turn(1), { glyph: 'play', fontSize: 16 }));
  };
  draw();
  return p;
}
