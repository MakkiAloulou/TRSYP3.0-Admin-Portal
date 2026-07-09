import 'server-only';
import { createServerClient } from '@supabase/ssr';
import { cookies } from 'next/headers';

// Anon-key, session-aware client for reading the logged-in user in Server
// Components / Route Handlers. Not to be confused with admin-client.ts
// (service-role, bypasses RLS, no user session).
export async function createClient() {
  const cookieStore = await cookies();

  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return cookieStore.getAll();
        },
        setAll(cookiesToSet) {
          try {
            cookiesToSet.forEach(({ name, value, options }) =>
              cookieStore.set(name, value, options),
            );
          } catch {
            // Called from a Server Component during render — middleware
            // handles the actual cookie refresh in that case, so this is
            // safe to ignore.
          }
        },
      },
    },
  );
}
