import { prisma } from '@/lib/prisma';
import { ChartCard, Meter, RankedBars, ShareBar, StatTile, StatusList, TrendChart, VIZ, type TrendPoint } from './charts';

/** Status palette — reserved for state, never reused as a series colour. */
const STATUS = {
  good: '#0ca30c',
  warning: '#fab219',
  serious: '#ec835a',
  critical: '#d03b3b',
} as const;

const VISA_ORDER = [
  { status: 'Pending', color: STATUS.warning },
  { status: 'LetterSent', label: 'Letter sent', color: STATUS.serious },
  { status: 'Approved', color: STATUS.good },
  { status: 'Rejected', color: STATUS.critical },
] as const;

export default async function DashboardPage() {
  const [participants, teams, visaApplications, rooms] = await Promise.all([
    prisma.participant.findMany({
      select: {
        participantType: true,
        gender: true,
        paid: true,
        isInternational: true,
        banned: true,
        sb: true,
        country: true,
        createdAt: true,
        user: { select: { active: true } },
      },
    }),
    prisma.team.findMany({
      select: { activity: true, size: true, _count: { select: { memberships: true } } },
    }),
    prisma.visaApplication.findMany({ select: { status: true } }),
    prisma.room.findMany({ select: { status: true } }),
  ]);

  const total = participants.length;
  const paid = participants.filter((p) => p.paid).length;
  const international = participants.filter((p) => p.isInternational).length;
  const banned = participants.filter((p) => p.banned).length;
  const unverified = participants.filter((p) => !p.user.active).length;

  // "IEEE" == holds a membership grade; NonIEEE is the only non-member type.
  const nonIeee = participants.filter((p) => p.participantType === 'NonIEEE').length;
  const ieee = total - nonIeee;

  const byType = countBy(participants, (p) => p.participantType);
  const byGender = countBy(participants, (p) => normaliseGender(p.gender));
  const bySb = countBy(
    participants.filter((p) => p.sb),
    (p) => p.sb as string,
  );
  const byCountry = countBy(participants, (p) => p.country);

  const competitionTeams = teams.filter((t) => t.activity === 'COMPETITION');
  const challengeTeams = teams.filter((t) => t.activity === 'CHALLENGE');
  const fullTeams = teams.filter((t) => t._count.memberships >= t.size).length;
  const teamedParticipants = teams.reduce((sum, t) => sum + t._count.memberships, 0);

  const confirmedRooms = rooms.filter((r) => r.status === 'Confirmed').length;

  const visaItems = VISA_ORDER.map((v) => ({
    label: 'label' in v ? v.label : v.status,
    value: visaApplications.filter((a) => a.status === v.status).length,
    color: v.color,
  }));

  const trend = buildTrend(participants.map((p) => p.createdAt));

  return (
    <div className="space-y-6">
      <div>
        <h2 className="admin-heading text-lg text-white">Overview</h2>
        <p className="text-sm" style={{ color: 'rgba(255,255,255,0.4)' }}>
          Live registration &amp; team stats
        </p>
      </div>

      <div className="viz-kpi-row">
        <StatTile label="Participants" value={total} sub={`${unverified} unverified`} />
        <StatTile
          label="Paid"
          value={paid}
          sub={`${sharePct(paid, total)} of registrations`}
          accent="var(--viz-1)"
        />
        <StatTile label="Competition teams" value={competitionTeams.length} sub={`${fullTeams} full overall`} />
        <StatTile label="Challenge teams" value={challengeTeams.length} sub={`${teamedParticipants} seats taken`} />
        <StatTile
          label="International"
          value={international}
          sub={`${sharePct(international, total)} of registrations`}
          accent="var(--viz-2)"
        />
      </div>

      <ChartCard title="Registrations over time" subtitle="Cumulative sign-ups since the first registration">
        <TrendChart points={trend} />
      </ChartCard>

      <div className="viz-grid">
        <ChartCard title="IEEE vs non-IEEE" subtitle={`${total} participants`}>
          <ShareBar
            slices={[
              { label: 'IEEE members', value: ieee, color: VIZ[0] },
              { label: 'Non-IEEE', value: nonIeee, color: VIZ[1] },
            ]}
          />
        </ChartCard>

        <ChartCard title="Gender split" subtitle={`${total} participants`}>
          <ShareBar
            slices={byGender.map((g, i) => ({ label: g.label, value: g.value, color: VIZ[i % VIZ.length] }))}
          />
        </ChartCard>

        <ChartCard title="Membership type" subtitle="Registrations by participant type">
          <RankedBars items={byType} />
        </ChartCard>

        <ChartCard title="Payment" subtitle="Confirmed payments against total registrations">
          <Meter value={paid} total={total} caption="of participants have paid" />
          <div className="viz-footnote">
            <span>{total - paid} unpaid</span>
            <span>{banned} banned</span>
            <span>
              {confirmedRooms}/{rooms.length} rooms confirmed
            </span>
          </div>
        </ChartCard>

        <ChartCard title="Teams by activity" subtitle={`${teams.length} teams · ${fullTeams} at full capacity`}>
          <ShareBar
            slices={[
              { label: 'Competition', value: competitionTeams.length, color: VIZ[0] },
              { label: 'Challenge', value: challengeTeams.length, color: VIZ[2] },
            ]}
          />
        </ChartCard>

        <ChartCard title="Visa pipeline" subtitle={`${visaApplications.length} applications`}>
          <StatusList items={visaItems} />
        </ChartCard>

        <ChartCard title="Top student branches" subtitle="Ten largest delegations">
          <RankedBars items={topN(bySb, 10)} emptyLabel="No student branch recorded yet" />
        </ChartCard>

        <ChartCard title="Countries" subtitle="Where participants are registering from">
          <RankedBars items={topN(byCountry, 8)} color={VIZ[2]} />
        </ChartCard>
      </div>
    </div>
  );
}

