'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';

const VIEWS = [
  { href: '/sessions', label: 'Sessions' },
  { href: '/sessions/standings', label: 'Branch standings' },
] as const;

/** The sessions list and the branch standings, as tabs, like the team activities. */
export function SessionsSubtabs() {
  const pathname = usePathname();

  return (
    <nav className="subtabs" aria-label="Sessions views">
      {VIEWS.map((view) => {
        const active = pathname === view.href;
        return (
          <Link
            key={view.href}
            href={view.href}
            className="subtab"
            aria-current={active ? 'page' : undefined}
            data-active={active ? '' : undefined}
          >
            {view.label}
          </Link>
        );
      })}
    </nav>
  );
}
