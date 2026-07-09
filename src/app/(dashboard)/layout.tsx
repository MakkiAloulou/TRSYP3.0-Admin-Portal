import { redirect } from 'next/navigation';
import Link from 'next/link';
import { createClient } from '@/lib/supabase/server';
import { prisma } from '@/lib/prisma';
import Image from 'next/image';

export default async function DashboardLayout({ children }: { children: React.ReactNode }) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect('/login');
  }

  const admin = await prisma.admin.findUnique({
    where: { supabaseId: user.id },
    select: { id: true, name: true, lastName: true, position: true },
  });

  if (!admin) {
    redirect('/unauthorized');
  }

  return (
    <div className="min-h-screen" style={{ background: 'var(--color-bg)' }}>
      <header
        className="px-8 py-6"
        style={{ borderBottom: '1px solid rgba(0, 232, 122, 0.12)' }}
      >
        <div className="mx-auto flex max-w-6xl items-center justify-between">
          <div className="flex items-center gap-10">
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
            <nav className="flex gap-8 text-base" style={{ color: 'rgba(255,255,255,0.6)' }}>
              <Link href="/" className="hover:text-white transition-colors">
                Participants
              </Link>
              <Link href="/teams" className="hover:text-white transition-colors">
                Teams
              </Link>
            </nav>
          </div>
          <span className="text-base" style={{ color: 'rgba(255,255,255,0.4)' }}>
            {admin.name} {admin.lastName}
          </span>
        </div>
      </header>
      <main className="mx-auto max-w-6xl px-8 py-8">{children}</main>
    </div>
  );
}
