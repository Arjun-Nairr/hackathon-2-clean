import { config } from "dotenv";
import { test } from "node:test";
import assert from "node:assert/strict";
import { findUnsupportedMonetaryClaims } from "../api/_lib/number-guard";
import { answerChatMessage } from "../api/_lib/chat";
import { GeminiError } from "../api/_lib/gemini";
import { EVENTS, PROFILE } from "../db/seed-data";

config({ path: ".env.local" });

// PROFILE.projectedPayday is 25 — a day-of-month number, never an amount.
const monetaryAmounts = [9450, 630, 57250];

test("findUnsupportedMonetaryClaims passes AED-tagged figures that are real computed amounts", () => {
  const reply = "You have AED 9,450 safe to spend, about AED 630 a day.";
  assert.deepEqual(findUnsupportedMonetaryClaims(reply, monetaryAmounts), []);
});

test("findUnsupportedMonetaryClaims flags an AED-tagged figure that isn't a computed amount at all", () => {
  const reply = "You have AED 12,345 safe to spend today.";
  assert.deepEqual(findUnsupportedMonetaryClaims(reply, monetaryAmounts), [12345]);
});

// The exact bug this guard replaces: the old global "does this number appear
// ANYWHERE in context" check let a day-of-month value stand in as money,
// because 25 was also the payday day. Field-aware validation must reject
// this even though "25" is a perfectly real number the backend gave Gemini
// — just never as an amount.
test("findUnsupportedMonetaryClaims rejects a day-of-month number reused as an AED amount, even though 25 is a real context number (the payday day)", () => {
  const reply = "You have AED 25 safe to spend today.";
  assert.deepEqual(findUnsupportedMonetaryClaims(reply, monetaryAmounts), [25]);
});

test("findUnsupportedMonetaryClaims ignores plain numbers Gemini writes without an AED tag (dates, day counts) — only money claims are checked", () => {
  const reply = "You have 15 days until payday on the 25th.";
  assert.deepEqual(findUnsupportedMonetaryClaims(reply, monetaryAmounts), []);
});

function withFakeGeminiReply(replyText: string, run: () => Promise<unknown>) {
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

test("answerChatMessage refuses a Gemini reply that misattributes the payday day (25) as an AED amount", async () => {
  await withFakeGeminiReply("You have AED 25 safe to spend today!", async () => {
    await assert.rejects(
      () => answerChatMessage("What's safe to spend today?", [], PROFILE, [...EVENTS]),
      (err: unknown) => err instanceof GeminiError && err.message.includes("25"),
    );
  });
});

test("answerChatMessage refuses a Gemini reply containing a wholly invented monetary figure", async () => {
  await withFakeGeminiReply("You're actually AED 99,999 in the red this month!", async () => {
    await assert.rejects(
      () => answerChatMessage("What's safe to spend today?", [], PROFILE, [...EVENTS]),
      (err: unknown) => err instanceof GeminiError && err.message.includes("99999"),
    );
  });
});

test("answerChatMessage accepts a Gemini reply that only reuses AED amounts already in the computed context", async () => {
  await withFakeGeminiReply("You have AED 9,450 safe to spend, about AED 630 a day, before payday on the 25th.", async () => {
    const result = await answerChatMessage("What's safe to spend today?", [], PROFILE, [...EVENTS]);
    assert.equal(result.card.type, "answer");
  });
});
