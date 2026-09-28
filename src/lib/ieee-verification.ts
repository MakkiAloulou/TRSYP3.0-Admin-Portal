// Shared IEEE membership-check vocabulary. Kept free of Prisma and React
// imports so both server actions and client components can pull from it —
// same split as src/lib/payment.ts.
//
// `participants.participant_type` and `is_ras` are IEEE's verdict, not the
// participant's claim: the main website sets them from the `ieee_verifications`
// row (see pricedValues). So nothing here compares the profile against the
// record — it reports what IEEE said.

/** What is stored per check, for the record. What a row shows is derived from
 *  the raw IEEE columns on every render (see evaluateIeee). */
export const IEEE_CHECK_STATUSES = ['VERIFIED', 'MISMATCH', 'INACTIVE', 'NOT_FOUND'] as const;
export type IeeeCheckStatus = (typeof IEEE_CHECK_STATUSES)[number];

/**
 * What a row shows:
 * - VERIFIED — IEEE member (active, or a pending application); "Verified · RAS"
 *   when RAS is among their societies
 * - NOT_RAS — IEEE member who said they were in RAS when they registered, under
 *   the old form, but IEEE doesn't list RAS. Registration no longer asks, so
 *   this only ever applies to those earlier claims (see claimedRas).
 * - NOT_IEEE — IEEE record without a membership (never held one, lapsed), or no record
 * - UNVERIFIED — no check yet (normally only seconds after registering), or
 *   only one for an old member number or email, which the main website
 *   re-checks automatically
 */
export type IeeeCheckState = 'VERIFIED' | 'NOT_RAS' | 'NOT_IEEE' | 'UNVERIFIED';

/** States that carry a current IEEE result. */
export const hasIeeeResult = (state: IeeeCheckState) =>
  state === 'VERIFIED' || state === 'NOT_RAS' || state === 'NOT_IEEE';

export const IEEE_CHECK_LABELS: Record<IeeeCheckState, string> = {
  VERIFIED: 'Verified',
  NOT_RAS: 'Not RAS',
  NOT_IEEE: 'Not IEEE',
  UNVERIFIED: 'No verification yet',
};

export const IEEE_CHECK_BADGES: Record<IeeeCheckState, string> = {
  VERIFIED: 'admin-badge--green',
  NOT_RAS: 'admin-badge--violet',
  NOT_IEEE: 'admin-badge--red',
  UNVERIFIED: 'admin-badge--gray',
};

/** Row and chart colour per state. */
export const IEEE_CHECK_COLORS: Record<IeeeCheckState, string> = {
  VERIFIED: '#00e87a',
  NOT_RAS: '#a78bfa',
  NOT_IEEE: '#ef4444',
  UNVERIFIED: 'rgba(255,255,255,0.4)',
};

/** A note shown in the participant's details — context on IEEE's answer, never
 *  a verdict. `level` is kept for rows written before notes were info-only. */
export type IeeeIssue = { level: 'mismatch' | 'warning'; text: string; code?: string };

