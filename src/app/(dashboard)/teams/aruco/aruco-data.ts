import 'server-only';
import { prisma } from '@/lib/prisma';
import { SCAN_LIMIT, gameTitle } from './aruco-types';
import type {
  CompetitionTeam,
  Game,
  GameMarker,
  MarkerKind,
  RoundDetail,
  RoundSummary,
  RoundTeam,
  TimelineEntry,
} from './aruco-types';

const KIND_ORDER: Record<MarkerKind, number> = { letter: 0, hint: 1, collector: 2, path: 3 };

function isKind(kind: string): kind is MarkerKind {
  return kind === 'letter' || kind === 'hint' || kind === 'collector' || kind === 'path';
}

/** The games and what each marker gives in them: letters by ID, then hints 1-4, then collectors; paths by ID. */
export async function getGames(): Promise<Game[]> {
  const games = await prisma.arucoGame.findMany({ orderBy: { number: 'asc' }, include: { markers: true } });
  return games.map((game) => ({
    number: game.number,
    name: game.name,
    field: game.field === 'Mine' ? 'Mine' : 'Garden',
    title: gameTitle(game),
    word: game.word,
    scanLimit: game.scanLimit ?? SCAN_LIMIT,
    markers: game.markers
      .flatMap((m): GameMarker[] =>
        isKind(m.kind) ? [{ markerId: m.markerId, kind: m.kind, content: m.content, hintNumber: m.hintNumber }] : [],
      )
      .sort(
        (a, b) =>
          KIND_ORDER[a.kind] - KIND_ORDER[b.kind] ||
          (a.hintNumber ?? 0) - (b.hintNumber ?? 0) ||
          a.markerId - b.markerId,
      ),
  }));
}

/** Every Competition team, to choose who plays a round. */
export async function getCompetitionTeams(): Promise<CompetitionTeam[]> {
  const teams = await prisma.team.findMany({
    where: { activity: 'COMPETITION' },
    select: { id: true, name: true, _count: { select: { memberships: true } } },
    orderBy: { name: 'asc' },
  });
  return teams.map((t) => ({ id: t.id, name: t.name, members: t._count.memberships }));
}

/** Every round, newest first. */
export async function getRounds(): Promise<RoundSummary[]> {
  const rounds = await prisma.arucoRound.findMany({
    orderBy: { startedAt: 'desc' },
    include: { arucoGame: true, _count: { select: { teams: true } } },
  });
  return rounds.map((r) => ({
    id: r.id,
    game: r.game,
    title: gameTitle(r.arucoGame),
    scanLimit: r.arucoGame.scanLimit ?? SCAN_LIMIT,
    hasWord: r.arucoGame.word !== null,
    startedAt: r.startedAt.toISOString(),
    endedAt: r.endedAt?.toISOString() ?? null,
    teamCount: r._count.teams,
  }));
}

/**
 * One round, team by team: everything each did, in order, worded from the
 * activity log. Counts are rebuilt from the log too, so a past round reads
 * the same after its progress rows were deleted by the next start.
 */
export async function getRoundDetail(roundId: string): Promise<RoundDetail | null> {
  const round = await prisma.arucoRound.findUnique({
    where: { id: roundId },
    include: {
      arucoGame: true,
      teams: true,
      events: { orderBy: { createdAt: 'asc' } },
      _count: { select: { teams: true } },
    },
  });
  if (!round) return null;

  const hints = await prisma.arucoMarker.findMany({ where: { game: round.game, kind: 'hint' } });
  const hintNumber = new Map(hints.map((h) => [h.markerId, h.hintNumber]));

  const teamIds = [...new Set([...round.teams.map((t) => t.teamId), ...round.events.map((e) => e.teamId)])];
  const userIds = [...new Set(round.events.flatMap((e) => (e.userId ? [e.userId] : [])))];
  const [teams, users] = await Promise.all([
    prisma.team.findMany({ where: { id: { in: teamIds } }, select: { id: true, name: true } }),
    prisma.user.findMany({ where: { id: { in: userIds } }, select: { id: true, name: true, lastName: true } }),
  ]);
  const teamName = new Map(teams.map((t) => [t.id, t.name]));
  const userName = new Map(users.map((u) => [u.id, `${u.name} ${u.lastName}`.trim()]));

  const detailTeams: RoundTeam[] = teamIds.map((teamId) => {
    const events = round.events.filter((e) => e.teamId === teamId);
    const timeline: TimelineEntry[] = events.map((e) => {
      const entry = describe(e, hintNumber);
      return {
        id: e.id,
        at: e.createdAt.toISOString(),
        who: e.userId ? (userName.get(e.userId) ?? 'Unknown member') : null,
        action: e.action as TimelineEntry['action'],
        ...entry,
      };
    });

    // Since the team's last reset, as the backend counts.
    const lastReset = events.findLastIndex((e) => e.action === 'reset');
    const live = events.slice(lastReset + 1);
    const tried = new Set(live.filter((e) => e.action === 'scan' && e.outcome !== 'limit').map((e) => e.markerId));
    const words = live.filter((e) => e.action === 'word' && e.outcome !== 'locked');

    return {
      teamId,
      teamName: teamName.get(teamId) ?? null,
      triesUsed: tried.size,
      wordAttempts: words.length,
      solved: words.some((e) => e.outcome === 'correct'),
      timeline,
    };
  });

  return {
    id: round.id,
    game: round.game,
    title: gameTitle(round.arucoGame),
    scanLimit: round.arucoGame.scanLimit ?? SCAN_LIMIT,
    hasWord: round.arucoGame.word !== null,
    startedAt: round.startedAt.toISOString(),
    endedAt: round.endedAt?.toISOString() ?? null,
    teamCount: round._count.teams,
    teams: detailTeams.sort((a, b) => (a.teamName ?? '').localeCompare(b.teamName ?? '')),
  };
}

/** Words one logged event. */
function describe(
  e: { action: string; outcome: string; content: string; markerId: number | null },
  hintNumber: Map<number, number | null>,
): Pick<TimelineEntry, 'tone' | 'text'> {
  const id = `#${e.markerId}`;
  if (e.action === 'reset') return { tone: 'neutral', text: 'Progress reset by an organizer' };
  if (e.action === 'word') {
    if (e.outcome === 'correct') return { tone: 'good', text: `Word “${e.content}”: right` };
    if (e.outcome === 'wrong') return { tone: 'bad', text: `Word “${e.content}”: wrong` };
    return { tone: 'neutral', text: `Word “${e.content}”: not counted (already solved or out of attempts)` };
  }
  switch (e.outcome) {
    case 'letter':
      return { tone: 'good', text: `Scanned ${id}: letter ${e.content}` };
    case 'hint': {
      // A quotation hint carries its own quotes.
      const n = e.markerId === null ? undefined : hintNumber.get(e.markerId);
      return { tone: 'good', text: `Scanned ${id}: ${n ? `hint ${n}` : 'hint'}, ${e.content}` };
    }
    case 'collector':
      return { tone: 'good', text: `Scanned ${id}: collector (word box)` };
    case 'path':
      return e.content === 'safe'
        ? { tone: 'good', text: `Scanned ${id}: safe path` }
        : { tone: 'bad', text: `Scanned ${id}: unsafe path` };
    case 'limit':
      return { tone: 'bad', text: `Tried ${id}: refused, all tries used` };
    default:
      return { tone: 'bad', text: `Scanned ${id}: no marker` };
  }
}
