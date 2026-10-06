import { createServerClient } from '@supabase/ssr';
import { NextResponse, type NextRequest } from 'next/server';

// Refreshes the Supabase session cookie on every request. This does NOT
// check whether the user is an admin — that check needs Prisma, which needs
// the Node.js runtime, and Next.js middleware runs on the Edge runtime. The
// actual admin gate lives in src/app/(dashboard)/layout.tsx instead.
export async function updateSession(request: NextRequest) {
  let response = NextResponse.next({ request });

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value));
          response = NextResponse.next({ request });
          cookiesToSet.forEach(({ name, value, options }) =>
            response.cookies.set(name, value, options),
          );
        },
      },
    },
  );

  // Required: this call refreshes the session and must not be removed or
  // reordered relative to the response above, per Supabase's Next.js guide.
  //
  // getClaims rather than getUser: with asymmetric JWT signing keys it checks
  // the token's signature locally instead of asking the Auth server on every
  // request (getUser always makes that round trip). With a legacy symmetric
  // secret it falls back to the same server check, so it is never less safe.
  await supabase.auth.getClaims();

  return response;
}
