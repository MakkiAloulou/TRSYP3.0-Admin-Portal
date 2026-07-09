import { redirect } from 'next/navigation';
import Link from 'next/link';
import { createClient } from '@/lib/supabase/server';
import { prisma } from '@/lib/prisma';

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
        className="px-6 py-4"
        style={{ borderBottom: '1px solid rgba(0, 232, 122, 0.12)' }}
      >
        <div className="mx-auto flex max-w-6xl items-center justify-between">
          <div className="flex items-center gap-8">
            <h1
              className="admin-heading text-sm"
              style={{ color: 'var(--color-green)' }}
            >
              TRSYP 3.0 <span className="text-white/40">/ ADMIN</span>
            </h1>
            <nav className="flex gap-6 text-sm" style={{ color: 'rgba(255,255,255,0.6)' }}>
              <Link href="/" className="hover:text-white transition-colors">
                Users
              </Link>
              <Link href="/teams" className="hover:text-white transition-colors">
                Teams
              </Link>
            </nav>
          </div>
          <span className="text-sm" style={{ color: 'rgba(255,255,255,0.4)' }}>
            {admin.name} {admin.lastName}
          </span>
        </div>
      </header>
      <main className="mx-auto max-w-6xl px-6 py-8">{children}</main>
    </div>
  );
}
