import { test } from "node:test";
import assert from "node:assert/strict";
import { classifyIntent, classifyIntentWithHistory, type HistoryTurn } from "../api/_lib/intent";

test('"billion" does not match the whole word "bill" — an unrelated question keeps declining', () => {
  assert.equal(classifyIntent("Is a unicorn company worth a billion dirhams?"), "decline");
});

test('a genuine "bill" question is in scope (whole-word match, not a substring)', () => {
  assert.equal(classifyIntent("What bill is due next?"), "read");
});

test("loan-eligibility questions are unavailable, not read or decline", () => {
  assert.equal(classifyIntent("Can I afford a loan?"), "unavailable");
  assert.equal(classifyIntent("What's my loan EMI?"), "unavailable");
});

test("rent-vs-buy questions are unavailable", () => {
  assert.equal(classifyIntent("Should I rent or buy a home?"), "unavailable");
  assert.equal(classifyIntent("Is it better to rent vs buy?"), "unavailable");
});

test("calendar-change verbs at the start of the message classify as calendar_change", () => {
  assert.equal(classifyIntent("Add a one-time AED 5,000 bonus on 28 Sep 2026."), "calendar_change");
  assert.equal(classifyIntent("Add AED 1,200 as a monthly expense starting 1 Oct 2026."), "calendar_change");
  assert.equal(classifyIntent("Change the groceries event to AED 2,500."), "calendar_change");
  assert.equal(classifyIntent("Remove the card minimum event."), "calendar_change");
  assert.equal(classifyIntent("Add school fees."), "calendar_change");
  assert.equal(classifyIntent("Add AED 3,000 rent."), "calendar_change");
  assert.equal(classifyIntent("Add a bonus next month."), "calendar_change");
});

test("a mid-sentence verb does not trigger calendar_change (only the first word does)", () => {
  assert.equal(classifyIntent("What would change my safe-to-spend?"), "read");
});

test('an income-report opener ("I received...") also classifies as calendar_change, even with no imperative verb', () => {
  assert.equal(classifyIntent("I received an AED 8,000 bonus today."), "calendar_change");
  assert.equal(classifyIntent("I got a AED 500 refund yesterday."), "calendar_change");
});

test("a goal question is missing_data", () => {
  assert.equal(classifyIntent("What goals am I on track for?"), "missing_data");
});

test("a read question about safe-to-spend is read", () => {
  assert.equal(classifyIntent("What's safe to spend today?"), "read");
});

test("an unrelated question declines", () => {
  assert.equal(classifyIntent("What's the weather in Dubai today?"), "decline");
});

test("a follow-up answer with no independent signal restores calendar_change from an earlier unresolved add request", () => {
  const history: HistoryTurn[] = [
    { role: "user", content: "Add school fees" },
    { role: "assistant", content: "Could you share the amount in AED, the date, and whether this is one-time or recurring?" },
  ];
  assert.equal(classifyIntentWithHistory("AED 3,000 monthly from 1 October 2026", history), "calendar_change");
});

test("a follow-up choice restores calendar_change from an earlier ambiguous removal", () => {
  const history: HistoryTurn[] = [
    { role: "user", content: "Remove my payment" },
    { role: "assistant", content: "You have two payment events — the credit card minimum and the car loan installment. Which one did you mean?" },
  ];
  assert.equal(classifyIntentWithHistory("The credit card minimum", history), "calendar_change");
});

test("a message with its own independent signal is never overridden by history (a real topic change is respected)", () => {
  const history: HistoryTurn[] = [
    { role: "user", content: "Add school fees" },
    { role: "assistant", content: "Could you share the amount in AED, the date, and whether this is one-time or recurring?" },
  ];
  assert.equal(classifyIntentWithHistory("What's safe to spend today?", history), "read");
});

test("an unrelated reply is not interpreted as a continuation, even with an open calendar_change thread", () => {
  const history: HistoryTurn[] = [
    { role: "user", content: "Add school fees" },
    { role: "assistant", content: "Could you share the amount in AED, the date, and whether this is one-time or recurring?" },
  ];
  assert.equal(classifyIntentWithHistory("What's the weather in Dubai today?", history), "decline");
  assert.equal(classifyIntentWithHistory("Never mind.", history), "decline");
  assert.equal(classifyIntentWithHistory("Yes, confirm it.", history), "decline");
});

test("no continuation is applied without an open calendar_change thread, or without an assistant turn to answer", () => {
  const noOpenThread: HistoryTurn[] = [
    { role: "user", content: "What's safe to spend today?" },
    { role: "assistant", content: "AED 9,450 across the next 15 days." },
  ];
  assert.equal(classifyIntentWithHistory("AED 3,000 monthly from 1 October 2026", noOpenThread), "decline");
  assert.equal(classifyIntentWithHistory("AED 3,000 monthly from 1 October 2026", []), "decline");

  const userSpokeLast: HistoryTurn[] = [
    { role: "user", content: "Add school fees" },
    { role: "user", content: "AED 3,000" },
  ];
  assert.equal(classifyIntentWithHistory("monthly from 1 October 2026", userSpokeLast), "decline");
});
