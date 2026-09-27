'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { verifyParticipants, type VerifyResult } from './actions';
import {
  IEEE_CHECK_BADGES,
  IEEE_CHECK_LABELS,
  deriveIeeeState,
  displayStatus,
  isIeeeResultStale,
  isRasSociety,
  isYpSociety,
  type IeeeCheckState,
  type IeeeCheckStatus,
  type IeeeVerification,
} from '@/lib/ieee-verification';
import type { ParticipantRow } from './participants-table';

/** Participants per server round-trip. The action checks them in parallel, so
 *  this bounds concurrent IEEE calls; small enough that rows update steadily
 *  rather than in long silent jumps. */
const BATCH_SIZE = 5;

export const IEEE_CHECK_COLORS: Record<IeeeCheckState, string> = {
  VERIFIED: '#00e87a',
  MISMATCH: '#f59e0b',
  NOT_RAS: '#a78bfa',
  INACTIVE: '#ef4444',
  NOT_FOUND: '#ef4444',
  UNVERIFIED: 'rgba(255,255,255,0.4)',
  NOT_APPLICABLE: 'rgba(255,255,255,0.25)',
};

const FAILED_COLOR = '#ff1d78';
const CHECKING_COLOR = 'var(--viz-3)';

/** A run's tally: each verdict as the row shows it, plus lookups that never
 *  reached one (IEEE down, timeout) and so stored nothing. */
export type RunOutcome = IeeeCheckStatus | 'NOT_RAS' | 'FAILED';
const RUN_OUTCOMES: RunOutcome[] = ['VERIFIED', 'MISMATCH', 'NOT_RAS', 'INACTIVE', 'NOT_FOUND', 'FAILED'];

const OUTCOME_LABELS: Record<RunOutcome, string> = { ...IEEE_CHECK_LABELS, FAILED: 'Failed' };
const OUTCOME_COLORS: Record<RunOutcome, string> = { ...IEEE_CHECK_COLORS, FAILED: FAILED_COLOR };

export type IeeeRun = {
  total: number;
  done: number;
  counts: Record<RunOutcome, number>;
  phase: 'running' | 'stopping' | 'finished' | 'stopped' | 'aborted';
  /** Why the run aborted — a server-level refusal, not one participant's. */
  message: string | null;
};

type Activity = 'queued' | 'checking';

/**
 * Drives batch and single-participant IEEE checks from the client.
 *
 * Results are merged into local state as each batch returns, so rows change
 * one after another instead of all at once at the end; the page is refreshed
 * from the server once when the work is done.
 */
