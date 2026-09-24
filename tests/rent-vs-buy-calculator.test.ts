import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  calculateRentVsBuyDecision,
  RentVsBuyInputError,
  type RentVsBuyInput,
} from '../api/_lib/rent-vs-buy-calculator';

const context = {
  monthlyIncome: 50_000,
  recurringCommitments: 10_000,
  currentBalance: 700_000,
  bufferTarget: 50_000,
  lowestForecastBalance: 650_000,
};

const baseInput: RentVsBuyInput = {
  propertyPrice: 2_000_000,
  monthlyRent: 10_000,
  availableSavings: 700_000,
  plannedStayYears: 5,
  downPaymentPct: 20,
  annualMortgageRatePct: 4.5,
  mortgageTermYears: 25,
  annualServiceCharges: 20_000,
  annualRentGrowthPct: 3,
  purchaseCostPct: 7,
  sellingCostPct: 2,
  context,
};

test('normal comparison returns day-one, monthly and three scenario outputs', () => {
  const result = calculateRentVsBuyDecision(baseInput);
  assert.equal(result.requiredDownPayment, 400_000);
  assert.equal(result.purchaseCosts, 140_000);
  assert.equal(result.totalDayOneCash, 540_000);
  assert.equal(result.cashShortfall, 0);
  assert.equal(result.projectedCurrentBalanceAfterDayOneCash, 160_000);
  assert.equal(result.mortgagePrincipal, 1_600_000);
  assert.ok(result.monthlyMortgagePayment > 8_000);
  assert.ok(result.estimatedMonthlyOwnershipCost > result.monthlyMortgagePayment);
  assert.equal(result.scenarios.length, 3);
  assert.deepEqual(result.scenarios.map((scenario) => scenario.id), ['flat-price', 'growth-3pct', 'sale-price-down-10pct']);
  assert.match(result.assumptions.join(' '), /not a property valuation/i);
});

test('insufficient savings reports the exact day-one cash shortfall and favours renting', () => {
  const result = calculateRentVsBuyDecision({ ...baseInput, availableSavings: 90_000 });
  assert.equal(result.cashShortfall, 450_000);
  assert.equal(result.verdict, 'rent');
  assert.match(result.reasons.join(' '), /do not cover/i);
});

test('short and long planned stays produce materially different comparisons', () => {
  const shortStay = calculateRentVsBuyDecision({ ...baseInput, plannedStayYears: 2 });
  const longStay = calculateRentVsBuyDecision({ ...baseInput, plannedStayYears: 15 });
  const shortFlat = shortStay.scenarios.find((scenario) => scenario.id === 'flat-price')!;
  const longFlat = longStay.scenarios.find((scenario) => scenario.id === 'flat-price')!;
  assert.notEqual(shortFlat.buyerAdvantage, longFlat.buyerAdvantage);
  assert.ok(longStay.cumulativeRentingCost > shortStay.cumulativeRentingCost);
});

test('three price scenarios are ordered from growth to flat to down-price at exit', () => {
  const result = calculateRentVsBuyDecision(baseInput);
  const flat = result.scenarios.find((scenario) => scenario.id === 'flat-price')!;
  const growth = result.scenarios.find((scenario) => scenario.id === 'growth-3pct')!;
  const down = result.scenarios.find((scenario) => scenario.id === 'sale-price-down-10pct')!;
  assert.ok(growth.salePriceAtPlannedExit > flat.salePriceAtPlannedExit);
  assert.ok(flat.salePriceAtPlannedExit > down.salePriceAtPlannedExit);
  assert.ok(growth.buyerAdvantage > flat.buyerAdvantage);
  assert.ok(flat.buyerAdvantage > down.buyerAdvantage);
});

test('high rent can break even while very low rent may never break even in the tested horizon', () => {
  const highRent = calculateRentVsBuyDecision({ ...baseInput, monthlyRent: 35_000 });
  const lowRent = calculateRentVsBuyDecision({ ...baseInput, monthlyRent: 1_000, annualRentGrowthPct: 0 });
  assert.ok(highRent.scenarios.some((scenario) => scenario.breakEvenYear !== null));
  assert.ok(lowRent.scenarios.some((scenario) => scenario.breakEvenYear === null));
});

test('monthly ownership affordability uses Neon-derived income and commitments', () => {
  const constrained = calculateRentVsBuyDecision({
    ...baseInput,
    context: { ...context, monthlyIncome: 15_000, recurringCommitments: 12_000 },
  });
  assert.equal(constrained.monthlyCashHeadroom, 3_000);
  assert.equal(constrained.verdict, 'rent');
  assert.match(constrained.reasons.join(' '), /monthly ownership cost/i);
});

test('day-one cash cannot exceed the Neon-derived current balance', () => {
  const constrained = calculateRentVsBuyDecision({
    ...baseInput,
    context: { ...context, currentBalance: 500_000 },
  });
  assert.equal(constrained.projectedCurrentBalanceAfterDayOneCash, -40_000);
  assert.equal(constrained.verdict, 'rent');
  assert.match(constrained.reasons.join(' '), /Neon-derived current balance/i);
});

test('fractional planned stays are normalized once to whole months', () => {
  const whole = calculateRentVsBuyDecision({ ...baseInput, plannedStayYears: 5 });
  const roundedToSameMonth = calculateRentVsBuyDecision({ ...baseInput, plannedStayYears: 5.01 });
  assert.deepEqual(roundedToSameMonth, whole);
  assert.match(whole.assumptions.join(' '), /60 whole months/i);
});

test('zero mortgage rate is handled deterministically', () => {
  const result = calculateRentVsBuyDecision({ ...baseInput, annualMortgageRatePct: 0 });
  assert.equal(result.monthlyMortgagePayment, 5_333.33);
  assert.deepEqual(calculateRentVsBuyDecision({ ...baseInput, annualMortgageRatePct: 0 }), result);
});

test('invalid and negative inputs are rejected', () => {
  assert.throws(() => calculateRentVsBuyDecision({ ...baseInput, propertyPrice: -1 }), RentVsBuyInputError);
  assert.throws(() => calculateRentVsBuyDecision({ ...baseInput, monthlyRent: 0 }), RentVsBuyInputError);
  assert.throws(() => calculateRentVsBuyDecision({ ...baseInput, downPaymentPct: 120 }), RentVsBuyInputError);
  assert.throws(() => calculateRentVsBuyDecision({ ...baseInput, mortgageTermYears: 0 }), RentVsBuyInputError);
  assert.throws(() => calculateRentVsBuyDecision({ ...baseInput, propertyPrice: Number.MAX_VALUE }), RentVsBuyInputError);
  assert.throws(() => calculateRentVsBuyDecision({ ...baseInput, annualMortgageRatePct: 101 }), RentVsBuyInputError);
});
