export type LoanRateType = 'flat' | 'reducing';
export type DecisionVerdict = 'comfortable' | 'tight' | 'does-not-fit';
export type ThresholdStatus = 'pass' | 'warning' | 'fail';

export interface LoanFinancialContext {
  monthlyIncome: number;
  existingMonthlyDebt: number;
  currentBalance: number;
  bufferTarget: number;
  lowestForecastBalance: number;
}

export interface LoanCalculatorInput {
  requestedLoanAmount: number;
  annualInterestRatePct: number;
  rateType: LoanRateType;
  termMonths: number;
  processingFeeAed: number;
  financeProcessingFee: boolean;
  upfrontCashAed?: number;
  context: LoanFinancialContext;
}

export interface LoanThresholdCheck {
  id: 'monthly-debt-burden' | 'loan-to-income' | 'upfront-liquidity' | 'buffer-resilience';
  label: string;
  status: ThresholdStatus;
  actual: number;
  preferredMaximum?: number;
  demoMaximum?: number;
  requiredMinimum?: number;
  unit: 'percent' | 'multiple' | 'AED';
}

export interface LoanCalculatorResult {
  monthlyInstalment: number;
  totalInterest: number;
  totalRepayment: number;
  financedPrincipal: number;
  reducingEquivalentAnnualRatePct: number;
  debtBurdenRatioPct: number;
  loanToMonthlyIncomeMultiple: number;
  dayOneCashOutflow: number;
  projectedLowestBalanceAfterUpfrontCosts: number;
  checks: LoanThresholdCheck[];
  verdict: DecisionVerdict;
  assumptions: string[];
  reasons: string[];
}

export const LOAN_DEMO_THRESHOLDS = {
  preferredDebtBurdenPct: 40,
  maximumDebtBurdenPct: 50,
  preferredIncomeMultiple: 12,
  maximumIncomeMultiple: 20,
} as const;

const MAX_SUPPORTED_AED_INPUT = 1_000_000_000_000;
const MAX_SUPPORTED_ANNUAL_RATE_PCT = 1_000;

export class LoanCalculatorInputError extends Error {}

function assertFiniteNonNegative(name: string, value: number): void {
  if (!Number.isFinite(value) || value < 0) {
    throw new LoanCalculatorInputError(`${name} must be a finite number greater than or equal to zero.`);
  }
}

function assertSupportedAed(name: string, value: number, allowNegative = false): void {
  if (!Number.isFinite(value) || (!allowNegative && value < 0) || Math.abs(value) > MAX_SUPPORTED_AED_INPUT) {
    const range = allowNegative ? `between -${MAX_SUPPORTED_AED_INPUT} and ${MAX_SUPPORTED_AED_INPUT}` : `between 0 and ${MAX_SUPPORTED_AED_INPUT}`;
    throw new LoanCalculatorInputError(`${name} must be a finite AED amount ${range}.`);
  }
}

function assertInputs(input: LoanCalculatorInput): void {
  assertSupportedAed('requestedLoanAmount', input.requestedLoanAmount);
  assertFiniteNonNegative('annualInterestRatePct', input.annualInterestRatePct);
  assertSupportedAed('processingFeeAed', input.processingFeeAed);
  assertSupportedAed('upfrontCashAed', input.upfrontCashAed ?? 0);
  assertSupportedAed('monthlyIncome', input.context.monthlyIncome);
  assertSupportedAed('existingMonthlyDebt', input.context.existingMonthlyDebt);
  assertSupportedAed('currentBalance', input.context.currentBalance);
  assertSupportedAed('bufferTarget', input.context.bufferTarget);
  assertSupportedAed('lowestForecastBalance', input.context.lowestForecastBalance, true);
  if (!Number.isInteger(input.termMonths) || input.termMonths <= 0 || input.termMonths > 600) {
    throw new LoanCalculatorInputError('termMonths must be an integer between 1 and 600.');
  }
  if (input.requestedLoanAmount <= 0) {
    throw new LoanCalculatorInputError('requestedLoanAmount must be greater than zero.');
  }
  if (input.annualInterestRatePct > MAX_SUPPORTED_ANNUAL_RATE_PCT) {
    throw new LoanCalculatorInputError(`annualInterestRatePct cannot exceed ${MAX_SUPPORTED_ANNUAL_RATE_PCT}.`);
  }
  if (input.context.monthlyIncome <= 0) {
    throw new LoanCalculatorInputError('monthlyIncome must be greater than zero.');
  }
  if (input.rateType !== 'flat' && input.rateType !== 'reducing') {
    throw new LoanCalculatorInputError('rateType must be "flat" or "reducing".');
  }
  if ((input.upfrontCashAed ?? 0) > input.requestedLoanAmount) {
    throw new LoanCalculatorInputError('upfrontCashAed cannot exceed requestedLoanAmount.');
  }
}

