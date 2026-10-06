import { Suspense } from 'react';
import type { Metadata } from 'next';
import { prisma } from '@/lib/prisma';
import { getAllProofs } from '@/lib/payment-proofs';
import {
  PAYMENT_STATE_COLORS,
  PAYMENT_STATE_LABELS,
  derivePaymentState,
  feeFor,
  latestProofPerParticipant,
  type PaymentState,
} from '@/lib/payment';
import { ChartCard, DonutBreakdown, RankedBars, ShareBar, StatTile, RegistrationsCard, VIZ, type TrendPoint } from './charts';
import { ChartCardSkeleton, Skeleton, StatTileSkeleton } from './loading-skeletons';
import { RegionMap } from './region-map';
import { regionForBranch } from '@/lib/student-branch-region';
import { REGION_NAMES } from '@/lib/tunisia-regions';

/** Status colour for "needs attention" — reserved for state, never a series colour. */
const WARNING = '#fab219';

/** The Membership column's colours, so the chart and the table agree. */
const MEMBERSHIP_COLORS = { nonIeee: 'var(--color-pink)', ieee: 'var(--color-green)', ras: '#a78bfa' };

/** Settled first, then what still needs someone. */
const PAYMENT_ORDER: PaymentState[] = ['PAID', 'PENDING', 'REJECTED', 'NOT_PAID'];

export const metadata: Metadata = { title: 'Overview' };

function loadParticipants() {
  return prisma.participant.findMany({
    select: {
      id: true,
      isRas: true,
      participantType: true,
      gender: true,
      paid: true,
      banned: true,
      sb: true,
      createdAt: true,
      // Only how many there are: a team in any activity is what moves the fee.
      memberships: { select: { activity: true } },
      user: { select: { active: true } },
    },
  });
}

type OverviewParticipant = Awaited<ReturnType<typeof loadParticipants>>[number];

/**
 * The page waits only for the database. Everything that needs the payments
 * service — which can be slow to wake — streams in behind its own skeleton
 * (PaymentTiles, PaymentStatusCard), so a cold backend no longer holds up
 * the charts that don't depend on it.
 */
export default async function DashboardPage() {
  // Start the payments request now, alongside the database queries; the
  // streamed sections below pick up this same cached request.
  void getAllProofs();

  const [participants, teams] = await Promise.all([
    loadParticipants(),
    prisma.team.findMany({ select: { activity: true } }),
  ]);

  const total = participants.length;
  const unverified = participants.filter((p) => !p.user.active).length;

  // The three tiers the Membership column shows. RAS only counts for IEEE
  // members, mirroring how the fee is priced.
  const nonIeee = participants.filter((p) => p.participantType === 'NonIEEE').length;
  const ras = participants.filter((p) => p.participantType !== 'NonIEEE' && p.isRas).length;
  const ieeeOnly = total - nonIeee - ras;

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

  const trend = buildTrend(participants.map((p) => p.createdAt));
  const thisWeek = registeredInLastDays(participants.map((p) => p.createdAt), 7);

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
        <Suspense
          fallback={
            <>
              <StatTileSkeleton />
              <StatTileSkeleton />
            </>
          }
        >
          <PaymentTiles participants={participants} />
        </Suspense>
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

      <RegistrationsCard points={trend} lastWeek={thisWeek} />

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
      </div>

      {/* Membership on one half; the two part-to-whole splits stacked on the other. */}
      <div className="viz-split">
        <ChartCard title="Membership" subtitle={`All ${total} participants, as each is priced`}>
          <DonutBreakdown
            items={[
              { label: 'Non-IEEE', value: nonIeee, color: MEMBERSHIP_COLORS.nonIeee },
              { label: 'IEEE', value: ieeeOnly, color: MEMBERSHIP_COLORS.ieee },
              { label: 'IEEE + RAS', value: ras, color: MEMBERSHIP_COLORS.ras },
            ].filter((item) => item.value > 0)}
            centerValue={sharePct(total - nonIeee, total)}
            // The counts are in the list beside the ring; the centre stays short.
            centerLabel="IEEE members"
            emptyLabel="No participants yet"
          />
        </ChartCard>

        <div className="viz-stack">
          <Suspense fallback={<ShareCardSkeleton />}>
            <PaymentStatusCard participants={participants} />
          </Suspense>

          <ChartCard title="Gender split" subtitle={`${total} participants`}>
            <ShareBar
              slices={byGender.map((g, i) => ({ label: g.label, value: g.value, color: VIZ[i % VIZ.length] }))}
            />
          </ChartCard>
        </div>
      </div>
    </div>
  );
}

/* ── sections that wait on the payments service ─────────── */

