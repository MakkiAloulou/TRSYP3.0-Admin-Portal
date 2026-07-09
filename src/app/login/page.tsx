'use client';

import { useState } from 'react';
import { createClient } from '@/lib/supabase/client';

export default function LoginPage() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function handlePasswordLogin(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setLoading(true);

    const supabase = createClient();
    const { error: signInError } = await supabase.auth.signInWithPassword({ email, password });

    if (signInError) {
      setError(signInError.message);
      setLoading(false);
      return;
    }

    window.location.href = '/';
  }

  async function handleGoogleLogin() {
    setError(null);
    setLoading(true);

    const supabase = createClient();
    const { error: oauthError } = await supabase.auth.signInWithOAuth({
      provider: 'google',
      options: {
        redirectTo: `${window.location.origin}/auth/callback`,
      },
    });

    if (oauthError) {
      setError(oauthError.message);
      setLoading(false);
    }
  }

  return (
    <div
      className="flex min-h-screen items-center justify-center px-4"
      style={{ background: 'var(--color-bg)' }}
    >
      <div className="admin-modal w-full max-w-sm" style={{ position: 'static' }}>
        <div className="mb-7 text-center">
          <span
            className="admin-badge admin-badge--green mb-3"
            style={{ letterSpacing: '0.2em' }}
          >
            Admin Access
          </span>
          <h1 className="admin-heading text-xl text-white mt-3">Sign In</h1>
          <p className="mt-1 text-sm" style={{ color: 'rgba(255,255,255,0.4)' }}>
            TRSYP 3.0 admin dashboard
          </p>
        </div>

        {error && (
          <div
            className="mb-4 rounded-md px-3 py-2 text-sm"
            style={{
              background: 'rgba(255, 29, 120, 0.08)',
              border: '1px solid rgba(255, 29, 120, 0.25)',
              color: 'var(--color-pink)',
            }}
          >
            {error}
          </div>
        )}

        <button
          type="button"
          onClick={handleGoogleLogin}
          disabled={loading}
          className="admin-btn-secondary flex w-full items-center justify-center gap-2 px-4 py-2.5 text-sm disabled:opacity-50"
        >
          Continue with Google
        </button>

        <div
          className="my-5 flex items-center gap-3 text-xs"
          style={{ color: 'rgba(255,255,255,0.3)' }}
        >
          <div className="h-px flex-1" style={{ background: 'rgba(255,255,255,0.1)' }} />
          or
          <div className="h-px flex-1" style={{ background: 'rgba(255,255,255,0.1)' }} />
        </div>

        <form onSubmit={handlePasswordLogin} className="space-y-3">
          <div>
            <label
              htmlFor="email"
              className="mb-1 block text-xs uppercase tracking-wide"
              style={{ color: 'rgba(255,255,255,0.5)' }}
            >
              Email
            </label>
            <input
              id="email"
              type="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="admin-input w-full px-3 py-2 text-sm"
            />
          </div>
          <div>
            <label
              htmlFor="password"
              className="mb-1 block text-xs uppercase tracking-wide"
              style={{ color: 'rgba(255,255,255,0.5)' }}
            >
              Password
            </label>
            <input
              id="password"
              type="password"
              required
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="admin-input w-full px-3 py-2 text-sm"
            />
          </div>
          <button
            type="submit"
            disabled={loading}
            className="admin-btn-primary w-full px-4 py-2.5 text-sm disabled:opacity-50"
          >
            {loading ? 'Signing in…' : 'Sign In'}
          </button>
        </form>
      </div>
    </div>
  );
}
