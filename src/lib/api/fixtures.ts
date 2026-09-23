// Fixed, typed response fixtures for Bundle 1. No amortization, APR, DBR,
// LTV, break-even, or verdict math happens anywhere in this app yet — every
// number below is a literal, carried over from the values this app already
// showed before the real finance engine exists. `checkAffordability` and
// `compareRentVsBuy` return these regardless of the submitted form input;
// the real engine (Bundle 2+) is what makes them respond to input.
import type { AffordabilityResult, ChatCard, ChatRule, RentVsBuyResult } from './types';

export const AFFORDABILITY_FIXTURE: AffordabilityResult = {
  verdict: 'fits',
  headline: 'This fits your month, with AED 87,267 still comfortable.',
  monthlyInstallment: 1932.67,
  maxInstallment: 9600,
  reducingEquivalentRate: 7.38,
  apr: 4.24,
  totalInterest: 12768,
  totalCostAbovePrincipal: 13568,
  legal: { debtRatio: 19.3, maxDebtRatio: 50, salaryMultiple: 3.2, maxSalaryMultiple: 20, passes: true },
  calendar: { lowestBalance: 52517, worstMonth: 'September 2026' },
  resilience: { bufferAfterUpfront: 89200, targetBuffer: 45000, monthsSurvived: 15, passes: true },
  suggestions: [],
  assumptions: [
    'Uses a 50% debt-burden ratio and a 20x-salary cap, the commonly cited UAE personal-loan guidelines.',
    'Existing monthly debt assumed at AED 2,900 (car loan + card minimum).',
    'Flat rate shown as advertised; the reducing-balance equivalent is an approximation.',
  ],
};

export const RENT_VS_BUY_FIXTURE: RentVsBuyResult = {
  verdict: 'rent',
  headline: 'Renting keeps more cash free for the years you plan to stay.',
  dayOneCash: 531290,
  monthlyOwning: 10561,
  monthlyRenting: 10000,
  breakEvenYear: null,
  flipFactor: 'If you stayed 3 years instead of 5, the day-one cash may not be worth it.',
  components: [
    { label: 'Down payment', amount: 400000 },
    { label: 'DLD transfer fee', amount: 80000, typical: true },
    { label: 'Agency fee', amount: 40000, typical: true },
    { label: 'Mortgage registration', amount: 5290, typical: true },
    { label: 'Trustee & other', amount: 6000, typical: true },
  ],
  cashShortfall: 441290,
  dayOneCashPctOfPrice: 26.6,
  scenarios: [
    { label: 'Flat market', netPosition: -33688, breakEvenYear: null },
    { label: 'Prices +3%/yr', netPosition: -15688, breakEvenYear: null },
    { label: 'Prices -10%', netPosition: -81504, breakEvenYear: null },
  ],
  assumptions: [
    '20% down payment, the standard LTV tier for this price band.',
    'Fees never financed: 4% DLD, 2% agency, mortgage registration and trustee fees, all paid day one.',
    'Mortgage assumed at 4.5% reducing over 25 years; rent grows 3%/year in the rising scenario.',
  ],
};

const RULE_REFS: ChatRule[] = [
  { path: 'dbr-limit', source: 'Debt-burden ratio guideline (50% of income)' },
  { path: 'salary-multiple', source: 'Loan-to-salary guideline (20x monthly salary)' },
];

export const AFFORDABILITY_CHAT_CARD: ChatCard = {
  type: 'verdict',
  comfortBand: 'green',
  headline: AFFORDABILITY_FIXTURE.headline,
  numbers: [
    { label: 'Monthly instalment', valueAed: AFFORDABILITY_FIXTURE.monthlyInstallment },
    { label: 'Legal debt ratio', valuePct: AFFORDABILITY_FIXTURE.legal.debtRatio, detail: `Limit ${AFFORDABILITY_FIXTURE.legal.maxDebtRatio}%` },
    { label: 'Lowest balance this loan', valueAed: AFFORDABILITY_FIXTURE.calendar.lowestBalance, detail: AFFORDABILITY_FIXTURE.calendar.worstMonth },
  ],
  whatWouldChangeIt: [],
  rules: RULE_REFS,
  doNothing: 'Your calendar carries on exactly as it does today.',
};

export const RENT_VS_BUY_CHAT_CARD: ChatCard = {
  type: 'verdict',
  comfortBand: 'amber',
  headline: RENT_VS_BUY_FIXTURE.headline,
  numbers: [
    { label: 'Day-one cash', valueAed: RENT_VS_BUY_FIXTURE.dayOneCash },
    { label: 'Owning / month', valueAed: RENT_VS_BUY_FIXTURE.monthlyOwning },
    { label: 'Break-even', valueText: 'Never' },
  ],
  components: RENT_VS_BUY_FIXTURE.components.map((c) => ({ label: c.label, valueAed: c.amount, typical: c.typical })),
  whatWouldChangeIt: [RENT_VS_BUY_FIXTURE.flipFactor],
  rules: RULE_REFS,
  doNothing: 'You keep renting at today’s rate; nothing about your plan changes.',
};

export const TIGHT_MONTH_ANSWER = {
  text: 'Your tightest point this year is AED 54,450 on 2026-09-20, right after credit card minimum.',
  card: { type: 'answer', source: 'calendar-forecast' } satisfies ChatCard,
};

export const DECLINE_ANSWER = {
  text: "That's outside what I can work out yet. Try a loan, rent vs buy, or your tight month.",
  card: { type: 'decline' } satisfies ChatCard,
};
