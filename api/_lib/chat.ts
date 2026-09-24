// Deterministic gate first (whole-word intent classification — never a
// substring match), then a small, bounded, tool-using Gemini agent for
// everything the gate lets through. Gemini never performs financial
// arithmetic itself and never writes to the calendar directly — it only
// calls read tools backed by the deterministic finance engine, and can
// propose a change via create_calendar_draft, which only ever produces a
// *pending* draft (see tools.ts / drafts-repository.ts).
import { randomUUID } from 'node:crypto';
import { buildCalendarForecast, buildMoneyCalendar, type EventRow, type ProfileRow } from './finance-engine.js';
import { callGemini, GeminiError, type GeminiContent } from './gemini.js';
import { classifyIntentWithHistory, isUnderspecifiedAddRequest } from './intent.js';
import { loadSkill } from './skill.js';
import { ALL_TOOLS, READ_TOOLS, executeTool, type ToolExecution } from './tools.js';
import { extractNumbers, findUnsupportedMonetaryClaims } from './number-guard.js';
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

// Distinct from GeminiError (network/API/timeout failure): this fires when
// Gemini DID answer, but the reply contained an AED figure the number
// guard couldn't verify. api/chat.ts responds to each with a different,
// honest message instead of collapsing both into "couldn't reach the
// planner" — that message should only ever mean the model call itself
// failed.
export class UnsupportedClaimError extends Error {}

export async function answerChatMessage(
  message: string,
  history: ChatHistoryItem[],
  profile: ProfileRow,
  events: EventRow[],
  sourceMessageId: string = randomUUID(),
): Promise<ChatResult> {
  const trimmed = message.trim().slice(0, MAX_MESSAGE_LENGTH);
  // History-aware: restores calendar_change for a follow-up answer to an
  // earlier unresolved add/remove request (see intent.ts), without the
  // user repeating "add"/"remove".
  const intent = classifyIntentWithHistory(trimmed, history);

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
      text: "Loan eligibility and rent-vs-buy aren't calculated from your data in this chat yet — the Loan and Rent-vs-buy pages show a sample walkthrough, not a live calculation.",
      card: { type: 'unavailable', capability: 'loan-or-rent-vs-buy' },
    };
  }

  if (intent === 'decline') {
    return {
      text: "That's outside what I can compute from your calendar yet. Ask about safe-to-spend, your tight month, upcoming commitments, or propose a calendar change.",
      card: { type: 'decline' },
    };
  }

  // A fresh "add" request with no amount/date yet ("Add an expense to my
  // calendar.") is deliberately answered with a fixed, figure-free
  // clarification instead of being sent to Gemini at all. Gemini's own
  // free-text clarifying reply to a request this open-ended has, in
  // practice, sometimes included an illustrative example figure ("...the
  // amount, e.g. AED 500"), which the number guard below then correctly
  // rejects as unverified — a real financial answer never gets weaker
  // guarding, but this specific turn never needs to risk one at all. Once
  // the user replies with real details, classifyIntentWithHistory restores
  // calendar_change for that follow-up and it goes to Gemini normally.
  if (intent === 'calendar_change' && isUnderspecifiedAddRequest(trimmed)) {
    return {
      text: "To add this, I need a few details: the amount in AED, the date (or start date if it repeats), whether it's one-time or recurring (monthly, quarterly, or yearly), and whether it's income or an expense. For an expense, let me know if it's expected, discretionary, or an emergency.",
      card: { type: 'answer', source: 'deterministic' },
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
    'When asking which event to remove, list the candidates by name and date only — amounts are not needed to choose.',
    `Convert relative dates ("today", "tomorrow", "Friday", "this weekend", "end of month") using the demo date ${profile.month}-${String(profile.asOfDay).padStart(2, '0')}, never the real calendar date.`,
  ].join('\n');

  const boundedHistory = history
    .slice(-MAX_HISTORY)
    .map((h) => `${h.role}: ${h.content.slice(0, MAX_MESSAGE_LENGTH)}`)
    .join('\n');
  const prompt = boundedHistory ? `${boundedHistory}\nuser: ${trimmed}` : trimmed;

  const contents: GeminiContent[] = [{ role: 'user', parts: [{ text: prompt }] }];

  let finalText: string | undefined;
  let draftCreated: ToolExecution['draftCreated'];
  // Monetary values the tools actually handed Gemini this turn (event
  // amounts from the event list, a draft's amount and impact) — trusted
  // because they came from the database/engine, and scoped to this turn so
  // an amount Gemini never saw can't be claimed.
  const toolAmounts: number[] = [];

  try {
    for (let turn = 0; turn < MAX_TOOL_CALLS; turn += 1) {
      const modelContent = await callGemini(systemInstruction, contents, tools);
      contents.push(modelContent);

      const callPart = modelContent.parts.find((p) => p.functionCall)?.functionCall;
      if (!callPart) {
        finalText = modelContent.parts.map((p) => p.text ?? '').join('').trim();
        break;
      }

      // At most one draft per assistant turn: once a draft exists, refuse a
      // second create_calendar_draft call rather than executing it — this
      // stops a second pending row from ever being written (and left
      // orphaned, since only the first draft's card is ever shown).
      if (callPart.name === 'create_calendar_draft' && draftCreated) {
        contents.push({
          role: 'user',
          parts: [{ functionResponse: { name: callPart.name, response: { ok: false, error: 'A draft was already created this turn. Only one draft may be proposed per response — tell the user about the existing draft instead.' } } }],
        });
        continue;
      }

      const execution = await executeTool(callPart.name, callPart.args, { profile, events, sourceMessageId });
      toolAmounts.push(...execution.amounts);
      if (execution.draftCreated) draftCreated = execution.draftCreated;
      // See gemini.ts's GeminiContent comment: this model wants the tool
      // result back as role "user", not the conventional "function" role.
      contents.push({ role: 'user', parts: [{ functionResponse: { name: callPart.name, response: execution.result } }] });
    }
  } catch (err) {
    // A validated draft already exists and its card needs nothing further
    // from Gemini — show it with server-written text rather than failing
    // the whole turn (which would leave the user a pending draft they
    // never saw). Without a draft, the error propagates as before.
    if (draftCreated) return draftResponse(draftCreated, undefined);
    throw err;
  }

  if (!finalText) {
    if (draftCreated) return draftResponse(draftCreated, undefined);
    throw new GeminiError('Gemini did not produce a final answer within the tool-call limit.');
  }

  // Defense in depth: the system prompt and skill both say never to invent
  // a number, but a prompt is not a guarantee. Allowed: engine figures,
  // figures a tool returned this turn (e.g. an event's amount from the
  // event list, a draft's impact), and figures the user typed — in this
  // message or an earlier user turn (e.g. an amount given two turns ago in
  // the same clarification). Assistant turns are never a source.
  const userNumbers = [trimmed, ...history.slice(-MAX_HISTORY).filter((h) => h.role === 'user').map((h) => h.content)].flatMap(extractNumbers);
  const unsupported = findUnsupportedMonetaryClaims(finalText, [...monetaryAmounts, ...toolAmounts, ...userNumbers]);
  if (unsupported.length > 0) {
    // With a valid draft, drop Gemini's text (the unverified figure is
    // never shown) and describe the draft from its own validated fields.
    if (draftCreated) return draftResponse(draftCreated, undefined);
    throw new UnsupportedClaimError(`Gemini response contained unsupported monetary claim(s): ${unsupported.join(', ')}`);
  }

  if (draftCreated) return draftResponse(draftCreated, finalText);
  return { text: finalText, card: { type: 'answer', source: 'gemini' } };
}