/** Proofs to review and Fees collected, the two tiles that need proofs. */
async function PaymentTiles({ participants }: { participants: OverviewParticipant[] }) {
  const proofs = await getAllProofs();

  // Same rule as the Payments page: only a participant's newest proof counts.
  const latestProofs = proofs.ok ? latestProofPerParticipant(proofs.data.data) : [];
  const pendingProofs = latestProofs.filter((p) => p.status === 'PENDING');
  const oldestPending = pendingProofs.reduce<string | null>(
    (min, p) => (min === null || Date.parse(p.createdAt) < Date.parse(min) ? p.createdAt : min),
    null,
  );

  // Money. A paid participant counts at what their approved proof was priced
  // at — the amount actually handed over — falling back to the current fee if
  // there is no such proof. Everyone not banned is expected to pay.
  const paidAmount = new Map(
    latestProofs.filter((p) => p.status === 'APPROVED').map((p) => [p.participantId, p.amountSnapshot]),
  );
  const owed = (p: OverviewParticipant) => (p.paid ? (paidAmount.get(p.id) ?? feeFor(p)) : feeFor(p));
  const paidCount = participants.filter((p) => p.paid).length;
  const collected = participants.filter((p) => p.paid).reduce((sum, p) => sum + owed(p), 0);
  const expected = participants.filter((p) => p.paid || !p.banned).reduce((sum, p) => sum + owed(p), 0);

  return (
    <>
      <StatTile
        label="Proofs to review"
        value={proofs.ok ? pendingProofs.length : '—'}
        sub={!proofs.ok ? 'Could not load the queue' : oldestPending ? oldestWaiting(oldestPending) : 'Queue clear.'}
        accent={pendingProofs.length > 0 ? WARNING : undefined}
        href="/payments?status=PENDING"
        cta={pendingProofs.length > 0 ? 'Review now' : 'Open payments'}
      />
      <StatTile
        label="Fees collected"
        value={
          <>
            {formatTnd(collected)}
            <span className="viz-tile-unit">TND</span>
          </>
        }
        // Most useful first, so a narrow screen cuts the least of it.
        sub={`${paidCount} of ${participants.length} paid · ${formatTnd(expected)} TND expected`}
      />
    </>
  );
}

/** The four states of the participants table's Payment column. */
async function PaymentStatusCard({ participants }: { participants: OverviewParticipant[] }) {
  const proofs = await getAllProofs();
  const latestStatus = new Map(
    proofs.ok ? latestProofPerParticipant(proofs.data.data).map((p) => [p.participantId, p.status]) : [],
  );
  const states = participants.map((p) => derivePaymentState(p.paid, latestStatus.get(p.id) ?? null));

  return (
    <ChartCard title="Payment status" subtitle={`${participants.length} participants`}>
      <ShareBar
        slices={PAYMENT_ORDER.map((state) => ({
          label: PAYMENT_STATE_LABELS[state],
          value: states.filter((s) => s === state).length,
          color: PAYMENT_STATE_COLORS[state],
        }))}
      />
    </ChartCard>
  );
}

/** Stands in for a share-bar card while it streams: the bar, then the legend. */
function ShareCardSkeleton() {
  return (
    <ChartCardSkeleton>
      <Skeleton style={{ height: 14 }} />
      <Skeleton className="skeleton-text" style={{ width: '60%' }} />
    </ChartCardSkeleton>
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

/** "21,450" — grouped so four- and five-figure sums read at a glance. */
function formatTnd(amount: number) {
  return amount.toLocaleString('en-US');
}

function sharePct(value: number, total: number) {
  if (total === 0) return '0%';
  return `${Math.round((value / total) * 100)}%`;
}

/** Cumulative sign-ups, one point per calendar day (UTC) from first to today. */
/** How many registered in the last `days` days, counting back from now. */
function registeredInLastDays(dates: Date[], days: number) {
  const since = Date.now() - days * 86_400_000;
  return dates.filter((d) => d.getTime() >= since).length;
}

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

/** "Oldest waiting 12 minutes.", "…5 hours.", "…3 days.": how long the oldest proof has waited. */
function oldestWaiting(iso: string) {
  const minutes = Math.floor((Date.now() - Date.parse(iso)) / 60_000);
  if (minutes < 1) return 'Oldest sent just now.';
  if (minutes < 60) return `Oldest waiting ${minutes === 1 ? '1 minute' : `${minutes} minutes`}.`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `Oldest waiting ${hours === 1 ? '1 hour' : `${hours} hours`}.`;
  const days = Math.floor(hours / 24);
  return `Oldest waiting ${days === 1 ? '1 day' : `${days} days`}.`;
}

function formatDay(date: Date) {
  return date.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', timeZone: 'UTC' });
}
