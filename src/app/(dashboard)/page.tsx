import { prisma } from '@/lib/prisma';
import { ChartCard, DonutBreakdown, RankedBars, ShareBar, StatTile, TrendChart, VIZ, type TrendPoint } from './charts';
import { RegionMap } from './region-map';
import { regionForBranch } from '@/lib/student-branch-region';
import { REGION_NAMES } from '@/lib/tunisia-regions';
import {
  IEEE_CHECK_COLORS,
  IEEE_CHECK_LABELS,
  deriveIeeeState,
  type IeeeCheckState,
  type IeeeIssue,
} from '@/lib/ieee-verification';

/** Status palette — reserved for state, never reused as a series colour. */
const STATUS = {
  good: '#0ca30c',
  warning: '#fab219',
  serious: '#ec835a',
  critical: '#d03b3b',
} as const;

/** Slice order around the donut, as validated for adjacent-pair contrast:
 *  green, violet, red, then unchecked in grey. */
const IEEE_ORDER: IeeeCheckState[] = ['VERIFIED', 'NOT_RAS', 'NOT_IEEE', 'UNVERIFIED'];

const VISA_ORDER = [
  { status: 'Pending', color: STATUS.warning },
  { status: 'LetterSent', label: 'Letter sent', color: STATUS.serious },
  { status: 'Approved', color: STATUS.good },
  { status: 'Rejected', color: STATUS.critical },
] as const;

export default async function DashboardPage() {
  const [participants, teams, visaApplications] = await Promise.all([
    prisma.participant.findMany({
      select: {
        ieeeId: true,
        isRas: true,
        participantType: true,
        gender: true,
        paid: true,
        isInternational: true,
        banned: true,
        sb: true,
        createdAt: true,
        user: { select: { active: true, email: true, name: true, lastName: true } },
        // The stored IEEE record and the profile it was checked against: the
        // verdict is judged from these under the current rules.
        ieeeVerification: {
          select: {
            memberStatus: true,
            grade: true,
            societies: true,
            firstInitial: true,
            lastInitial: true,
            matchedBy: true,
            // Carries a RAS claim made under the old form (see claimedRas).
            issues: true,
            claimedIeeeId: true,
            claimedType: true,
            claimedIsRas: true,
            claimedEmail: true,
          },
        },
      },
    }),
    prisma.team.findMany({
      select: { activity: true, size: true, _count: { select: { memberships: true } } },
    }),
    prisma.visaApplication.findMany({ select: { status: true } }),
  ]);

  const total = participants.length;
  const paid = participants.filter((p) => p.paid).length;
  const international = participants.filter((p) => p.isInternational).length;
  const unverified = participants.filter((p) => !p.user.active).length;

  // "IEEE" == holds a membership grade; NonIEEE is the only non-member type.
  const nonIeee = participants.filter((p) => p.participantType === 'NonIEEE').length;
  const ieee = total - nonIeee;

  const byGender = countBy(participants, (p) => normaliseGender(p.gender));
  const bySb = countBy(
    participants.filter((p) => p.sb),
    (p) => p.sb as string,
  );
  // Effectively every participant is Tunisian, so a country breakdown says
  // nothing. Student branch does carry location, which resolves to a governorate.
  const byRegion = REGION_NAMES.map((region) => ({
    region,
    value: participants.filter((p) => regionForBranch(p.sb) === region).length,
  }));

  const placed = byRegion.reduce((sum, r) => sum + r.value, 0);
  const unplaced = total - placed;

  const competitionTeams = teams.filter((t) => t.activity === 'COMPETITION');
  const challengeTeams = teams.filter((t) => t.activity === 'CHALLENGE');
  const hackathonTeams = teams.filter((t) => t.activity === 'FABLAB');
  const fullTeams = teams.filter((t) => t._count.memberships >= t.size).length;

  // Every participant: participant_type is IEEE's verdict now, so a NonIEEE
  // participant was looked up too (or is about to be).
  const ieeeStates = participants.map((p) =>
    deriveIeeeState({
      ...p,
      ieeeVerification: p.ieeeVerification && {
        ...p.ieeeVerification,
        matchedBy: p.ieeeVerification.matchedBy as 'IEEE_ID' | 'EMAIL' | null,
        issues: p.ieeeVerification.issues as IeeeIssue[],
      },
    }),
  );

  const ieeeItems = IEEE_ORDER.map((state) => ({
    label: IEEE_CHECK_LABELS[state],
    value: ieeeStates.filter((s) => s === state).length,
    color: IEEE_CHECK_COLORS[state],
  })).filter((item) => item.value > 0);

  // Both member tiers: RAS (Verified) and IEEE without RAS.
  const ieeeVerified = ieeeStates.filter((s) => s === 'VERIFIED' || s === 'NOT_RAS').length;
  const ieeeNotIeee = ieeeStates.filter((s) => s === 'NOT_IEEE').length;
  const ieeePending = ieeeStates.filter((s) => s === 'UNVERIFIED').length;

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
        <StatTile
          label="Competition teams"
          value={competitionTeams.length}
          sub={`${sharePct(competitionTeams.length, teams.length)} of all teams`}
        />
        <StatTile
          label="Challenge teams"
          value={challengeTeams.length}
          sub={`${sharePct(challengeTeams.length, teams.length)} of all teams`}
        />
        <StatTile
          label="Hackathon teams"
          value={hackathonTeams.length}
          sub={`${sharePct(hackathonTeams.length, teams.length)} of all teams`}
        />
      </div>

      <ChartCard title="Registrations over time" subtitle="Cumulative registrations since the first registration">
        <TrendChart points={trend} />
      </ChartCard>

      <ChartCard
        title="IEEE verification"
        subtitle={`IEEE's answer for all ${ieeeStates.length} participants`}
      >
        <DonutBreakdown
          items={ieeeItems}
          centerValue={sharePct(ieeeVerified, ieeeStates.length)}
          centerLabel={`IEEE members (${ieeeVerified} of ${ieeeStates.length})`}
          emptyLabel="No participants yet"
        />
        <div className="viz-footnote">
          <span>{ieeeNotIeee} not IEEE members</span>
          <span>{ieeePending} awaiting a current check</span>
        </div>
      </ChartCard>

      <div className="viz-grid">
        <ChartCard title="Top student branches" subtitle="Ten largest delegations">
          <RankedBars items={topN(bySb, 10)} emptyLabel="No student branch recorded yet" />
        </ChartCard>

        <ChartCard title="Participants by region" subtitle="Governorate of each student branch">
          <RegionMap counts={byRegion} />
          <div className="viz-footnote">
            <span>{placed} placed by branch</span>
            {unplaced > 0 && <span>{unplaced} unmapped</span>}
          </div>
        </ChartCard>

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
