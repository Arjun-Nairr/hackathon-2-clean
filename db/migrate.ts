import { config } from 'dotenv';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { neon } from '@neondatabase/serverless';
import { getDatabaseUrl } from '../api/_lib/env';

config({ path: '.env.local' });

// Idempotent: `create table if not exists` means running this twice is a
// no-op the second time.
async function main() {
  const sql = neon(getDatabaseUrl());
  const schemaPath = fileURLToPath(new URL('./schema.sql', import.meta.url));
  const schema = readFileSync(schemaPath, 'utf8')
    .split('\n')
    .filter((line) => !line.trim().startsWith('--'))
    .join('\n');
  // Neon's HTTP query interface runs one prepared statement per call, so a
  // schema file with several `create table` statements must be split and
  // run individually. Comment lines are stripped first so a semicolon
  // inside a comment can't be mistaken for a statement boundary.
  const statements = schema
    .split(';')
    .map((s) => s.trim())
    .filter((s) => s.length > 0);
  for (const statement of statements) {
    await sql.query(statement);
  }
  console.log(`Migration applied (${statements.length} statement(s), or already up to date).`);
}

main().catch((err) => {
  console.error('Migration failed:', err instanceof Error ? err.message : err);
  process.exit(1);
});
