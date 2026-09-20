// Which governorate each IEEE student branch sits in.
//
// Participants record a student branch, not a location, so the region map is
// only ever as right as this table. Two rules keep it honest:
//
//   1. A branch is listed here only when its city is known. Guessing would put
//      real people in the wrong governorate, which is worse than leaving them
//      out — a map that is confidently wrong reads exactly like one that is right.
//   2. Anything not listed is counted as unmapped and reported as such on the
//      dashboard, so the gap is visible rather than silently absorbed.
//
// Two invariants, both worth re-checking whenever this table is edited, since
// neither fails loudly — a typo just silently empties a governorate:
//   - every key is a value of the `SB` enum in prisma/schema.prisma, and every
//     SB value appears either here or in UNPLACED_BRANCHES below;
//   - every region matches a name in REGION_NAMES (tunisia-regions.ts) exactly.

export const BRANCH_REGIONS: Record<string, string> = {
  // Greater Tunis
  INAT: 'Tunis',
  INSAT: 'Tunis',
  FST: 'Tunis',
  ENIT: 'Tunis',
  ENSIT: 'Tunis',
  ENICarthage: 'Tunis',
  EPT: 'Tunis',
  ULT: 'Tunis',
  UCentrale: 'Tunis',
  SMU: 'Tunis',
  ISTMT: 'Tunis',

  // Ariana — the Ghazala / Technopole cluster
  SupCom: 'Ariana',
  ISI: 'Ariana',
  ISETCom: 'Ariana',
  ESPRIT: 'Ariana',
  SESAME: 'Ariana',
  TEKUP: 'Ariana',

  ENSI: 'Manouba',
  MSE: 'Manouba',

  // Ben Arous
  ISETRADES: 'Ben Arous',
  ISTIC: 'Ben Arous',

  // Sfax
  ENIS: 'Sfax',
  PolytechSfax: 'Sfax',
  ENETCom: 'Sfax',
  ISIMS: 'Sfax',
  FSS: 'Sfax',
  ISGI: 'Sfax',
  ISGIS: 'Sfax',
  IIT: 'Sfax',
  ESPIN: 'Sfax',

  // Sousse
  ENISO: 'Sousse',
  ESSTHS: 'Sousse',
  ISSATSo: 'Sousse',
  EPS: 'Sousse',
  EPI: 'Sousse',
  ESPITA: 'Sousse',

  // Monastir
  ENIM: 'Monastir',
  ISIMM: 'Monastir',
  FSM: 'Monastir',
  EPPM: 'Monastir',

  // Bizerte
  ENIB: 'Bizerte',
  FSB: 'Bizerte',
  ENSTAB: 'Bizerte',
  ISETBizerte: 'Bizerte',
  ISSATM: 'Bizerte', // Mateur

  // Gabes
  ENIG: 'Gabes',
  ISIMG: 'Gabes',
  FSG: 'Gabes',

  // Elsewhere
  ISIMa: 'Mahdia',
  ISETNABEUL: 'Nabeul',
  ISETKef: 'Le Kef',
  ISETKairouan: 'Kairouan',
  ISETDjerba: 'Medenine', // Djerba
};

/**
 * Branches with no region. 'CU' is a dead enum value — no such branch exists —
 * and 'Other' is unknown by definition, so neither can ever be placed. Both
 * still have to appear somewhere, or the coverage check above cannot tell a
 * deliberate omission from a forgotten one.
 *
 * Participants on these branches are counted in the dashboard footnote rather
 * than assigned a guessed region.
 */
export const UNPLACED_BRANCHES = ['CU', 'Other'] as const;

/** The governorate a branch sits in, or null when it is not placed yet. */
export function regionForBranch(branch: string | null | undefined): string | null {
  if (!branch) return null;
  return BRANCH_REGIONS[branch] ?? null;
}
