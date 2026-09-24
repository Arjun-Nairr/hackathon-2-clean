import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  calculateLoanDecision,
  LoanCalculatorInputError,
  type LoanCalculatorInput,
} from '../api/_lib/loan-calculator';

const context = {
  monthlyIncome: 25_000,
  existingMonthlyDebt: 2_900,
  currentBalance: 57_250,
  bufferTarget: 45_000,
  lowestForecastBalance: 54_450,
};

const baseInput: LoanCalculatorInput = {
  requestedLoanAmount: 80_000,
  annualInterestRatePct: 3.99,
  rateType: 'flat',
  termMonths: 48,
  processingFeeAed: 800,
  financeProcessingFee: false,
  upfrontCashAed: 0,
  context,
};

test('flat-rate loan returns transparent deterministic repayment and affordability fields', () => {
  const result = calculateLoanDecision(baseInput);
  assert.equal(result.monthlyInstalment, 1_932.67);
  assert.equal(result.totalInterest, 12_768);
  assert.equal(result.totalRepayment, 93_568);
  assert.equal(result.debtBurdenRatioPct, 19.3307);
  assert.equal(result.loanToMonthlyIncomeMultiple, 3.2);
  assert.equal(result.projectedLowestBalanceAfterUpfrontCosts, 53_650);
  assert.equal(result.verdict, 'comfortable');
  assert.ok(result.reducingEquivalentAnnualRatePct > inputRate(baseInput));
  assert.match(result.assumptions.join(' '), /not legal eligibility or bank approval/i);
});

function inputRate(input: LoanCalculatorInput): number {
  return input.annualInterestRatePct;
}

test('zero-interest loan divides principal evenly with no interest', () => {
  const result = calculateLoanDecision({ ...baseInput, annualInterestRatePct: 0, rateType: 'reducing', processingFeeAed: 0 });
  assert.equal(result.monthlyInstalment, 1_666.67);
  assert.equal(result.totalInterest, 0);
  assert.equal(result.totalRepayment, 80_000);
  assert.equal(result.reducingEquivalentAnnualRatePct, 0);
});

test('flat and reducing rates produce different payments while remaining stable', () => {
  const flat = calculateLoanDecision(baseInput);
  const reducing = calculateLoanDecision({ ...baseInput, rateType: 'reducing' });
  assert.ok(flat.monthlyInstalment > reducing.monthlyInstalment);
  assert.ok(flat.totalInterest > reducing.totalInterest);
  assert.deepEqual(calculateLoanDecision(baseInput), flat);
});

test('financed fee increases principal while cash-paid fee reduces forecast liquidity', () => {
  const paid = calculateLoanDecision(baseInput);
  const financed = calculateLoanDecision({ ...baseInput, financeProcessingFee: true });
  assert.equal(financed.financedPrincipal, 80_800);
  assert.equal(financed.dayOneCashOutflow, 0);
  assert.equal(financed.projectedLowestBalanceAfterUpfrontCosts, 54_450);
  assert.equal(paid.dayOneCashOutflow, 800);
  assert.ok(financed.monthlyInstalment > paid.monthlyInstalment);
});

test('extreme loan fails the debt and income-multiple checks', () => {
  const result = calculateLoanDecision({ ...baseInput, requestedLoanAmount: 2_000_000_000 });
  assert.equal(result.verdict, 'does-not-fit');
  assert.equal(result.checks.find((check) => check.id === 'monthly-debt-burden')?.status, 'fail');
  assert.equal(result.checks.find((check) => check.id === 'loan-to-income')?.status, 'fail');
});

test('low but nonzero income produces a does-not-fit verdict rather than unstable arithmetic', () => {
  const result = calculateLoanDecision({ ...baseInput, context: { ...context, monthlyIncome: 2_000 } });
  assert.equal(result.verdict, 'does-not-fit');
  assert.ok(Number.isFinite(result.debtBurdenRatioPct));
});

test('upfront cash and fees cannot silently consume more liquidity than exists', () => {
  const result = calculateLoanDecision({
    ...baseInput,
    upfrontCashAed: 50_000,
    processingFeeAed: 10_000,
  });
  assert.equal(result.verdict, 'does-not-fit');
  assert.equal(result.checks.find((check) => check.id === 'upfront-liquidity')?.status, 'fail');
  assert.equal(result.projectedLowestBalanceAfterUpfrontCosts, -5_550);
});

test('invalid, negative and zero-income inputs are rejected', () => {
  assert.throws(() => calculateLoanDecision({ ...baseInput, requestedLoanAmount: -1 }), LoanCalculatorInputError);
  assert.throws(() => calculateLoanDecision({ ...baseInput, termMonths: 0 }), LoanCalculatorInputError);
  assert.throws(() => calculateLoanDecision({ ...baseInput, context: { ...context, monthlyIncome: 0 } }), LoanCalculatorInputError);
  assert.throws(() => calculateLoanDecision({ ...baseInput, upfrontCashAed: 90_000 }), LoanCalculatorInputError);
  assert.throws(() => calculateLoanDecision({ ...baseInput, requestedLoanAmount: Number.MAX_VALUE }), LoanCalculatorInputError);
  assert.throws(() => calculateLoanDecision({ ...baseInput, annualInterestRatePct: 1_001 }), LoanCalculatorInputError);
});
