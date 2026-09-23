// Deterministic gate first (whole-word intent classification — never a
// substring match), then a small, bounded, tool-using Gemini agent for
// everything the gate lets through. Gemini never performs financial
// arithmetic itself and never writes to the calendar directly — it only
// calls read tools backed by the deterministic finance engine, and can
// propose a change via create_calendar_draft, which only ever produces a
// *pending* draft (see tools.ts / drafts-repository.ts).
import { randomUUID } from 'node:crypto';
import { buildCalendarForecast, buildMoneyCalendar, type EventRow, type ProfileRow } from './finance-engine';
import { callGemini, GeminiError, type GeminiContent } from './gemini';
import { classifyIntent } from './intent';
import { loadSkill } from './skill';
import { ALL_TOOLS, READ_TOOLS, executeTool, type ToolExecution } from './tools';
import { extractNumbers, findUnsupportedMonetaryClaims } from './number-guard';
import type { ChatCard, ChatHistoryItem } from '../../src/lib/api/types';

const MAX_HISTORY = 6;
const MAX_MESSAGE_LENGTH = 500;
// A read answer needs at most one tool call; a calendar change needs at
// most a couple (e.g. list commitments to find a target id, then propose
// the draft). Capped well below "unbounded" either way.
const MAX_TOOL_CALLS = 4;

export interface ChatResult {
  text: string;
  card: ChatCard;
}

export async function answerChatMessage(
  message: string,
  history: ChatHistoryItem[],
  profile: ProfileRow,
  events: EventRow[],
  sourceMessageId: string = randomUUID(),
): Promise<ChatResult> {
  const trimmed = message.trim().slice(0, MAX_MESSAGE_LENGTH);
  const intent = classifyIntent(trimmed);

  // Missing-data check: this bundle has no goals table yet, so a goal
  // question is answered honestly rather than guessed or sent to Gemini.
  if (intent === 'missing_data') {
    return {
      text: "I don't have goal data connected yet, so I can't answer that.",
      card: { type: 'missing_data', fields: [{ key: 'goals', label: 'Savings goals', how: 'Goal tracking is not connected to your calendar yet in this build.' }] },
    };
  }

  // Loan and rent-vs-buy still have no backend capability behind this chat
  // — declared unavailable deterministically, same as the missing-data and
  // decline checks, never sent to Gemini.
  if (intent === 'unavailable') {
    return {
      text: "Loan eligibility and rent-vs-buy aren't connected to this chat yet — use the Loan and Rent-vs-buy pages for those.",
      card: { type: 'unavailable', capability: 'loan-or-rent-vs-buy' },
    };
  }

  if (intent === 'decline') {
    return {
      text: "That's outside what I can compute from your calendar yet. Ask about safe-to-spend, your tight month, upcoming commitments, or propose a calendar change.",
      card: { type: 'decline' },
    };
  }

  // intent is 'read' or 'calendar_change' from here — both go through the
  // tool-using Gemini agent below.
  const calendar = buildMoneyCalendar(profile, events);
  const forecast = buildCalendarForecast(profile, events);
  const skill = loadSkill();

  // Every genuinely monetary figure any read tool could hand back to
  // Gemini — not just the handful a fixed context blob used to include.
  // Since the tools now expose the full snapshot/forecast, the allow-list
  // has to cover the same surface, or a real, tool-sourced figure (e.g.
  // the emergency buffer) would wrongly get flagged as "unsupported".
  const monetaryAmounts: number[] = [
    calendar.financialSnapshot.currentAvailableBalance,
    calendar.financialSnapshot.expectedIncomeBeforeNextPayday,
    calendar.financialSnapshot.billsAndCommitmentsDueBeforeNextPayday,
    calendar.financialSnapshot.minimumDebtPayments,
    calendar.financialSnapshot.plannedGoalContributions,
    calendar.financialSnapshot.recommendedEmergencyBuffer,
    calendar.financialSnapshot.safeToSpendUntilPayday,
    calendar.dailyAllowance,
    ...calendar.upcomingCommitments.map((e) => e.amount),
    forecast.lowestPoint.balance,
    ...Object.values(forecast.monthEnd),
  ];

  const tools = intent === 'calendar_change' ? ALL_TOOLS : READ_TOOLS;

  const systemInstruction = [
    skill,
    '---',
    'Runtime rules for this deployment, in addition to everything above:',
    'Always write every monetary amount as "AED <number>" (e.g. "AED 9,450"), never a bare number.',
    `Today is day ${profile.asOfDay} of the fixed demo exemplar month ${profile.month} — never claim this is the real current date.`,
    'Keep the answer under 80 words, plain and direct.',
    'When proposing a calendar change, a short generic name derived from its category (e.g. "Monthly expense", "Rent payment") is enough — the amount, direction, date, and recurrence are the fields worth asking about if missing; do not ask the user to invent a name for it.',
  ].join('\n');

  const boundedHistory = history
    .slice(-MAX_HISTORY)
    .map((h) => `${h.role}: ${h.content.slice(0, MAX_MESSAGE_LENGTH)}`)
    .join('\n');
  const prompt = boundedHistory ? `${boundedHistory}\nuser: ${trimmed}` : trimmed;

  const contents: GeminiContent[] = [{ role: 'user', parts: [{ text: prompt }] }];

  let finalText: string | undefined;
  let draftCreated: ToolExecution['draftCreated'];

  for (let turn = 0; turn < MAX_TOOL_CALLS; turn += 1) {
    const modelContent = await callGemini(systemInstruction, contents, tools);
    contents.push(modelContent);

    const callPart = modelContent.parts.find((p) => p.functionCall)?.functionCall;
    if (!callPart) {
      finalText = modelContent.parts.map((p) => p.text ?? '').join('').trim();
      break;
    }

    const execution = await executeTool(callPart.name, callPart.args, { profile, events, sourceMessageId });
    if (execution.draftCreated) draftCreated = execution.draftCreated;
    // See gemini.ts's GeminiContent comment: this model wants the tool
    // result back as role "user", not the conventional "function" role.
    contents.push({ role: 'user', parts: [{ functionResponse: { name: callPart.name, response: execution.result } }] });
  }

  if (!finalText) {
    throw new GeminiError('Gemini did not produce a final answer within the tool-call limit.');
  }

  // Defense in depth: the system prompt and skill both say never to invent
  // a number, but a prompt is not a guarantee. For a calendar_change turn,
  // the allow-list also includes numbers the user themselves supplied (a
  // proposed amount is a fact, not something Gemini invented) and the
  // amounts in any draft that got created.
  const allowList =
    intent === 'calendar_change'
      ? [...monetaryAmounts, ...extractNumbers(trimmed), ...(draftCreated?.draft.events?.map((e) => e.amount_aed) ?? [])]
      : monetaryAmounts;

  const unsupported = findUnsupportedMonetaryClaims(finalText, allowList);
  if (unsupported.length > 0) {
    throw new GeminiError(`Gemini response contained unsupported monetary claim(s): ${unsupported.join(', ')}`);
  }

  if (draftCreated) {
    const d = draftCreated.draft;
    return {
      text: finalText,
      card: {
        type: 'calendar_draft',
        draftId: d.draft_id,
        action: d.action,
        targetEventId: d.target_event_id,
        events: (d.events ?? []).map((e) => ({ name: e.name, amountAed: e.amount_aed, direction: e.direction, date: e.date, recurrence: e.recurrence, category: e.category, note: e.note })),
        reason: d.reason,
      },
    };
  }

  return { text: finalText, card: { type: 'answer', source: 'gemini' } };
}
