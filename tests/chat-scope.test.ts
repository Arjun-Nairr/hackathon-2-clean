import { config } from "dotenv";
import { test } from "node:test";
import assert from "node:assert/strict";
import { answerChatMessage } from "../api/_lib/chat";

config({ path: ".env.local" });
import { EVENTS, PROFILE } from "../db/seed-data";

const events = [...EVENTS];

function withFakeGemini<T>(replyText: string, run: () => Promise<T>): Promise<T> {
  const original = globalThis.fetch;
  globalThis.fetch = (async () =>
    new Response(JSON.stringify({ candidates: [{ content: { parts: [{ text: replyText }] } }] }), {
      status: 200,
      headers: { "content-type": "application/json" },
    })) as typeof fetch;
  return run().finally(() => {
    globalThis.fetch = original;
  });
}

test("a goal question is a controlled missing-data response and never reaches Gemini", async () => {
  const original = globalThis.fetch;
  let called = false;
  globalThis.fetch = (async () => {
    called = true;
    throw new Error("should not be called");
  }) as typeof fetch;
  try {
    const result = await answerChatMessage("What goals am I on track for?", [], PROFILE, events);
    assert.equal(result.card.type, "missing_data");
    assert.equal(called, false);
  } finally {
    globalThis.fetch = original;
  }
});

test("a loan-eligibility question is a controlled unavailable response and never reaches Gemini", async () => {
  const original = globalThis.fetch;
  let called = false;
  globalThis.fetch = (async () => {
    called = true;
    throw new Error("should not be called");
  }) as typeof fetch;
  try {
    const result = await answerChatMessage("Can I afford a loan?", [], PROFILE, events);
    assert.equal(result.card.type, "unavailable");
    assert.equal(called, false);
  } finally {
    globalThis.fetch = original;
  }
});

test("a rent-vs-buy question is a controlled unavailable response and never reaches Gemini", async () => {
  const original = globalThis.fetch;
  let called = false;
  globalThis.fetch = (async () => {
    called = true;
    throw new Error("should not be called");
  }) as typeof fetch;
  try {
    const result = await answerChatMessage("Should I rent or buy?", [], PROFILE, events);
    assert.equal(result.card.type, "unavailable");
    assert.equal(called, false);
  } finally {
    globalThis.fetch = original;
  }
});

test("an unrelated question is declined deterministically and never reaches Gemini", async () => {
  const original = globalThis.fetch;
  let called = false;
  globalThis.fetch = (async () => {
    called = true;
    throw new Error("should not be called");
  }) as typeof fetch;
  try {
    const result = await answerChatMessage("What's the weather in Dubai today?", [], PROFILE, events);
    assert.equal(result.card.type, "decline");
    assert.equal(called, false);
  } finally {
    globalThis.fetch = original;
  }
});

test('"Add an expense to my calendar." (the chat page\'s write-action button prompt) gets a deterministic clarification, not "unverified-figure", and never reaches Gemini', async () => {
  const original = globalThis.fetch;
  let called = false;
  globalThis.fetch = (async () => {
    called = true;
    throw new Error("should not be called");
  }) as typeof fetch;
  try {
    const result = await answerChatMessage("Add an expense to my calendar.", [], PROFILE, events);
    assert.equal(result.card.type, "answer");
    if (result.card.type === "answer") assert.notEqual(result.card.source, "unverified-figure");
    assert.doesNotMatch(result.text, /aed\s*\d/i);
    assert.equal(called, false, "an underspecified add request must be answered deterministically, without calling Gemini");
  } finally {
    globalThis.fetch = original;
  }
});

test('"Add an income source to my calendar." also gets the deterministic clarification, never an invented example figure', async () => {
  const original = globalThis.fetch;
  let called = false;
  globalThis.fetch = (async () => {
    called = true;
    throw new Error("should not be called");
  }) as typeof fetch;
  try {
    const result = await answerChatMessage("Add an income source to my calendar.", [], PROFILE, events);
    assert.equal(result.card.type, "answer");
    assert.doesNotMatch(result.text, /aed\s*\d/i);
    assert.equal(called, false);
  } finally {
    globalThis.fetch = original;
  }
});

test("a fully specified add request (amount and date already given) still goes to Gemini as normal, not the deterministic clarification", async () => {
  await withFakeGemini("I have prepared a draft to add a one-time AED 500 gift on 20 Sep 2026. Nothing changes until you confirm in the app.", async () => {
    const result = await answerChatMessage("Add an AED 500 gift on 20 September 2026.", [], PROFILE, events);
    assert.notEqual(result.card.type, "missing_data");
    assert.notEqual(result.card.type, "unavailable");
    if (result.card.type === "answer") assert.equal(result.card.source, "gemini");
  });
});

test("an in-scope question calls Gemini with a context containing only engine-computed numbers, and returns an answer card", async () => {
  await withFakeGemini("You have AED 9,450 safe to spend before payday.", async () => {
    const result = await answerChatMessage("What's safe to spend today?", [], PROFILE, events);
    assert.equal(result.card.type, "answer");
    assert.equal(result.text, "You have AED 9,450 safe to spend before payday.");
  });
});

test("chat history sent to Gemini is bounded to the last 6 messages", async () => {
  const longHistory = Array.from({ length: 20 }, (_, i) => ({ role: i % 2 === 0 ? ("user" as const) : ("assistant" as const), content: `message ${i}` }));
  let capturedBody: string | undefined;
  const original = globalThis.fetch;
  globalThis.fetch = (async (_url, init) => {
    capturedBody = String((init as RequestInit).body);
    return new Response(JSON.stringify({ candidates: [{ content: { parts: [{ text: "ok" }] } }] }), { status: 200 });
  }) as typeof fetch;
  try {
    await answerChatMessage("What's my tightest month?", longHistory, PROFILE, events);
    assert.ok(capturedBody);
    const parsed = JSON.parse(capturedBody!);
    const promptText = parsed.contents[0].parts[0].text as string;
    const historyLines = promptText.split("\n").filter((l: string) => l.startsWith("message ") || /^(user|assistant): message \d+/.test(l));
    assert.ok(historyLines.length <= 6, `expected at most 6 history lines, got ${historyLines.length}`);
  } finally {
    globalThis.fetch = original;
  }
});
