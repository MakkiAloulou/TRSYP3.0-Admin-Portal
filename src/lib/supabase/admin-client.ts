import 'server-only';
import { createClient } from '@supabase/supabase-js';

// Service-role client (bypasses RLS). Separate from src/lib/supabase/server.ts,
// which is the session-aware SSR client used for auth. This one is for admin
// actions against the Supabase Auth API itself (e.g. supabase.auth.admin.*) —
// data reads for the dashboard go through Prisma (src/lib/prisma.ts) instead.
//
// Must NEVER be imported from a client component or exposed to the browser.
// The 'server-only' import above throws a build error if anything tries to
// bundle this into client code.
const supabaseUrl = process.env.SUPABASE_URL;
const supabaseServiceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !supabaseServiceRoleKey) {
  throw new Error(
    'Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY env vars. Copy .env.example to .env.local and fill them in.',
  );
}

export const supabaseAdmin = createClient(supabaseUrl, supabaseServiceRoleKey, {
  auth: {
    autoRefreshToken: false,
    persistSession: false,
  },
});
