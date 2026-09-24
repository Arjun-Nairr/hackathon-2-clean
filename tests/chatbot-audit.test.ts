import { config } from "dotenv";
config({ path: ".env.local" });

import { test } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { answerChatMessage, UnsupportedClaimError } from "../api/_lib/chat";
import { classifyIntentWithHistory, type HistoryTurn } from "../api/_lib/intent";
import { executeTool } from "../api/_lib/tools";
import { sql } from "../api/_lib/db";
import type { EventRow } from "../api/_lib/finance-engine";
import { EVENTS, PROFILE } from "../db/seed-data";

const events = [...EVENTS] as unknown as EventRow[];

interface FakeTurn {
  text?: string;
  functionCall?: { name: string; args: Record<string, unknown> };
  fail?: number;
}

// Fakes only Gemini's REST endpoint; Neon's HTTP driver shares global fetch
// and must reach the real database so draft rows can be asserted.
function withFakeGemini<T>(turns: FakeTurn[], run: () => Promise<T>): Promise<T> {
  const original = globalThis.fetch;
  let call = 0;
  globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = typeof input === "string" ? input : input instanceof URL ? input.href : input.url;
    if (!url.includes("generativelanguage.googleapis.com")) return original(input, init);
    const turn = turns[Math.min(call, turns.length - 1)]!;
    call += 1;
    if (turn.fail) return new Response("upstream error", { status: turn.fail });
    const parts = turn.functionCall ? [{ functionCall: turn.functionCall }] : [{ text: turn.text ?? "" }];
    return new Response(JSON.stringify({ candidates: [{ content: { parts } }] }), { status: 200 });
  }) as typeof fetch;
  return run().finally(() => {
    globalThis.fetch = original;
  });
}

const LIST_CALL: FakeTurn = { functionCall: { name: "list_upcoming_commitments", args: {} } };
const REMOVE_PROMPT = "Remove an expense or income source from my calendar.";

async function cleanupBySource(sourceMessageId: string) {
  await sql()`delete from calendar_drafts where source_message_id = ${sourceMessageId}`;
}

// ---- Number guard: tool-backed amounts --------------------------------------

test("Remove item button: Gemini may list real event amounts returned by list_upcoming_commitments", async () => {
  const reply =
    "Which one should I remove? Rent cheque (AED 18,000), School term fees (AED 12,000), Car loan installment (AED 2,300), DEWA (AED 450), Groceries & essentials (AED 2,200), Credit card minimum (AED 600), or Salary (AED 25,000)?";
  const result = await withFakeGemini([LIST_CALL, { text: reply }], () => answerChatMessage(REMOVE_PROMPT, [], PROFILE, events));
  assert.equal(result.card.type, "answer");
  assert.equal(result.text, reply);
});

test("an invented figure is still rejected even after the event-list tool ran", async () => {
  await withFakeGemini([LIST_CALL, { text: "Which one? Rent cheque (AED 18,000) or the gym (AED 7,777)?" }], async () => {
    await assert.rejects(
      () => answerChatMessage(REMOVE_PROMPT, [], PROFILE, events),
      (err: unknown) => err instanceof UnsupportedClaimError && err.message.includes("7777"),
    );
  });
});

test("event amounts are not allowed when the event-list tool did not run (tool-scoped, not blanket)", async () => {
  await withFakeGemini([{ text: "Your safe-to-spend is AED 18,000." }], async () => {
    await assert.rejects(() => answerChatMessage("What's safe to spend today?", [], PROFILE, events), UnsupportedClaimError);
  });
});

test("a read answer may name the salary amount once the event list was consulted", async () => {
  const result = await withFakeGemini([LIST_CALL, { text: "Your salary of AED 25,000 arrives on the 25th." }], () =>
    answerChatMessage("When do I get paid?", [], PROFILE, events),
  );
  assert.equal(result.card.type, "answer");
});

test("Gemini may repeat an amount the user gave in an earlier turn of the same clarification", async () => {
  const history: HistoryTurn[] = [
    { role: "user", content: "Add an expense to my calendar." },
    { role: "assistant", content: "What's the amount?" },
    { role: "user", content: "AED 4,000" },
    { role: "assistant", content: "What date should it start?" },
  ];
  const result = await withFakeGemini([{ text: "Got it — AED 4,000 starting 12 Sep 2026. Is it one-time or recurring?" }], () =>
    answerChatMessage("12 September", history, PROFILE, events),
  );
  assert.equal(result.card.type, "answer");
});

