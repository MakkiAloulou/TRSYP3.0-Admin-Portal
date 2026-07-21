'use client';

import { useState } from 'react';
import Link from 'next/link';
import Image from 'next/image';

export function DashboardHeader({ adminName }: { adminName: string }) {
  const [open, setOpen] = useState(false);

  return (
    <header className="admin-header">
      <div className="admin-header-inner">
        <div className="admin-header-left">
          <a className="navbar-logo" href="/">
            <Image
              src="/trsyp-logo.png"
              loading="eager"
              alt="TRSYP 3.0"
              width={100}
              height={40}
              priority
              style={{ height: '40px', width: 'auto', objectFit: 'contain' }}
            />
          </a>
          <nav className="admin-nav admin-nav--desktop">
            <Link href="/" className="hover:text-white transition-colors">
              Participants
            </Link>
            <Link href="/teams" className="hover:text-white transition-colors">
              Teams
            </Link>
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
        <Link href="/" onClick={() => setOpen(false)}>
          Participants
        </Link>
        <Link href="/teams" onClick={() => setOpen(false)}>
          Teams
        </Link>
      </nav>
    </header>
  );
}
