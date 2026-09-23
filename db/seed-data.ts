// The one synthetic AED exemplar household and one month of transactions,
// as plain data. Pure and side-effect-free so both `seed.ts` and the
// finance-engine unit tests can import it directly.
export const PROFILE = {
  id: 'rohan-mehta',
  name: 'Rohan Mehta',
  city: 'Dubai',
  currency: 'AED',
  month: '2026-09',
  monthLabel: 'September 2026',
  asOfDay: 10,
  projectedPayday: 25,
  openingBalance: 90000,
  bufferTarget: 45000,
} as const;

export const EVENTS = [
  // Quarterly, not monthly: recurs every 3 months (Sep, Dec, Mar, Jun, ...).
  { id: 'rent-cheque', label: 'Rent cheque (Q4)', amount: 18000, day: 1, kind: 'commitment', paymentType: 'housing', status: 'actual', confidence: 'high', amountType: 'fixed', accountName: 'Main current account', reviewed: true, note: null, recurring: true, recurrenceIntervalMonths: 3, monthOffset: 0 },
  // Termly, not monthly: recurs roughly three times a year, every 4 months.
  { id: 'school-term', label: 'School term fees', amount: 12000, day: 1, kind: 'commitment', paymentType: 'school', status: 'actual', confidence: 'high', amountType: 'fixed', accountName: 'Main current account', reviewed: true, note: null, recurring: true, recurrenceIntervalMonths: 4, monthOffset: 0 },
  { id: 'car-loan', label: 'Car loan installment', amount: 2300, day: 5, kind: 'commitment', paymentType: 'loan', status: 'forecasted', confidence: 'high', amountType: 'fixed', accountName: 'Main current account', reviewed: true, note: null, recurring: true, recurrenceIntervalMonths: 1, monthOffset: 0 },
  { id: 'dewa', label: 'DEWA', amount: 450, day: 10, kind: 'commitment', paymentType: 'utilities', status: 'pending', confidence: 'medium', amountType: 'variable', accountName: 'Main current account', reviewed: false, note: null, recurring: true, recurrenceIntervalMonths: 1, monthOffset: 0 },
  { id: 'groceries', label: 'Groceries & essentials', amount: 2200, day: 15, kind: 'commitment', paymentType: 'other', status: 'forecasted', confidence: 'medium', amountType: 'variable', accountName: 'Main current account', reviewed: false, note: 'Estimated from last three months.', recurring: true, recurrenceIntervalMonths: 1, monthOffset: 0 },
  { id: 'card-minimum', label: 'Credit card minimum', amount: 600, day: 20, kind: 'commitment', paymentType: 'credit-card', status: 'pending', confidence: 'high', amountType: 'fixed', accountName: 'Main current account', reviewed: true, note: null, recurring: true, recurrenceIntervalMonths: 1, monthOffset: 0 },
  { id: 'salary', label: 'Salary', amount: 25000, day: 25, kind: 'income', paymentType: 'salary', status: 'forecasted', confidence: 'high', amountType: 'fixed', accountName: 'Main current account', reviewed: true, note: null, recurring: true, recurrenceIntervalMonths: 1, monthOffset: 0 },
] as const;
