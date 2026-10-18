import { buildXlsx, tabulate, type XlsxColumn } from '@/lib/xlsx';
import { seatIn, type Workshop, type WorkshopPerson } from './workshop-types';

const WHO: XlsxColumn<WorkshopPerson>[] = [
  { header: 'First name', value: (p) => p.name },
  { header: 'Last name', value: (p) => p.lastName },
  { header: 'Email', value: (p) => p.email },
  { header: 'Phone', value: (p) => p.phone },
  { header: 'Student branch', value: (p) => p.sb ?? '' },
  { header: 'Challenge team', value: (p) => p.challengeTeam ?? '' },
];

/** A workshop's attendance list, for the room. */
export function buildAttendeesXlsx(workshop: Workshop, attendees: WorkshopPerson[]) {
  const { header, rows } = tabulate(WHO, attendees);
  // Excel caps sheet names at 31 characters and refuses a few symbols.
  return buildXlsx(rows, { sheet: workshop.title.replace(/[\\/?*[\]:]/g, ' ').slice(0, 31), header });
}

/** Everyone shown on the "No seat yet" tab, with the seat they have, if any. */
export function buildUnseatedXlsx(people: WorkshopPerson[], workshops: Workshop[], sessions: number[]) {
  const title = (id: string) => workshops.find((w) => w.id === id)?.title ?? id;
  const columns: XlsxColumn<WorkshopPerson>[] = [
    ...WHO,
    ...sessions.map((session) => ({
      header: `Session ${session}`,
      value: (p: WorkshopPerson) => {
        const seat = seatIn(p, session);
        return seat ? title(seat.workshopId) : '';
      },
    })),
  ];
  const { header, rows } = tabulate(columns, people);
  return buildXlsx(rows, { sheet: 'No seat yet', header });
}

export function workshopsXlsxFilename(what: string, now = new Date()) {
  const slug = what
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 40);
  return `trsyp-workshop-${slug}-${now.toISOString().slice(0, 10)}.xlsx`;
}
