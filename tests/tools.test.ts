import { config } from "dotenv";
config({ path: ".env.local" });

import { test } from "node:test";
import assert from "node:assert/strict";
import { CREATE_DRAFT_TOOL, executeTool } from "../api/_lib/tools";
import { buildCalendarForecast, buildMoneyCalendar } from "../api/_lib/finance-engine";
import { sql } from "../api/_lib/db";
import { EVENTS, PROFILE } from "../db/seed-data";

const events = [...EVENTS];
const ctx = { profile: PROFILE, events, sourceMessageId: "test-message" };

async function cleanupDraft(draftId: string | undefined) {
  if (!draftId) return;
  await sql()`delete from calendar_drafts where draft_id = ${draftId}`;
}

test("get_financial_snapshot returns the same figures the finance engine computes — never a duplicated calculation", async () => {
  const calendar = buildMoneyCalendar(PROFILE, events);
  const { result } = await executeTool("get_financial_snapshot", {}, ctx);
  assert.equal(result.currentAvailableBalance, calendar.financialSnapshot.currentAvailableBalance);
  assert.equal(result.safeToSpendUntilPayday, calendar.financialSnapshot.safeToSpendUntilPayday);
  assert.equal(result.dailyAllowance, calendar.dailyAllowance);
  assert.equal(result.nextPaydayDate, calendar.nextPaydayDate);
});

test("get_calendar_forecast returns the engine's own lowest point and month-end series", async () => {
  const forecast = buildCalendarForecast(PROFILE, events);
  const { result } = await executeTool("get_calendar_forecast", {}, ctx);
  assert.deepEqual(result.lowestPoint, forecast.lowestPoint);
  assert.equal(result.horizonMonths, forecast.horizonMonths);
});

test("list_upcoming_commitments returns every recorded event (not just still-upcoming ones), with ids Gemini can target for removal", async () => {
  const calendar = buildMoneyCalendar(PROFILE, events);
  const { result } = await executeTool("list_upcoming_commitments", {}, ctx);
  const rows = result.events as Array<{ id: string; amount: number; upcoming: boolean }>;
  // All 7 seeded events are present, not only the 2 that are still ahead —
  // a removal target like "DEWA" (already processed) or "salary" (income)
  // has to be resolvable too.
  assert.deepEqual(rows.map((r) => r.id).sort(), calendar.events.map((e) => e.id).sort());

  const upcomingIds = new Set(calendar.upcomingCommitments.map((e) => e.id));
  for (const row of rows) {
    assert.equal(row.upcoming, upcomingIds.has(row.id), `expected upcoming flag to match for ${row.id}`);
  }
});

test("an unsupported tool name returns a controlled unavailable result, not a throw", async () => {
  const { result } = await executeTool("delete_everything", {}, ctx);
  assert.equal(result.ok, false);
});

test("create_calendar_draft rejects a proposal with no events at all", async () => {
  const { result, draftCreated } = await executeTool("create_calendar_draft", { action: "add", reason: "test" }, ctx);
  assert.equal(result.ok, false);
  assert.equal(draftCreated, undefined);
});

test("create_calendar_draft rejects an incomplete proposal (missing amount/date) instead of writing anything", async () => {
  const { result, draftCreated } = await executeTool("create_calendar_draft", { action: "add", reason: "test", events: [{ name: "Incomplete" }] }, ctx);
  assert.equal(result.ok, false);
  assert.ok(Array.isArray(result.errors) && (result.errors as string[]).length > 0);
  assert.equal(draftCreated, undefined);
});

test("the model-exposed create_calendar_draft tool only declares add and delete — never update", () => {
  const actionSchema = (CREATE_DRAFT_TOOL.parameters as { properties: { action: { enum: string[] } } }).properties.action;
  assert.deepEqual(actionSchema.enum, ["add", "delete"]);
});

test("create_calendar_draft refuses action 'update' even though the validator/database still accept it for compatibility", async () => {
  const { result, draftCreated } = await executeTool(
    "create_calendar_draft",
    { action: "update", target_event_id: "groceries", reason: "test", events: [{ name: "Groceries & essentials", amount_aed: 2500, direction: "debit", date: "2026-09-15", recurrence: "monthly", category: "other" }] },
    ctx,
  );
  assert.equal(result.ok, false);
  assert.equal(draftCreated, undefined);
});

test("create_calendar_draft rejects a removal whose target_event_id does not exist, without creating a draft (never invent an event id)", async () => {
  const { result, draftCreated } = await executeTool("create_calendar_draft", { action: "delete", target_event_id: "does-not-exist", reason: "test" }, ctx);
  assert.equal(result.ok, false);
  assert.equal(draftCreated, undefined);
});

test("create_calendar_draft computes a deterministic before/after impact for an add, purely from the finance engine", async () => {
  const { draftCreated } = await executeTool(
    "create_calendar_draft",
    { action: "add", reason: "test", events: [{ name: "Zzz Tools Test Bonus", amount_aed: 1000, direction: "credit", date: "2026-09-28", recurrence: "none", category: "bonus" }] },
    ctx,
  );
  try {
    assert.ok(draftCreated);
    const calendar = buildMoneyCalendar(PROFILE, events);
    assert.equal(draftCreated!.impact.metricLabel, "Safe to spend until payday");
    assert.equal(draftCreated!.impact.before, calendar.financialSnapshot.safeToSpendUntilPayday);
    // A one-time bonus on day 28 is after payday (day 25), so it does not
    // change safe-to-spend-until-payday at all — before === after here is
    // correct, not a bug.
    assert.equal(draftCreated!.impact.after, calendar.financialSnapshot.safeToSpendUntilPayday);
  } finally {
    await cleanupDraft(draftCreated?.draftId);
  }
});

test("create_calendar_draft computes the impact for a delete against the event's own month, not always the current month", async () => {
  const { draftCreated } = await executeTool("create_calendar_draft", { action: "delete", target_event_id: "card-minimum", reason: "test" }, ctx);
  try {
    assert.ok(draftCreated);
    const calendar = buildMoneyCalendar(PROFILE, events);
    // card-minimum (day 20) is inside the exemplar month and before
    // payday, so removing it raises safe-to-spend-until-payday by its 600.
    assert.equal(draftCreated!.impact.metricLabel, "Safe to spend until payday");
    assert.equal(draftCreated!.impact.before, calendar.financialSnapshot.safeToSpendUntilPayday);
    assert.equal(draftCreated!.impact.after, calendar.financialSnapshot.safeToSpendUntilPayday + 600);
  } finally {
    await cleanupDraft(draftCreated?.draftId);
  }
});
