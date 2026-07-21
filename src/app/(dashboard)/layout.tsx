import { redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import { prisma } from '@/lib/prisma';
import { DashboardHeader } from './dashboard-header';

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
      <DashboardHeader adminName={`${admin.name} ${admin.lastName}`} />
      <main className="mx-auto max-w-6xl px-8 py-8">{children}</main>
    </div>
  );
}
