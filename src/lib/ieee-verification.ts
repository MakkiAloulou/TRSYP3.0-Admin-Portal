// Shared IEEE membership-check vocabulary. Kept free of Prisma and React
// imports so both server actions and client components can pull from it —
// same split as src/lib/payment.ts.

/** What is stored per check. Coarse on purpose: the verdict a row shows is
 *  recomputed from the stored IEEE record on every render (see evaluateIeee),
 *  so changing the rules never needs a re-check or a data migration. */
export const IEEE_CHECK_STATUSES = ['VERIFIED', 'MISMATCH', 'INACTIVE', 'NOT_FOUND'] as const;
export type IeeeCheckStatus = (typeof IEEE_CHECK_STATUSES)[number];

/**
 * What a row shows:
 * - VERIFIED — active member (or a pending application, with a note)
 * - NOT_RAS — active member whose only problem is claiming RAS
 * - NOT_IEEE — no active membership: never a member, lapsed, or no record
 * plus the states with no current result: never checked (or changed since),
 * and NonIEEE participants, who claim no membership and are never sent to IEEE.
 */
export type IeeeCheckState = 'VERIFIED' | 'NOT_RAS' | 'NOT_IEEE' | 'UNVERIFIED' | 'NOT_APPLICABLE';

export const IEEE_CHECK_LABELS: Record<IeeeCheckState, string> = {
  VERIFIED: 'Verified',
  NOT_RAS: 'Not RAS',
  NOT_IEEE: 'Not IEEE',
  UNVERIFIED: 'Unverified',
  NOT_APPLICABLE: 'Not needed',
};

export const IEEE_CHECK_BADGES: Record<IeeeCheckState, string> = {
  VERIFIED: 'admin-badge--green',
  NOT_RAS: 'admin-badge--violet',
  NOT_IEEE: 'admin-badge--red',
  UNVERIFIED: 'admin-badge--gray',
  NOT_APPLICABLE: 'admin-badge--gray',
};

/** Row and chart colour per verdict. Every actionable verdict has its own hue,
 *  so a glance at a column or a chart says which problem it is. */
export const IEEE_CHECK_COLORS: Record<IeeeCheckState, string> = {
  VERIFIED: '#00e87a',
  NOT_RAS: '#a78bfa',
  NOT_IEEE: '#ef4444',
  UNVERIFIED: 'rgba(255,255,255,0.4)',
  NOT_APPLICABLE: 'rgba(255,255,255,0.25)',
};

/** A `mismatch` issue changes the verdict; a `warning` is a note shown in the
 *  participant's details — a reason to look, not to reject. */
export type IeeeIssue = {
  level: 'mismatch' | 'warning';
  text: string;
  /** Set on the issues the verdict needs to recognise, not just display. */
  code?: 'NOT_RAS';
};

/** One stored check, as the client receives it (dates already ISO strings). */
export type IeeeVerification = {
  status: IeeeCheckStatus;
  memberStatus: string | null;
  grade: string | null;
  societies: string[];
  firstInitial: string | null;
  lastInitial: string | null;
  matchedBy: 'IEEE_ID' | 'EMAIL' | null;
  /** The notes as they were when the check ran. Kept for the record; what is
   *  displayed comes from evaluateIeee, under the current rules. */
  issues: IeeeIssue[];
  checkedAt: string;
  // What the participant claimed when this check ran. If any of it has changed
  // since, the result no longer describes them and they count as unverified.
  claimedIeeeId: number | null;
  claimedType: string;
  claimedIsRas: boolean;
  claimedEmail: string;
};

/** The participant facts a check is made against. */
export type IeeeClaim = {
  ieeeId: number | null;
  participantType: string;
  isRas: boolean;
  email: string;
  /** The account was activated through a link sent to `email`, which is what
   *  makes an email match evidence that the IEEE record is theirs. */
  emailConfirmed: boolean;
  firstName: string;
  lastName: string;
};

/** The fields of a successful GetMemberStatus response this dashboard uses. */
export type IeeeMemberRecord = {
  memberStatus: string;
  grade: string;
  societies: string[];
  firstInitial: string;
  lastInitial: string;
};

