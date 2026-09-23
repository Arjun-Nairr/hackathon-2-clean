// Hand-written mirror of the authoritative, immutable
// `agent/uae-finance-planner/schemas/calendar-change-draft.schema.json`.
// That file is treated as a fixed input (Codex owns it) rather than
// something this app parses generically with a JSON-Schema library — the
// shape is small and fixed, so a direct validator is simpler than adding a
// schema-engine dependency for one shape. If the two ever disagree, the
// JSON file is the one that's right; update this function to match it, not
// the other way around.
export interface DraftEvent {
  name: string;
  amount_aed: number;
  direction: 'debit' | 'credit';
  date: string;
  recurrence: 'none' | 'monthly' | 'quarterly' | 'yearly';
  category: string;
  note?: string;
}

export interface CalendarChangeDraft {
  draft_id: string;
  action: 'add' | 'update' | 'delete';
  target_event_id?: string;
  events?: DraftEvent[];
  reason: string;
  requires_confirmation: true;
  source_message_id: string;
}

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const EVENT_KEYS = new Set(['name', 'amount_aed', 'direction', 'date', 'recurrence', 'category', 'note']);
const DRAFT_KEYS = new Set(['draft_id', 'action', 'target_event_id', 'events', 'reason', 'requires_confirmation', 'source_message_id']);

function validateEvent(raw: unknown, index: number, errors: string[]): DraftEvent | null {
  if (!raw || typeof raw !== 'object') {
    errors.push(`events[${index}] must be an object`);
    return null;
  }
  const e = raw as Record<string, unknown>;
  for (const key of Object.keys(e)) {
    if (!EVENT_KEYS.has(key)) errors.push(`events[${index}] has unexpected field "${key}"`);
  }
  if (typeof e.name !== 'string' || e.name.length < 1 || e.name.length > 80) errors.push(`events[${index}].name must be 1-80 characters`);
  if (typeof e.amount_aed !== 'number' || !(e.amount_aed > 0)) errors.push(`events[${index}].amount_aed must be a positive number`);
  if (e.direction !== 'debit' && e.direction !== 'credit') errors.push(`events[${index}].direction must be "debit" or "credit"`);
  if (typeof e.date !== 'string' || !DATE_RE.test(e.date)) errors.push(`events[${index}].date must be an ISO date (YYYY-MM-DD)`);
  if (!['none', 'monthly', 'quarterly', 'yearly'].includes(e.recurrence as string)) errors.push(`events[${index}].recurrence must be none, monthly, quarterly, or yearly`);
  if (typeof e.category !== 'string' || e.category.length < 1 || e.category.length > 64) errors.push(`events[${index}].category must be 1-64 characters`);
  if (e.note !== undefined && (typeof e.note !== 'string' || e.note.length > 240)) errors.push(`events[${index}].note must be at most 240 characters`);
  return e as unknown as DraftEvent;
}

export function validateCalendarChangeDraft(input: unknown): { valid: true; draft: CalendarChangeDraft } | { valid: false; errors: string[] } {
  const errors: string[] = [];
  if (!input || typeof input !== 'object') {
    return { valid: false, errors: ['draft must be an object'] };
  }
  const d = input as Record<string, unknown>;

  for (const key of Object.keys(d)) {
    if (!DRAFT_KEYS.has(key)) errors.push(`unexpected field "${key}"`);
  }

  if (typeof d.draft_id !== 'string' || d.draft_id.length < 8) errors.push('draft_id must be a string of at least 8 characters');
  if (d.action !== 'add' && d.action !== 'update' && d.action !== 'delete') errors.push('action must be "add", "update", or "delete"');
  if (d.target_event_id !== undefined && (typeof d.target_event_id !== 'string' || d.target_event_id.length < 1)) {
    errors.push('target_event_id must be a non-empty string');
  }
  if (typeof d.reason !== 'string' || d.reason.length < 1 || d.reason.length > 240) errors.push('reason must be 1-240 characters');
  if (d.requires_confirmation !== true) errors.push('requires_confirmation must be true');
  if (typeof d.source_message_id !== 'string' || d.source_message_id.length < 1) errors.push('source_message_id must be a non-empty string');

  let events: DraftEvent[] | undefined;
  if (d.events !== undefined) {
    if (!Array.isArray(d.events) || d.events.length > 12) {
      errors.push('events must be an array of at most 12 items');
    } else {
      events = [];
      d.events.forEach((raw, i) => {
        const validated = validateEvent(raw, i, errors);
        if (validated) events!.push(validated);
      });
    }
  }

  if (d.action === 'add') {
    if (!events || events.length < 1) errors.push('action "add" requires at least one event');
  } else if (d.action === 'update') {
    if (typeof d.target_event_id !== 'string' || !d.target_event_id) errors.push('action "update" requires target_event_id');
    if (!events || events.length !== 1) errors.push('action "update" requires exactly one event');
  } else if (d.action === 'delete') {
    if (typeof d.target_event_id !== 'string' || !d.target_event_id) errors.push('action "delete" requires target_event_id');
    if (events && events.length > 0) errors.push('action "delete" must not include events');
  }

  if (errors.length > 0) return { valid: false, errors };

  return {
    valid: true,
    draft: {
      draft_id: d.draft_id as string,
      action: d.action as 'add' | 'update' | 'delete',
      target_event_id: d.target_event_id as string | undefined,
      events,
      reason: d.reason as string,
      requires_confirmation: true,
      source_message_id: d.source_message_id as string,
    },
  };
}
