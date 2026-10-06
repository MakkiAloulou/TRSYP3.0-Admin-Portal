'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { verifyParticipants, type VerifyResult } from './actions';
import {
  IEEE_CHECK_BADGES,
  IEEE_CHECK_LABELS,
  evaluateIeee,
  hasIeeeResult,
  isIeeeResultStale,
  isRasSociety,
  recordSummary,
  type IeeeVerification,
} from '@/lib/ieee-verification';
import type { ParticipantRow } from './participants-table';

type Activity = 'checking';

type Checked = { verification: IeeeVerification; priced: { participantType: string; isRas: boolean } };

/**
 * Re-checks single participants from their details.
 *
 * Checks run automatically on the main website; this is the admin's way to
 * refresh one result on demand. The new result is merged into local state so
 * the row and modal update at once, then the page is refreshed from the server.
 */
export function useIeeeVerification(participants: ParticipantRow[]) {
  const router = useRouter();
  const [checks, setChecks] = useState<Record<string, Checked>>({});
  const [activity, setActivity] = useState<Record<string, Activity>>({});
  const [failures, setFailures] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);
  // A ref, not state: two quick clicks must not both pass the busy check.
  const busyRef = useRef(false);

  const rows = useMemo(
    // A re-check writes the priced type/RAS through as well as the row; both
    // are merged, or the row would read as stale until the refresh lands.
    () =>
      participants.map((p) => {
        const checked = checks[p.id];
        return checked ? { ...p, ...checked.priced, ieeeVerification: checked.verification } : p;
      }),
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
      setChecks((current) => ({ ...current, [id]: { verification: outcome.verification, priced: outcome.priced } }));
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

  return { rows, activity, failures, busy, recheck };
}

/* ─── Detail modal section ─────────────────────────────────────────── */

/**
 * IEEE's answer for this participant, worded as what IEEE said — the profile's
 * type and RAS are set from it, so there is no claim to check it against.
 */
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
  const { state, issues } = evaluateIeee(p);
  const v = p.ieeeVerification;
  const checking = activity !== undefined;

  return (
    <section className="pmodal-section">
      <div className="pmodal-section-head">
        <h4>IEEE membership</h4>
        <button
          type="button"
          className="admin-btn-secondary px-3 py-1 text-xs"
          onClick={onRecheck}
          disabled={busy}
          title={busy && !checking ? 'Wait for the running check to finish' : undefined}
        >
          {checking ? 'Checking…' : v ? 'Re-check' : 'Check now'}
        </button>
      </div>

      <div className="space-y-3">
        <div className="flex flex-wrap items-center gap-2">
          <span className={`admin-badge ${IEEE_CHECK_BADGES[state]}`}>{IEEE_CHECK_LABELS[state]}</span>
          {v && (
            <span className="text-xs" style={{ color: 'rgba(255,255,255,0.4)' }}>
              Checked {formatDateTime(v.checkedAt)} by {v.checkedBy}
              {v.matchedBy && ` · matched by ${v.matchedBy === 'IEEE_ID' ? 'member number' : 'email'}`}
            </span>
          )}
        </div>

        {failure && (
          <div className="ieee-issue ieee-issue--failed">
            <span aria-hidden>✕</span>
            <span>Last check failed: {failure}</span>
          </div>
        )}

        {state === 'UNVERIFIED' && !isIeeeResultStale(p) && (
          <p className="text-sm" style={{ color: 'rgba(255,255,255,0.55)' }}>
            No verification yet. The main website checks new participants with IEEE within seconds of
            registering.
          </p>
        )}

        {isIeeeResultStale(p) && v && (
          <div className="ieee-issue ieee-issue--warning">
            <span aria-hidden>!</span>
            <span>
              This check was for {v.claimedIeeeId !== null ? `member number ${v.claimedIeeeId}` : 'no member number'}{' '}
              and {v.claimedEmail}. Their details have changed since; the main website re-checks them automatically.
            </span>
          </div>
        )}

        {hasIeeeResult(state) && v && (
          <>
            <p className="text-sm text-white">{recordSummary(v)}</p>

            {issues.map((issue, i) => (
              <div key={i} className="ieee-issue ieee-issue--warning">
                <span aria-hidden>!</span>
                <span>{issue.text}</span>
              </div>
            ))}

            <dl className="pmodal-grid">
              <IeeeDetail label="IEEE status" value={v.memberStatus ?? 'No record'} />
              <IeeeDetail label="Grade" value={v.grade || '—'} />
              <IeeeDetail
                label="Record initials"
                value={v.firstInitial || v.lastInitial ? `${v.firstInitial}. ${v.lastInitial}.` : '—'}
              />
              <IeeeDetail label="Priced as" value={`${p.participantType}${p.isRas ? ' · RAS' : ''}`} />
              {v.memberStatus !== null && (
                <div className="col-span-2">
                  <dt>Active societies</dt>
                  {v.societies.length === 0 ? (
                    <dd>None</dd>
                  ) : (
                    <dd className="mt-1 flex flex-wrap gap-1.5">
                      {v.societies.map((code) => (
                        <span key={code} className={`ieee-society${isRasSociety(code) ? ' ieee-society--key' : ''}`}>
                          {code}
                          {isRasSociety(code) && ' · RAS'}
                        </span>
                      ))}
                    </dd>
                  )}
                </div>
              )}
            </dl>
          </>
        )}
      </div>
    </section>
  );
}

function IeeeDetail({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <dt>{label}</dt>
      <dd>{value}</dd>
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
