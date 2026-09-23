import { config } from 'dotenv';
import { neon } from '@neondatabase/serverless';
import { getDatabaseUrl } from '../api/_lib/env';
import { upsertDemoData } from './seed-core';

config({ path: '.env.local' });

// Idempotent: every write is `on conflict ... do update`, so running this
// twice leaves the same 1 profile + 7 events, not duplicates.
async function main() {
  const sql = neon(getDatabaseUrl());
  const count = await upsertDemoData(sql);
  console.log(`Seeded profile "rohan-mehta" with ${count} calendar events.`);
}

main().catch((err) => {
  console.error('Seed failed:', err instanceof Error ? err.message : err);
  process.exit(1);
});
