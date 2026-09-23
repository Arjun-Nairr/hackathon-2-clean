import { test } from "node:test";
import assert from "node:assert/strict";
import { executeTool } from "../api/_lib/tools";
import { buildCalendarForecast, buildMoneyCalendar } from "../api/_lib/finance-engine";
import { EVENTS, PROFILE } from "../db/seed-data";

const events = [...EVENTS];
const ctx = { profile: PROFILE, events, sourceMessageId: "test-message" };

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

test("list_upcoming_commitments returns the engine's upcomingCommitments, with ids Gemini can target for update/delete", async () => {
  const calendar = buildMoneyCalendar(PROFILE, events);
  const { result } = await executeTool("list_upcoming_commitments", {}, ctx);
  const commitments = result.commitments as Array<{ id: string; amount: number }>;
  assert.deepEqual(commitments.map((c) => c.id), calendar.upcomingCommitments.map((e) => e.id));
  assert.deepEqual(commitments.map((c) => c.amount), calendar.upcomingCommitments.map((e) => e.amount));
});

test("an unsupported tool name returns a controlled unavailable result, not a throw", async () => {
  const { result } = await executeTool("delete_everything", {}, ctx);
  assert.equal(result.ok, false);
});

test("create_calendar_draft rejects an incomplete proposal (missing amount/date) instead of writing anything", async () => {
  const { result, draftCreated } = await executeTool("create_calendar_draft", { action: "add", reason: "test" }, ctx);
  assert.equal(result.ok, false);
  assert.ok(Array.isArray(result.errors) && (result.errors as string[]).length > 0);
  assert.equal(draftCreated, undefined);
});
