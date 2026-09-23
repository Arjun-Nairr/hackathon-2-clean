// Typed shapes for every value the UI displays. Bundle 1's mock client returns
// these directly; Bundle 2's HTTP client will return the same shapes from a
// real server. The frontend never derives a money figure or a verdict that
// isn't already a field here — it only formats what it's given.

export interface CalendarEvent {
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
  note?: string | null;
}

export interface FinancialSnapshot {
  asOf: string;
  currency: 'AED';
  currentAvailableBalance: number;
  expectedIncomeBeforeNextPayday: number;
  billsAndCommitmentsDueBeforeNextPayday: number;
  minimumDebtPayments: number;
  plannedGoalContributions: number;
  recommendedEmergencyBuffer: number;
  safeToSpendUntilPayday: number;
}

export interface CalendarStatus {
  tone: 'success' | 'warning' | 'danger';
  text: string;
  detail: string;
}

export interface MoneyCalendar {
  persona: string;
  month: string;
  monthLabel: string;
  projectedPayday: number;
  tightDay: number;
  bufferTarget: number;
  financialSnapshot: FinancialSnapshot;
  events: CalendarEvent[];
  assumptions: string[];
  // Precomputed by the engine (mock here, real server in Bundle 2) so the
  // frontend never has to work out a daily figure or a status color itself.
  dailyAllowance: number;
  daysLeft: number;
  nextPaydayDate: string;
  status: CalendarStatus;
  // Non-income events strictly after the exemplar "as of" day, in day order.
  // The backend applies the same as-of boundary here as it does to
  // `currentAvailableBalance` — the frontend must not re-derive this list
  // from `events` itself (that quietly let a past event, e.g. day-1 rent,
  // show up as "coming up" again).
  upcomingCommitments: CalendarEvent[];
}

export interface ForecastPoint {
  date: string;
  eventId: string;
  label: string;
  amount: number;
  category: string;
  balanceAfter: number;
}

export interface CalendarForecast {
  asOf: string;
  openingBalance: number;
  horizonMonths: number;
  safeToSpendToday: number;
  safeToSpendNote: string;
  nextSalaryDate: string | null;
  lowestPoint: { date: string; balance: number; label: string };
  monthEnd: Record<string, number>;
  points: ForecastPoint[];
  bufferTarget: number;
}

export type LoanRateType = 'flat' | 'reducing';

export interface AffordabilityInput {
  amount: number;
  annualRate: number;
  tenureMonths: number;
  upfrontCash: number;
  financedFee: boolean;
  rateType: LoanRateType;
  processingFeePercentage: number;
}

export interface AffordabilityResult {
  verdict: 'fits' | 'fits-if' | 'does-not-fit';
  headline: string;
  monthlyInstallment: number;
  maxInstallment: number;
  reducingEquivalentRate: number;
  apr: number;
  totalInterest: number;
  totalCostAbovePrincipal: number;
  legal: { debtRatio: number; maxDebtRatio: number; salaryMultiple: number; maxSalaryMultiple: number; passes: boolean };
  calendar: { lowestBalance: number; worstMonth: string };
  resilience: { bufferAfterUpfront: number; targetBuffer: number; monthsSurvived: number; passes: boolean };
  suggestions: string[];
  assumptions: string[];
}

export interface RentVsBuyInput {
  monthlyRent: number;
  homePrice: number;
  savings: number;
  yearsToStay: number;
  annualIncome: number;
  existingInstallments: number;
  familyPlans: string;
  serviceChargeAnnual: number;
}

export interface RentVsBuyResult {
  verdict: 'buy' | 'rent' | 'close-call';
  headline: string;
  dayOneCash: number;
  monthlyOwning: number;
  monthlyRenting: number;
  breakEvenYear: number | null;
  flipFactor: string;
  components: { label: string; amount: number; typical?: boolean }[];
  cashShortfall?: number;
  dayOneCashPctOfPrice?: number;
  scenarios: { label: string; netPosition: number; breakEvenYear: number | null }[];
  assumptions: string[];
}

