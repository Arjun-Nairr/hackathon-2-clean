import { test } from "node:test";
import assert from "node:assert/strict";
import { validateCalendarChangeDraft } from "../api/_lib/draft-schema";

function draftWithDate(date: string) {
  return {
    draft_id: "draft-date-test-0001",
    action: "add",
    reason: "test",
    requires_confirmation: true,
    source_message_id: "msg-1",
    events: [{ name: "Test event", amount_aed: 100, direction: "debit", date, recurrence: "none", category: "other" }],
  };
}

test("rejects a date with an impossible month and day (2026-13-99)", () => {
  const result = validateCalendarChangeDraft(draftWithDate("2026-13-99"));
  assert.equal(result.valid, false);
});

test("rejects Feb 30, which JS's Date silently rolls into March rather than rejecting", () => {
  const result = validateCalendarChangeDraft(draftWithDate("2026-02-30"));
  assert.equal(result.valid, false);
});

test("rejects Feb 29 in a non-leap year", () => {
  // 2026 is not a leap year (not divisible by 4).
  const result = validateCalendarChangeDraft(draftWithDate("2026-02-29"));
  assert.equal(result.valid, false);
});

test("accepts Feb 29 in a real leap year", () => {
  // 2028 is a leap year (divisible by 4, not a century year).
  const result = validateCalendarChangeDraft(draftWithDate("2028-02-29"));
  assert.equal(result.valid, true);
});

test("accepts an ordinary valid date", () => {
  const result = validateCalendarChangeDraft(draftWithDate("2026-10-01"));
  assert.equal(result.valid, true);
});
