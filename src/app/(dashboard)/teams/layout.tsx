import { TeamsTabs } from './teams-tabs';

// The activity tabs stay put while a team page (or its loading skeleton)
// swaps in beneath them.
export default function TeamsLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="space-y-5">
      <TeamsTabs />
      {children}
    </div>
  );
}
