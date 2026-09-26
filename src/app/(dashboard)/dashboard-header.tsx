'use client';

import { useState } from 'react';
import Link from 'next/link';
import Image from 'next/image';
import { usePathname } from 'next/navigation';

const NAV_LINKS = [
  { href: '/', label: 'Overview' },
  { href: '/participants', label: 'Participants' },
  { href: '/payments', label: 'Payments' },
  { href: '/teams/competition', label: 'Competition' },
  { href: '/teams/challenge', label: 'Challenge' },
  { href: '/teams/hackathon', label: 'Hackathon' },
] as const;

export function DashboardHeader({ adminName }: { adminName: string }) {
  const [open, setOpen] = useState(false);
  const pathname = usePathname();

  const isActive = (href: string) => (href === '/' ? pathname === '/' : pathname.startsWith(href));

  return (
    <header className="admin-header">
      <div className="admin-header-inner">
        <div className="admin-header-left">
          <Link className="navbar-logo" href="/">
            <Image
              src="/trsyp-logo.png"
              loading="eager"
              alt="TRSYP 3.0"
              width={100}
              height={40}
              priority
              style={{ height: '40px', width: 'auto', objectFit: 'contain' }}
            />
          </Link>
          <nav className="admin-nav admin-nav--desktop">
            {NAV_LINKS.map((link) => (
              <Link
                key={link.href}
                href={link.href}
                className="transition-colors hover:text-white"
                aria-current={isActive(link.href) ? 'page' : undefined}
                data-active={isActive(link.href) ? '' : undefined}
              >
                {link.label}
              </Link>
            ))}
          </nav>
        </div>

        <div className="admin-header-right">
          <span className="admin-header-name">{adminName}</span>
          <button
            type="button"
            className="admin-nav-toggle"
            aria-label="Toggle menu"
            aria-expanded={open}
            onClick={() => setOpen((v) => !v)}
          >
            <span />
            <span />
            <span />
          </button>
        </div>
      </div>

      <nav className={`admin-nav admin-nav--mobile${open ? ' is-open' : ''}`}>
        <span className="admin-nav--mobile-name">{adminName}</span>
        {NAV_LINKS.map((link) => (
          <Link
            key={link.href}
            href={link.href}
            onClick={() => setOpen(false)}
            aria-current={isActive(link.href) ? 'page' : undefined}
            data-active={isActive(link.href) ? '' : undefined}
          >
            {link.label}
          </Link>
        ))}
      </nav>
    </header>
  );
}
