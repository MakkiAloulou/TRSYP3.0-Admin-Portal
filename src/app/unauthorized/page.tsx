export default function UnauthorizedPage() {
  return (
    <div
      className="flex min-h-screen items-center justify-center px-4"
      style={{ background: 'var(--color-bg)' }}
    >
      <div className="max-w-sm space-y-3 text-center">
        <span className="admin-badge admin-badge--pink">Not Authorized</span>
        <h1 className="admin-heading text-lg text-white">Access denied</h1>
        <p className="text-sm" style={{ color: 'rgba(255,255,255,0.4)' }}>
          Your account isn&apos;t registered as an admin for this dashboard. Contact an existing
          admin if you believe this is a mistake.
        </p>
      </div>
    </div>
  );
}
