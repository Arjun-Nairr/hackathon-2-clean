// Fixed, typed fixtures for the one demo household this mock serves: Rohan
// Mehta, Dubai, AED. Every value below is a literal, not a runtime
// calculation — Bundle 1 must not derive safe-to-spend, daily allowance,
// status, or any other financial meaning from user input.
import type { CalendarEvent, CalendarForecast, FinancialSnapshot, MoneyCalendar } from './types';

export const MONTH_LABEL = 'September 2026';
export const MONTH = '2026-09';

export const events: CalendarEvent[] = [
  { id: 'rent-cheque', label: 'Rent cheque (Q4)', amount: 18000, day: 1, kind: 'commitment', paymentType: 'housing', status: 'actual', confidence: 'high', amountType: 'fixed', accountName: 'Main current account', reviewed: true },
  { id: 'school-term', label: 'School term fees', amount: 12000, day: 1, kind: 'commitment', paymentType: 'school', status: 'actual', confidence: 'high', amountType: 'fixed', accountName: 'Main current account', reviewed: true },
  { id: 'car-loan', label: 'Car loan installment', amount: 2300, day: 5, kind: 'commitment', paymentType: 'loan', status: 'forecasted', confidence: 'high', amountType: 'fixed', accountName: 'Main current account', reviewed: true },
  { id: 'dewa', label: 'DEWA', amount: 450, day: 10, kind: 'commitment', paymentType: 'utilities', status: 'pending', confidence: 'medium', amountType: 'variable', accountName: 'Main current account', reviewed: false },
  { id: 'groceries', label: 'Groceries & essentials', amount: 2200, day: 15, kind: 'commitment', paymentType: 'other', status: 'forecasted', confidence: 'medium', amountType: 'variable', accountName: 'Main current account', reviewed: false, note: 'Estimated from last three months.' },
  { id: 'card-minimum', label: 'Credit card minimum', amount: 600, day: 20, kind: 'commitment', paymentType: 'credit-card', status: 'pending', confidence: 'high', amountType: 'fixed', accountName: 'Main current account', reviewed: true },
  { id: 'salary', label: 'Salary', amount: 25000, day: 25, kind: 'income', paymentType: 'salary', status: 'forecasted', confidence: 'high', amountType: 'fixed', accountName: 'Main current account', reviewed: true },
];

const financialSnapshot: FinancialSnapshot = {
  asOf: '2026-09-10T09:00:00.000Z',
  currency: 'AED',
  currentAvailableBalance: 57250,
  expectedIncomeBeforeNextPayday: 0,
  billsAndCommitmentsDueBeforeNextPayday: 2800,
  minimumDebtPayments: 600,
  plannedGoalContributions: 500,
  recommendedEmergencyBuffer: 45000,
  safeToSpendUntilPayday: 8950,
};

// GET /money-calendar fixture. `dailyAllowance` and `status` are fixed
// fields here, not computed from `safeToSpendUntilPayday` at request time.
export const MONEY_CALENDAR_FIXTURE: MoneyCalendar = {
  persona: 'Rohan Mehta',
  month: MONTH,
  monthLabel: MONTH_LABEL,
  projectedPayday: 25,
  tightDay: 20,
  bufferTarget: 45000,
  financialSnapshot,
  events,
  assumptions: [
    'Safe-to-spend excludes the recommended emergency buffer.',
    'Goal contributions are set aside before anything is called "safe to spend".',
    'Variable-confidence items use a three-month average until reviewed.',
  ],
  dailyAllowance: 596.67,
  daysLeft: 15,
  nextPaydayDate: '2026-09-25',
  status: {
    tone: 'warning',
    text: 'Forecast needs review',
    detail: 'On-track status depends on confirmation.',
  },
};

// GET /calendar-forecast fixture. `points` amounts are the literal month-end
// deltas; nothing here is derived at request time.
export const CALENDAR_FORECAST_FIXTURE: CalendarForecast = {
  asOf: financialSnapshot.asOf,
  openingBalance: 57250,
  horizonMonths: 12,
  safeToSpendToday: 8950,
  safeToSpendNote: 'After this month’s rent, school fees and your buffer, this is what’s safely spendable before payday.',
  nextSalaryDate: '2026-09-25',
  lowestPoint: { date: '2026-09-20', balance: 54450, label: 'Credit card minimum' },
  monthEnd: {
    '2026-09': 79450,
    '2026-10': 98900,
    '2026-11': 118350,
    '2026-12': 125800,
    '2027-01': 145250,
    '2027-02': 164700,
    '2027-03': 166150,
    '2027-04': 185600,
    '2027-05': 205050,
    '2027-06': 224500,
    '2027-07': 243950,
    '2027-08': 263400,
  },
  points: [
    { date: '2026-09-15', eventId: 'groceries', label: 'Groceries & essentials', amount: -2200, category: 'other', balanceAfter: 55050 },
    { date: '2026-09-20', eventId: 'card-minimum', label: 'Credit card minimum', amount: -600, category: 'credit-card', balanceAfter: 54450 },
    { date: '2026-09-25', eventId: 'salary', label: 'Salary', amount: 25000, category: 'salary', balanceAfter: 79450 },
    { date: '2026-10-28', eventId: 'month-end-2026-10', label: 'Month end', amount: 19450, category: 'salary', balanceAfter: 98900 },
    { date: '2026-11-28', eventId: 'month-end-2026-11', label: 'Month end', amount: 19450, category: 'salary', balanceAfter: 118350 },
    { date: '2026-12-28', eventId: 'month-end-2026-12', label: 'Month end', amount: 7450, category: 'salary', balanceAfter: 125800 },
    { date: '2027-01-28', eventId: 'month-end-2027-01', label: 'Month end', amount: 19450, category: 'salary', balanceAfter: 145250 },
    { date: '2027-02-28', eventId: 'month-end-2027-02', label: 'Month end', amount: 19450, category: 'salary', balanceAfter: 164700 },
    { date: '2027-03-28', eventId: 'month-end-2027-03', label: 'Month end', amount: 1450, category: 'salary', balanceAfter: 166150 },
    { date: '2027-04-28', eventId: 'month-end-2027-04', label: 'Month end', amount: 19450, category: 'salary', balanceAfter: 185600 },
    { date: '2027-05-28', eventId: 'month-end-2027-05', label: 'Month end', amount: 19450, category: 'salary', balanceAfter: 205050 },
    { date: '2027-06-28', eventId: 'month-end-2027-06', label: 'Month end', amount: 19450, category: 'salary', balanceAfter: 224500 },
    { date: '2027-07-28', eventId: 'month-end-2027-07', label: 'Month end', amount: 19450, category: 'salary', balanceAfter: 243950 },
    { date: '2027-08-28', eventId: 'month-end-2027-08', label: 'Month end', amount: 19450, category: 'salary', balanceAfter: 263400 },
  ],
  bufferTarget: 45000,
};
