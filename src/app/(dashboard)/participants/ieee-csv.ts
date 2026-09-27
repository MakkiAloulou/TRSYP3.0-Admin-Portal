import { IEEE_CHECK_LABELS, evaluateIeee, isRasSociety } from '@/lib/ieee-verification';
import type { ParticipantRow } from './participants-table';

type IeeeCsvRow = Pick<ParticipantRow, 'participantType' | 'ieeeId' | 'isRas' | 'user' | 'ieeeVerification'>;

/**
 * The IEEE verification columns, shared by the participants and team exports.
 *
 * The verdict and notes are judged under the current rules, like the table.
 * The raw IEEE fields are filled only while the stored result still applies —
 * a result the participant has since invalidated describes an old profile, so
 * those rows show "Unverified" and nothing else.
 */
export const IEEE_CSV_COLUMNS: { header: string; value: (p: IeeeCsvRow) => string }[] = [
  { header: 'IEEE check', value: (p) => IEEE_CHECK_LABELS[evaluateIeee(p).state] },
  {
    header: 'IEEE status',
    value: (p) => current(p)?.memberStatus ?? (current(p) ? 'No record' : ''),
  },
  { header: 'IEEE grade', value: (p) => current(p)?.grade ?? '' },
  {
    header: 'IEEE RAS',
    // Only an actual IEEE record says anything about RAS.
    value: (p) => {
      const v = current(p);
      if (!v || v.memberStatus === null) return '';
      return v.societies.some(isRasSociety) ? 'Yes' : 'No';
    },
  },
  {
    header: 'IEEE matched by',
    value: (p) => {
      const by = current(p)?.matchedBy;
      return by === 'IEEE_ID' ? 'IEEE ID' : by === 'EMAIL' ? 'Email' : '';
    },
  },
  {
    header: 'IEEE checked at',
    value: (p) => {
      const at = current(p)?.checkedAt;
      return at ? `${at.slice(0, 10)} ${at.slice(11, 16)}` : '';
    },
  },
  {
    header: 'IEEE notes',
    value: (p) =>
      evaluateIeee(p)
        .issues.map((issue) => issue.text)
        .join(' | '),
  },
];

/** The stored result, if it still describes the participant. */
function current(p: IeeeCsvRow) {
  const state = evaluateIeee(p).state;
  return state === 'UNVERIFIED' || state === 'NOT_APPLICABLE' ? null : p.ieeeVerification;
}
