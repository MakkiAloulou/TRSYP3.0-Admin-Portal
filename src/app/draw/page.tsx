import type { Metadata } from 'next';
import { requireAdmin } from '@/lib/require-admin';
import { DrawStage } from './draw-stage';
import { getSavedDraw } from './draw-data';

export const metadata: Metadata = { title: 'Competition draw' };

/**
 * The competition draw, run live on the venue screen. Deliberately outside
 * the dashboard: no navbar and no link to it, reached by URL only, but behind
 * the same admin gate.
 */
export default async function DrawPage() {
  await requireAdmin();
  // A saved draw opens on its matches, so a refresh never loses the result.
  return <DrawStage savedOrder={await getSavedDraw()} />;
}