/* ── aggregation helpers ────────────────────────────────── */

function countBy<T>(rows: T[], key: (row: T) => string) {
  const counts = new Map<string, number>();
  for (const row of rows) {
    const k = key(row);
    counts.set(k, (counts.get(k) ?? 0) + 1);
  }
  return [...counts.entries()].map(([label, value]) => ({ label, value })).sort((a, b) => b.value - a.value);
}

/** Keeps the biggest `n` entries and folds the rest into "Other". */
function topN(items: { label: string; value: number }[], n: number) {
  if (items.length <= n) return items;
  const head = items.slice(0, n);
  const rest = items.slice(n).reduce((sum, i) => sum + i.value, 0);
  return rest > 0 ? [...head, { label: `Other (${items.length - n})`, value: rest }] : head;
}

function normaliseGender(gender: string) {
  const g = gender.trim().toLowerCase();
  if (g === 'm' || g === 'male') return 'Male';
  if (g === 'f' || g === 'female') return 'Female';
  return gender.trim() || 'Unspecified';
}

function sharePct(value: number, total: number) {
  if (total === 0) return '0%';
  return `${Math.round((value / total) * 100)}%`;
}

/** Cumulative sign-ups, one point per calendar day (UTC) from first to today. */
function buildTrend(dates: Date[]): TrendPoint[] {
  if (dates.length === 0) return [];

  const perDay = new Map<string, number>();
  for (const d of dates) {
    const key = d.toISOString().slice(0, 10);
    perDay.set(key, (perDay.get(key) ?? 0) + 1);
  }

  const sorted = [...dates].sort((a, b) => a.getTime() - b.getTime());
  const start = new Date(`${sorted[0].toISOString().slice(0, 10)}T00:00:00Z`);
  const end = new Date(`${new Date().toISOString().slice(0, 10)}T00:00:00Z`);

  const points: TrendPoint[] = [];
  let running = 0;

  for (let day = start; day <= end; day = new Date(day.getTime() + 86_400_000)) {
    const key = day.toISOString().slice(0, 10);
    const daily = perDay.get(key) ?? 0;
    running += daily;
    points.push({ date: formatDay(day), total: running, daily });
  }

  return points;
}

function formatDay(date: Date) {
  return date.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', timeZone: 'UTC' });
}
