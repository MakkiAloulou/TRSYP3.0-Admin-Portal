'use server';

import { revalidatePath } from 'next/cache';
import { prisma } from '@/lib/prisma';
import { getAdminId } from '@/lib/require-admin';
import type { AssignResult } from './workshop-types';

/** Thrown inside a transaction to roll it back with a message for the admin. */
class Refusal extends Error {}

/**
 * Gives a participant a seat in a workshop, as the website's own booking
 * would (WorkshopService.book in the backend): the workshop row is locked
 * with SELECT ... FOR UPDATE so the seat count read is final, one seat per
 * session, and only participants who may book — not banned, and paid or with
 * a payment waiver.
 *
 * Two things an admin can do that a participant cannot: with
 * `allowOverCapacity`, seat someone in a full workshop; with `move`, take
 * someone out of the workshop they hold in the same session and seat them
 * here, in one transaction, so they are never left with neither.
 */
export async function assignWorkshop(input: {
  participantId: string;
  workshopId: string;
  allowOverCapacity: boolean;
  move?: boolean;
}): Promise<AssignResult> {
  // Server actions are reachable by POST from anywhere; the dashboard layout's
  // admin check does not cover them.
  if (!(await getAdminId())) return { ok: false, message: 'Only admins can assign workshops.' };

  const { participantId, workshopId } = input;
  if (typeof participantId !== 'string' || typeof workshopId !== 'string') {
    return { ok: false, message: 'Pick a participant and a workshop.' };
  }

  try {
    await prisma.$transaction(
      async (tx) => {
        // Serialise every booking of this workshop, the website's included,
        // from here to commit.
        const [workshop] = await tx.$queryRaw<{ title: string; session: number; capacity: number }[]>`
          SELECT title, session, capacity FROM public.workshops WHERE id = ${workshopId} FOR UPDATE`;
        if (!workshop) throw new Refusal('That workshop no longer exists.');

        const [person] = await tx.$queryRaw<{ banned: boolean; paid: boolean; waived: boolean }[]>`
          SELECT p.banned, p.paid, w.participant_id IS NOT NULL AS waived
            FROM public.participants p
            LEFT JOIN public.workshop_payment_waivers w ON w.participant_id = p.id
           WHERE p.id = ${participantId}`;
        if (!person) throw new Refusal('That participant no longer exists.');
        if (person.banned) throw new Refusal('Banned participants cannot take a workshop.');
        if (!person.paid && !person.waived) {
          throw new Refusal('Workshop seats are for participants whose payment is confirmed.');
        }

        const [current] = await tx.$queryRaw<{ id: string; workshop_id: string; title: string }[]>`
          SELECT b.id, b.workshop_id, w.title
            FROM public.workshop_bookings b
            JOIN public.workshops w ON w.id = b.workshop_id
           WHERE b.participant_id = ${participantId} AND b.session = ${workshop.session}`;
        if (current?.workshop_id === workshopId) throw new Refusal(`They already have a seat in ${workshop.title}.`);
        if (current && !input.move) {
          throw new Refusal(`They already have a seat in session ${workshop.session}: ${current.title}.`);
        }
        // Freeing a seat needs no lock: it can only make room.
        if (current) await tx.$executeRaw`DELETE FROM public.workshop_bookings WHERE id = ${current.id}`;

        const [{ booked }] = await tx.$queryRaw<{ booked: number }[]>`
          SELECT count(*)::int AS booked FROM public.workshop_bookings WHERE workshop_id = ${workshopId}`;
        if (booked >= workshop.capacity && !input.allowOverCapacity) {
          throw new Refusal(`${workshop.title} is full (${booked}/${workshop.capacity}).`);
        }

        await tx.$executeRaw`
          INSERT INTO public.workshop_bookings (id, participant_id, workshop_id, session)
          VALUES (gen_random_uuid()::text, ${participantId}, ${workshopId}, ${workshop.session})`;
      },
      // A booking rush on the website can hold the row lock for a while.
      { maxWait: 10_000, timeout: 15_000 },
    );
  } catch (error) {
    if (error instanceof Refusal) return { ok: false, message: error.message };
    // Two assignments raced the same person into one session: the unique
    // index on (participant_id, session) kept one.
    if (String(error).includes('workshop_bookings_participant_id_session_key')) {
      return { ok: false, message: 'They were just given a seat in this session. Refresh to see it.' };
    }
    console.error('Could not assign workshop', { participantId, workshopId }, error);
    return { ok: false, message: 'The seat could not be assigned. Try again.' };
  }

  revalidatePath('/workshops');
  return { ok: true };
}

/**
 * Frees a participant's seat in a workshop. Participants cannot cancel on the
 * website — bookings are final there — so this is for an admin putting a
 * mistake right.
 */
export async function removeWorkshopSeat(input: { participantId: string; workshopId: string }): Promise<AssignResult> {
  if (!(await getAdminId())) return { ok: false, message: 'Only admins can remove workshop seats.' };

  const { participantId, workshopId } = input;
  if (typeof participantId !== 'string' || typeof workshopId !== 'string') {
    return { ok: false, message: 'Pick a seat to remove.' };
  }

  try {
    const removed = await prisma.$executeRaw`
      DELETE FROM public.workshop_bookings
       WHERE participant_id = ${participantId} AND workshop_id = ${workshopId}`;
    if (removed === 0) return { ok: false, message: 'That seat was already freed. Refresh to see the change.' };
  } catch (error) {
    console.error('Could not remove workshop seat', { participantId, workshopId }, error);
    return { ok: false, message: 'The seat could not be removed. Try again.' };
  }

  revalidatePath('/workshops');
  return { ok: true };
}
