import { config } from "dotenv";
config({ path: ".env.local" });

import { test } from "node:test";
import assert from "node:assert/strict";
import { answerChatMessage, UnsupportedClaimError } from "../api/_lib/chat";
import { sql } from "../api/_lib/db";
import { EVENTS, PROFILE } from "../db/seed-data";

const events = [...EVENTS];

// Simulates Gemini's REST response shape across successive fetch calls —
// one entry per tool-loop turn. The last entry repeats if the loop runs
// longer than the list (defensive; none of these tests need it to).
interface FakeTurn {
  text?: string;
  functionCall?: { name: string; args: Record<string, unknown> };
}

function withFakeGeminiSequence<T>(turns: FakeTurn[], run: () => Promise<T>): Promise<T> {
  const original = globalThis.fetch;
  let call = 0;
  // Only intercept calls to Gemini — the Neon driver also talks HTTP over
  // this same global `fetch`, and letting a real draft insert/read reach
  // Neon is the whole point of these tests (they assert against real rows).
  globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url;
    if (!url.includes('generativelanguage.googleapis.com')) {
      return original(input, init);
    }
    const turn = turns[Math.min(call, turns.length - 1)]!;
    call += 1;
    const parts = turn.functionCall ? [{ functionCall: turn.functionCall }] : [{ text: turn.text ?? "" }];
    return new Response(JSON.stringify({ candidates: [{ content: { parts } }] }), { status: 200, headers: { "content-type": "application/json" } });
  }) as typeof fetch;
  return run().finally(() => {
    globalThis.fetch = original;
  });
}

async function cleanupDraft(draftId: string | undefined) {
  if (!draftId) return;
  await sql()`delete from calendar_drafts where draft_id = ${draftId}`;
}

test("an affordability question may repeat the AED amount the user themselves supplied", async () => {
  await withFakeGeminiSequence(
    [{ text: "A AED 3,000 TV is well within your AED 9,450 safe-to-spend until payday." }],
    async () => {
      const result = await answerChatMessage("Can I afford a AED 3,000 TV this month?", [], PROFILE, events);
      assert.equal(result.card.type, "answer");
      assert.match(result.text, /AED 3,000/);
    },
  );
});

test("Gemini may not introduce an unrelated invented amount, even on a question that itself contains a number", async () => {
  await withFakeGeminiSequence([{ text: "Actually you're AED 50,000 short this month." }], async () => {
    await assert.rejects(
      () => answerChatMessage("Can I afford a AED 3,000 TV this month?", [], PROFILE, events),
      (err: unknown) => err instanceof UnsupportedClaimError && err.message.includes("50000"),
    );
  });
});

test("network/model failure still throws the plain GeminiError path (not the number-guard error) — distinguishable by api/chat.ts", async () => {
  const original = globalThis.fetch;
  globalThis.fetch = (async () => {
    throw new Error("network down");
  }) as typeof fetch;
  try {
    await assert.rejects(
      () => answerChatMessage("What's safe to spend today?", [], PROFILE, events),
      (err: unknown) => !(err instanceof UnsupportedClaimError) && err instanceof Error && err.message.includes("network down"),
    );
  } finally {
    globalThis.fetch = original;
  }
});

