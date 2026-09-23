import { test } from "node:test";
import assert from "node:assert/strict";
import { classifyIntent } from "../api/_lib/intent";

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

test("a goal question is missing_data", () => {
  assert.equal(classifyIntent("What goals am I on track for?"), "missing_data");
});

test("a read question about safe-to-spend is read", () => {
  assert.equal(classifyIntent("What's safe to spend today?"), "read");
});

test("an unrelated question declines", () => {
  assert.equal(classifyIntent("What's the weather in Dubai today?"), "decline");
});