// ---- Event lookup ------------------------------------------------------------

test("list_upcoming_commitments includes events in future months, with a real ISO date, so they can be removed", async () => {
  const future: EventRow = { ...events[0]!, id: "coffee-future", label: "Coffee", amount: 60, day: 1, kind: "commitment", recurring: true, recurrenceIntervalMonths: 1, monthOffset: 1 };
  const { result } = await executeTool("list_upcoming_commitments", {}, { profile: PROFILE, events: [...events, future], sourceMessageId: "t" });
  const rows = result.events as Array<{ id: string; date: string }>;
  const row = rows.find((r) => r.id === "coffee-future");
  assert.ok(row, "a confirmed future-month event must be listed");
  assert.equal(row.date, "2026-10-01");
  assert.equal(rows.find((r) => r.id === "rent-cheque")?.date, "2026-09-01");
});

test("create_calendar_draft rejects a date before the demo month and beyond the forecast horizon (would be silently invisible)", async () => {
  for (const date of ["2026-08-15", "2027-09-01"]) {
    const { result, draftCreated } = await executeTool(
      "create_calendar_draft",
      { action: "add", reason: "t", events: [{ name: "X", amount_aed: 10, direction: "debit", date, recurrence: "none", category: "other" }] },
      { profile: PROFILE, events, sourceMessageId: "t" },
    );
    assert.equal(result.ok, false, `expected ${date} to be refused`);
    assert.equal(draftCreated, undefined);
  }
});

test("malformed and unknown tool calls fail cleanly: no draft, a normal answer, no throw", async () => {
  const sourceMessageId = `audit-malformed-${randomUUID()}`;
  try {
    const result = await withFakeGemini(
      [
        { functionCall: { name: "create_calendar_draft", args: { action: "add", events: "not-an-array" } } },
        { functionCall: { name: "delete_everything", args: {} } },
        { text: "I couldn't prepare that change — could you tell me the amount and date?" },
      ],
      () => answerChatMessage("Add AED 50 lunch on 20 September 2026", [], PROFILE, events, sourceMessageId),
    );
    assert.equal(result.card.type, "answer");
    const rows = await sql()`select 1 from calendar_drafts where source_message_id = ${sourceMessageId}`;
    assert.equal(rows.length, 0);
  } finally {
    await cleanupBySource(sourceMessageId);
  }
});

// ---- Draft responses ---------------------------------------------------------

test("a delete draft card names the real target event, not just its id", async () => {
  const sourceMessageId = `audit-delete-label-${randomUUID()}`;
  try {
    const result = await withFakeGemini(
      [
        LIST_CALL,
        { functionCall: { name: "create_calendar_draft", args: { action: "delete", target_event_id: "car-loan", reason: "Remove the car loan installment" } } },
        { text: "I've prepared a draft to remove your Car loan installment of AED 2,300. Nothing changes until you confirm in the app." },
      ],
      () => answerChatMessage(REMOVE_PROMPT, [], PROFILE, events, sourceMessageId),
    );
    assert.equal(result.card.type, "calendar_draft");
    if (result.card.type !== "calendar_draft") return;
    assert.equal(result.card.targetEventLabel, "Car loan installment");
    const stored = await sql()`select status from calendar_drafts where source_message_id = ${sourceMessageId}`;
    assert.equal(stored[0]?.status, "pending");
    const stillThere = await sql()`select 1 from calendar_events where profile_id = ${PROFILE.id} and id = 'car-loan'`;
    assert.equal(stillThere.length, 1, "no deletion before confirmation");
  } finally {
    await cleanupBySource(sourceMessageId);
  }
});

test("Gemini may restate the draft's deterministic before/after impact", async () => {
  const sourceMessageId = `audit-impact-${randomUUID()}`;
  try {
    const result = await withFakeGemini(
      [
        { functionCall: { name: "create_calendar_draft", args: { action: "add", reason: "Coffee", events: [{ name: "Coffee", amount_aed: 60, direction: "debit", date: "2026-10-01", recurrence: "monthly", category: "coffee" }] } } },
        { text: "I've prepared a draft. Your October month-end balance would go from AED 98,900 to AED 98,840. Nothing changes until you confirm in the app." },
      ],
      () => answerChatMessage("Add AED 60 coffee monthly from 1 October 2026", [], PROFILE, events, sourceMessageId),
    );
    assert.equal(result.card.type, "calendar_draft");
  } finally {
    await cleanupBySource(sourceMessageId);
  }
});

