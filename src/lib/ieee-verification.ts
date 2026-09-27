// Shared IEEE membership-check vocabulary. Kept free of Prisma and React
// imports so both server actions and client components can pull from it —
// same split as src/lib/payment.ts.

export const IEEE_CHECK_STATUSES = ['VERIFIED', 'MISMATCH', 'INACTIVE', 'NOT_FOUND'] as const;
export type IeeeCheckStatus = (typeof IEEE_CHECK_STATUSES)[number];

/**
 * What a row shows — the stored status, made specific where the stored one is
 * too coarse to act on:
 * - MISMATCH whose only problem is RAS or YP → NOT_RAS / NOT_YP
 * - INACTIVE, by IEEE's own status → NOT_MEMBER (an IEEE account, never a
 *   membership), APPLICANT (application started, not completed) or LAPSED
 *   (was a member: arrears, expired)
 * plus the states with no stored result: never checked (or changed since), and
 * NonIEEE participants, who claim no membership and are never sent to IEEE.
 */
export type IeeeCheckState =
  | Exclude<IeeeCheckStatus, 'INACTIVE'>
  | 'NOT_RAS'
  | 'NOT_YP'
  | 'NOT_MEMBER'
  | 'APPLICANT'
  | 'LAPSED'
  | 'UNVERIFIED'
  | 'NOT_APPLICABLE';

export const IEEE_CHECK_LABELS: Record<IeeeCheckState, string> = {
  VERIFIED: 'Verified',
  MISMATCH: 'Mismatch',
  NOT_RAS: 'Not RAS',
  NOT_YP: 'Not YP',
  NOT_MEMBER: 'Not a member',
  APPLICANT: 'Pending application',
  LAPSED: 'Lapsed',
  NOT_FOUND: 'Not found',
  UNVERIFIED: 'Unverified',
  NOT_APPLICABLE: 'Not needed',
};

export const IEEE_CHECK_BADGES: Record<IeeeCheckState, string> = {
  VERIFIED: 'admin-badge--green',
  MISMATCH: 'admin-badge--amber',
  NOT_RAS: 'admin-badge--violet',
  NOT_YP: 'admin-badge--pink',
  NOT_MEMBER: 'admin-badge--orange',
  APPLICANT: 'admin-badge--lime',
  LAPSED: 'admin-badge--red',
  NOT_FOUND: 'admin-badge--cyan',
  UNVERIFIED: 'admin-badge--gray',
  NOT_APPLICABLE: 'admin-badge--gray',
};

/** Row and chart colour per verdict. Every actionable verdict has its own hue,
 *  so a glance at a column or a chart says which problem it is. */
export const IEEE_CHECK_COLORS: Record<IeeeCheckState, string> = {
  VERIFIED: '#00e87a',
  MISMATCH: '#f59e0b',
  NOT_RAS: '#a78bfa',
  NOT_YP: '#ff1d78',
  NOT_MEMBER: '#f97316',
  APPLICANT: '#a3e635',
  LAPSED: '#ef4444',
  NOT_FOUND: '#22d3ee',
  UNVERIFIED: 'rgba(255,255,255,0.4)',
  NOT_APPLICABLE: 'rgba(255,255,255,0.25)',
};

/** A `mismatch` issue changes the status; a `warning` is shown but leaves a
 *  verified member verified — it is a reason to look, not to reject. */
export type IeeeIssue = {
  level: 'mismatch' | 'warning';
  text: string;
  /** Set on the issues the UI needs to recognise, not just display. */
  code?: 'NOT_RAS' | 'NOT_YP';
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
    const text = {
      NOT_MEMBER: `Has an IEEE account but no membership (IEEE status "${record.memberStatus}", grade "${record.grade}").`,
      APPLICANT: `Has applied for IEEE membership, but the application is not complete (IEEE status "${record.memberStatus}"). Usually awaiting payment.`,
      LAPSED: `Membership is no longer active (IEEE status "${record.memberStatus}", grade "${record.grade}"). They need to renew.`,
    }[inactiveKind(record.memberStatus)];
    issues.push({ level: 'mismatch', text });
    return { status: 'INACTIVE', issues };
  }

  const isStudentGrade = /student/i.test(record.grade);

  if (claim.participantType === 'Student' && !isStudentGrade) {
    issues.push({
      level: 'mismatch',
      text: `Registered as Student, but IEEE grade is "${record.grade}".`,
    });
  }

  // One issue whichever way it fails, so "the only problem is YP" stays a
  // single mismatch that displayStatus can name.
  if (claim.participantType === 'YoungProfessional') {
    if (isStudentGrade) {
      issues.push({
        level: 'mismatch',
        code: 'NOT_YP',
        text: `Registered as Young Professional, but IEEE grade is "${record.grade}".`,
      });
    } else if (!record.societies.some(isYpSociety)) {
      issues.push({
        level: 'mismatch',
        code: 'NOT_YP',
        text: 'Registered as Young Professional, but Young Professionals (MEMYP060) is not among their active societies.',
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
  ieeeVerification: Pick<
    IeeeVerification,
    'status' | 'issues' | 'memberStatus' | 'claimedIeeeId' | 'claimedType' | 'claimedIsRas' | 'claimedEmail'
  > | null;
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

/** The stored status as a row shows it, so the admin knows the fix without
 *  opening it. A mismatch whose only problem is RAS or YP reads as "Not RAS" /
 *  "Not YP"; anything else wrong alongside it stays a plain mismatch. */
export function displayStatus(v: Pick<IeeeVerification, 'status' | 'issues' | 'memberStatus'>): IeeeCheckState {
  if (v.status === 'INACTIVE') return inactiveKind(v.memberStatus ?? '');
  if (v.status !== 'MISMATCH') return v.status;
  const mismatches = v.issues.filter((issue) => issue.level === 'mismatch');
  return (mismatches.length === 1 && mismatches[0].code) || 'MISMATCH';
}

/**
 * Sorts IEEE's non-active statuses by what the admin does about them. Seen in
 * practice: "Not Applicable" and "Applicant" (both grade "Individual"),
 * "Arrears" and "Inactive". Anything unrecognised is treated as lapsed — the
 * only one of the three that says they once held a membership, so the one
 * that never understates a problem.
 */
function inactiveKind(memberStatus: string): 'NOT_MEMBER' | 'APPLICANT' | 'LAPSED' {
  const status = memberStatus.trim().toLowerCase();
  if (status === 'not applicable') return 'NOT_MEMBER';
  if (status === 'applicant') return 'APPLICANT';
  return 'LAPSED';
}

/** Whether the stored result exists but no longer applies — shown as a note so
 *  "Unverified" after a completed check does not look like a lost result. */
export function isIeeeResultStale(p: IeeeStateInput) {
  return p.ieeeVerification !== null && p.participantType !== 'NonIEEE' && deriveIeeeState(p) === 'UNVERIFIED';
}
