// Loads Codex's authoritative agent skill once per process and caches it.
// Treated as an immutable input: this file only reads it, never edits or
// duplicates its rules elsewhere. A missing/empty file fails loudly (at
// startup via server/index.ts's eager call, or on first request in a
// serverless cold start) rather than silently running an unguided chat.
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

let cached: string | null = null;

export function loadSkill(): string {
  if (cached) return cached;
  const path = fileURLToPath(new URL('../../agent/uae-finance-planner/SKILL.md', import.meta.url));
  const text = readFileSync(path, 'utf8');
  if (!text.trim()) {
    throw new Error('agent/uae-finance-planner/SKILL.md is empty');
  }
  cached = text;
  return cached;
}
