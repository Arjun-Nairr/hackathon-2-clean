// Deterministic finance engine. Pure functions over plain row data — no DB,
// no network, no LLM. This is the only place income/expense totals, safe to
// spend, daily allowance, the lowest projected balance, and status/comfort
// colour are computed; the frontend never does this arithmetic.
import type { CalendarEvent, CalendarForecast, CalendarStatus, FinancialSnapshot, ForecastPoint, MoneyCalendar } from '../../src/lib/api/types';

export interface ProfileRow {
  id: string;
  name: string;
  city: string;
  currency: string;
  month: string;
  monthLabel: string;
  asOfDay: number;
  projectedPayday: number;
  openingBalance: number;
  bufferTarget: number;
}

export interface EventRow {
  id: string;
  label: string;
  amount: number;
  day: number;
  kind: 'income' | 'commitment' | 'goal';
  paymentType: string;
  status: 'actual' | 'forecasted' | 'pending' | 'overdue';
  confidence: 'high' | 'medium' | 'low';
  amountType: 'fixed' | 'variable' | 'range';
  accountName: string;
  reviewed: boolean;
  note: string | null;
  recurring: boolean;
  // How often (in months) the forecast repeats this event once it recurs:
  // 1 for a monthly item, 3 for a quarterly rent cheque, 4 for a roughly
  // three-times-a-year school term fee, etc. Ignored when `recurring` is
  // false.
  recurrenceIntervalMonths: number;
  // Which month `day` belongs to, relative to `profile.month` (0 = the
  // exemplar's own month). A confirmed calendar-change draft can add an
  // event that starts later (e.g. "starting 1 Oct 2026" is month_offset 1)
  // without it also counting inside the exemplar month's balance/upcoming
  // list. Every seeded event is 0.
  monthOffset: number;
}

// This demo is anchored to a fixed exemplar date, not the machine's real
// clock — every calculation (safe-to-spend, days left, upcoming
// commitments, payday) must read "today" from here, and only here.
function exemplarAsOfIso(profile: ProfileRow): string {
  return `${profile.month}-${String(profile.asOfDay).padStart(2, '0')}T09:00:00.000Z`;
}

function sortedByDay(events: EventRow[]): EventRow[] {
  return [...events].sort((a, b) => a.day - b.day);
}

function runningBalances(openingBalance: number, events: EventRow[]): Array<{ day: number; event: EventRow; balanceAfter: number }> {
  let balance = openingBalance;
  return sortedByDay(events).map((event) => {
    balance += event.kind === 'income' ? event.amount : -event.amount;
    return { day: event.day, event, balanceAfter: balance };
  });
}

// The one as-of boundary decision, applied everywhere "today" matters: an
// event dated on the as-of day itself counts as already processed (folded
// into the current balance), not still upcoming. `isProcessed`/`isUpcoming`
// are complements of the same `day <= asOfDay` test — current balance,
// bills-due-before-payday, and the "coming up" list must all agree with it.
function isProcessed(day: number, asOfDay: number): boolean {
  return day <= asOfDay;
}