const CONFIRM_SENTENCE = 'Nothing changes until you confirm in the app.';
const money = (n: number) => n.toLocaleString('en-US', { maximumFractionDigits: 2 });

// Every draft reply ends with CONFIRM_SENTENCE, whoever wrote the rest: it
// is how intent.ts recognises from plain-text history that this request is
// complete and must not be reopened by a later short reply.
function draftResponse(created: NonNullable<ToolExecution['draftCreated']>, geminiText: string | undefined): ChatResult {
  const d = created.draft;
  const e = d.events?.[0];
  const serverText =
    d.action === 'delete'
      ? `I've prepared a draft to remove ${created.target?.label ?? 'this event'}${created.target ? ` (AED ${money(created.target.amount)})` : ''}.`
      : e
        ? `I've prepared a draft to add ${e.name}: ${e.direction === 'credit' ? 'income' : 'an expense'} of AED ${money(e.amount_aed)}, ${e.recurrence === 'none' ? 'one-time on' : `${e.recurrence} from`} ${e.date}.`
        : "I've prepared a draft.";
  const body = geminiText?.trim() || serverText;
  return {
    text: body.includes(CONFIRM_SENTENCE) ? body : `${body} ${CONFIRM_SENTENCE}`,
    card: {
      type: 'calendar_draft',
      draftId: d.draft_id,
      action: d.action,
      targetEventId: d.target_event_id,
      targetEventLabel: created.target?.label,
      events: (d.events ?? []).map((ev) => ({ name: ev.name, amountAed: ev.amount_aed, direction: ev.direction, date: ev.date, recurrence: ev.recurrence, category: ev.category, note: ev.note })),
      reason: d.reason,
      impact: created.impact,
    },
  };
}
