import { pickLine, RESEARCHER, SHOPKEEPER, shopLine } from '../data/dialogue';
import { DEX_SPECIES, LEGENDS } from '../data/legends';
import { speciesWithElement, SPECIES_BY_ID } from '../data/species';
import { creatureName, stats } from './creature';
import { hasSeenForm } from './dex';
import { stepsToBoss } from './map';
import type { Run } from './run';

/** The shopkeeper's line for this visit. */
export function shopTalk(run: Run): string {
  const team = run.team.filter((c) => c.hp > 0);
  const health = run.team.length ? run.team.reduce((t, c) => t + Math.max(0, c.hp) / stats(c).hp, 0) / run.team.length : 1;
  const line = shopLine(
    {
      floor: run.floor,
      coins: run.coins,
      health: team.length ? health : 0,
      bossNear: stepsToBoss(run.map, run.currentId) <= 2,
      visits: Math.max(0, (run.shopVisits ?? 1) - 1),
    },
    `${run.seed}:${run.currentId}:shop`,
  );
  return `${SHOPKEEPER}: “${line}”`;
}

/**
 * The researcher's hint on an event hex: something about the Hexlidex, the land, your lead, or a
 * legendary roaming nearby. Always true for this save and run.
 */
export function researcherHint(run: Run): string {
  const dex = run.meta.dex;
  const land = run.biomes[run.floor];
  const hints: string[] = [];
  if (run.roamer) hints.push('Something legendary passed through here. It never stays long... wear it down a little each time you meet.');
  const here = speciesWithElement(land);
  const notCaught = here.filter((sp) => !dex.caught.includes(sp.id));
  if (notCaught.length) hints.push(`There are ${notCaught.length} ${land} Hexling line${notCaught.length === 1 ? '' : 's'} you’ve never caught. These lands are full of them.`);
  const seen = notCaught.filter((sp) => hasSeenForm(dex, sp.id, 0));
  if (seen.length) hints.push(`I spotted a ${pickLine(seen.map((sp) => sp.names[0]), `${run.seed}:${run.currentId}:seen`)} nearby. You’ve seen one, but never caught one!`);
  const lead = run.team[0];
  if (lead && lead.stage < 2) {
    const at = lead.stage === 0 ? 30 : 65;
    hints.push(lead.level >= at ? `Your ${creatureName(lead)} is ready to evolve. An Evolution Stone would do it.` : `Your ${creatureName(lead)} can evolve from Lv ${at}, with an Evolution Stone.`);
  }
  const pct = Math.round((dex.caught.length / DEX_SPECIES.length) * 100);
  hints.push(`Your Hexlidex is ${pct}% complete. ${pct < 50 ? 'So much left to find!' : pct < 100 ? 'Impressive work.' : 'Remarkable. Truly.'}`);
  const legends = LEGENDS.filter((l) => !dex.caught.includes(l.id));
  if (legends.length && run.floor === 0) hints.push(`They say ${SPECIES_BY_ID[pickLine(legends.map((l) => l.id), `${run.seed}:leg`)].names[2]} roams the higher floors now and then.`);
  return `${RESEARCHER}: “${pickLine(hints, `${run.seed}:${run.currentId}:hint`)}”`;
}
