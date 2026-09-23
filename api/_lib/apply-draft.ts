// Applies a *confirmed* calendar-change draft to `calendar_events`. Only
// this module — reached only from the application's own confirm endpoint —
// ever writes calendar_events for a chat-proposed change; chat text never
// does, and a pending draft alone never does either.
import { sql } from './db.js';
import { getDraft } from './drafts-repository.js';
import { validateCalendarChangeDraft, type CalendarChangeDraft, type DraftEvent } from './draft-schema.js';

function recurrenceToIntervalMonths(recurrence: DraftEvent['recurrence']): number {
  if (recurrence === 'monthly') return 1;
  if (recurrence === 'quarterly') return 3;
  if (recurrence === 'yearly') return 12;
  return 1; // "none": one-time, interval is unused since `recurring` is false.
}

// Day-of-month plus how many months ahead of `profiles.month` that date
// falls — e.g. "2026-10-01" against exemplar month "2026-09" is day 1,
// month_offset 1.
function dateToDayAndMonthOffset(dateIso: string, profileMonth: string): { day: number; monthOffset: number } {
  const [y, m, d] = dateIso.split('-').map(Number);
  const [py, pm] = profileMonth.split('-').map(Number);
  return { day: d, monthOffset: y * 12 + m - (py * 12 + pm) };
}

// ponytail: slug + timestamp, not a UUID — good enough for one demo
// household's event ids; swap for crypto.randomUUID() if ids ever need to
// be opaque or collision-proof under high concurrency.
function slugify(name: string): string {
  const base = name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/(^-|-$)/g, '');
  return `${base || 'event'}-${Date.now().toString(36)}`;
}

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
      const { day, monthOffset } = dateToDayAndMonthOffset(event.date, profileMonth);
      const id = slugify(event.name);
      appliedEventIds.push(id);
      const kind = event.direction === 'credit' ? 'income' : 'commitment';
      const recurring = event.recurrence !== 'none';
      queries.push(db`
        insert into calendar_events (profile_id, id, label, amount, day, kind, payment_type, status, confidence, amount_type, account_name, reviewed, note, recurring, recurrence_interval_months, month_offset)
        values (${existing.profileId}, ${id}, ${event.name}, ${event.amount_aed}, ${day}, ${kind}, ${event.category}, 'actual', 'high', 'fixed', 'Main current account', true, ${event.note ?? null}, ${recurring}, ${recurrenceToIntervalMonths(event.recurrence)}, ${monthOffset})
      `);
    }
  } else if (draft.action === 'update') {
    // Guaranteed present by validateCalendarChangeDraft's "update" rule
    // (exactly one event).
    const event = (draft.events ?? [])[0]!;
    const targetId = draft.target_event_id as string;
    appliedEventIds.push(targetId);
    const { day, monthOffset } = dateToDayAndMonthOffset(event.date, profileMonth);
    const kind = event.direction === 'credit' ? 'income' : 'commitment';
    const recurring = event.recurrence !== 'none';
    queries.push(db`
      update calendar_events set
        label = ${event.name},
        amount = ${event.amount_aed},
        day = ${day},
        kind = ${kind},
        payment_type = ${event.category},
        status = 'actual',
        confidence = 'high',
        reviewed = true,
        note = ${event.note ?? null},
        recurring = ${recurring},
        recurrence_interval_months = ${recurrenceToIntervalMonths(event.recurrence)},
        month_offset = ${monthOffset}
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
