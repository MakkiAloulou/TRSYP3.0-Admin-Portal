// The draw's teams, shared by the stage and the server action that saves a
// draw, which checks every submitted draw against this list.

import type { StaticImageData } from 'next/image';
import ensitLogo from './logos/framed/ensit.png';
import enicarthageLogo from './logos/framed/enicarthage.png';
import espritLogo from './logos/framed/esprit.png';
import iitLogo from './logos/framed/iit.png';
import istmtLogo from './logos/framed/istmt.png';
import enetcomLogo from './logos/framed/enetcom.png';
import enigLogo from './logos/framed/enig.png';

export type Team = {
  id: string;
  name: string;
  /** The team's IEEE student branch; null while it's still to be confirmed. */
  branch: string | null;
  /** The branch's logo, from logos/framed: each one cropped to its mark and
   *  centred in the same 2:1 frame, so they all read at one size. Until one
   *  is set, an empty plate keeps its place. */
  branchLogo: StaticImageData | null;
};

/** The competition's eight teams. The keys are what the database stores. */
export const TEAMS: Team[] = [
  { id: 'ieee-ras-ensit', name: 'IEEE RAS ENSIT', branch: 'ENSIT SB', branchLogo: ensitLogo },
  { id: 'hannibal', name: 'HANNIBAL', branch: 'ENICarthage SB', branchLogo: enicarthageLogo },
  { id: 'autobots', name: 'AUTOBOTS', branch: 'ESPRIT SB', branchLogo: espritLogo },
  { id: 'lone-wolves', name: 'LONE WOLVES', branch: 'IIT SB', branchLogo: iitLogo },
  { id: 'synaptech', name: 'SYNAPTECH', branch: 'ISTMT SB', branchLogo: istmtLogo },
  { id: 'heptabot', name: 'HEPTABOT', branch: 'ENETCom SB', branchLogo: enetcomLogo },
  { id: 'spark', name: 'SPARK', branch: 'ENIG SB', branchLogo: enigLogo },
  { id: 'nexora', name: 'NEXORA', branch: 'ENIG SB', branchLogo: enigLogo },
];

/** A draw's result: the eight team keys in slot order, consecutive pairs being
 *  the matches, green corner first. Null unless it is exactly the teams above,
 *  each once, so a stored draw from an older team list is never half-shown. */
export function parseDrawOrder(keys: unknown): string[] | null {
  if (!Array.isArray(keys) || keys.length !== TEAMS.length) return null;
  const known = new Set(TEAMS.map((team) => team.id));
  if (!keys.every((key) => typeof key === 'string' && known.delete(key))) return null;
  return keys as string[];
}
