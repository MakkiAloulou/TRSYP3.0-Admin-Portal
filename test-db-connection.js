// Run with: node test-db-connection.js
// Bypasses Prisma/Next.js entirely — just tests raw TCP + Postgres auth
// against DATABASE_URL, to isolate whether the problem is network reachability
// or something in the app.
require('dotenv').config({ path: '.env.local' });
const { Client } = require('pg');

async function attempt(label, clientConfig) {
  const client = new Client(clientConfig);
  const start = Date.now();
  try {
    await client.connect();
    const res = await client.query('select now()');
    console.log(`✅ [${label}] Connected. Server time:`, res.rows[0].now, `(${Date.now() - start}ms)`);
  } catch (err) {
    console.error(`❌ [${label}] Failed after ${Date.now() - start}ms:`, err.message);
  } finally {
    await client.end().catch(() => {});
  }
}

async function main() {
  const url = process.env.DATABASE_URL;
  if (!url) {
    console.error('DATABASE_URL is not set in .env.local');
    process.exit(1);
  }

  console.log('Connecting to:', url.replace(/:[^:@]+@/, ':REDACTED@'));

  // Attempt 1: exactly what the app does today (no explicit ssl option)
  await attempt('no explicit ssl', { connectionString: url, connectionTimeoutMillis: 8000 });

  // Attempt 2: force SSL, skip cert verification (Supabase uses a cert chain
  // 'pg' may not trust by default without extra config)
  await attempt('ssl forced, no verify', {
    connectionString: url,
    connectionTimeoutMillis: 8000,
    ssl: { rejectUnauthorized: false },
  });
}

main();