export function useIeeeVerification(participants: ParticipantRow[]) {
  const router = useRouter();
  const [checks, setChecks] = useState<Record<string, IeeeVerification>>({});
  const [activity, setActivity] = useState<Record<string, Activity>>({});
  const [failures, setFailures] = useState<Record<string, string>>({});
  const [run, setRun] = useState<IeeeRun | null>(null);
  const [busy, setBusy] = useState(false);
  // Refs, not state: read inside the running loop, which would otherwise see
  // the values from the render that started it.
  const busyRef = useRef(false);
  const stopRequested = useRef(false);

  const rows = useMemo(
    () => participants.map((p) => (checks[p.id] ? { ...p, ieeeVerification: checks[p.id] } : p)),
    [participants, checks],
  );

  const unverifiedIds = useMemo(
    () => rows.filter((p) => deriveIeeeState(p) === 'UNVERIFIED').map((p) => p.id),
    [rows],
  );

  // Closing the tab mid-run loses nothing already saved, but the admin should
  // know the rest will not happen.
  useEffect(() => {
    if (!busy) return;
    const warn = (e: BeforeUnloadEvent) => e.preventDefault();
    window.addEventListener('beforeunload', warn);
    return () => window.removeEventListener('beforeunload', warn);
  }, [busy]);

  async function processBatch(ids: string[]): Promise<{ outcomes: RunOutcome[]; fatal: string | null }> {
    setActivity((current) => ({ ...current, ...Object.fromEntries(ids.map((id) => [id, 'checking' as const])) }));

    let result: VerifyResult;
    try {
      result = await verifyParticipants(ids);
    } catch {
      result = { ok: false, message: 'Could not reach the server.' };
    }

    const outcomes: RunOutcome[] = [];

    if (!result.ok) {
      const message = result.message;
      setFailures((current) => ({ ...current, ...Object.fromEntries(ids.map((id) => [id, message])) }));
      outcomes.push(...ids.map(() => 'FAILED' as const));
    } else {
      const fresh: Record<string, IeeeVerification> = {};
      const failed: Record<string, string> = {};
      for (const outcome of result.outcomes) {
        if (outcome.ok) {
          fresh[outcome.participantId] = outcome.verification;
          outcomes.push(displayStatus(outcome.verification) as RunOutcome);
        } else {
          failed[outcome.participantId] = outcome.message;
          outcomes.push('FAILED');
        }
      }
      setChecks((current) => ({ ...current, ...fresh }));
      setFailures((current) => {
        const next = { ...current, ...failed };
        for (const id of Object.keys(fresh)) delete next[id];
        return next;
      });
    }

    setActivity((current) => {
      const next = { ...current };
      for (const id of ids) delete next[id];
      return next;
    });

    return { outcomes, fatal: result.ok ? null : result.message };
  }

  /** Runs the given participants through IEEE, BATCH_SIZE at a time. */
  async function verify(ids: string[]) {
    if (busyRef.current || ids.length === 0) return;
    busyRef.current = true;
    setBusy(true);
    stopRequested.current = false;

    const counts = Object.fromEntries(RUN_OUTCOMES.map((o) => [o, 0])) as Record<RunOutcome, number>;
    setRun({ total: ids.length, done: 0, counts: { ...counts }, phase: 'running', message: null });
    setActivity(Object.fromEntries(ids.map((id) => [id, 'queued' as const])));

    let phase: IeeeRun['phase'] = 'finished';
    let message: string | null = null;
    let done = 0;

    for (let i = 0; i < ids.length; i += BATCH_SIZE) {
      if (stopRequested.current) {
        phase = 'stopped';
        break;
      }

      const batch = ids.slice(i, i + BATCH_SIZE);
      const { outcomes, fatal } = await processBatch(batch);
      for (const outcome of outcomes) counts[outcome]++;
      done += batch.length;
      setRun((current) => current && { ...current, done, counts: { ...counts } });

      // A refusal of the whole request (not signed in, credentials missing)
      // will refuse every later batch the same way.
      if (fatal) {
        phase = 'aborted';
        message = fatal;
        break;
      }
    }

    setActivity({});
    setRun((current) => current && { ...current, phase, message });
    busyRef.current = false;
    setBusy(false);
    router.refresh();
  }

  /** Re-checks one participant without disturbing the batch panel. */
  async function recheck(id: string) {
    if (busyRef.current) return;
    busyRef.current = true;
    setBusy(true);
    await processBatch([id]);
    busyRef.current = false;
    setBusy(false);
    router.refresh();
  }

  function stop() {
    stopRequested.current = true;
    setRun((current) => (current?.phase === 'running' ? { ...current, phase: 'stopping' } : current));
  }

  /** Failed lookups that are still unverified — the ones worth retrying. */
  const failedIds = useMemo(
    () => unverifiedIds.filter((id) => failures[id] !== undefined),
    [unverifiedIds, failures],
  );

  return {
    rows,
    activity,
    failures,
    run,
    busy,
    unverifiedIds,
    failedIds,
    verify,
    recheck,
    stop,
    dismiss: () => setRun(null),
  };
}

/* ─── Batch progress panel ─────────────────────────────────────────── */