test("a valid draft is still shown, with deterministic text, when Gemini's final text has an unverifiable figure — the figure is never shown", async () => {
  const sourceMessageId = `audit-fallback-${randomUUID()}`;
  try {
    const result = await withFakeGemini(
      [
        { functionCall: { name: "create_calendar_draft", args: { action: "add", reason: "Bonus", events: [{ name: "Bonus", amount_aed: 500, direction: "credit", date: "2026-09-28", recurrence: "none", category: "bonus" }] } } },
        { text: "Done! Your balance is now AED 999,999." },
      ],
      () => answerChatMessage("Add a one-time AED 500 bonus on 28 September 2026.", [], PROFILE, events, sourceMessageId),
    );
    assert.equal(result.card.type, "calendar_draft");
    assert.doesNotMatch(result.text, /999/);
    assert.match(result.text, /AED 500/);
    assert.match(result.text, /Nothing changes until you confirm in the app\./);
    const stored = await sql()`select status from calendar_drafts where source_message_id = ${sourceMessageId}`;
    assert.equal(stored[0]?.status, "pending", "the draft is visible to the user, so it stays actionable");
  } finally {
    await cleanupBySource(sourceMessageId);
  }
});

test("a valid draft is still shown when the Gemini call after it fails (even after the retry)", async () => {
  const sourceMessageId = `audit-fail-after-draft-${randomUUID()}`;
  try {
    const result = await withFakeGemini(
      [
        { functionCall: { name: "create_calendar_draft", args: { action: "add", reason: "Salary", events: [{ name: "Side income", amount_aed: 1500, direction: "credit", date: "2026-09-30", recurrence: "monthly", category: "income" }] } } },
        { fail: 503 },
      ],
      () => answerChatMessage("Add AED 1,500 monthly side income from 30 September 2026", [], PROFILE, events, sourceMessageId),
    );
    assert.equal(result.card.type, "calendar_draft");
    const rows = await sql()`select status from calendar_drafts where source_message_id = ${sourceMessageId}`;
    assert.equal(rows.length, 1, "retry never duplicates a draft");
  } finally {
    await cleanupBySource(sourceMessageId);
  }
});

test("every draft response carries the confirmation sentence, so later turns can tell the request is complete", async () => {
  const sourceMessageId = `audit-marker-${randomUUID()}`;
  try {
    const result = await withFakeGemini(
      [
        { functionCall: { name: "create_calendar_draft", args: { action: "add", reason: "Gift", events: [{ name: "Gift", amount_aed: 300, direction: "debit", date: "2026-09-20", recurrence: "none", category: "gifts", note: "Classification: discretionary" }] } } },
        { text: "I've set up a draft for the AED 300 gift." },
      ],
      () => answerChatMessage("Add a one-time AED 300 gift on 20 September 2026", [], PROFILE, events, sourceMessageId),
    );
    assert.match(result.text, /Nothing changes until you confirm in the app\./);
    const history: HistoryTurn[] = [
      { role: "user", content: "Add a one-time AED 300 gift on 20 September 2026" },
      { role: "assistant", content: result.text },
    ];
    assert.equal(classifyIntentWithHistory("400", history), "decline");
  } finally {
    await cleanupBySource(sourceMessageId);
  }
});

// ---- Conversation continuity -------------------------------------------------

const removalQ: HistoryTurn[] = [
  { role: "user", content: "Remove my payment" },
  { role: "assistant", content: "Which one did you mean — the credit card minimum or the car loan installment?" },
];
const dateQ: HistoryTurn[] = [
  { role: "user", content: "Add an expense to my calendar." },
  { role: "assistant", content: "What date should it start?" },
];

test("a removal choice naming a loan-like event continues the removal (not the loan-calculator gate)", () => {
  assert.equal(classifyIntentWithHistory("the car loan installment", removalQ), "calendar_change");
  assert.equal(classifyIntentWithHistory("Car loan", removalQ), "calendar_change");
});

test("a removal question whose '?' comes before a bulleted list (exact live Gemini output) still counts as open", () => {
  const history: HistoryTurn[] = [
    { role: "user", content: "Remove my payment" },
    { role: "assistant", content: "Which payment would you like to remove?\n\n- Rent cheque (Q4) (01 Sep 2026)\n- School term fees (01 Sep 2026)" },
  ];
  assert.equal(classifyIntentWithHistory("the car loan installment", history), "calendar_change");
});

