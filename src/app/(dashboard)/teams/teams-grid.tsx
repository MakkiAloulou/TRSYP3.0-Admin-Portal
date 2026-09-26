'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import type { FablabAxis } from '@prisma/client';
import { generateRiddleCodes, type GeneratedRiddleCode } from './actions';

type TeamMemberSummary = {
  id: string;
  user: { name: string; lastName: string };
};

export type TeamRow = {
  id: string;
  name: string;
  code: string;
  size: number;
  leaderId: string;
  /** FABLAB teams only — null everywhere else. */
  axis: FablabAxis | null;
  submissionUrl: string | null;
  submittedAt: string | null;
  members: TeamMemberSummary[];
};

export const FABLAB_AXES: { value: FablabAxis; label: string }[] = [
  { value: 'SAMPLE_PREPARATION', label: 'Automated Sample Preparation' },
  { value: 'WEIGHING_DOSING', label: 'Automated Weighing & Dosing Station' },
];

/** riddleNumber -> code, per team id */
export type ExistingCodesMap = Record<string, Record<number, string>>;

/**
 * Renders one activity's teams. Riddle codes belong to the challenge only, so
 * the selection toolbar and per-team code rows are opt-in via `showRiddleCodes`.
 * Likewise the hackathon's axis and concept submission via `showFablab`.
 */
export function TeamsGrid({
  teams,
  existingCodes = {},
  showRiddleCodes = false,
  showFablab = false,
}: {
  teams: TeamRow[];
  existingCodes?: ExistingCodesMap;
  showRiddleCodes?: boolean;
  showFablab?: boolean;
}) {
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [codesByTeam, setCodesByTeam] = useState<ExistingCodesMap>(existingCodes);
  const [results, setResults] = useState<GeneratedRiddleCode[] | null>(null);
  const [isPending, startTransition] = useTransition();
  const router = useRouter();

  function toggle(teamId: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(teamId)) next.delete(teamId);
      else next.add(teamId);
      return next;
    });
  }

  function toggleAll() {
    setSelected((prev) => (prev.size === teams.length ? new Set() : new Set(teams.map((t) => t.id))));
  }

  function handleGenerate() {
    const teamIds = Array.from(selected);
    if (teamIds.length === 0) return;

    startTransition(async () => {
      const generated = await generateRiddleCodes(teamIds);

      setCodesByTeam((prev) => {
        const next = { ...prev };
        for (const g of generated) {
          next[g.teamId] = { ...(next[g.teamId] ?? {}), [g.riddleNumber]: g.code };
        }
        return next;
      });
      setResults(generated);
      router.refresh();
    });
  }

  const allSelected = teams.length > 0 && selected.size === teams.length;

  if (teams.length === 0) {
    return (
      <div className="admin-card px-5 py-10 text-center text-sm" style={{ color: 'rgba(255,255,255,0.4)' }}>
        No teams yet.
      </div>
    );
  }

  return (
    <>
      {showRiddleCodes && (
        <div className="admin-card admin-toolbar">
          <label className="admin-checkbox-label">
            <input type="checkbox" className="admin-checkbox" checked={allSelected} onChange={toggleAll} />
            {allSelected ? 'All selected' : 'Select all'}
            {selected.size > 0 && (
              <span className="admin-badge admin-badge--gray">
                {selected.size}/{teams.length}
              </span>
            )}
          </label>

          <button
            type="button"
            className="admin-btn-primary px-5 py-2.5 text-sm disabled:cursor-not-allowed disabled:opacity-40"
            disabled={selected.size === 0 || isPending}
            onClick={handleGenerate}
          >
            {isPending ? 'Generating…' : 'Generate riddle codes'}
          </button>
        </div>
      )}

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {teams.map((team) => {
          const emptySlots = Math.max(team.size - team.members.length, 0);
          const hasCodes = showRiddleCodes && !!codesByTeam[team.id];

          const title = (
            <span className="min-w-0">
              <h3 className="admin-heading truncate text-sm text-white">{team.name}</h3>
              <p className="mt-0.5 text-xs" style={{ color: 'rgba(255,255,255,0.35)' }}>
                Code: {team.code}
              </p>
            </span>
          );

          return (
            <div key={team.id} className="admin-card flex flex-col p-5">
              <div className="mb-4 flex items-start justify-between gap-3">
                {showRiddleCodes ? (
                  <label className="admin-checkbox-label min-w-0 items-start">
                    <input
                      type="checkbox"
                      className="admin-checkbox mt-0.5"
                      checked={selected.has(team.id)}
                      onChange={() => toggle(team.id)}
                    />
                    {title}
                  </label>
                ) : (
                  title
                )}

                <div className="flex shrink-0 flex-col items-end gap-1.5">
                  <span className={`admin-badge admin-badge--${team.members.length === team.size ? 'pink' : 'green'}`}>
                    {team.members.length}/{team.size}
                  </span>
                  {hasCodes && <span className="admin-badge admin-badge--gray">Codes ready</span>}
                </div>
              </div>

              <div className="space-y-1.5">
                {team.members.map((member) => (
                  <div
                    key={member.id}
                    className="flex items-center justify-between rounded-md px-3 py-1.5 text-sm"
                    style={{ background: 'rgba(255,255,255,0.03)' }}
                  >
                    <span className="truncate text-white/80">
                      {member.user.name} {member.user.lastName}
                    </span>
                    {member.id === team.leaderId && (
                      <span
                        className="ml-2 shrink-0 text-[10px] font-medium uppercase"
                        style={{ color: 'var(--color-green)', letterSpacing: '0.08em' }}
                      >
                        Leader
                      </span>
                    )}
                  </div>
                ))}

                {Array.from({ length: emptySlots }).map((_, i) => (
                  <div
                    key={`empty-${i}`}
                    className="rounded-md px-3 py-1.5 text-sm"
                    style={{
                      border: '1px dashed rgba(255,255,255,0.12)',
                      color: 'rgba(255,255,255,0.25)',
                    }}
                  >
                    Empty spot
                  </div>
                ))}
              </div>

              {showFablab && <FablabDetails team={team} />}

              {hasCodes && (
                <div className="mt-4 space-y-1.5 border-t pt-4" style={{ borderColor: 'rgba(255,255,255,0.06)' }}>
                  {[1, 2, 3].map((n) => (
                    <CodeRow key={n} riddleNumber={n} code={codesByTeam[team.id]?.[n]} />
                  ))}
                </div>
              )}
            </div>
          );
        })}
      </div>

      {results && <ResultsModal results={results} onClose={() => setResults(null)} />}
    </>
  );
}

