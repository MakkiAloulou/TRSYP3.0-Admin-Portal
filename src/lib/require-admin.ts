import 'server-only';
import { redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import { prisma } from '@/lib/prisma';

/**
 * The admin gate for every protected page: no session goes to /login, and a
 * session that isn't on the admin list goes to /unauthorized. Middleware can't
 * do this itself (see lib/supabase/middleware.ts), so each protected layout or
 * page awaits it before rendering.
 */
export async function requireAdmin() {
  const userId = await sessionUserId();

  if (!userId) {
    redirect('/login');
  }

  if (!(await adminIdFor(userId))) {
    redirect('/unauthorized');
  }
}

/**
 * The signed-in admin's id, or null. For server actions, which are reachable
 * by POST from anywhere, so no page's gate covers them, and which must answer
 * rather than redirect.
 */
export async function getAdminId(): Promise<string | null> {
  const userId = await sessionUserId();
  return userId ? adminIdFor(userId) : null;
}

async function sessionUserId() {
  const supabase = await createClient();
  // A verified token's subject is the user id. getClaims checks the signature
  // locally with asymmetric keys, so this costs no Auth round trip (see
  // lib/supabase/middleware.ts); an invalid or expired token yields no claims.
  const { data } = await supabase.auth.getClaims();
  return data?.claims.sub ?? null;
}

async function adminIdFor(userId: string) {
  const admin = await prisma.admin.findUnique({
    where: { supabaseId: userId },
    select: { id: true },
  });
  return admin?.id ?? null;
}
