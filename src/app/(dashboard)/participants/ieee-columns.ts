import { IEEE_CHECK_LABELS, evaluateIeee, hasIeeeResult, isRasMember, recordSummary } from '@/lib/ieee-verification';
import type { XlsxColumn } from '@/lib/xlsx';
import type { ParticipantRow } from './participants-table';

type IeeeRow = Pick<ParticipantRow, 'participantType' | 'ieeeId' | 'isRas' | 'careerStage' | 'user' | 'ieeeVerification'>;

/**
 * The IEEE verification columns, shared by the participants and team exports.
 *
 * The raw IEEE fields are filled only while the stored result still applies —
 * one for an old member number or email no longer describes them, so those
 * rows show "No verification yet" and nothing else. Career stage is the participant's own answer.
 */
export const IEEE_COLUMNS: XlsxColumn<IeeeRow>[] = [
  { header: 'Career stage', value: (p) => p.careerStage ?? '' },
  { header: 'IEEE check', value: (p) => IEEE_CHECK_LABELS[evaluateIeee(p).state] },
  {
    header: 'IEEE result',
    value: (p) => {
      const v = current(p);
      return v ? recordSummary(v) : '';
    },
  },
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
      return isRasMember(v) ? 'Yes' : 'No';
    },
  },
  {
    header: 'IEEE matched by',
    value: (p) => {
      const by = current(p)?.matchedBy;
      return by === 'IEEE_ID' ? 'IEEE ID' : by === 'EMAIL' ? 'Email' : '';
    },
  },
  { header: 'IEEE checked by', value: (p) => current(p)?.checkedBy ?? '' },
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
function current(p: IeeeRow) {
  const state = evaluateIeee(p).state;
  return hasIeeeResult(state) ? p.ieeeVerification : null;
}
