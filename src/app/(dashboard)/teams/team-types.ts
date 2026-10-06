import type { FablabAxis } from '@prisma/client';
import type { PaymentState } from '@/lib/payment';

// Kept apart from teams-grid.tsx and team-data.ts, which are server-only: the
// CSV export runs in the browser and needs the axes without pulling those in.

type TeamMemberSummary = {
  id: string;
  user: { name: string; lastName: string };
  paid: boolean;
  /** Same four states as the participants table's Payment column, or null
   *  while the payments service is still answering. */
  payment: PaymentState | null;
};

export type TeamRow = {
  id: string;
  name: string;
  code: string;
  size: number;
  leaderId: string;
  /** FABLAB teams only — null everywhere else. */
  axis: FablabAxis | null;
  submissionUrl: string | null;
  submittedAt: string | null;
  members: TeamMemberSummary[];
};

export const FABLAB_AXES: { value: FablabAxis; label: string }[] = [
  { value: 'SAMPLE_PREPARATION', label: 'Automated Sample Preparation' },
  { value: 'WEIGHING_DOSING', label: 'Automated Weighing & Dosing Station' },
];
