'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';

const ACTIVITIES = [
  { href: '/teams/competition', label: 'Competition' },
  { href: '/teams/challenge', label: 'Challenge' },
  { href: '/teams/hackathon', label: 'Hackathon' },
] as const;

/** The three activities as tabs, shown above every Teams page. */
export function TeamsTabs() {
  const pathname = usePathname();

  return (
    <nav className="subtabs" aria-label="Team activities">
      {ACTIVITIES.map((activity) => {
        const active = pathname.startsWith(activity.href);
        return (
          <Link
            key={activity.href}
            href={activity.href}
            className="subtab"
            aria-current={active ? 'page' : undefined}
            data-active={active ? '' : undefined}
          >
            {activity.label}
          </Link>
        );
      })}
    </nav>
  );
}
