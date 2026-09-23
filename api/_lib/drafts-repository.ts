import { sql } from './db';
import type { CalendarChangeDraft } from './draft-schema';

export interface DraftRow {
  draftId: string;
  profileId: string;
  sourceMessageId: string;
  action: 'add' | 'update' | 'delete';
  targetEventId: string | null;
  payload: CalendarChangeDraft;
  status: 'pending' | 'confirmed' | 'rejected';
  appliedEventIds: string[];
}

export async function insertPendingDraft(profileId: string, draft: CalendarChangeDraft): Promise<void> {
  const db = sql();
  await db`
    insert into calendar_drafts (draft_id, profile_id, source_message_id, action, target_event_id, payload, status)
    values (${draft.draft_id}, ${profileId}, ${draft.source_message_id}, ${draft.action}, ${draft.target_event_id ?? null}, ${JSON.stringify(draft)}::jsonb, 'pending')
    on conflict (draft_id) do nothing
  `;
}

export async function getDraft(draftId: string): Promise<DraftRow | null> {
  const db = sql();
  const rows = await db`select draft_id, profile_id, source_message_id, action, target_event_id, payload, status, applied_event_ids from calendar_drafts where draft_id = ${draftId}`;
  if (rows.length === 0) return null;
  const r = rows[0] as Record<string, unknown>;
  return {
    draftId: r.draft_id as string,
    profileId: r.profile_id as string,
    sourceMessageId: r.source_message_id as string,
    action: r.action as DraftRow['action'],
    targetEventId: (r.target_event_id as string | null) ?? null,
    payload: r.payload as CalendarChangeDraft,
    status: r.status as DraftRow['status'],
    appliedEventIds: (r.applied_event_ids as string[] | null) ?? [],
  };
}

// Repeated rejection is safe by construction: this only ever moves a
// *pending* draft to rejected, so calling it again on an already-rejected
// (or confirmed) draft is a no-op.
export async function markDraftRejected(draftId: string): Promise<void> {
  const db = sql();
  await db`
    update calendar_drafts set status = 'rejected', rejected_at = now()
    where draft_id = ${draftId} and status = 'pending'
  `;
}
