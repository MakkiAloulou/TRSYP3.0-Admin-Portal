// Filtering and paging re-query the backend, which can be slow to wake on a
// cold start. Without this, a client-side navigation leaves the previous page
// on screen with no sign anything is happening.
export default function PaymentsLoading() {
  return (
    <div className="space-y-4">
      <div>
        <h2 className="admin-heading text-lg text-white">Payments</h2>
        <p className="text-sm" style={{ color: 'rgba(255,255,255,0.4)' }}>
          Loading queue&hellip;
        </p>
      </div>

      <div className="admin-card p-4">
        {Array.from({ length: 6 }).map((_, row) => (
          <div
            key={row}
            className="pay-skeleton-row"
            style={{ animationDelay: `${row * 60}ms` }}
            aria-hidden
          />
        ))}
        <span className="sr-only">Loading payment queue</span>
      </div>
    </div>
  );
}