export function buildMoneyCalendar(profile: ProfileRow, events: EventRow[]): MoneyCalendar {
  // Only events in the exemplar's own month affect its balance, bills-due,
  // and "upcoming" list — an event a confirmed draft placed in a future
  // month (month_offset > 0) belongs to the forecast, not to "this month".
  const currentMonthEvents = events.filter((e) => e.monthOffset === 0);
  const trail = runningBalances(profile.openingBalance, currentMonthEvents);

  const upToToday = trail.filter((t) => isProcessed(t.day, profile.asOfDay));
  const currentAvailableBalance = upToToday.length > 0 ? upToToday[upToToday.length - 1].balanceAfter : profile.openingBalance;

  const beforePayday = trail.filter((t) => !isProcessed(t.day, profile.asOfDay) && t.day < profile.projectedPayday);
  const expectedIncomeBeforeNextPayday = beforePayday.filter((t) => t.event.kind === 'income').reduce((sum, t) => sum + t.event.amount, 0);
  const billsAndCommitmentsDueBeforeNextPayday = beforePayday.filter((t) => t.event.kind === 'commitment').reduce((sum, t) => sum + t.event.amount, 0);
  const minimumDebtPayments = beforePayday.filter((t) => t.event.paymentType === 'credit-card').reduce((sum, t) => sum + t.event.amount, 0);
  const plannedGoalContributions = trail.filter((t) => t.event.kind === 'goal').reduce((sum, t) => sum + t.event.amount, 0);
  const recommendedEmergencyBuffer = profile.bufferTarget;

  const safeToSpendUntilPayday = currentAvailableBalance - billsAndCommitmentsDueBeforeNextPayday - plannedGoalContributions - recommendedEmergencyBuffer;
  const daysLeft = Math.max(1, profile.projectedPayday - profile.asOfDay);
  const dailyAllowance = Math.round((safeToSpendUntilPayday / daysLeft) * 100) / 100;

  const lowest = trail.reduce((min, t) => (t.balanceAfter < min.balanceAfter ? t : min), { balanceAfter: profile.openingBalance, day: 0 } as { balanceAfter: number; day: number });
  const tightDay = lowest.day || profile.projectedPayday;

  const hasOverdue = currentMonthEvents.some((e) => e.kind !== 'income' && e.status === 'overdue');
  const reviewNeeds = currentMonthEvents.filter((e) => !e.reviewed && (e.status === 'forecasted' || e.status === 'pending')).length;

  const status: CalendarStatus =
    safeToSpendUntilPayday <= 0
      ? { tone: 'danger', text: 'Cash is stretched', detail: 'Safe to spend is depleted before payday.' }
      : hasOverdue
        ? { tone: 'warning', text: 'Action needed', detail: 'Some commitments are marked as overdue.' }
        : reviewNeeds > 0
          ? { tone: 'warning', text: 'Forecast needs review', detail: 'On-track status depends on confirmation.' }
          : Math.abs(profile.asOfDay - tightDay) <= 3
            ? { tone: 'warning', text: 'Tight days ahead', detail: `Keep your buffer untouched around the ${tightDay}th.` }
            : { tone: 'success', text: 'On track', detail: 'Sufficient safe-to-spend for the days ahead.' };

  const financialSnapshot: FinancialSnapshot = {
    asOf: exemplarAsOfIso(profile),
    currency: profile.currency as 'AED',
    currentAvailableBalance,
    expectedIncomeBeforeNextPayday,
    billsAndCommitmentsDueBeforeNextPayday,
    minimumDebtPayments,
    plannedGoalContributions,
    recommendedEmergencyBuffer,
    safeToSpendUntilPayday,
  };

  const calendarEvents: CalendarEvent[] = sortedByDay(currentMonthEvents).map((e) => ({
    id: e.id,
    label: e.label,
    amount: e.amount,
    day: e.day,
    kind: e.kind,
    paymentType: e.paymentType,
    status: e.status,
    confidence: e.confidence,
    amountType: e.amountType,
    accountName: e.accountName,
    reviewed: e.reviewed,
    note: e.note,
  }));

  const upcomingCommitments = calendarEvents.filter((e) => e.kind !== 'income' && !isProcessed(e.day, profile.asOfDay));

  return {
    persona: profile.name,
    month: profile.month,
    monthLabel: profile.monthLabel,
    projectedPayday: profile.projectedPayday,
    tightDay,
    bufferTarget: profile.bufferTarget,
    financialSnapshot,
    events: calendarEvents,
    assumptions: [
      `This is a fixed demo exemplar dated ${profile.month}-${String(profile.asOfDay).padStart(2, '0')}, not the real current date.`,
      'Safe-to-spend excludes the recommended emergency buffer.',
      'Goal contributions are set aside before anything is called "safe to spend".',
      'Variable-confidence items use a three-month average until reviewed.',
    ],
    dailyAllowance,
    daysLeft,
    nextPaydayDate: `${profile.month}-${String(profile.projectedPayday).padStart(2, '0')}`,
    status,
    upcomingCommitments,
  };
}

