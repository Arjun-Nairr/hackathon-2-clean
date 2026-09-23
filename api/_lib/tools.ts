// The internal, typed tool registry Gemini can select from. Gemini only
// ever *picks* a tool by name and arguments; this module is the only place
// a tool is actually executed. Read tools reuse the same finance engine
// and repository data every other endpoint uses — no calculation is
// duplicated here.
import { randomUUID } from 'node:crypto';
import { buildCalendarForecast, buildMoneyCalendar, type EventRow, type ProfileRow } from './finance-engine.js';
import { validateCalendarChangeDraft, type CalendarChangeDraft } from './draft-schema.js';
import { insertPendingDraft } from './drafts-repository.js';
import { mapDraftEventToEventRow } from './draft-mapping.js';
import type { GeminiToolDeclaration } from './gemini.js';

const eventParameters = {
  type: 'object',
  properties: {
    name: { type: 'string', description: 'Short label for the event, e.g. "Annual bonus".' },
    amount_aed: { type: 'number', description: 'Positive AED amount.' },
    direction: { type: 'string', enum: ['debit', 'credit'], description: '"credit" for income, "debit" for an expense.' },
    date: { type: 'string', description: 'ISO date YYYY-MM-DD. For a recurring item, its first occurrence.' },
    recurrence: { type: 'string', enum: ['none', 'monthly', 'quarterly', 'yearly'] },
    category: { type: 'string', description: 'Short category, e.g. "salary", "housing", "school".' },
    note: {
      type: 'string',
      description:
        'Optional. For an expense whose classification is not obvious from its category, start this with "Classification: expected", "Classification: discretionary", or "Classification: emergency" followed by any other detail. Skip for income.',
    },
  },
  required: ['name', 'amount_aed', 'direction', 'date', 'recurrence', 'category'],
};

export const READ_TOOLS: GeminiToolDeclaration[] = [
  {
    name: 'get_financial_snapshot',
    description: 'Current balance, safe-to-spend, daily allowance, buffer, and payday for the signed-in user.',
    parameters: { type: 'object', properties: {} },
  },
  {
    name: 'get_calendar_forecast',
    description: 'The 12-month projection: month-end balances and the single tightest/lowest point in the horizon.',
    parameters: { type: 'object', properties: {} },
  },
  {
    name: 'list_upcoming_commitments',
    description: 'Every recorded income and expense event for the exemplar month, with its event id and whether it is still upcoming. Call this before proposing a removal to find the exact id.',
    parameters: { type: 'object', properties: {} },
  },
];

// Only "add" and "delete" — this app's model-exposed calendar-write surface
// deliberately has no "update"/reschedule action. To change an existing
// event's amount or date, remove it and add the replacement as two
// separate proposals. The database and validator still understand "update"
// (see draft-schema.ts, apply-draft.ts) for compatibility, but Gemini is
// never offered it here.
export const CREATE_DRAFT_TOOL: GeminiToolDeclaration = {
  name: 'create_calendar_draft',
  description:
    'Propose adding or deleting a calendar income or expense event. This only creates a pending draft — it never writes to the calendar. Only call this once every required field is known; otherwise ask the user for the missing one instead. There is no update/reschedule action: to change an existing event, propose deleting it and adding the replacement.',
  parameters: {
    type: 'object',
    properties: {
      action: { type: 'string', enum: ['add', 'delete'] },
      target_event_id: { type: 'string', description: 'Required for "delete": the existing event id from list_upcoming_commitments. Never invent one — if you are not sure of the id, call list_upcoming_commitments first.' },
      events: { type: 'array', items: eventParameters, description: 'Required for "add": exactly 1 item — one expense or income source per draft. Omit for "delete".' },
      reason: { type: 'string', description: 'One short sentence describing the change, echoing what the user asked for.' },
    },
    required: ['action', 'reason'],
  },
};

export const ALL_TOOLS: GeminiToolDeclaration[] = [...READ_TOOLS, CREATE_DRAFT_TOOL];

export interface ToolContext {
  profile: ProfileRow;
  events: EventRow[];
  sourceMessageId: string;
}

export interface DraftImpact {
  metricLabel: string;
  before: number;
  after: number;
}

export interface ToolExecution {
  result: Record<string, unknown>;
  draftCreated?: { draftId: string; draft: CalendarChangeDraft; impact: DraftImpact };
}

// Which month key (e.g. "2026-10") a month_offset from profile.month falls
// in — same convention finance-engine.ts's forecast uses for its
// `monthEnd` keys, so a preview computed here always finds the right entry.
function monthKeyForOffset(profileMonth: string, offset: number): string {
  const [y, m] = profileMonth.split('-').map(Number);
  const date = new Date(Date.UTC(y, m - 1 + offset, 1));
  return `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, '0')}`;
}

