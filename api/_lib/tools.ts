// The internal, typed tool registry Gemini can select from. Gemini only
// ever *picks* a tool by name and arguments; this module is the only place
// a tool is actually executed. Read tools reuse the same finance engine
// and repository data every other endpoint uses — no calculation is
// duplicated here.
import { randomUUID } from 'node:crypto';
import { buildCalendarForecast, buildMoneyCalendar, type EventRow, type ProfileRow } from './finance-engine';
import { validateCalendarChangeDraft, type CalendarChangeDraft } from './draft-schema';
import { insertPendingDraft } from './drafts-repository';
import type { GeminiToolDeclaration } from './gemini';

const eventParameters = {
  type: 'object',
  properties: {
    name: { type: 'string', description: 'Short label for the event, e.g. "Annual bonus".' },
    amount_aed: { type: 'number', description: 'Positive AED amount.' },
    direction: { type: 'string', enum: ['debit', 'credit'], description: '"credit" for income, "debit" for an expense.' },
    date: { type: 'string', description: 'ISO date YYYY-MM-DD. For a recurring item, its first occurrence.' },
    recurrence: { type: 'string', enum: ['none', 'monthly', 'quarterly', 'yearly'] },
    category: { type: 'string', description: 'Short category, e.g. "salary", "housing", "school".' },
    note: { type: 'string' },
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
    description: 'Recorded income and expense events still ahead of the exemplar date, with their event ids.',
    parameters: { type: 'object', properties: {} },
  },
];

export const CREATE_DRAFT_TOOL: GeminiToolDeclaration = {
  name: 'create_calendar_draft',
  description:
    'Propose adding, updating, or deleting a calendar income or expense event. This only creates a pending draft — it never writes to the calendar. Only call this once every required field is known; otherwise ask the user for the missing one instead.',
  parameters: {
    type: 'object',
    properties: {
      action: { type: 'string', enum: ['add', 'update', 'delete'] },
      target_event_id: { type: 'string', description: 'Required for "update" and "delete": the existing event id from list_upcoming_commitments.' },
      events: { type: 'array', items: eventParameters, description: 'Required for "add" (>=1 item) and "update" (exactly 1 item). Omit for "delete".' },
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

export interface ToolExecution {
  result: Record<string, unknown>;
  draftCreated?: { draftId: string; draft: CalendarChangeDraft };
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

    case 'list_upcoming_commitments':
      return {
        result: {
          commitments: calendar.upcomingCommitments.map((e) => ({ id: e.id, label: e.label, amount: e.amount, day: e.day, kind: e.kind })),
        },
      };

    case 'create_calendar_draft': {
      // draft_id, requires_confirmation, and source_message_id are always
      // server-assigned — Gemini only ever supplies the proposed change
      // itself (action/target/events/reason).
      const candidate = {
        ...(typeof args === 'object' && args !== null ? args : {}),
        draft_id: randomUUID(),
        requires_confirmation: true as const,
        source_message_id: ctx.sourceMessageId,
      };
      const validated = validateCalendarChangeDraft(candidate);
      if (!validated.valid) {
        return { result: { ok: false, errors: validated.errors } };
      }
      await insertPendingDraft(ctx.profile.id, validated.draft);
      return {
        result: { ok: true, draft_id: validated.draft.draft_id, status: 'pending' },
        draftCreated: { draftId: validated.draft.draft_id, draft: validated.draft },
      };
    }

    default:
      return { result: { ok: false, error: `Unsupported tool: ${name}` } };
  }
}