// IEEE product catalog code for Robotics and Automation Society membership.
const RAS_CODE = 'MEMRA024';

export const isRasSociety = (code: string) => code.toUpperCase() === RAS_CODE;

/**
 * IEEE member numbers run 8–9 digits (e.g. 90247965). The column is an Int, so
 * an old number's leading zeros are gone, and the bar sits well below 8 to
 * leave room for that. Anything shorter was never a member number — usually a
 * branch or student number typed into the wrong field.
 */
const MIN_IEEE_ID = 10_000;

export const isPlausibleIeeeId = (id: number) => id >= MIN_IEEE_ID;

/** "UH3001,MEMPE031" → ['UH3001', 'MEMPE031']; the API sends "None" when empty. */
export function parseSocietyList(raw: string | null | undefined): string[] {
  if (!raw || raw.trim().toLowerCase() === 'none') return [];
  return raw
    .split(',')
    .map((code) => code.trim())
    .filter(Boolean);
}

export type IeeeJudgement = { state: Exclude<IeeeCheckState, 'UNVERIFIED' | 'NOT_APPLICABLE'>; issues: IeeeIssue[] };

/**
 * Judges an IEEE lookup against what the participant registered as. `record`
 * is null when IEEE had no record under their ID or email.
 *
 * Two facts decide the verdict: whether they hold an active membership, and,
 * for those who registered as RAS, whether RAS is among their societies. Grade
 * is deliberately not compared. Everything that merely makes the match less
 * certain — initials, falling back to email — is a note.
 */
export function judgeRecord(
  claim: IeeeClaim,
  record: IeeeMemberRecord | null,
  matchedBy: 'IEEE_ID' | 'EMAIL',
): IeeeJudgement {
  if (!record) return { state: 'NOT_IEEE', issues: [] };

  const issues: IeeeIssue[] = [];

  if (matchedBy === 'EMAIL' && claim.ieeeId !== null) {
    issues.push({
      level: 'warning',
      text: isPlausibleIeeeId(claim.ieeeId)
        ? `IEEE ID ${claim.ieeeId} was not found; matched by email instead. The ID they entered is probably wrong or mistyped.`
        : `"${claim.ieeeId}" is not an IEEE member number (those have 8–9 digits); matched by email instead. Ask them for their real IEEE ID.`,
    });
  }

  // An email match proves the record is theirs only if they proved they own
  // the address. Anyone can register with someone else's email; they just
  // cannot activate the account.
  if (matchedBy === 'EMAIL' && !claim.emailConfirmed) {
    issues.push({
      level: 'warning',
      text: `Matched by email, but they never confirmed they own ${claim.email} (account not activated). The record may not be theirs.`,
    });
  }

  if (!initialsMatch(claim, record)) {
    issues.push({
      level: 'warning',
      text: `IEEE record initials are ${record.firstInitial}. ${record.lastInitial}., which do not match ${claim.firstName} ${claim.lastName}. This ID may belong to someone else.`,
    });
  }

  const status = record.memberStatus.trim().toLowerCase();

  // Applied and not yet through (usually payment). Counted as a member; the
  // application has no societies to check RAS against yet.
  if (status === 'applicant') {
    issues.push({
      level: 'warning',
      text: 'Pending IEEE application: they have applied, but the membership is not complete yet (usually awaiting payment).',
    });
    return { state: 'VERIFIED', issues };
  }

  if (status !== 'active') {
    // "Not Applicable" is an IEEE account that never held a membership — the
    // verdict says all there is to say. Anything else (Arrears, Inactive) was
    // a membership once, which is worth telling them.
    if (status !== 'not applicable') {
      issues.push({
        level: 'warning',
        text: `Lapsed IEEE membership (IEEE status "${record.memberStatus}", grade "${record.grade}"). They were a member and need to renew.`,
      });
    }
    return { state: 'NOT_IEEE', issues };
  }

  if (claim.isRas && !record.societies.some(isRasSociety)) {
    issues.push({
      level: 'mismatch',
      code: 'NOT_RAS',
      text: 'Registered as a RAS member, but RAS (MEMRA024) is not among their active societies.',
    });
    return { state: 'NOT_RAS', issues };
  }

  return { state: 'VERIFIED', issues };
}

