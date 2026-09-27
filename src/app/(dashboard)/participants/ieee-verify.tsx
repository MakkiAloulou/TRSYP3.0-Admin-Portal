'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { verifyParticipants, type VerifyResult } from './actions';
import {
  IEEE_CHECK_BADGES,
  IEEE_CHECK_COLORS,
  IEEE_CHECK_LABELS,
  deriveIeeeState,
  evaluateIeee,
  isIeeeResultStale,
  isRasSociety,
  type IeeeVerification,
} from '@/lib/ieee-verification';
import type { ParticipantRow } from './participants-table';

// A failed lookup is blue, apart from every verdict colour; the transient
// "Checking…" is plain white — its pulse is what sets it apart.
const FAILED_COLOR = 'var(--viz-3)';
const CHECKING_COLOR = 'rgba(255,255,255,0.8)';

type Activity = 'checking';

/**
 * Re-checks single participants from their details.
 *
 * Checks run automatically on the main website; this is the admin's way to
 * refresh one result on demand. The new result is merged into local state so
 * the row and modal update at once, then the page is refreshed from the server.
 */
export function useIeeeVerification(participants: ParticipantRow[]) {
  const router = useRouter();
  const [checks, setChecks] = useState<Record<string, IeeeVerification>>({});
  const [activity, setActivity] = useState<Record<string, Activity>>({});
  const [failures, setFailures] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);
  // A ref, not state: two quick clicks must not both pass the busy check.
  const busyRef = useRef(false);

  const rows = useMemo(
    () => participants.map((p) => (checks[p.id] ? { ...p, ieeeVerification: checks[p.id] } : p)),
    [participants, checks],
  );

  // Leaving mid-check loses nothing, but the admin should know it won't finish.
  useEffect(() => {
    if (!busy) return;
    const warn = (e: BeforeUnloadEvent) => e.preventDefault();
    window.addEventListener('beforeunload', warn);
    return () => window.removeEventListener('beforeunload', warn);
  }, [busy]);

  async function recheck(id: string) {
    if (busyRef.current) return;
    busyRef.current = true;
    setBusy(true);
    setActivity({ [id]: 'checking' });

    let result: VerifyResult;
    try {
      result = await verifyParticipants([id]);
    } catch {
      result = { ok: false, message: 'Could not reach the server.' };
    }

    const outcome = result.ok ? result.outcomes[0] : null;
    if (outcome?.ok) {
      setChecks((current) => ({ ...current, [id]: outcome.verification }));
      setFailures((current) => {
        const next = { ...current };
        delete next[id];
        return next;
      });
    } else {
      const message = outcome ? outcome.message : result.ok ? 'No result returned.' : result.message;
      setFailures((current) => ({ ...current, [id]: message }));
    }

    setActivity({});
    busyRef.current = false;
    setBusy(false);
    router.refresh();
  }

  /** Participants whose last re-check failed and who are still unverified. */
  const failedIds = useMemo(
    () => rows.filter((p) => failures[p.id] !== undefined && deriveIeeeState(p) === 'UNVERIFIED').map((p) => p.id),
    [rows, failures],
  );

  return { rows, activity, failures, busy, failedIds, recheck };
}

/* ─── Table cell ───────────────────────────────────────────────────── */

/**
 * The verdict alone. Reasons and notes are in the participant's details, so
 * the column stays a one-glance scan.
 */
export function IeeeStatusCell({
  participant: p,
  activity,
  failure,
}: {
  participant: ParticipantRow;
  activity: Activity | undefined;
  failure: string | undefined;
}) {
  if (activity === 'checking') {
    return <StateLine color={CHECKING_COLOR} label="Checking…" pulse />;
  }

  const state = deriveIeeeState(p);

  if (state === 'UNVERIFIED' && failure) {
    return <StateLine color={FAILED_COLOR} label="Check failed" />;
  }

  return <StateLine color={IEEE_CHECK_COLORS[state]} label={IEEE_CHECK_LABELS[state]} />;
}

function StateLine({ color, label, pulse = false }: { color: string; label: string; pulse?: boolean }) {
  return (
    <span className="pay-state" style={{ color }}>
      <span className={`pay-dot${pulse ? ' ieee-pulse' : ''}`} style={{ background: color }} />
      {label}
    </span>
  );
}

/* ─── Detail modal section ─────────────────────────────────────────── */

