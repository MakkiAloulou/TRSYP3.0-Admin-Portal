// Shared IEEE membership-check vocabulary. Kept free of Prisma and React
// imports so both server actions and client components can pull from it —
// same split as src/lib/payment.ts.

export const IEEE_CHECK_STATUSES = ['VERIFIED', 'MISMATCH', 'INACTIVE', 'NOT_FOUND'] as const;
export type IeeeCheckStatus = (typeof IEEE_CHECK_STATUSES)[number];

/** What a row shows. The stored statuses, NOT_RAS (a MISMATCH whose only
 *  problem is RAS, named for what it is), and the states that have no row:
 *  never checked (or changed since), and NonIEEE participants, who claim no
 *  membership and so are never sent to IEEE at all. */
export type IeeeCheckState = IeeeCheckStatus | 'NOT_RAS' | 'UNVERIFIED' | 'NOT_APPLICABLE';

export const IEEE_CHECK_LABELS: Record<IeeeCheckState, string> = {
  VERIFIED: 'Verified',
  MISMATCH: 'Mismatch',
  NOT_RAS: 'Not RAS',
  INACTIVE: 'Inactive',
  NOT_FOUND: 'Not found',
  UNVERIFIED: 'Unverified',
  NOT_APPLICABLE: 'Not needed',
};

export const IEEE_CHECK_BADGES: Record<IeeeCheckState, string> = {
  VERIFIED: 'admin-badge--green',
  MISMATCH: 'admin-badge--amber',
  NOT_RAS: 'admin-badge--violet',
  INACTIVE: 'admin-badge--red',
  NOT_FOUND: 'admin-badge--red',
  UNVERIFIED: 'admin-badge--gray',
  NOT_APPLICABLE: 'admin-badge--gray',
};

/** A `mismatch` issue changes the status; a `warning` is shown but leaves a
 *  verified member verified — it is a reason to look, not to reject. */
export type IeeeIssue = {
  level: 'mismatch' | 'warning';
  text: string;
  /** Set on the issues the UI needs to recognise, not just display. */
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

// IEEE product catalog codes for the two memberships a registration claims:
// Robotics and Automation Society, and Young Professionals.
const RAS_CODE = 'MEMRA024';
const YP_CODE = 'MEMYP060';

export const isRasSociety = (code: string) => code.toUpperCase() === RAS_CODE;
export const isYpSociety = (code: string) => code.toUpperCase() === YP_CODE;

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

/**
 * Judges a found IEEE record against what the participant registered as.
 *
 * Only facts that change the fee count as a mismatch: active membership, the
 * Student vs Young Professional tier, and RAS. Everything that merely makes
 * the match less certain — initials, falling back to email — is a warning.
 */
export function assessMember(
  claim: IeeeClaim,
  record: IeeeMemberRecord,
  matchedBy: 'IEEE_ID' | 'EMAIL',
): { status: IeeeCheckStatus; issues: IeeeIssue[] } {
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

  if (record.memberStatus.toLowerCase() !== 'active') {
    issues.push({
      level: 'mismatch',
      text: `IEEE membership status is "${record.memberStatus}" (grade "${record.grade}"), not Active.`,
    });
    return { status: 'INACTIVE', issues };
  }

  const isStudentGrade = /student/i.test(record.grade);

  if (claim.participantType === 'Student' && !isStudentGrade) {
    issues.push({
      level: 'mismatch',
      text: `Registered as Student, but IEEE grade is "${record.grade}".`,
    });
  }

  if (claim.participantType === 'YoungProfessional') {
    if (isStudentGrade) {
      issues.push({
        level: 'mismatch',
        text: `Registered as Young Professional, but IEEE grade is "${record.grade}".`,
      });
    } else if (!record.societies.some(isYpSociety)) {
      issues.push({
        level: 'warning',
        text: 'Active member, but Young Professionals is not in their society list.',
      });
    }
  }

  if (claim.isRas && !record.societies.some(isRasSociety)) {
    issues.push({
      level: 'mismatch',
      code: 'NOT_RAS',
      text: 'Registered as a RAS member, but RAS (MEMRA024) is not among their active societies.',
    });
  }

  const status = issues.some((issue) => issue.level === 'mismatch') ? 'MISMATCH' : 'VERIFIED';
  return { status, issues };
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

/** The subset of a participant row the state depends on. */
export type IeeeStateInput = {
  participantType: string;
  ieeeId: number | null;
  isRas: boolean;
  user: { email: string };
  ieeeVerification: IeeeVerification | null;
};

/**
 * A stored result only counts while it still describes the participant. Anyone
 * who changed their IEEE ID, tier, RAS flag or email after the check is back to
 * unverified, so the batch picks them up again.
 */
export function deriveIeeeState(p: IeeeStateInput): IeeeCheckState {
  if (p.participantType === 'NonIEEE') return 'NOT_APPLICABLE';

  const v = p.ieeeVerification;
  if (!v) return 'UNVERIFIED';

  const stale =
    v.claimedIeeeId !== p.ieeeId ||
    v.claimedType !== p.participantType ||
    v.claimedIsRas !== p.isRas ||
    v.claimedEmail.toLowerCase() !== p.user.email.toLowerCase();

  return stale ? 'UNVERIFIED' : displayStatus(v);
}

/** The stored status as a row shows it: a mismatch whose only problem is RAS
 *  reads as "Not RAS", so the admin knows the fix without opening it. */
export function displayStatus(v: Pick<IeeeVerification, 'status' | 'issues'>): IeeeCheckState {
  if (v.status !== 'MISMATCH') return v.status;
  const mismatches = v.issues.filter((issue) => issue.level === 'mismatch');
  return mismatches.length === 1 && mismatches[0].code === 'NOT_RAS' ? 'NOT_RAS' : 'MISMATCH';
}

/** Whether the stored result exists but no longer applies — shown as a note so
 *  "Unverified" after a completed check does not look like a lost result. */
export function isIeeeResultStale(p: IeeeStateInput) {
  return p.ieeeVerification !== null && p.participantType !== 'NonIEEE' && deriveIeeeState(p) === 'UNVERIFIED';
}
