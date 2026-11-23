/**
 * The Workshop (Hexbound 2.0): a camp stall where embers buy lasting upgrades. Four branches, each
 * an ordered track (buy them in order), cheap and modest early and steeply pricier later, each
 * ending in a capstone. About 5,000 embers in all (roughly 120-150 runs at 35-50 a win).
 *
 * Daily and weekly runs and online races ignore the Workshop (see logic/workshop). Effects are read
 * where they apply through the helpers in logic/workshop.
 */

export type WorkshopBranch = 'supplies' | 'training' | 'fortune' | 'lore';

export type WorkshopId =
  // Supplies
  | 'potion1' | 'coins1' | 'potion2' | 'coins2' | 'freeroll' | 'coins3' | 'pouch' | 'provisioner'
  // Training
  | 'level1' | 'benchxp' | 'level2' | 'revive' | 'level3' | 'benchslot' | 'partner'
  // Fortune
  | 'gilded1' | 'hidden' | 'rarity1' | 'firstfour' | 'gilded2' | 'rarity2' | 'blessing'
  // Lore
  | 'lore1' | 'lore2' | 'lore3' | 'lore4' | 'lore5';

export interface WorkshopUpgrade {
  id: WorkshopId;
  branch: WorkshopBranch;
  name: string;
  desc: string;
  cost: number;
  /** The last upgrade in its branch. */
  capstone?: boolean;
}

export interface WorkshopBranchDef {
  id: WorkshopBranch;
  name: string;
  /** One line for the branch list. */
  blurb: string;
  color: number;
}

export const WORKSHOP_BRANCHES: WorkshopBranchDef[] = [
  { id: 'supplies', name: 'Supplies', blurb: 'Start runs with more potions and coins.', color: 0x6a4a1a },
  { id: 'training', name: 'Training', blurb: 'A stronger starter and a deeper bench.', color: 0x2a4a6a },
  { id: 'fortune', name: 'Fortune', blurb: 'Better boons, more hidden hexes, more Gilded.', color: 0x6a5a1a },
  { id: 'lore', name: 'Lore', blurb: 'More boons and surprises join the pool (variety, not power).', color: 0x4a2a6a },
];

const U = (id: WorkshopId, branch: WorkshopBranch, name: string, cost: number, desc: string, capstone = false): WorkshopUpgrade => ({
  id,
  branch,
  name,
  cost,
  desc,
  ...(capstone ? { capstone } : {}),
});

/** Every upgrade, each branch in buying order. Branch totals: 1,250 embers each, 5,000 in all. */
export const WORKSHOP: WorkshopUpgrade[] = [
  // ------------------------------------------------------------ Supplies (1,250)
  U('potion1', 'supplies', 'Potion I', 30, 'Start every run with a potion.'),
  U('coins1', 'supplies', 'Coin purse I', 50, 'Start every run with 40 coins.'),
  U('potion2', 'supplies', 'Potion II', 90, 'Start every run with 2 potions.'),
  U('coins2', 'supplies', 'Coin purse II', 130, 'Start every run with 80 coins.'),
  U('freeroll', 'supplies', 'Restocker', 180, 'Your first shop reroll on each floor is free.'),
  U('coins3', 'supplies', 'Coin purse III', 220, 'Start every run with 120 coins.'),
  U('pouch', 'supplies', 'Bigger pouch', 250, 'Carry 2 more potions.'),
  U('provisioner', 'supplies', 'Provisioner', 300, 'Start every run with a full pouch, and your starter gets a Limit Breaker (+5 level cap).', true),
  // ------------------------------------------------------------ Training (1,250)
  U('level1', 'training', 'Warm-up I', 40, 'Your starter begins 1 level higher.'),
  U('benchxp', 'training', 'Sparring', 70, 'Your bench learns more: 75% of the XP instead of 50%.'),
  U('level2', 'training', 'Warm-up II', 110, 'Your starter begins 2 levels higher.'),
  U('revive', 'training', 'Second chance', 150, 'Revival hexes bring Hexlings back at 70% of their level (not 60%).'),
  U('level3', 'training', 'Warm-up III', 200, 'Your starter begins 3 levels higher.'),
  U('benchslot', 'training', 'Bigger bench', 300, 'One more bench slot (4 in all).'),
  U('partner', 'training', 'Partner', 380, 'At the starter pick, take two of the three: the second joins your team at the same level.', true),
  // ------------------------------------------------------------ Fortune (1,250)
  U('gilded1', 'fortune', 'Lucky glint I', 40, 'Gilded wild Hexlings turn up 25% more often.'),
  U('hidden', 'fortune', 'Keen eye', 80, 'Hidden hexes turn up half again as often.'),
  U('rarity1', 'fortune', 'Fortune I', 120, 'Rare and mythic boons are offered a little more often.'),
  U('firstfour', 'fortune', 'First pick', 170, "Each run's first boon offer has a 4th choice."),
  U('gilded2', 'fortune', 'Lucky glint II', 220, 'Gilded wild Hexlings turn up 50% more often.'),
  U('rarity2', 'fortune', 'Fortune II', 270, 'Rare and mythic boons are offered more often again.'),
  U('blessing', 'fortune', 'Blessing', 350, 'Start every run with a boon (choose from 3).', true),
  // ------------------------------------------------------------ Lore (1,250)
  U('lore1', 'lore', 'Lore I', 60, '5 more boons join the pool: Pack Tactics, Rainbow Squad, Lingering, Dread and Fault Line.'),
  U('lore2', 'lore', 'Lore II', 120, "5 more boons (Opportunist, Rampage, Possession, Chain Lightning, Dragon's Pride) and two rare floors: Mirror and Shattered."),
  U('lore3', 'lore', 'Lore III', 200, '4 more boons (First Strike, Prospector, Plague Bearer, Halo) and the Hidden Shop.'),
  U('lore4', 'lore', 'Lore IV', 300, '4 more boons (Lone Champion, Glass Menagerie, Ironclad, the mythic Overflow) and Gilded trainers.'),
  U('lore5', 'lore', 'Lore V', 570, 'The last mythics (Elemental Fusion, Pact), the rarest omens (Blood Moon, Golden Age), and one extra boon offer every run.', true),
];