/** The coarse status stored alongside a check, for the record. */
export function storedStatus(judgement: IeeeJudgement, record: IeeeMemberRecord | null): IeeeCheckStatus {
  if (!record) return 'NOT_FOUND';
  if (judgement.state === 'NOT_IEEE') return 'INACTIVE';
  return judgement.state === 'VERIFIED' ? 'VERIFIED' : 'MISMATCH';
}

/** IEEE returns only initials. Either order is accepted, since first and last
 *  names are often swapped between the two systems. */
function initialsMatch(claim: IeeeClaim, record: IeeeMemberRecord) {
  const first = initial(claim.firstName);
  const last = initial(claim.lastName);
  const theirFirst = initial(record.firstInitial);
  const theirLast = initial(record.lastInitial);

  // Nothing to compare against — don't raise a warning over missing data.
  if (!theirFirst || !theirLast) return true;

  return (first === theirFirst && last === theirLast) || (first === theirLast && last === theirFirst);
}

function initial(name: string) {
  return name
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .trim()
    .charAt(0)
    .toUpperCase();
}

/** The subset of a participant row the verdict depends on. */
export type IeeeStateInput = {
  participantType: string;
  ieeeId: number | null;
  isRas: boolean;
  user: { email: string; name: string; lastName: string; active: boolean };
  ieeeVerification: Pick<
    IeeeVerification,
    | 'memberStatus'
    | 'grade'
    | 'societies'
    | 'firstInitial'
    | 'lastInitial'
    | 'matchedBy'
    | 'claimedIeeeId'
    | 'claimedType'
    | 'claimedIsRas'
    | 'claimedEmail'
  > | null;
};

/**
 * The verdict and notes a participant shows now: the stored IEEE record,
 * judged under the current rules against their current profile.
 *
 * A stored result only counts while it still describes the participant. Anyone
 * who changed their IEEE ID, tier, RAS flag or email after the check is back to
 * unverified, so the batch picks them up again.
 */
export function evaluateIeee(p: IeeeStateInput): { state: IeeeCheckState; issues: IeeeIssue[] } {
  if (p.participantType === 'NonIEEE') return { state: 'NOT_APPLICABLE', issues: [] };

  const v = p.ieeeVerification;
  if (!v || isStale(p, v)) return { state: 'UNVERIFIED', issues: [] };

  const record: IeeeMemberRecord | null =
    v.memberStatus === null
      ? null
      : {
          memberStatus: v.memberStatus,
          grade: v.grade ?? '',
          societies: v.societies,
          firstInitial: v.firstInitial ?? '',
          lastInitial: v.lastInitial ?? '',
        };

  return judgeRecord(claimOf(p), record, v.matchedBy ?? 'IEEE_ID');
}

export function deriveIeeeState(p: IeeeStateInput): IeeeCheckState {
  return evaluateIeee(p).state;
}

/** The claim a participant makes, from their profile as it stands. */
export function claimOf(p: Omit<IeeeStateInput, 'ieeeVerification'>): IeeeClaim {
  return {
    ieeeId: p.ieeeId,
    participantType: p.participantType,
    isRas: p.isRas,
    email: p.user.email,
    emailConfirmed: p.user.active,
    firstName: p.user.name,
    lastName: p.user.lastName,
  };
}

function isStale(p: IeeeStateInput, v: NonNullable<IeeeStateInput['ieeeVerification']>) {
  return (
    v.claimedIeeeId !== p.ieeeId ||
    v.claimedType !== p.participantType ||
    v.claimedIsRas !== p.isRas ||
    v.claimedEmail.toLowerCase() !== p.user.email.toLowerCase()
  );
}

/** Whether the stored result exists but no longer applies — shown as a note so
 *  "Unverified" after a completed check does not look like a lost result. */
export function isIeeeResultStale(p: IeeeStateInput) {
  return p.ieeeVerification !== null && p.participantType !== 'NonIEEE' && isStale(p, p.ieeeVerification);
}
