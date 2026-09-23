import { test } from "node:test";
import assert from "node:assert/strict";
import { buildCalendarForecast, buildMoneyCalendar } from "../api/_lib/finance-engine";
import { EVENTS, PROFILE } from "../db/seed-data";

// Pure unit tests against the real seed fixture — no DB, no network. These
// numbers are hand-derived from the fixture (see CLAUDE_HANDOFF.md) so a
// regression in the engine's arithmetic fails here, not just in a screenshot.
const events = [...EVENTS];

test("buildMoneyCalendar computes the current balance from events up to today, not a stored field", () => {
  const calendar = buildMoneyCalendar(PROFILE, events);
  assert.equal(calendar.financialSnapshot.currentAvailableBalance, 57250);
});

test("buildMoneyCalendar finds the tight day as the actual lowest-balance day in the month", () => {
  const calendar = buildMoneyCalendar(PROFILE, events);
  assert.equal(calendar.tightDay, 20);
});

test("buildMoneyCalendar sums only commitments strictly between today and the next payday", () => {
  const calendar = buildMoneyCalendar(PROFILE, events);
  assert.equal(calendar.financialSnapshot.billsAndCommitmentsDueBeforeNextPayday, 2800);
  assert.equal(calendar.financialSnapshot.minimumDebtPayments, 600);
  assert.equal(calendar.financialSnapshot.expectedIncomeBeforeNextPayday, 0);
});

test("buildMoneyCalendar derives safe-to-spend and daily allowance from the snapshot, not a fixture", () => {
  const calendar = buildMoneyCalendar(PROFILE, events);
  assert.equal(calendar.financialSnapshot.safeToSpendUntilPayday, 9450);
  assert.equal(calendar.daysLeft, 15);
  assert.equal(calendar.dailyAllowance, 630);
});

test("buildMoneyCalendar flags review-needed status from actual unreviewed events", () => {
  const calendar = buildMoneyCalendar(PROFILE, events);
  assert.equal(calendar.status.tone, "warning");
  assert.equal(calendar.status.text, "Forecast needs review");
});

test("buildMoneyCalendar reports zero planned goal contributions when no goal events exist", () => {
  const calendar = buildMoneyCalendar(PROFILE, events);
  assert.equal(calendar.financialSnapshot.plannedGoalContributions, 0);
});

test("buildCalendarForecast repeats only recurring events into future months and finds the true lowest point", () => {
  const forecast = buildCalendarForecast(PROFILE, events);
  assert.equal(forecast.lowestPoint.balance, 54450);
  assert.equal(forecast.monthEnd["2026-09"], 79450);
  assert.equal(forecast.monthEnd["2026-10"], 98900);
  assert.equal(forecast.horizonMonths, 12);
  assert.equal(Object.keys(forecast.monthEnd).length, 12);
});

test("buildCalendarForecast month-end deltas are the monthly recurring net, minus quarterly rent or termly school fees in the months they fall due", () => {
  const forecast = buildCalendarForecast(PROFILE, events);
  const months = Object.keys(forecast.monthEnd);
  // Monthly baseline (salary - car loan - DEWA - groceries - card minimum) is
  // +19450; Dec/Mar/Jun additionally carry the AED 18,000 quarterly rent
  // cheque, and Jan/May additionally carry the AED 12,000 termly school fee.
  const expectedDeltas = [19450, 19450, 1450, 7450, 19450, 1450, 19450, 7450, 1450, 19450, 19450];
  for (let i = 1; i < months.length; i += 1) {
    const delta = forecast.monthEnd[months[i]] - forecast.monthEnd[months[i - 1]];
    assert.equal(delta, expectedDeltas[i - 1], `unexpected delta for ${months[i]}`);
  }
});

test("buildCalendarForecast includes future quarterly rent-cheque and termly school-fee occurrences beyond September", () => {
  const forecast = buildCalendarForecast(PROFILE, events);
  const rentOccurrences = forecast.points.filter((p) => p.eventId === "rent-cheque");
  const schoolOccurrences = forecast.points.filter((p) => p.eventId === "school-term");
  // Within the 12-month horizon: rent recurs at Dec, Mar, Jun; school at Jan, May.
  assert.equal(rentOccurrences.length, 3, "expected 3 future rent-cheque occurrences (Dec, Mar, Jun)");
  assert.equal(schoolOccurrences.length, 2, "expected 2 future school-term occurrences (Jan, May)");
  assert.ok(rentOccurrences.some((p) => p.date.startsWith("2026-12")));
  assert.ok(rentOccurrences.some((p) => p.date.startsWith("2027-03")));
  assert.ok(rentOccurrences.some((p) => p.date.startsWith("2027-06")));
  assert.ok(schoolOccurrences.some((p) => p.date.startsWith("2027-01")));
  assert.ok(schoolOccurrences.some((p) => p.date.startsWith("2027-05")));
  // September's low-balance demo point must still be the global lowest —
  // the future quarterly/termly obligations must not undercut it.
  assert.equal(forecast.lowestPoint.balance, 54450);
  assert.equal(forecast.lowestPoint.date, "2026-09-20");
});

test('buildMoneyCalendar/buildCalendarForecast "today" is the fixed exemplar date, not the real current date', () => {
  const calendar = buildMoneyCalendar(PROFILE, events);
  const forecast = buildCalendarForecast(PROFILE, events);
  assert.equal(calendar.financialSnapshot.asOf, "2026-09-10T09:00:00.000Z");
  assert.equal(forecast.asOf, "2026-09-10T09:00:00.000Z");
  assert.ok(calendar.assumptions.some((a) => a.includes("fixed demo exemplar")), "expected the exemplar date to be labeled in assumptions");
});

test("an event exactly on the exemplar as-of day (DEWA, day 10) counts as already processed, consistently in both the balance and the upcoming list", () => {
  const calendar = buildMoneyCalendar(PROFILE, events);
  // 90000 - 18000 - 12000 - 2300 - 450(DEWA) = 57250: DEWA is already
  // folded into the current balance...
  assert.equal(calendar.financialSnapshot.currentAvailableBalance, 57250);
  // ...and consistently, it must NOT also appear as still "upcoming" —
  // an event can't be both already-deducted and still-ahead.
  assert.ok(!calendar.upcomingCommitments.some((e) => e.id === "dewa"), "DEWA (day 10, the as-of day) must not appear in upcomingCommitments");
});

test("upcomingCommitments excludes every event on or before the exemplar as-of day, including the day-1 rent cheque and school fee", () => {
  const calendar = buildMoneyCalendar(PROFILE, events);
  const ids = calendar.upcomingCommitments.map((e) => e.id);
  assert.deepEqual(ids, ["groceries", "card-minimum"], "only day-15 groceries and day-20 card-minimum are strictly after day 10");
  assert.ok(!ids.includes("rent-cheque"), "the day-1 rent cheque is 9 days in the past relative to the exemplar date and must not be 'upcoming'");
  assert.ok(!ids.includes("school-term"));
  assert.ok(!ids.includes("car-loan"));
});

test("buildMoneyCalendar and buildCalendarForecast never invent an event that isn't in the input", () => {
  const calendar = buildMoneyCalendar(PROFILE, events);
  assert.equal(calendar.events.length, events.length);
  for (const event of calendar.events) {
    assert.ok(events.some((e) => e.id === event.id));
  }
});
