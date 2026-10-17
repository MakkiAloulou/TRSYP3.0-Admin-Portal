import type { Metadata } from 'next';
import { getRegister, getTeamProgress } from './aruco-data';
import { ProgressTable } from './progress-table';
import { RegisterEditor } from './register-editor';

export const metadata: Metadata = { title: 'ArUco' };

/** The value, or null (logged) when it could not be read. */
async function attempt<T>(what: string, read: () => Promise<T>): Promise<T | null> {
  try {
    return await read();
  } catch (error) {
    console.error(`Could not load ${what}`, error);
    return null;
  }
}

export default async function ArucoPage() {
  // Loaded apart: the register's table comes with a backend migration, and
  // progress must stay readable (and resettable) if that hasn't run yet.
  const [register, teams] = await Promise.all([
    attempt('the ArUco register', () => getRegister()),
    attempt('ArUco progress', () => getTeamProgress()),
  ]);

  return (
    <div className="space-y-4">
      <div>
        <h2 className="admin-heading text-lg text-white">ArUco</h2>
        <p className="text-sm" style={{ color: 'rgba(255,255,255,0.4)' }}>
          What each marker ID gives on the main site&apos;s /aruco page, and how far each Competition team has got
        </p>
      </div>

      {register ? (
        <RegisterEditor initial={register.markers} initialVersion={register.version} />
      ) : (
        <LoadError>
          The marker register could not be loaded. If the backend hasn&apos;t been deployed since the register moved to
          the database, its migration (20261018010000_aruco_markers) hasn&apos;t run yet.
        </LoadError>
      )}

      {teams ? (
        <ProgressTable teams={teams} markers={register?.markers ?? []} />
      ) : (
        <LoadError>Team progress could not be loaded. Refresh the page to try again.</LoadError>
      )}
    </div>
  );
}

function LoadError({ children }: { children: React.ReactNode }) {
  return (
    <div className="admin-card p-6">
      <p className="pay-error">{children}</p>
    </div>
  );
}
