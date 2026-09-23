import { config } from 'dotenv';
import { neon } from '@neondatabase/serverless';
import { getDatabaseUrl } from '../api/_lib/env';
import { EVENTS } from './seed-data';
import { resetDemoData } from './reset-demo-core';

config({ path: '.env.local' });

// `pnpm run db:reset-demo` — run this after rehearsing the chat/confirm
// flow (or before judging) to remove any extra events and pending/
// confirmed/rejected draft rows the rehearsal left behind and restore the
// exact 7 canonical events. Never prints DATABASE_URL or any other secret
// — only counts. getDatabaseUrl() throws a clear, value-free error if the
// configuration is missing.
async function main() {
  const sql = neon(getDatabaseUrl());
  const result = await resetDemoData(sql);

  console.log(`Demo reset: removed ${result.removedEvents} extra event(s) and ${result.removedDrafts} draft row(s). Canonical event count: ${result.finalEventCount}.`);

  if (result.finalEventCount !== EVENTS.length) {
    console.error(`Expected exactly ${EVENTS.length} events after reset, found ${result.finalEventCount}.`);
    process.exit(1);
  }
}

main().catch((err) => {
  console.error('Demo reset failed:', err instanceof Error ? err.message : err);
  process.exit(1);
});