const HORIZON_MONTHS = 12;

export function buildCalendarForecast(profile: ProfileRow, events: EventRow[]): CalendarForecast {
  const calendar = buildMoneyCalendar(profile, events);
  const startBalance = calendar.financialSnapshot.currentAvailableBalance;

  const restOfThisMonth = sortedByDay(events).filter((e) => e.monthOffset === 0 && e.day > profile.asOfDay);
  const recurring = sortedByDay(events).filter((e) => e.recurring);
  // Non-recurring events dated in a future month (e.g. a one-time bonus a
  // confirmed draft placed in October) — applied exactly once, when the
  // loop below reaches their month, unlike `restOfThisMonth` above which
  // only covers the exemplar's own month.
  const futureOneTime = sortedByDay(events).filter((e) => !e.recurring && e.monthOffset > 0);

  let balance = startBalance;
  let lowest = { day: profile.asOfDay, balance, label: 'Today' };
  const points: ForecastPoint[] = [];
  const monthEnd: Record<string, number> = {};

  const applyEvent = (monthOffset: number, event: EventRow) => {
    balance += event.kind === 'income' ? event.amount : -event.amount;
    const [year, month] = profile.month.split('-').map(Number);
    const targetMonthIndex = month - 1 + monthOffset;
    const date = new Date(Date.UTC(year, targetMonthIndex, event.day));
    const dateKey = date.toISOString().slice(0, 10);
    points.push({ date: dateKey, eventId: event.id, label: event.label, amount: event.kind === 'income' ? event.amount : -event.amount, category: event.paymentType, balanceAfter: balance });
    if (balance < lowest.balance) lowest = { day: event.day, balance, label: event.label };
    return dateKey;
  };

  for (const event of restOfThisMonth) {
    applyEvent(0, event);
  }
  monthEnd[profile.month] = balance;

  for (let monthOffset = 1; monthOffset < HORIZON_MONTHS; monthOffset += 1) {
    for (const event of recurring) {
      // Relative to the event's own start month, not always the exemplar's
      // — an event seeded at month_offset 0 behaves exactly as before
      // (relative === monthOffset), while a draft-added event starting
      // later only begins recurring from its own start month onward.
      const relative = monthOffset - event.monthOffset;
      if (relative >= 0 && relative % event.recurrenceIntervalMonths === 0) {
        applyEvent(monthOffset, event);
      }
    }
    for (const event of futureOneTime) {
      if (event.monthOffset === monthOffset) {
        applyEvent(monthOffset, event);
      }
    }
    const [year, month] = profile.month.split('-').map(Number);
    const targetDate = new Date(Date.UTC(year, month - 1 + monthOffset, 1));
    const key = `${targetDate.getUTCFullYear()}-${String(targetDate.getUTCMonth() + 1).padStart(2, '0')}`;
    monthEnd[key] = balance;
  }

  return {
    asOf: calendar.financialSnapshot.asOf,
    openingBalance: startBalance,
    horizonMonths: HORIZON_MONTHS,
    safeToSpendToday: calendar.financialSnapshot.safeToSpendUntilPayday,
    safeToSpendNote: 'After this month’s rent, school fees and your buffer, this is what’s safely spendable before payday.',
    nextSalaryDate: calendar.nextPaydayDate,
    lowestPoint: { date: points.find((p) => p.balanceAfter === lowest.balance)?.date ?? calendar.nextPaydayDate, balance: lowest.balance, label: lowest.label },
    monthEnd,
    points,
    bufferTarget: profile.bufferTarget,
  };
}
