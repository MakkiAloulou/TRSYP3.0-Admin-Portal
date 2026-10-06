import type { FablabAxis } from '@prisma/client';
import type { PaymentState } from '@/lib/payment';

// Kept apart from teams-grid.tsx, which is a client component: a server page
// importing a value from a 'use client' module gets a reference, not the value.

type TeamMemberSummary = {
  id: string;
  user: { name: string; lastName: string };
  /** Same four states as the participants table's Payment column. */
  payment: PaymentState;
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