export function IeeeRunPanel({
  run,
  failedCount,
  onStop,
  onRetryFailed,
  onDismiss,
  onShow,
}: {
  run: IeeeRun;
  failedCount: number;
  onStop: () => void;
  onRetryFailed: () => void;
  onDismiss: () => void;
  /** Filters the table to one outcome. */
  onShow: (outcome: RunOutcome) => void;
}) {
  const active = run.phase === 'running' || run.phase === 'stopping';

  const headline = {
    running: `Checking ${Math.min(run.done + 1, run.total)} of ${run.total} with IEEE…`,
    stopping: `Stopping after the current batch… (${run.done} of ${run.total})`,
    finished: `Checked ${run.total} participant${run.total === 1 ? '' : 's'}`,
    stopped: `Stopped after ${run.done} of ${run.total}`,
    aborted: `Stopped after ${run.done} of ${run.total}`,
  }[run.phase];

  return (
    <div className="admin-card ieee-run" role="status" aria-live="polite">
      <div className="ieee-run-head">
        <div>
          <div className="ieee-run-title">IEEE verification</div>
          <div className="ieee-run-headline">{headline}</div>
        </div>
        <div className="ieee-run-actions">
          {active ? (
            <button
              type="button"
              className="admin-btn-secondary px-3 py-1.5 text-xs"
              onClick={onStop}
              disabled={run.phase === 'stopping'}
            >
              Stop
            </button>
          ) : (
            <>
              {failedCount > 0 && (
                <button type="button" className="admin-btn-primary px-3 py-1.5 text-xs" onClick={onRetryFailed}>
                  Retry {failedCount} failed
                </button>
              )}
              <button type="button" className="admin-btn-secondary px-3 py-1.5 text-xs" onClick={onDismiss}>
                Dismiss
              </button>
            </>
          )}
        </div>
      </div>

      {/* One segment per outcome, sized against the whole run, so the bar fills
          in the colours of what was found rather than a single progress hue. */}
      <div
        className="ieee-run-bar"
        role="progressbar"
        aria-valuemin={0}
        aria-valuemax={run.total}
        aria-valuenow={run.done}
      >
        {RUN_OUTCOMES.map((outcome) =>
          run.counts[outcome] > 0 ? (
            <span
              key={outcome}
              style={{ width: `${(run.counts[outcome] / run.total) * 100}%`, background: OUTCOME_COLORS[outcome] }}
            />
          ) : null,
        )}
      </div>

      {run.message && (
        <div className="pay-error">
          {run.message}
        </div>
      )}

      <div className="ieee-run-chips">
        {RUN_OUTCOMES.map((outcome) => (
          <button
            key={outcome}
            type="button"
            className="ieee-chip"
            onClick={() => onShow(outcome)}
            disabled={run.counts[outcome] === 0}
            title={`Show ${OUTCOME_LABELS[outcome].toLowerCase()} participants`}
          >
            <span className="pay-dot" style={{ background: OUTCOME_COLORS[outcome] }} />
            {OUTCOME_LABELS[outcome]}
            <span className="ieee-chip-count">{run.counts[outcome]}</span>
          </button>
        ))}
      </div>
    </div>
  );
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
  if (activity === 'queued') {
    return <StateLine color="rgba(255,255,255,0.25)" label="Queued" />;
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
  const state = deriveIeeeState(p);
  const v = p.ieeeVerification;
  const checking = activity !== undefined;

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

          {v?.issues.map((issue, i) => (
            <div key={i} className={`ieee-issue ieee-issue--${issue.level}`}>
              <span aria-hidden>{issue.level === 'mismatch' ? '✕' : '!'}</span>
              <span>{issue.text}</span>
            </div>
          ))}

          {v?.status === 'VERIFIED' && v.issues.length === 0 && (
            <div className="ieee-issue ieee-issue--ok">
              <span aria-hidden>✓</span>
              <span>Active IEEE member; grade, societies and name initials match what they registered.</span>
            </div>
          )}

          {v && v.memberStatus !== null && (
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
                        className={`ieee-society${isRasSociety(code) || isYpSociety(code) ? ' ieee-society--key' : ''}`}
                      >
                        {code}
                        {isRasSociety(code) && ' · RAS'}
                        {isYpSociety(code) && ' · YP'}
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