export function IeeeSection({
  participant: p,
  activity,
  failure,
  busy,
  onRecheck,
}: {
  participant: ParticipantRow;
  activity: Activity | undefined;
  failure: string | undefined;
  busy: boolean;
  onRecheck: () => void;
}) {
  // Judged under the current rules, so the notes here always match the verdict.
  const { state, issues } = evaluateIeee(p);
  const v = p.ieeeVerification;
  const checking = activity !== undefined;
  const current = state !== 'UNVERIFIED';

  return (
    <div>
      <div className="mb-2 flex items-center justify-between gap-3">
        <h4 className="admin-heading text-xs uppercase" style={{ color: 'var(--color-pink)', letterSpacing: '0.1em' }}>
          IEEE Membership
        </h4>
        {state !== 'NOT_APPLICABLE' && (
          <button
            type="button"
            className="admin-btn-secondary px-3 py-1 text-xs"
            onClick={onRecheck}
            disabled={busy}
            title={busy && !checking ? 'Wait for the running check to finish' : undefined}
          >
            {checking ? 'Checking…' : v ? 'Re-check' : 'Check now'}
          </button>
        )}
      </div>

      {state === 'NOT_APPLICABLE' ? (
        <p className="text-sm" style={{ color: 'rgba(255,255,255,0.45)' }}>
          Registered as non-IEEE, so there is nothing to verify.
        </p>
      ) : (
        <div className="space-y-3">
          <div className="flex flex-wrap items-center gap-2">
            <span className={`admin-badge ${IEEE_CHECK_BADGES[state]}`}>{IEEE_CHECK_LABELS[state]}</span>
            {v && (
              <span className="text-xs" style={{ color: 'rgba(255,255,255,0.4)' }}>
                Checked {formatDateTime(v.checkedAt)}
                {v.matchedBy && ` · matched by ${v.matchedBy === 'IEEE_ID' ? 'IEEE ID' : 'email'}`}
              </span>
            )}
          </div>

          {failure && state === 'UNVERIFIED' && (
            <div className="ieee-issue ieee-issue--failed">
              <span aria-hidden>✕</span>
              <span>Last check failed: {failure}</span>
            </div>
          )}

          {isIeeeResultStale(p) && v && (
            <div className="ieee-issue ieee-issue--warning">
              <span aria-hidden>!</span>
              <span>
                Profile changed since this check (it was run for {v.claimedType}
                {v.claimedIeeeId !== null ? `, IEEE ID ${v.claimedIeeeId}` : ', no IEEE ID'}
                {v.claimedIsRas ? ', RAS' : ''}). Re-check to update it.
              </span>
            </div>
          )}

          {issues.map((issue, i) => (
            <div key={i} className={`ieee-issue ieee-issue--${issue.level}`}>
              <span aria-hidden>{issue.level === 'mismatch' ? '✕' : '!'}</span>
              <span>{issue.text}</span>
            </div>
          ))}

          {state === 'VERIFIED' && issues.length === 0 && (
            <div className="ieee-issue ieee-issue--ok">
              <span aria-hidden>✓</span>
              <span>Active IEEE member; RAS and name initials match what they registered.</span>
            </div>
          )}

          {current && v && v.memberStatus === null && (
            <div className="grid grid-cols-2 gap-x-4 gap-y-2.5">
              <IeeeDetail label="IEEE record" value="None found for their IEEE ID or email" />
              <IeeeDetail label="Registered as" value={`${p.participantType}${p.isRas ? ' · RAS' : ''}`} />
            </div>
          )}

          {current && v && v.memberStatus !== null && (
            <div className="grid grid-cols-2 gap-x-4 gap-y-2.5">
              <IeeeDetail label="IEEE status" value={v.memberStatus} />
              <IeeeDetail label="Grade" value={v.grade || '—'} />
              <IeeeDetail
                label="Record initials"
                value={v.firstInitial || v.lastInitial ? `${v.firstInitial}. ${v.lastInitial}.` : '—'}
              />
              <IeeeDetail label="Registered as" value={`${p.participantType}${p.isRas ? ' · RAS' : ''}`} />
              <div className="col-span-2">
                <div className="text-[10px] uppercase" style={{ color: 'rgba(255,255,255,0.35)', letterSpacing: '0.08em' }}>
                  Active societies
                </div>
                {v.societies.length === 0 ? (
                  <div className="text-sm text-white">None</div>
                ) : (
                  <div className="mt-1 flex flex-wrap gap-1.5">
                    {v.societies.map((code) => (
                      <span
                        key={code}
                        className={`ieee-society${isRasSociety(code) ? ' ieee-society--key' : ''}`}
                      >
                        {code}
                        {isRasSociety(code) && ' · RAS'}
                      </span>
                    ))}
                  </div>
                )}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function IeeeDetail({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <div className="text-[10px] uppercase" style={{ color: 'rgba(255,255,255,0.35)', letterSpacing: '0.08em' }}>
        {label}
      </div>
      <div className="text-sm text-white">{value}</div>
    </div>
  );
}

function formatDateTime(iso: string) {
  return new Date(iso).toLocaleString('en-GB', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}
