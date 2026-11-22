import type { Family, StagePlan } from './sprites';

/**
 * 2.0 art: hand-set looks for lines whose names promise something specific (a torch head, a crab's
 * pincers, an owl's ear tufts). `plan` is the middle and final forms; babies get a softer version
 * of it unless `baby` says otherwise; `stages` overrides one form. `sig`: where the element feature
 * goes (0 head, 1 shoulders, 2 tail only). `hollow`: glowing empty eyes.
 */
export interface LinePlan {
  fam?: Partial<Family>;
  plan: Partial<StagePlan>;
  baby?: Partial<StagePlan>;
  stages?: Partial<Record<0 | 1 | 2, Partial<StagePlan>>>;
  sig?: 0 | 1 | 2;
  hollow?: boolean;
  /** Body colour, when the name calls for one (Sunpup gold, Jadelet jade, Rustbug copper). */
  color?: number;
}

export const LINE_PLANS: Record<string, LinePlan> = {
  // ---------------------------------------------------------------- Metal
  forgepup: { fam: { tail: 'flame', pattern: 'core' }, plan: { body: 'wide', head: 'long', arms: 'none', back: 'spines', top: 'ears', mouth: 'fangs' } },
  rivetfin: { fam: { tail: 'thin', pattern: 'rings' }, plan: { body: 'tall', head: 'long', arms: 'none', back: 'fins', top: 'unihorn', mouth: 'jaw' } },
  gearbud: { color: 0xc8b46a, fam: { pattern: 'core' }, plan: { body: 'pear', head: 'round', arms: 'stub', back: 'mane', top: 'spikerow', mouth: 'smile' } },
  coldcog: { fam: { pattern: 'rings' }, plan: { body: 'boxy', head: 'flat', arms: 'fists', back: 'crystals', top: 'antennae', mouth: 'jaw' } },
  rustbug: { color: 0xc07a50, fam: { pattern: 'spots' }, plan: { body: 'segmented', head: 'round', arms: 'pincers', back: 'bugwings', top: 'antennae', mouth: 'mandibles' } },
  nightcog: { fam: { pattern: 'chevrons' }, plan: { body: 'vtorso', head: 'round', arms: 'blades', back: 'cape', top: 'horns-swept', mouth: 'none' } },
  alloylet: { color: 0xa0a8c0, fam: { tail: 'spiked', pattern: 'belly' }, plan: { body: 'wide', head: 'long', arms: 'claws', back: 'plates', top: 'horns-swept', mouth: 'jaw' } },
  // ---------------------------------------------------------------- Toxic
  smoglet: { fam: { tail: 'thin', pattern: 'spots' }, plan: { body: 'wide', head: 'long', arms: 'none', back: 'spines', top: 'ears', mouth: 'fangs' } },
  tarlet: { color: 0x3a3040, fam: { pattern: 'spots' }, plan: { body: 'round', head: 'merged', arms: 'none', back: 'none', top: 'none', mouth: 'jaw' } },
  fizzlet: { fam: { pattern: 'core' }, plan: { body: 'round', head: 'merged', arms: 'tentacles', back: 'none', top: 'antennae', mouth: 'smile' } },
  gelicle: { color: 0x9ad8e0, fam: { pattern: 'spots' }, plan: { body: 'drop', head: 'merged', arms: 'none', back: 'crystals', top: 'spikerow', mouth: 'fangs' } },
  neonewt: { color: 0x7be043, fam: { tail: 'thin', pattern: 'spots' }, plan: { body: 'wide', head: 'wide', arms: 'none', back: 'none', top: 'frill', mouth: 'smile' } },
  spooklet: { fam: { pattern: 'spots' }, plan: { body: 'tall', head: 'round', arms: 'none', back: 'mane', top: 'none', mouth: 'none' } },
  hisslet: { fam: { pattern: 'belly' }, plan: { body: 'tall', head: 'long', arms: 'none', back: 'fins', top: 'crown', mouth: 'fangs' } },
  // ---------------------------------------------------------------- Shadow
  inklet: { color: 0x2e3458, fam: { eyes: 2, pattern: 'spots' }, plan: { body: 'drop', head: 'merged', arms: 'tentacles', back: 'none', top: 'none', mouth: 'none' } },
  nightbud: { fam: { pattern: 'chevrons' }, plan: { body: 'vtorso', head: 'round', arms: 'blades', back: 'mane', top: 'spikerow', mouth: 'fangs' } },
  gravelet: { color: 0x6a6478, fam: { tail: 'none', pattern: 'belly' }, plan: { body: 'wide', head: 'long', arms: 'claws', back: 'shell', top: 'none', mouth: 'fangs' } },
  crowlet: { color: 0x34384e, fam: { pattern: 'chevrons' }, plan: { body: 'oval', head: 'beak', arms: 'none', back: 'featherwings', top: 'crest', mouth: 'beak' } },
  chilkit: { fam: { tail: 'thin', pattern: 'hstripes' }, plan: { body: 'wide', head: 'round', arms: 'none', back: 'none', top: 'ears', mouth: 'fangs' } },
  twilit: { color: 0x3a3a6a, fam: { eyes: 1, pattern: 'core' }, plan: { body: 'round', head: 'merged', arms: 'none', back: 'none', top: 'crown', mouth: 'none' } },
  duskhatch: { fam: { tail: 'spiked', pattern: 'spots' }, plan: { body: 'vtorso', head: 'long', arms: 'claws', back: 'batwings', top: 'horns-swept', mouth: 'jaw' } },
  // ---------------------------------------------------------------- Spirit
  flickghost: { fam: { tail: 'none', pattern: 'core' }, sig: 0, plan: { body: 'drop', head: 'merged', arms: 'long', back: 'none', top: 'none', mouth: 'fangs' } },
  siplet: { fam: { pattern: 'rings' }, plan: { body: 'tall', head: 'long', arms: 'none', back: 'fins', top: 'crest', mouth: 'none' } },
  sprigghost: { fam: { pattern: 'vstripes' }, plan: { body: 'tall', head: 'round', arms: 'long', back: 'cape', top: 'antlers', mouth: 'smile' } },
  totemkin: { fam: { eyes: 2, pattern: 'rings' }, plan: { body: 'boxy', head: 'flat', arms: 'stub', back: 'none', top: 'spikerow', mouth: 'jaw' } },
  breezeling: { fam: { pattern: 'chevrons' }, plan: { body: 'drop', head: 'round', arms: 'long', back: 'cape', top: 'tuft', mouth: 'none' } },
  helmlet: { fam: { pattern: 'rings' }, hollow: true, plan: { body: 'vtorso', head: 'skull', arms: 'fists', back: 'cape', top: 'crest', mouth: 'none' } },
  bonelet: { color: 0xe8e0c8, fam: { pattern: 'rings' }, plan: { body: 'tall', head: 'skull', arms: 'none', back: 'batwings', top: 'horns-swept', mouth: 'jaw' } },
  // ---------------------------------------------------------------- Light
  sunpup: { color: 0xf2b441, fam: { tail: 'thin', pattern: 'chevrons' }, plan: { body: 'wide', head: 'round', arms: 'none', back: 'mane', top: 'ears', mouth: 'fangs' } },
  shinefin: { fam: { pattern: 'chevrons' }, plan: { body: 'wide', head: 'merged', arms: 'none', back: 'fins', top: 'none', mouth: 'smile' } },
  sunsprout: { color: 0xf2c040, fam: { pattern: 'core' }, plan: { body: 'pear', head: 'round', arms: 'stub', back: 'mane', top: 'none', mouth: 'smile' } },
  quartzlet: { color: 0xf0c8d8, fam: { pattern: 'belly' }, plan: { body: 'wide', head: 'long', arms: 'none', back: 'crystals', top: 'unihorn', mouth: 'fangs' } },
  twinklet: { fam: { pattern: 'core' }, plan: { body: 'round', head: 'merged', arms: 'stub', back: 'crystals', top: 'crown', mouth: 'smile' } },
  shinepup: { fam: { tail: 'thin', pattern: 'belly' }, plan: { body: 'wide', head: 'round', arms: 'none', back: 'mane', top: 'tuft', mouth: 'fangs' } },
  // ---------------------------------------------------------------- Dragon
  vinelet: { color: 0x4a9a50, fam: { pattern: 'vstripes' }, plan: { body: 'tall', head: 'long', arms: 'tentacles', back: 'none', top: 'antlers', mouth: 'fangs' } },
  sparkhatch: { fam: { tail: 'thin', pattern: 'chevrons' }, plan: { body: 'oval', head: 'long', arms: 'none', back: 'batwings', top: 'horns-swept', mouth: 'jaw' } },
  rimehatch: { fam: { tail: 'spiked', pattern: 'belly' }, plan: { body: 'wide', head: 'long', arms: 'claws', back: 'spines', top: 'horns-swept', mouth: 'fangs' } },
  hornling: { fam: { pattern: 'belly' }, plan: { body: 'hulk', head: 'long', arms: 'claws', back: 'plates', top: 'horns-twin', mouth: 'jaw' } },
  glidelet: { fam: { tail: 'thin', pattern: 'chevrons' }, plan: { body: 'oval', head: 'long', arms: 'none', back: 'batwings', top: 'crest', mouth: 'fangs' } },
  jadelet: { color: 0x3aa878, fam: { pattern: 'rings' }, plan: { body: 'tall', head: 'long', arms: 'claws', back: 'none', top: 'antlers', mouth: 'fangs' } },
  // ---------------------------------------------------------------- Frost
  thawlet: { fam: { pattern: 'core' }, sig: 0, plan: { body: 'drop', head: 'merged', arms: 'none', back: 'crystals', top: 'none', mouth: 'smile' } },
  snowlet: { fam: { eyes: 2, pattern: 'chevrons' }, plan: { body: 'round', head: 'merged', arms: 'none', back: 'featherwings', top: 'ears', mouth: 'beak' } },
  yetling: { fam: { pattern: 'belly' }, plan: { body: 'hulk', head: 'round', arms: 'fists', back: 'none', top: 'horns-twin', mouth: 'fangs' } },
  icemite: { fam: { eyes: 4, pattern: 'spots' }, plan: { body: 'segmented', head: 'round', arms: 'pincers', back: 'crystals', top: 'none', mouth: 'mandibles' } },
  shardlet: { fam: { pattern: 'rings' }, plan: { body: 'tall', head: 'long', arms: 'none', back: 'crystals', top: 'spikerow', mouth: 'jaw' } },
  // ---------------------------------------------------------------- Fire
  sallet: { fam: { tail: 'flame', pattern: 'spots' }, plan: { body: 'wide', head: 'long', arms: 'none', back: 'none', top: 'crest', mouth: 'smile' } },
  emberchick: { fam: { pattern: 'chevrons' }, sig: 0, plan: { body: 'oval', head: 'beak', arms: 'none', back: 'featherwings', top: 'crest', mouth: 'beak' } },
  smithlet: { color: 0x8a4a3a, fam: { pattern: 'belly' }, plan: { body: 'hulk', head: 'flat', arms: 'fists', back: 'none', top: 'horns-twin', mouth: 'tusks' } },
  brimlet: { color: 0xe8c040, fam: { pattern: 'spots' }, plan: { body: 'round', head: 'merged', arms: 'none', back: 'spines', top: 'horns-twin', mouth: 'jaw' } },
  torchlet: { fam: { pattern: 'chevrons' }, sig: 0, plan: { body: 'vtorso', head: 'round', arms: 'blades', back: 'cape', top: 'none', mouth: 'none' } },
  // ---------------------------------------------------------------- Water
  squalllet: { fam: { pattern: 'hstripes' }, plan: { body: 'tall', head: 'long', arms: 'none', back: 'fins', top: 'crest', mouth: 'jaw' } },
  ottlet: { fam: { tail: 'thin', pattern: 'belly' }, plan: { body: 'wide', head: 'round', arms: 'stub', back: 'none', top: 'ears', mouth: 'smile' } },
  pinchlet: { fam: { eyes: 2, pattern: 'rings' }, plan: { body: 'wide', head: 'merged', arms: 'pincers', back: 'shell', top: 'crown', mouth: 'mandibles' } },
  bubblit: { fam: { pattern: 'spots' }, plan: { body: 'round', head: 'merged', arms: 'none', back: 'none', top: 'none', mouth: 'smile' } },
  divebot: { fam: { eyes: 1, pattern: 'rings' }, plan: { body: 'boxy', head: 'round', arms: 'fists', back: 'none', top: 'antennae', mouth: 'none' } },
  // ---------------------------------------------------------------- Nature
  acornet: { color: 0xa8743a, fam: { pattern: 'vstripes' }, plan: { body: 'pear', head: 'round', arms: 'fists', back: 'none', top: 'tuft', mouth: 'fangs' } },
  larvlet: {
    fam: { pattern: 'rings' },
    plan: { body: 'oval', head: 'round', arms: 'long', back: 'bugwings', top: 'antennae', mouth: 'none' },
    baby: { body: 'pear', head: 'merged', arms: 'none', back: 'none', top: 'antennae', mouth: 'smile' },
    // The cocoon: wrapped up, nothing sticking out.
    stages: { 1: { body: 'drop', head: 'merged', arms: 'none', back: 'none', top: 'none', mouth: 'none' } },
  },
  fernling: { fam: { pattern: 'chevrons' }, plan: { body: 'wide', head: 'long', arms: 'none', back: 'spines', top: 'frill', mouth: 'fangs' } },
  gnarlet: { fam: { eyes: 2, pattern: 'vstripes' }, plan: { body: 'tall', head: 'flat', arms: 'long', back: 'none', top: 'antlers', mouth: 'jaw' } },
  // ---------------------------------------------------------------- Storm
  cloudlet: { color: 0xd8e0f0, fam: { pattern: 'core' }, plan: { body: 'round', head: 'merged', arms: 'stub', back: 'mane', top: 'none', mouth: 'smile' } },
  ramlet: { fam: { pattern: 'belly' }, plan: { body: 'wide', head: 'round', arms: 'none', back: 'mane', top: 'horns-ram', mouth: 'smile' } },
  zapeel: { fam: { pattern: 'hstripes' }, plan: { body: 'tall', head: 'long', arms: 'none', back: 'fins', top: 'antennae', mouth: 'fangs' } },
  waspark: { fam: { tail: 'spiked', pattern: 'hstripes' }, plan: { body: 'segmented', head: 'round', arms: 'blades', back: 'bugwings', top: 'antennae', mouth: 'mandibles' } },
  // ---------------------------------------------------------------- Earth
  dillokin: { fam: { pattern: 'rings' }, plan: { body: 'round', head: 'long', arms: 'none', back: 'shell', top: 'ears', mouth: 'smile' } },
  rhinlet: { fam: { pattern: 'belly' }, plan: { body: 'wide', head: 'long', arms: 'none', back: 'plates', top: 'unihorn', mouth: 'tusks' } },
  stalaglet: { fam: { pattern: 'spots' }, plan: { body: 'hulk', head: 'flat', arms: 'fists', back: 'crystals', top: 'spikerow', mouth: 'jaw' } },
};

/** A baby's take on a plan: rounder, smaller limbs, soft parts only, a smile. */
export function babyOf(p: Partial<StagePlan>): Partial<StagePlan> {
  const soft = ['mane', 'fins', 'shell', 'featherwings', 'bugwings'];
  return {
    body: p.body === 'hulk' || p.body === 'vtorso' || p.body === 'boxy' ? 'round' : p.body === 'tall' ? 'tall' : p.body === 'segmented' ? 'segmented' : 'pear',
    head: p.head,
    arms: p.arms === 'none' || p.arms === 'tentacles' ? p.arms : 'stub',
    back: p.back && soft.includes(p.back) ? p.back : 'none',
    top: p.top === 'antlers' || p.top === 'spikerow' || p.top === 'horns-twin' || p.top === 'horns-swept' ? 'ears' : p.top,
    mouth: p.mouth === 'beak' || p.mouth === 'mandibles' || p.mouth === 'none' ? p.mouth : 'smile',
  };
}