test("relative date answers continue a date clarification", () => {
  for (const reply of ["end of month", "this weekend", "Friday", "next Monday", "today", "tomorrow", "28 Sep"]) {
    assert.equal(classifyIntentWithHistory(reply, dateQ), "calendar_change", reply);
  }
});

test("an answer containing category words still continues (income / rent / salary vocabulary)", () => {
  const typeQ: HistoryTurn[] = [
    { role: "user", content: "Add something to my calendar" },
    { role: "assistant", content: "Is this income or an expense?" },
  ];
  assert.equal(classifyIntentWithHistory("income", typeQ), "calendar_change");
  const amountQ: HistoryTurn[] = [
    { role: "user", content: "Add my rent" },
    { role: "assistant", content: "What's the amount, and when does it start?" },
  ];
  assert.equal(classifyIntentWithHistory("AED 5,000 rent from 1 October", amountQ), "calendar_change");
});

test("a real new topic still closes the clarification", () => {
  assert.equal(classifyIntentWithHistory("Show my balance", removalQ), "read");
  assert.equal(classifyIntentWithHistory("Can I afford a loan?", removalQ), "unavailable");
  assert.equal(classifyIntentWithHistory("What's safe to spend?", dateQ), "read");
});

test("a retry after a planner failure still continues the open clarification", () => {
  const history: HistoryTurn[] = [
    ...dateQ,
    { role: "user", content: "12 September" },
    { role: "assistant", content: "I couldn't reach the planner just now. Your calendar is unchanged — try again in a moment." },
  ];
  assert.equal(classifyIntentWithHistory("12 September", history), "calendar_change");
});

test("common read phrasings are answered, not declined", async () => {
  const { classifyIntent } = await import("../api/_lib/intent");
  for (const q of ["How much money do I have?", "When do I get paid?", "What's coming up?", "What does my forecast look like?"]) {
    assert.equal(classifyIntent(q), "read", q);
  }
});

// ---- End-to-end removal flow (pending only; confirmation mechanics are in calendar-drafts.test.ts) --

test("Remove item flow end to end: listing with amounts, then choosing the car loan, yields a pending delete draft", async () => {
  const sourceMessageId = `audit-remove-e2e-${randomUUID()}`;
  const question = "Which one should I remove? Car loan installment (AED 2,300), Credit card minimum (AED 600), or Salary (AED 25,000)?";
  const turn1 = await withFakeGemini([LIST_CALL, { text: question }], () => answerChatMessage(REMOVE_PROMPT, [], PROFILE, events));
  assert.equal(turn1.card.type, "answer");

  const history: HistoryTurn[] = [
    { role: "user", content: REMOVE_PROMPT },
    { role: "assistant", content: turn1.text },
  ];
  try {
    const turn2 = await withFakeGemini(
      [
        LIST_CALL,
        { functionCall: { name: "create_calendar_draft", args: { action: "delete", target_event_id: "car-loan", reason: "Remove the car loan installment" } } },
        { text: "I've prepared a draft to remove the Car loan installment (AED 2,300). Nothing changes until you confirm in the app." },
      ],
      () => answerChatMessage("the car loan installment", history, PROFILE, events, sourceMessageId),
    );
    assert.equal(turn2.card.type, "calendar_draft");
    if (turn2.card.type === "calendar_draft") assert.equal(turn2.card.targetEventId, "car-loan");
  } finally {
    await cleanupBySource(sourceMessageId);
  }
});

// ---- Frontend (source-level) -------------------------------------------------

const chatPage = readFileSync(fileURLToPath(new URL("../src/pages/chat.tsx", import.meta.url)), "utf8");

test("a planner/verification failure is not shown as 'capability not connected'", () => {
  assert.match(chatPage, /capability !== 'chat'/);
  assert.match(chatPage, /capability !== 'unverified-figure'/);
});

test("a failed Confirm or Not now tells the user instead of failing silently", () => {
  assert.match(chatPage, /data-testid="text-draft-error"/);
  assert.match(chatPage, /onError/);
});

test("the three write-action buttons send the exact starting prompts", () => {
  for (const p of ["Add an expense to my calendar.", "Add an income source to my calendar.", "Remove an expense or income source from my calendar."]) {
    assert.ok(chatPage.includes(p), p);
  }
});