export const WORKSHOP_BY_ID = Object.fromEntries(WORKSHOP.map((u) => [u.id, u])) as Record<WorkshopId, WorkshopUpgrade>;

export const branchUpgrades = (b: WorkshopBranch): WorkshopUpgrade[] => WORKSHOP.filter((u) => u.branch === b);

/** All of the Workshop, in embers. */
export const WORKSHOP_TOTAL = WORKSHOP.reduce((n, u) => n + u.cost, 0);

/**
 * Lore gating: boons and surprises that start locked, and the Lore tier that adds them. Everything
 * not listed is in the pool from the start (35 boons, all 8 curses and the more common surprises).
 * Seeded runs (daily, weekly, races) always use the full pool.
 */
export const LORE_BOONS: Record<string, WorkshopId> = {
  packtactics: 'lore1', rainbowsquad: 'lore1', lingering: 'lore1', dread: 'lore1', quake: 'lore1',
  opportunist: 'lore2', rampage: 'lore2', possession: 'lore2', chainlightning: 'lore2', dragonpride: 'lore2',
  firststrike: 'lore3', prospector: 'lore3', plaguebearer: 'lore3', halo: 'lore3',
  lonechampion: 'lore4', glassmenagerie: 'lore4', ironclad: 'lore4', overflow: 'lore4',
  fusion: 'lore5', pact: 'lore5',
};

/** Vague Hexlidex hints for Lore-locked boons you haven't been offered yet (like surprise hints). */
export const LORE_BOON_HINTS: Record<string, string> = {
  packtactics: 'Strength in numbers, if they look alike.',
  rainbowsquad: 'A team of every colour.',
  lingering: 'Some troubles stay a while longer.',
  dread: 'Fear lives in the dark.',
  quake: 'The ground breaks every wall.',
  opportunist: 'Strike the foe that is already hurting.',
  rampage: 'One who never steps back grows fiercer.',
  possession: 'Spirits that muddle minds.',
  chainlightning: 'Lightning that strikes twice.',
  dragonpride: 'Follow a dragon into battle.',
  firststrike: 'Always the first to move.',
  prospector: 'Every battle pays a little more.',
  plaguebearer: 'Foes arrive already sick.',
  halo: 'A light that shields its own.',
  lonechampion: 'Stronger with fewer at its side.',
  glassmenagerie: 'A small team that hits hard.',
  ironclad: 'Metal that strikes back.',
  overflow: 'Each knockout feeds the next.',
  fusion: 'Every attack finds its best element.',
  pact: 'A price paid in health for richer offers.',
};

export const LORE_SURPRISES: Record<string, WorkshopId> = {
  mirror: 'lore2', shattered: 'lore2',
  hiddenshop: 'lore3',
  gildedtrainer: 'lore4',
  bloodmoon: 'lore5', goldenage: 'lore5',
};