test("a complete expense addition creates a pending calendar_draft with an impact preview and a classification note", async () => {
  await withFakeGeminiSequence(
    [
      {
        functionCall: {
          name: "create_calendar_draft",
          args: {
            action: "add",
            reason: "Add an emergency AED 2,000 repair on 18 September 2026",
            events: [{ name: "Emergency repair", amount_aed: 2000, direction: "debit", date: "2026-09-18", recurrence: "none", category: "home", note: "Classification: emergency. Water heater failure." }],
          },
        },
      },
      { text: "I have prepared a draft to add a one-time AED 2,000 emergency repair on 18 Sep 2026. Nothing changes until you confirm in the app." },
    ],
    async () => {
      const result = await answerChatMessage("Add an AED 2,000 emergency repair on 18 September 2026.", [], PROFILE, events);
      assert.equal(result.card.type, "calendar_draft");
      if (result.card.type !== "calendar_draft") return;
      try {
        assert.equal(result.card.action, "add");
        assert.equal(result.card.events[0]?.amountAed, 2000);
        assert.equal(result.card.events[0]?.direction, "debit");
        assert.match(result.card.events[0]?.note ?? "", /emergency/i);
        assert.ok(result.card.impact.metricLabel.length > 0);
        assert.equal(typeof result.card.impact.before, "number");
        assert.equal(typeof result.card.impact.after, "number");

        const stored = await sql()`select status from calendar_drafts where draft_id = ${result.card.draftId}`;
        assert.equal(stored[0]?.status, "pending");
        const untouched = await sql()`select 1 from calendar_events where profile_id = ${PROFILE.id} and label = 'Emergency repair'`;
        assert.equal(untouched.length, 0, "a pending draft must not write to calendar_events");
      } finally {
        await cleanupDraft(result.card.draftId);
      }
    },
  );
});

test("a complete income addition creates a pending calendar_draft", async () => {
  await withFakeGeminiSequence(
    [
      {
        functionCall: {
          name: "create_calendar_draft",
          args: {
            action: "add",
            reason: "Add an AED 8,000 bonus received today",
            events: [{ name: "Bonus", amount_aed: 8000, direction: "credit", date: "2026-09-10", recurrence: "none", category: "bonus" }],
          },
        },
      },
      { text: "I have prepared a draft to add a one-time AED 8,000 bonus on 10 Sep 2026. Nothing changes until you confirm in the app." },
    ],
    async () => {
      const result = await answerChatMessage("I received an AED 8,000 bonus today.", [], PROFILE, events);
      assert.equal(result.card.type, "calendar_draft");
      if (result.card.type !== "calendar_draft") return;
      try {
        assert.equal(result.card.events[0]?.direction, "credit");
        assert.equal(result.card.events[0]?.amountAed, 8000);
      } finally {
        await cleanupDraft(result.card.draftId);
      }
    },
  );
});

test("when Gemini asks a clarifying question instead of calling the tool (e.g. an ambiguous removal), no draft is created", async () => {
  // True ambiguity detection ("which of two similarly-named events do you
  // mean?") is the live model's job, guided by the skill's removal-
  // resolution rules — not something this code path decides. What IS
  // guaranteed here: if the model responds with text instead of a
  // create_calendar_draft call, no draft exists afterward.
  await withFakeGeminiSequence(
    [{ text: "You have two payment events that could match — the credit card minimum and the car loan installment. Which one did you mean?" }],
    async () => {
      const result = await answerChatMessage("Remove the payment event.", [], PROFILE, events);
      assert.notEqual(result.card.type, "calendar_draft");
    },
  );
});

test("a removal attempt with a nonexistent target id is rejected by the tool and produces no draft", async () => {
  await withFakeGeminiSequence(
    [
      { functionCall: { name: "create_calendar_draft", args: { action: "delete", target_event_id: "not-a-real-event", reason: "Remove it" } } },
      { text: "I couldn't find an event with that id in your calendar, so I haven't proposed anything." },
    ],
    async () => {
      const result = await answerChatMessage("Remove the imaginary event.", [], PROFILE, events);
      assert.notEqual(result.card.type, "calendar_draft");
      const drafts = await sql()`select 1 from calendar_drafts where source_message_id is not null and payload->>'target_event_id' = 'not-a-real-event'`;
      assert.equal(drafts.length, 0);
    },
  );
});

test('chat confirmation phrases ("yes", "confirm", "go ahead") are declined deterministically and never reach Gemini or a draft', async () => {
  const original = globalThis.fetch;
  let called = false;
  globalThis.fetch = (async () => {
    called = true;
    throw new Error("should not be called");
  }) as typeof fetch;
  try {
    for (const phrase of ["Yes, go ahead and confirm it.", "Confirm.", "Go ahead."]) {
      const result = await answerChatMessage(phrase, [], PROFILE, events);
      assert.notEqual(result.card.type, "calendar_draft");
    }
    assert.equal(called, false);
  } finally {
    globalThis.fetch = original;
  }
});