export type ChatNumber = { label: string; valueAed?: number; valuePct?: number; valueText?: string; detail?: string };
// No `url`: Bundle 1 never shows a regulatory link it hasn't verified itself.
export type ChatRule = { path: string; source: string };
export type VerdictCard = { type: 'verdict'; comfortBand: 'green' | 'amber' | 'red'; headline: string; numbers: ChatNumber[]; components?: { label: string; valueAed: number; typical?: boolean }[]; whatWouldChangeIt: string[]; rules: ChatRule[]; doNothing: string };
export type MissingDataCard = { type: 'missing_data'; fields: { key: string; label: string; how: string }[] };

// A chat-proposed calendar change. It is inert until the application's own
// confirm endpoint applies it — this card never implies the change already
// happened.
export type CalendarDraftEventView = {
  name: string;
  amountAed: number;
  direction: 'debit' | 'credit';
  date: string;
  recurrence: 'none' | 'monthly' | 'quarterly' | 'yearly';
  category: string;
  note?: string;
};
// Before/after values from the deterministic finance engine, shown so the
// user sees the effect of a proposed change before they confirm it. Never
// computed in the browser or by the model.
export type CalendarDraftImpact = { metricLabel: string; before: number; after: number };

export type CalendarDraftCard = {
  type: 'calendar_draft';
  draftId: string;
  action: 'add' | 'update' | 'delete';
  targetEventId?: string;
  events: CalendarDraftEventView[];
  reason: string;
  impact: CalendarDraftImpact;
};

export type ChatCard =
  | VerdictCard
  | MissingDataCard
  | CalendarDraftCard
  | { type: 'decline' }
  | { type: 'unavailable'; capability: string }
  | { type: 'answer'; source: string };

export interface ChatHistoryItem {
  role: 'user' | 'assistant';
  content: string;
}

export interface ChatRequest {
  sessionId: string;
  message: string;
  history: ChatHistoryItem[];
}

export interface ChatResponse {
  sessionId: string;
  messageId: string;
  text: string;
  card: ChatCard;
}

export interface ConfirmDraftResult {
  status: 'confirmed';
  alreadyApplied: boolean;
  appliedEventIds: string[];
  calendar: MoneyCalendar;
  forecast: CalendarForecast;
}

export interface RejectDraftResult {
  status: 'rejected';
}

export interface Commitment {
  name: string;
  amount: number;
  day: number;
  category: string;
  confidence: 'high' | 'medium' | 'low';
}

export interface FinancialGoal {
  name: string;
  target: number;
  date: string;
  priority: 'high' | 'medium' | 'low';
}

export interface FinancialProfileInput {
  country: string;
  emirate: string;
  residency: string;
  employment: string;
  householdType: string;
  adults: number;
  dependents: number;
  basicSalary: number;
  housingAllowance: number;
  variableIncome: number;
  payFrequency: string;
  payday: number;
  availableBalance: number;
  mainAccount: string;
  commitments: Commitment[];
  goals: FinancialGoal[];
  bufferPreference: string;
  bufferAmount: number;
}

export type FinancialProfile = FinancialProfileInput;

export type DocumentType = 'bank-statement' | 'payslip' | 'credit-card-statement' | 'tenancy-contract' | 'school-fee-schedule';
export type AccountType = 'current' | 'savings' | 'credit-card';

export interface AccountConnectionInput {
  institution: string;
  accountName: string;
  accountType: AccountType;
}

export interface AccountConnection extends AccountConnectionInput {
  id: string;
  status: 'connected' | 'pending' | 'disconnected';
  lastSyncedAt: string | null;
}

export interface DocumentImportInput {
  documentType: DocumentType;
  label: string;
  amount: number;
  day: number;
  kind: 'income' | 'fixed' | 'lump' | 'goal';
  paymentType: string;
  amountType: 'fixed' | 'variable' | 'range';
  accountName: string;
  note?: string;
}

export interface ImportedRecord {
  id: string;
  reviewStatus: 'needs-review' | 'duplicate' | 'accepted' | 'rejected';
  source: { type: DocumentType };
  event: { label: string; amount: number; day: number; accountName: string };
  discoveredAt: string;
  duplicateOf?: string | null;
}

export interface ImportsQueue {
  records: ImportedRecord[];
  connections: AccountConnection[];
}