function roundMoney(value: number): number {
  return Math.round((value + Number.EPSILON) * 100) / 100;
}

function roundRate(value: number): number {
  return Math.round((value + Number.EPSILON) * 10_000) / 10_000;
}

function reducingPayment(principal: number, annualRatePct: number, termMonths: number): number {
  if (annualRatePct === 0) return principal / termMonths;
  const monthlyRate = annualRatePct / 100 / 12;
  return (principal * monthlyRate) / (1 - (1 + monthlyRate) ** -termMonths);
}

// Solves for the nominal annual reducing-balance rate that produces the
// supplied payment. This makes an advertised flat rate comparable with a
// reducing-balance rate without asking Gemini to do finance arithmetic.
function equivalentReducingRatePct(principal: number, payment: number, termMonths: number): number {
  if (payment <= principal / termMonths) return 0;
  let low = 0;
  let high = 5;
  while (reducingPayment(principal, high, termMonths) < payment && high < 1_000) high *= 2;
  for (let iteration = 0; iteration < 100; iteration += 1) {
    const mid = (low + high) / 2;
    if (reducingPayment(principal, mid, termMonths) < payment) low = mid;
    else high = mid;
  }
  return (low + high) / 2;
}

function bandMaximum(actual: number, preferred: number, maximum: number): ThresholdStatus {
  if (actual <= preferred) return 'pass';
  if (actual <= maximum) return 'warning';
  return 'fail';
}

