import { neon, type NeonQueryFunction } from '@neondatabase/serverless';
import { getDatabaseUrl } from './env.js';

// One lazily-created Neon client, reused across handler invocations. Neon's
// serverless driver talks HTTP, so this is safe in both a Vercel function
// and a plain local Node process.
let client: NeonQueryFunction<false, false> | null = null;

export function sql(): NeonQueryFunction<false, false> {
  if (!client) {
    client = neon(getDatabaseUrl());
  }
  return client;
}