function FablabDetails({ team }: { team: TeamRow }) {
  const axisIndex = FABLAB_AXES.findIndex((a) => a.value === team.axis);

  return (
    <div className="mt-4 space-y-1.5 border-t pt-4 text-xs" style={{ borderColor: 'rgba(255,255,255,0.06)' }}>
      <div className="flex items-center justify-between gap-3">
        <span className="shrink-0" style={{ color: 'rgba(255,255,255,0.4)' }}>
          Axis
        </span>
        {axisIndex >= 0 ? (
          <span className="truncate text-white/80" title={FABLAB_AXES[axisIndex].label}>
            {axisIndex + 1} · {FABLAB_AXES[axisIndex].label}
          </span>
        ) : (
          <span style={{ color: 'rgba(255,255,255,0.25)' }}>Not chosen</span>
        )}
      </div>
      <div className="flex items-center justify-between gap-3">
        <span className="shrink-0" style={{ color: 'rgba(255,255,255,0.4)' }}>
          Submission
        </span>
        {team.submissionUrl ? (
          <a
            href={team.submissionUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="truncate hover:underline"
            style={{ color: 'var(--color-green)' }}
            title={team.submissionUrl}
          >
            Drive folder{team.submittedAt ? ` · ${formatSubmitted(team.submittedAt)}` : ''}
          </a>
        ) : (
          <span style={{ color: 'rgba(255,255,255,0.25)' }}>Not submitted</span>
        )}
      </div>
    </div>
  );
}

function formatSubmitted(iso: string) {
  return new Date(iso).toLocaleString('en-GB', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' });
}

function CodeRow({ riddleNumber, code }: { riddleNumber: number; code?: string }) {
  const [copied, setCopied] = useState(false);
  if (!code) return null;

  return (
    <div className="flex items-center justify-between text-xs">
      <span style={{ color: 'rgba(255,255,255,0.4)' }}>Riddle {riddleNumber}</span>
      <button
        type="button"
        className="font-mono"
        style={{ color: 'var(--color-green)' }}
        onClick={() => {
          navigator.clipboard.writeText(code);
          setCopied(true);
          setTimeout(() => setCopied(false), 1200);
        }}
        title="Click to copy"
      >
        {copied ? 'Copied!' : code}
      </button>
    </div>
  );
}

function ResultsModal({ results, onClose }: { results: GeneratedRiddleCode[]; onClose: () => void }) {
  const byTeam = new Map<string, { teamName: string; codes: GeneratedRiddleCode[] }>();
  for (const r of results) {
    const entry = byTeam.get(r.teamId) ?? { teamName: r.teamName, codes: [] };
    entry.codes.push(r);
    byTeam.set(r.teamId, entry);
  }

  return (
    <div className="admin-modal-overlay" onClick={onClose}>
      <div className="admin-modal" onClick={(e) => e.stopPropagation()}>
        <button type="button" className="admin-modal-close" onClick={onClose} aria-label="Close">
          ×
        </button>

        <div className="mb-5">
          <h3 className="admin-heading text-lg text-white">Riddle codes generated</h3>
          <p className="text-sm" style={{ color: 'rgba(255,255,255,0.4)' }}>
            {byTeam.size} team{byTeam.size === 1 ? '' : 's'} · {results.length} codes
          </p>
        </div>

        <div className="space-y-4">
          {Array.from(byTeam.entries()).map(([teamId, { teamName, codes }]) => (
            <div key={teamId}>
              <div className="mb-1.5 truncate text-sm font-medium text-white">{teamName}</div>
              <div className="space-y-1">
                {codes
                  .sort((a, b) => a.riddleNumber - b.riddleNumber)
                  .map((c) => (
                    <div key={c.riddleNumber} className="flex items-center justify-between text-sm">
                      <span style={{ color: 'rgba(255,255,255,0.4)' }}>Riddle {c.riddleNumber}</span>
                      <span className="font-mono" style={{ color: 'var(--color-green)' }}>
                        {c.code}
                      </span>
                    </div>
                  ))}
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