export function calculateLoanDecision(input: LoanCalculatorInput): LoanCalculatorResult {
  assertInputs(input);

  const upfrontCash = input.upfrontCashAed ?? 0;
  const dayOneCashOutflow = upfrontCash + (input.financeProcessingFee ? 0 : input.processingFeeAed);
  const financedPrincipal = input.requestedLoanAmount - upfrontCash + (input.financeProcessingFee ? input.processingFeeAed : 0);
  const years = input.termMonths / 12;

  let monthlyInstalment: number;
  let totalInterest: number;
  if (input.rateType === 'flat') {
    totalInterest = financedPrincipal * (input.annualInterestRatePct / 100) * years;
    monthlyInstalment = (financedPrincipal + totalInterest) / input.termMonths;
  } else {
    monthlyInstalment = reducingPayment(financedPrincipal, input.annualInterestRatePct, input.termMonths);
    totalInterest = monthlyInstalment * input.termMonths - financedPrincipal;
  }

  const totalRepayment = financedPrincipal + totalInterest + (input.financeProcessingFee ? 0 : input.processingFeeAed);
  const reducingEquivalentAnnualRatePct =
    input.rateType === 'flat'
      ? equivalentReducingRatePct(financedPrincipal, monthlyInstalment, input.termMonths)
      : input.annualInterestRatePct;
  const debtBurdenRatioPct = ((input.context.existingMonthlyDebt + monthlyInstalment) / input.context.monthlyIncome) * 100;
  const loanToMonthlyIncomeMultiple = input.requestedLoanAmount / input.context.monthlyIncome;
  const projectedLowestBalanceAfterUpfrontCosts = input.context.lowestForecastBalance - dayOneCashOutflow;

  if (![monthlyInstalment, totalInterest, totalRepayment, reducingEquivalentAnnualRatePct, debtBurdenRatioPct, loanToMonthlyIncomeMultiple, projectedLowestBalanceAfterUpfrontCosts].every(Number.isFinite)) {
    throw new LoanCalculatorInputError('Inputs produce a result outside the calculator supported numeric range.');
  }

  const checks: LoanThresholdCheck[] = [
    {
      id: 'monthly-debt-burden',
      label: 'Total monthly debt burden',
      status: bandMaximum(debtBurdenRatioPct, LOAN_DEMO_THRESHOLDS.preferredDebtBurdenPct, LOAN_DEMO_THRESHOLDS.maximumDebtBurdenPct),
      actual: roundRate(debtBurdenRatioPct),
      preferredMaximum: LOAN_DEMO_THRESHOLDS.preferredDebtBurdenPct,
      demoMaximum: LOAN_DEMO_THRESHOLDS.maximumDebtBurdenPct,
      unit: 'percent',
    },
    {
      id: 'loan-to-income',
      label: 'Requested loan relative to monthly income',
      status: bandMaximum(loanToMonthlyIncomeMultiple, LOAN_DEMO_THRESHOLDS.preferredIncomeMultiple, LOAN_DEMO_THRESHOLDS.maximumIncomeMultiple),
      actual: roundRate(loanToMonthlyIncomeMultiple),
      preferredMaximum: LOAN_DEMO_THRESHOLDS.preferredIncomeMultiple,
      demoMaximum: LOAN_DEMO_THRESHOLDS.maximumIncomeMultiple,
      unit: 'multiple',
    },
    {
      id: 'upfront-liquidity',
      label: 'Current balance after upfront cash',
      status: dayOneCashOutflow <= input.context.currentBalance ? 'pass' : 'fail',
      actual: roundMoney(input.context.currentBalance - dayOneCashOutflow),
      requiredMinimum: 0,
      unit: 'AED',
    },
    {
      id: 'buffer-resilience',
      label: 'Lowest forecast balance after upfront cash',
      status:
        projectedLowestBalanceAfterUpfrontCosts >= input.context.bufferTarget
          ? 'pass'
          : projectedLowestBalanceAfterUpfrontCosts >= 0
            ? 'warning'
            : 'fail',
      actual: roundMoney(projectedLowestBalanceAfterUpfrontCosts),
      requiredMinimum: input.context.bufferTarget,
      unit: 'AED',
    },
  ];

  const verdict: DecisionVerdict = checks.some((check) => check.status === 'fail')
    ? 'does-not-fit'
    : checks.some((check) => check.status === 'warning')
      ? 'tight'
      : 'comfortable';

  const reasons = checks
    .filter((check) => check.status !== 'pass')
    .map((check) => `${check.label} is ${check.status === 'fail' ? 'outside' : 'close to'} the transparent demo threshold.`);
  if (reasons.length === 0) reasons.push('All four demo affordability checks remain within their preferred ranges.');

  return {
    monthlyInstalment: roundMoney(monthlyInstalment),
    totalInterest: roundMoney(totalInterest),
    totalRepayment: roundMoney(totalRepayment),
    financedPrincipal: roundMoney(financedPrincipal),
    reducingEquivalentAnnualRatePct: roundRate(reducingEquivalentAnnualRatePct),
    debtBurdenRatioPct: roundRate(debtBurdenRatioPct),
    loanToMonthlyIncomeMultiple: roundRate(loanToMonthlyIncomeMultiple),
    dayOneCashOutflow: roundMoney(dayOneCashOutflow),
    projectedLowestBalanceAfterUpfrontCosts: roundMoney(projectedLowestBalanceAfterUpfrontCosts),
    checks,
    verdict,
    assumptions: [
      'All amounts are in AED.',
      'Processing fee is treated as a fixed AED amount, not a percentage.',
      input.financeProcessingFee ? 'The processing fee is added to the financed principal.' : 'The processing fee is paid on day one.',
      'The debt-burden and income-multiple limits are transparent demo thresholds, not legal eligibility or bank approval.',
      'The forecast stress check subtracts day-one cash costs from the existing lowest projected balance; it does not predict lender behaviour.',
    ],
    reasons,
  };
}
