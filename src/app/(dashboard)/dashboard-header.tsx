'use client';

import { useCallback, useLayoutEffect, useRef } from 'react';
import Link from 'next/link';
import Image from 'next/image';
import { usePathname } from 'next/navigation';

type Section = {
  href: string;
  label: string;
  icon: keyof typeof ICONS;
  isActive: (pathname: string) => boolean;
};

/**
 * Seven sections. The three team activities live under Teams, with their own
 * tabs on those pages (teams/teams-tabs.tsx), which keeps the bar short
 * enough to be a phone's bottom tab bar as it is.
 */
const SECTIONS: Section[] = [
  { href: '/', label: 'Overview', icon: 'overview', isActive: (p) => p === '/' },
  { href: '/participants', label: 'Participants', icon: 'participants', isActive: (p) => p.startsWith('/participants') },
  { href: '/payments', label: 'Payments', icon: 'payments', isActive: (p) => p.startsWith('/payments') },
  { href: '/teams/competition', label: 'Teams', icon: 'teams', isActive: (p) => p.startsWith('/teams') },
  { href: '/rooms', label: 'Rooms', icon: 'rooms', isActive: (p) => p.startsWith('/rooms') },
  { href: '/sessions', label: 'Sessions', icon: 'sessions', isActive: (p) => p.startsWith('/sessions') },
  { href: '/workshops', label: 'Workshops', icon: 'workshops', isActive: (p) => p.startsWith('/workshops') },
];

/**
 * The top bar (logo, and the sections centred on wider screens) plus, on
 * phones, a floating dock with the same seven sections in thumb reach: icons,
 * with the current one opened out into a lit capsule carrying its label.
 */
export function DashboardHeader() {
  const pathname = usePathname();
  const linksRef = useRef<HTMLElement>(null);
  const underlineRef = useRef<HTMLSpanElement>(null);
  // The first placement snaps; later ones slide, so the line never sweeps
  // in from the edge on page load.
  const placedRef = useRef(false);

  /**
   * Puts the lit line under `target`: the current page, or — as a fainter
   * preview — the link being hovered or focused. Written straight to the
   * element, so following the pointer never re-renders the header.
   */
  const moveUnderline = useCallback((target: HTMLElement | null, preview: boolean) => {
    const underline = underlineRef.current;
    if (!underline) return;
    if (!target || target.offsetWidth === 0) {
      underline.removeAttribute('data-visible');
      return;
    }
    if (!placedRef.current) underline.setAttribute('data-instant', '');
    underline.style.width = `${target.offsetWidth}px`;
    underline.style.transform = `translateX(${target.offsetLeft}px)`;
    underline.setAttribute('data-visible', '');
    underline.toggleAttribute('data-preview', preview);
    if (!placedRef.current) {
      placedRef.current = true;
      requestAnimationFrame(() => underline.removeAttribute('data-instant'));
    }
  }, []);

  const activeLink = useCallback(
    () => linksRef.current?.querySelector<HTMLElement>('[data-active]') ?? null,
    [],
  );

  useLayoutEffect(() => {
    const links = linksRef.current;
    if (!links) return;
    const home = () => moveUnderline(activeLink(), false);
    home();
    // Fonts arriving or the window resizing change the links' widths.
    const observer = new ResizeObserver(home);
    observer.observe(links);
    return () => observer.disconnect();
  }, [pathname, moveUnderline, activeLink]);

  // Hover or keyboard focus previews a link; leaving returns to the page.
  function preview(event: React.SyntheticEvent) {
    const link = (event.target as HTMLElement).closest<HTMLElement>('.nav-link');
    if (link) moveUnderline(link, !link.hasAttribute('data-active'));
  }

  function settle() {
    moveUnderline(activeLink(), false);
  }

  return (
    <>
      <header className="nav">
        <div className="nav-inner">
          <Link className="nav-logo" href="/" aria-label="TRSYP 3.0 admin — overview">
            <Image
              src="/trsyp-logo.png"
              alt="TRSYP 3.0"
              width={100}
              height={40}
              priority
              className="nav-logo-img"
            />
          </Link>

          <nav
            className="nav-links"
            ref={linksRef}
            aria-label="Main"
            onMouseOver={preview}
            onMouseLeave={settle}
            onFocus={preview}
            onBlur={settle}
          >
            {SECTIONS.map((section) => (
              <SectionLink key={section.href} section={section} pathname={pathname} className="nav-link" />
            ))}
            <span className="nav-underline" ref={underlineRef} aria-hidden />
          </nav>
        </div>
      </header>

      {/* Phones only (CSS): the same sections, where a thumb reaches them. */}
      <nav className="tabbar" aria-label="Main">
        {SECTIONS.map((section) => (
          <SectionLink key={section.href} section={section} pathname={pathname} className="tabbar-tab" />
        ))}
      </nav>
    </>
  );
}

function SectionLink({ section, pathname, className }: { section: Section; pathname: string; className: string }) {
  const active = section.isActive(pathname);
  return (
    <Link
      href={section.href}
      className={className}
      aria-current={active ? 'page' : undefined}
      data-active={active ? '' : undefined}
    >
      <NavIcon name={section.icon} />
      <span>{section.label}</span>
    </Link>
  );
}

/** One stroke weight and corner style across the set. */
const ICONS = {
  overview: (
    <>
      <rect x="3.5" y="3.5" width="7" height="7" rx="1.75" />
      <rect x="13.5" y="3.5" width="7" height="7" rx="1.75" />
      <rect x="3.5" y="13.5" width="7" height="7" rx="1.75" />
      <rect x="13.5" y="13.5" width="7" height="7" rx="1.75" />
    </>
  ),
  participants: (
    <>
      <circle cx="9" cy="8" r="3.5" />
      <path d="M2.5 20a6.5 6.5 0 0 1 13 0" />
      <path d="M16 4.7a3.5 3.5 0 0 1 0 6.6" />
      <path d="M18.5 14.4a6.5 6.5 0 0 1 3 5.6" />
    </>
  ),
  payments: (
    <>
      <rect x="2.5" y="5" width="19" height="14" rx="2.5" />
      <path d="M2.5 10h19" />
      <path d="M6.5 15h4" />
    </>
  ),
  teams: (
    <>
      <path d="M8 4h8v5a4 4 0 0 1-8 0z" />
      <path d="M8 6H5.5a2.5 2.5 0 0 0 2.8 4" />
      <path d="M16 6h2.5a2.5 2.5 0 0 1-2.8 4" />
      <path d="M12 13v4" />
      <path d="M8.5 20h7" />
    </>
  ),
  rooms: (
    <>
      <path d="M3 5v14" />
      <path d="M3 15h18" />
      <path d="M21 19v-6.5a3 3 0 0 0-3-3h-7.5V15" />
      <circle cx="6.75" cy="11.25" r="1.75" />
    </>
  ),
  sessions: (
    <>
      <rect x="3.5" y="5" width="17" height="15.5" rx="2.5" />
      <path d="M3.5 10h17" />
      <path d="M8 3v4" />
      <path d="M16 3v4" />
      <path d="m9 15 2 2 4-4" />
    </>
  ),
  workshops: (
    <>
      <rect x="3.5" y="4" width="17" height="11.5" rx="2" />
      <path d="M8 20h8" />
      <path d="M12 15.5V20" />
      <path d="m8 11 2.5-2.5 2 2L16 7" />
    </>
  ),
};

function NavIcon({ name }: { name: keyof typeof ICONS }) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.75}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
      focusable="false"
    >
      {ICONS[name]}
    </svg>
  );
}
