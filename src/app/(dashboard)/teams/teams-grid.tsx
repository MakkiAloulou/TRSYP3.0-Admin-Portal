'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
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
  members: TeamMemberSummary[];
};

/** riddleNumber -> code, per team id */
export type ExistingCodesMap = Record<string, Record<number, string>>;

export function TeamsGrid({ teams, existingCodes }: { teams: TeamRow[]; existingCodes: ExistingCodesMap }) {
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

  return (
    <>
      <div className="mb-4 flex items-center justify-between">
        <label className="flex items-center gap-2 text-sm" style={{ color: 'rgba(255,255,255,0.6)' }}>
          <input
            type="checkbox"
            checked={teams.length > 0 && selected.size === teams.length}
            onChange={toggleAll}
            style={{ accentColor: 'var(--color-green)' }}
          />
          Select all
        </label>

        <button
          className="admin-btn-primary"
          disabled={selected.size === 0 || isPending}
          onClick={handleGenerate}
        >
          {isPending
            ? 'Generating…'
            : `Generate riddle codes${selected.size > 0 ? ` (${selected.size})` : ''}`}
        </button>
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {teams.map((team) => {
          const emptySlots = Math.max(team.size - team.members.length, 0);
          const hasCodes = !!codesByTeam[team.id];

          return (
            <div key={team.id} className="admin-card p-4">
              <div className="mb-3 flex items-start justify-between gap-2">
                <label className="flex items-start gap-2">
                  <input
                    type="checkbox"
                    checked={selected.has(team.id)}
                    onChange={() => toggle(team.id)}
                    className="mt-1"
                    style={{ accentColor: 'var(--color-green)' }}
                  />
                  <div>
                    <h3 className="admin-heading text-sm text-white">{team.name}</h3>
                    <p className="text-xs" style={{ color: 'rgba(255,255,255,0.35)' }}>
                      Code: {team.code}
                    </p>
                  </div>
                </label>

                <div className="flex flex-col items-end gap-1">
                  {team.members.length === team.size && (
                    <span className="admin-badge admin-badge--pink">
                      {team.members.length}/{team.size}
                    </span>
                  )}
                  {team.members.length < team.size && (
                    <span className="admin-badge admin-badge--green">
                      {team.members.length}/{team.size}
                    </span>
                  )}
                  {hasCodes && <span className="admin-badge admin-badge--gray">Codes generated</span>}
                </div>
              </div>

              <div className="space-y-1.5">
                {team.members.map((member) => (
                  <div
                    key={member.id}
                    className="flex items-center justify-between rounded-md px-3 py-1.5 text-sm"
                    style={{ background: 'rgba(255,255,255,0.03)' }}
                  >
                    <span className="text-white/80">
                      {member.user.name} {member.user.lastName}
                    </span>
                    {member.id === team.leaderId && (
                      <span
                        className="text-[10px] font-medium uppercase"
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

              {hasCodes && (
                <div className="mt-3 space-y-1 border-t pt-3" style={{ borderColor: 'rgba(255,255,255,0.06)' }}>
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

function CodeRow({ riddleNumber, code }: { riddleNumber: number; code?: string }) {
  const [copied, setCopied] = useState(false);
  if (!code) return null;

  return (
    <div className="flex items-center justify-between text-xs">
      <span style={{ color: 'rgba(255,255,255,0.4)' }}>Riddle {riddleNumber}</span>
      <button
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
        <button className="admin-modal-close" onClick={onClose} aria-label="Close">
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
              <div className="mb-1.5 text-sm font-medium text-white">{teamName}</div>
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
