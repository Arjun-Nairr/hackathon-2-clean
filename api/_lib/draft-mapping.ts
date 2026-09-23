// Shared mapping between a validated calendar-change draft event and the
// calendar_events row shape it becomes. Used both when a confirmed draft
// is actually written (apply-draft.ts) and when a pending draft's
// financial impact is previewed before confirmation (tools.ts), so the
// preview and the real write can never drift apart.
import type { DraftEvent } from './draft-schema.js';
import type { EventRow } from './finance-engine.js';

export function recurrenceToIntervalMonths(recurrence: DraftEvent['recurrence']): number {
  if (recurrence === 'monthly') return 1;
  if (recurrence === 'quarterly') return 3;
  if (recurrence === 'yearly') return 12;
  return 1; // "none": one-time, interval is unused since `recurring` is false.
}

// Day-of-month plus how many months ahead of `profiles.month` that date
// falls — e.g. "2026-10-01" against exemplar month "2026-09" is day 1,
// month_offset 1.
export function dateToDayAndMonthOffset(dateIso: string, profileMonth: string): { day: number; monthOffset: number } {
  const [y, m, d] = dateIso.split('-').map(Number);
  const [py, pm] = profileMonth.split('-').map(Number);
  return { day: d, monthOffset: y * 12 + m - (py * 12 + pm) };
}

// ponytail: slug + timestamp, not a UUID — good enough for one demo
// household's event ids; swap for crypto.randomUUID() if ids ever need to
// be opaque or collision-proof under high concurrency.
export function slugify(name: string): string {
  const base = name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/(^-|-$)/g, '');
  return `${base || 'event'}-${Date.now().toString(36)}`;
}

export function mapDraftEventToEventRow(event: DraftEvent, id: string, profileMonth: string): EventRow {
  const { day, monthOffset } = dateToDayAndMonthOffset(event.date, profileMonth);
  return {
    id,
    label: event.name,
    amount: event.amount_aed,
    day,
    kind: event.direction === 'credit' ? 'income' : 'commitment',
    paymentType: event.category,
    status: 'actual',
    confidence: 'high',
    amountType: 'fixed',
    accountName: 'Main current account',
    reviewed: true,
    note: event.note ?? null,
    recurring: event.recurrence !== 'none',
    recurrenceIntervalMonths: recurrenceToIntervalMonths(event.recurrence),
    monthOffset,
  };
}