/** One stored check, as the client receives it (dates already ISO strings). */
export type IeeeVerification = {
  status: IeeeCheckStatus;
  memberStatus: string | null;
  grade: string | null;
  societies: string[];
  firstInitial: string | null;
  lastInitial: string | null;
  matchedBy: 'IEEE_ID' | 'EMAIL' | null;
  /** The notes as written when the check ran; what is shown comes from
   *  evaluateIeee. */
  issues: IeeeIssue[];
  checkedAt: string;
  /** 'system' for the main website's automatic checks, otherwise the admin's
   *  name (resolved from their id on the server). */
  checkedBy: string;
  // The participant's values the row was written against — after the check
  // updated them. If any has changed since, the row no longer applies.
  claimedIeeeId: number | null;
  claimedType: string;
  claimedIsRas: boolean;
  claimedEmail: string;
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

/* ─── The rules the main website prices by ──────────────────────────── */

const normalise = (memberStatus: string | null) => memberStatus?.trim().toLowerCase() ?? null;

/** Member = Active or Applicant (an application counts as a membership). */
export function isIeeeMember(memberStatus: string | null) {
  const status = normalise(memberStatus);
  return status === 'active' || status === 'applicant';
}

/** RAS = an Active membership with MEMRA024 among the societies. */
export function isRasMember(record: { memberStatus: string | null; societies: string[] }) {
  return normalise(record.memberStatus) === 'active' && record.societies.some(isRasSociety);
}

/**
 * The `participant_type` / `is_ras` a record prices a participant at — the same
 * rule the main website applies. Members take their own career stage; when
 * they never gave one, a student branch means Student.
 */
export function pricedValues(
  record: { memberStatus: string | null; societies: string[] } | null,
  profile: { careerStage: string | null; sb: string | null },
): { participantType: 'NonIEEE' | 'Student' | 'YoungProfessional'; isRas: boolean } {
  if (!record || !isIeeeMember(record.memberStatus)) return { participantType: 'NonIEEE', isRas: false };

  const participantType =
    profile.careerStage === 'Student' || profile.careerStage === 'YoungProfessional'
      ? profile.careerStage
      : profile.sb
        ? 'Student'
        : 'YoungProfessional';

  return { participantType, isRas: isRasMember(record) };
}

/** The coarse status stored with a check, for the record. */
export function storedStatus(record: IeeeMemberRecord | null): IeeeCheckStatus {
  if (!record) return 'NOT_FOUND';
  return isIeeeMember(record.memberStatus) ? 'VERIFIED' : 'INACTIVE';
}

/* ─── Describing a result ──────────────────────────────────────────── */

/** IEEE's answer in one sentence, worded as what IEEE said. */
export function recordSummary(v: { memberStatus: string | null; societies: string[] }): string {
  const status = normalise(v.memberStatus);
  if (status === null) return 'No IEEE record found (by member number or email)';
  if (status === 'active') return isRasMember(v) ? 'Verified IEEE member · RAS' : 'Verified IEEE member';
  if (status === 'applicant') return 'IEEE application pending — counted as a member';
  if (status === 'not applicable') return 'IEEE account found, but it has never held a membership';
  return 'IEEE membership lapsed';
}

/** Who the check is for, for the identity notes. */
export type IeeeSubject = { ieeeId: number | null; firstName: string; lastName: string };

/**
 * Context on a result that is worth an admin's attention. None of it changes
 * the verdict — the verdict is IEEE's.
 */
export function recordNotes(
  subject: IeeeSubject,
  v: Pick<IeeeVerification, 'memberStatus' | 'grade' | 'firstInitial' | 'lastInitial' | 'matchedBy'>,
): IeeeIssue[] {
  const notes: IeeeIssue[] = [];
  const status = normalise(v.memberStatus);
  if (status === null) return notes;

  if (v.matchedBy === 'EMAIL' && subject.ieeeId !== null) {
    notes.push({
      level: 'warning',
      text: isPlausibleIeeeId(subject.ieeeId)
        ? `IEEE ID ${subject.ieeeId} was not found; matched by email instead. The ID they entered is probably wrong or mistyped.`
        : `"${subject.ieeeId}" is not an IEEE member number (those have 8–9 digits); matched by email instead. Ask them for their real IEEE ID.`,
    });
  }

  if (!initialsMatch(subject, v)) {
    notes.push({
      level: 'warning',
      text: `IEEE record initials are ${v.firstInitial}. ${v.lastInitial}., which do not match ${subject.firstName} ${subject.lastName}. This record may belong to someone else.`,
    });
  }

  if (status === 'applicant') {
    notes.push({
      level: 'warning',
      text: 'Pending IEEE application: they have applied, but the membership is not complete yet (usually awaiting payment).',
    });
  } else if (status !== 'active' && status !== 'not applicable') {
    notes.push({
      level: 'warning',
      text: `Lapsed IEEE membership (IEEE status "${v.memberStatus}", grade "${v.grade ?? ''}"). They were a member and need to renew.`,
    });
  }

  return notes;
}

/** IEEE returns only initials. Either order is accepted, since first and last
 *  names are often swapped between the two systems. */
function initialsMatch(subject: IeeeSubject, v: { firstInitial: string | null; lastInitial: string | null }) {
  const first = initial(subject.firstName);
  const last = initial(subject.lastName);
  const theirFirst = initial(v.firstInitial ?? '');
  const theirLast = initial(v.lastInitial ?? '');

  // Nothing to compare against — don't raise a note over missing data.
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

/* ─── A participant's current state ────────────────────────────────── */

/** The subset of a participant row the state depends on. */
export type IeeeStateInput = {
  participantType: string;
  ieeeId: number | null;
  isRas: boolean;
  user: { email: string; name: string; lastName: string };
  ieeeVerification: Pick<
    IeeeVerification,
    | 'memberStatus'
    | 'grade'
    | 'societies'
    | 'firstInitial'
    | 'lastInitial'
    | 'matchedBy'
    | 'issues'
    | 'claimedIeeeId'
    | 'claimedType'
    | 'claimedIsRas'
    | 'claimedEmail'
  > | null;
};

/**
 * Whether the participant said they were in RAS when they registered. The old
 * form asked; the portal's checks from that time saved the claim as a note
 * (code NOT_RAS, or its text on the very first rows), and re-checks carry it
 * over. The profile's is_ras can't tell us: it is IEEE's verdict now.
 */
export function claimedRas(issues: IeeeIssue[]) {
  return issues.some(isRasClaimNote);
}

export function isRasClaimNote(issue: IeeeIssue) {
  return issue.code === 'NOT_RAS' || issue.text.startsWith('Registered as a RAS member');
}

const RAS_CLAIM_NOTE =
  'Said they were a RAS member when they registered, but RAS (MEMRA024) is not among their active IEEE societies.';

/**
 * The state and notes a participant shows now. Any participant with a row
 * shows it, whatever their type: a NonIEEE participant with a row was looked up
 * and found not to be a member.
 *
 * A row is stale when any claimed_* differs from the participant's current
 * ieee_id, participant_type, is_ras or email — they changed their member number
 * or email since, and the main website re-checks them automatically.
 */
export function evaluateIeee(p: IeeeStateInput): { state: IeeeCheckState; issues: IeeeIssue[] } {
  const v = p.ieeeVerification;
  if (!v) return { state: 'UNVERIFIED', issues: [] };
  if (isStale(p, v)) return { state: 'UNVERIFIED', issues: [] };

  const subject = { ieeeId: p.ieeeId, firstName: p.user.name, lastName: p.user.lastName };
  const notes = recordNotes(subject, v);

  if (!isIeeeMember(v.memberStatus)) return { state: 'NOT_IEEE', issues: notes };

  // Only a false claim is "Not RAS"; a member who never said RAS is just Verified.
  if (claimedRas(v.issues) && !isRasMember(v)) {
    return { state: 'NOT_RAS', issues: [{ level: 'mismatch', code: 'NOT_RAS', text: RAS_CLAIM_NOTE }, ...notes] };
  }

  return { state: 'VERIFIED', issues: notes };
}

export function deriveIeeeState(p: IeeeStateInput): IeeeCheckState {
  return evaluateIeee(p).state;
}

/** Whether the participant has a row that no longer applies — shown in their
 *  details so "No verification yet" doesn't look like a lost result. */
export function isIeeeResultStale(p: IeeeStateInput) {
  return p.ieeeVerification !== null && isStale(p, p.ieeeVerification);
}

function isStale(p: IeeeStateInput, v: NonNullable<IeeeStateInput['ieeeVerification']>) {
  return (
    v.claimedIeeeId !== p.ieeeId ||
    v.claimedType !== p.participantType ||
    v.claimedIsRas !== p.isRas ||
    v.claimedEmail.toLowerCase() !== p.user.email.toLowerCase()
  );
}
