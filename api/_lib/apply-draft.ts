// Applies a *confirmed* calendar-change draft to `calendar_events`. Only
// this module — reached only from the application's own confirm endpoint —
// ever writes calendar_events for a chat-proposed change; chat text never
// does, and a pending draft alone never does either.
import { sql } from './db.js';
import { getDraft } from './drafts-repository.js';
import { validateCalendarChangeDraft, type CalendarChangeDraft } from './draft-schema.js';
import { mapDraftEventToEventRow, slugify } from './draft-mapping.js';

export type ConfirmOutcome =
  | { outcome: 'not_found' }
  | { outcome: 'rejected' }
  | { outcome: 'invalid'; errors: string[] }
  | { outcome: 'confirmed'; appliedEventIds: string[]; alreadyApplied: boolean };

// ponytail: the pending/confirmed check happens in a SELECT before the
// write transaction, so two truly concurrent confirm calls could both pass
// it (only the DB's own row lock on the final UPDATE stops a double-write
// there). Sequential double-confirm — the realistic case here — is fully
// idempotent. Add `select ... for update` if concurrent confirms become
// a real scenario.
export async function confirmDraft(draftId: string, profileMonth: string): Promise<ConfirmOutcome> {
  const existing = await getDraft(draftId);
  if (!existing) return { outcome: 'not_found' };
  if (existing.status === 'confirmed') {
    return { outcome: 'confirmed', appliedEventIds: existing.appliedEventIds, alreadyApplied: true };
  }
  if (existing.status === 'rejected') {
    return { outcome: 'rejected' };
  }

  const revalidated = validateCalendarChangeDraft(existing.payload);
  if (!revalidated.valid) {
    return { outcome: 'invalid', errors: revalidated.errors };
  }
  const draft: CalendarChangeDraft = revalidated.draft;

  const db = sql();
  const appliedEventIds: string[] = [];
  // Each push is an un-awaited tagged-template call; `db.transaction` below
  // is what actually sends and commits them, atomically, over one HTTP
  // round trip.
  const queries: unknown[] = [];

  if (draft.action === 'add') {
    for (const event of draft.events ?? []) {
      const id = slugify(event.name);
      const row = mapDraftEventToEventRow(event, id, profileMonth);
      appliedEventIds.push(id);
      queries.push(db`
        insert into calendar_events (profile_id, id, label, amount, day, kind, payment_type, status, confidence, amount_type, account_name, reviewed, note, recurring, recurrence_interval_months, month_offset)
        values (${existing.profileId}, ${row.id}, ${row.label}, ${row.amount}, ${row.day}, ${row.kind}, ${row.paymentType}, ${row.status}, ${row.confidence}, ${row.amountType}, ${row.accountName}, ${row.reviewed}, ${row.note}, ${row.recurring}, ${row.recurrenceIntervalMonths}, ${row.monthOffset})
      `);
    }
  } else if (draft.action === 'update') {
    // Kept for schema/database compatibility (the JSON schema and
    // validator still accept "update"), but the model-exposed tool surface
    // (tools.ts's CREATE_DRAFT_TOOL) no longer offers this action — a
    // chat-created draft is always "add" or "delete" now.
    // Guaranteed present by validateCalendarChangeDraft's "update" rule
    // (exactly one event).
    const event = (draft.events ?? [])[0]!;
    const targetId = draft.target_event_id as string;
    appliedEventIds.push(targetId);
    const row = mapDraftEventToEventRow(event, targetId, profileMonth);
    queries.push(db`
      update calendar_events set
        label = ${row.label},
        amount = ${row.amount},
        day = ${row.day},
        kind = ${row.kind},
        payment_type = ${row.paymentType},
        status = ${row.status},
        confidence = ${row.confidence},
        reviewed = ${row.reviewed},
        note = ${row.note},
        recurring = ${row.recurring},
        recurrence_interval_months = ${row.recurrenceIntervalMonths},
        month_offset = ${row.monthOffset}
      where profile_id = ${existing.profileId} and id = ${targetId}
    `);
  } else {
    const targetId = draft.target_event_id as string;
    appliedEventIds.push(targetId);
    queries.push(db`delete from calendar_events where profile_id = ${existing.profileId} and id = ${targetId}`);
  }

  queries.push(db`
    update calendar_drafts set status = 'confirmed', confirmed_at = now(), applied_event_ids = ${JSON.stringify(appliedEventIds)}::jsonb
    where draft_id = ${draftId} and status = 'pending'
  `);

  // Atomic: the calendar_events mutation and the draft's status transition
  // either both land or neither does.
  await db.transaction(queries as any);

  return { outcome: 'confirmed', appliedEventIds, alreadyApplied: false };
}