// The financial impact of a validated add/delete draft, computed purely by
// running the same deterministic finance engine twice — once on the
// current events, once on a hypothetical list with the draft applied.
// Never calculated in React or by Gemini. If the affected month is the
// exemplar's own month, "safe to spend until payday" is the clearest
// signal; otherwise (a future-month addition, or deleting a future event)
// that month's projected month-end balance is, since safe-to-spend
// wouldn't move at all for a change outside the current month.
function computeDraftImpact(profile: ProfileRow, events: EventRow[], draft: CalendarChangeDraft): DraftImpact {
  const before = buildMoneyCalendar(profile, events);
  const beforeForecast = buildCalendarForecast(profile, events);

  let hypotheticalEvents: EventRow[];
  let monthOffset = 0;

  if (draft.action === 'delete') {
    const target = events.find((e) => e.id === draft.target_event_id);
    monthOffset = target?.monthOffset ?? 0;
    hypotheticalEvents = events.filter((e) => e.id !== draft.target_event_id);
  } else {
    const newRow = mapDraftEventToEventRow((draft.events ?? [])[0]!, `preview-${draft.draft_id}`, profile.month);
    monthOffset = newRow.monthOffset;
    hypotheticalEvents = [...events, newRow];
  }

  const after = buildMoneyCalendar(profile, hypotheticalEvents);

  if (monthOffset === 0) {
    return { metricLabel: 'Safe to spend until payday', before: before.financialSnapshot.safeToSpendUntilPayday, after: after.financialSnapshot.safeToSpendUntilPayday };
  }
  const afterForecast = buildCalendarForecast(profile, hypotheticalEvents);
  const key = monthKeyForOffset(profile.month, monthOffset);
  return {
    metricLabel: `${key} projected month-end balance`,
    before: beforeForecast.monthEnd[key] ?? beforeForecast.openingBalance,
    after: afterForecast.monthEnd[key] ?? afterForecast.openingBalance,
  };
}

export async function executeTool(name: string, args: unknown, ctx: ToolContext): Promise<ToolExecution> {
  const calendar = buildMoneyCalendar(ctx.profile, ctx.events);
  const forecast = buildCalendarForecast(ctx.profile, ctx.events);

  switch (name) {
    case 'get_financial_snapshot':
      return {
        result: {
          ...calendar.financialSnapshot,
          dailyAllowance: calendar.dailyAllowance,
          daysLeft: calendar.daysLeft,
          nextPaydayDate: calendar.nextPaydayDate,
          tightDay: calendar.tightDay,
        },
      };

    case 'get_calendar_forecast':
      return {
        result: {
          lowestPoint: forecast.lowestPoint,
          monthEnd: forecast.monthEnd,
          horizonMonths: forecast.horizonMonths,
          nextSalaryDate: forecast.nextSalaryDate,
        },
      };

    case 'list_upcoming_commitments': {
      const upcomingIds = new Set(calendar.upcomingCommitments.map((e) => e.id));
      return {
        result: {
          events: calendar.events.map((e) => ({ id: e.id, label: e.label, amount: e.amount, day: e.day, kind: e.kind, upcoming: upcomingIds.has(e.id) })),
        },
      };
    }

    case 'create_calendar_draft': {
      const rawArgs = typeof args === 'object' && args !== null ? (args as Record<string, unknown>) : {};

      // Defense in depth: the tool's own parameter enum only offers
      // "add"/"delete" (see CREATE_DRAFT_TOOL above), but nothing stops a
      // model from sending "update" anyway. Refuse it here too rather than
      // silently falling through to the validator, which would still
      // accept "update" for schema/database compatibility.
      if (rawArgs.action !== 'add' && rawArgs.action !== 'delete') {
        return { result: { ok: false, error: 'action must be "add" or "delete" — there is no update/reschedule action. Delete the event and add its replacement instead.' } };
      }

      // Never invent an event id: a "delete" must name a real, currently
      // recorded event, checked against the same data list_upcoming_
      // commitments just read from.
      if (rawArgs.action === 'delete') {
        const targetId = typeof rawArgs.target_event_id === 'string' ? rawArgs.target_event_id : undefined;
        if (!targetId || !ctx.events.some((e) => e.id === targetId)) {
          return { result: { ok: false, error: `No recorded event with id "${targetId ?? ''}". Call list_upcoming_commitments to find the correct id, or tell the user no matching event was found.` } };
        }
      }

      // Exactly one expense/income at a time — this app's calendar-change
      // capability is "add an expense", "add an income source", not batch
      // entry. The JSON schema/validator still allow up to 12 (compat),
      // but the model-exposed tool is narrower.
      if (rawArgs.action === 'add' && (!Array.isArray(rawArgs.events) || rawArgs.events.length !== 1)) {
        return { result: { ok: false, error: 'action "add" must propose exactly one event. Propose one expense or income source per draft.' } };
      }

      // draft_id, requires_confirmation, and source_message_id are always
      // server-assigned — Gemini only ever supplies the proposed change
      // itself (action/target/events/reason).
      const candidate = {
        ...rawArgs,
        draft_id: randomUUID(),
        requires_confirmation: true as const,
        source_message_id: ctx.sourceMessageId,
      };
      const validated = validateCalendarChangeDraft(candidate);
      if (!validated.valid) {
        return { result: { ok: false, errors: validated.errors } };
      }
      await insertPendingDraft(ctx.profile.id, validated.draft);
      const impact = computeDraftImpact(ctx.profile, ctx.events, validated.draft);
      return {
        result: { ok: true, draft_id: validated.draft.draft_id, status: 'pending', impact },
        draftCreated: { draftId: validated.draft.draft_id, draft: validated.draft, impact },
      };
    }

    default:
      return { result: { ok: false, error: `Unsupported tool: ${name}` } };
  }
}
