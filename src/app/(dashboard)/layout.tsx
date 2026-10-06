import { redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import { prisma } from '@/lib/prisma';
import { DashboardHeader } from './dashboard-header';

export default async function DashboardLayout({ children }: { children: React.ReactNode }) {
  const supabase = await createClient();
  // A verified token's subject is the user id. getClaims checks the signature
  // locally with asymmetric keys, so this costs no Auth round trip (see
  // lib/supabase/middleware.ts); an invalid or expired token yields no claims.
  const { data } = await supabase.auth.getClaims();
  const userId = data?.claims.sub;

  if (!userId) {
    redirect('/login');
  }

  // Only whether they are an admin: the header no longer shows their name.
  const admin = await prisma.admin.findUnique({
    where: { supabaseId: userId },
    select: { id: true },
  });

  if (!admin) {
    redirect('/unauthorized');
  }

  return (
    <div className="min-h-screen" style={{ background: 'var(--color-bg)' }}>
      <DashboardHeader />
      <main className="dash-main mx-auto max-w-6xl px-4 py-6 sm:px-8 sm:py-8">{children}</main>
    </div>
  );
}
