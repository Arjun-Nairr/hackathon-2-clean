// Restores the hardcoded demo profile (`rohan-mehta`) to exactly its 7
// canonical seeded events — undoing whatever a rehearsal or a chat-agent
// demo added. Deletes every extra calendar_events row and every
// calendar_drafts row for this profile, then reuses upsertDemoData (the
// same routine seed.ts calls) to put the canonical profile and events back
// exactly. Only ever touches profile_id = PROFILE.id; safe to run
// repeatedly, since every step is either a scoped delete or an
// on-conflict-do-update upsert.
import type { NeonQueryFunction } from '@neondatabase/serverless';
import { EVENTS, PROFILE } from './seed-data';
import { upsertDemoData } from './seed-core';

export interface ResetResult {
  removedEvents: number;
  removedDrafts: number;
  finalEventCount: number;
}

export async function resetDemoData(sql: NeonQueryFunction<false, false>): Promise<ResetResult> {
  const canonicalIds = EVENTS.map((e) => e.id);

  const deletedEvents = await sql`
    delete from calendar_events
    where profile_id = ${PROFILE.id} and id != all(${canonicalIds})
    returning id
  `;

  const deletedDrafts = await sql`
    delete from calendar_drafts where profile_id = ${PROFILE.id} returning draft_id
  `;

  const finalEventCount = await upsertDemoData(sql);

  return { removedEvents: deletedEvents.length, removedDrafts: deletedDrafts.length, finalEventCount };
}
