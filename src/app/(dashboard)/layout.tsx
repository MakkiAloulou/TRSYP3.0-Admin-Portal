import { requireAdmin } from '@/lib/require-admin';
import { DashboardHeader } from './dashboard-header';

export default async function DashboardLayout({ children }: { children: React.ReactNode }) {
  await requireAdmin();

  return (
    <div className="min-h-screen" style={{ background: 'var(--color-bg)' }}>
      <DashboardHeader />
      <main className="dash-main mx-auto max-w-6xl px-4 py-6 sm:px-8 sm:py-8">{children}</main>
    </div>
  );
}
