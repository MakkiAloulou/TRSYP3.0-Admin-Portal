import { redirect } from 'next/navigation';

/** `/teams` is now split by activity — land on the competition list. */
export default function TeamsPage() {
  redirect('/teams/competition');
}
