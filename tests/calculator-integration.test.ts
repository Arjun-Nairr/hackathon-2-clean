import { config } from 'dotenv';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import test from 'node:test';
import assert from 'node:assert/strict';
import { createLoanHandler } from '../api/loan';
import { createRentVsBuyHandler } from '../api/rent-vs-buy';
import { buildCalendarForecast, buildMoneyCalendar, type EventRow, type ProfileRow } from '../api/_lib/finance-engine';
import type { ApiRequest, ApiResponse } from '../api/_lib/http';
import { EVENTS, PROFILE } from '../db/seed-data';
import type { AffordabilityInput, AffordabilityResult, RentVsBuyInput, RentVsBuyResult } from '../src/lib/api/types';

config({ path: '.env.local' });

const seededData = {
  profile: { ...PROFILE } as ProfileRow,
  events: EVENTS.map((event) => ({ ...event })) as EventRow[],
};
const loanHandler = createLoanHandler(async () => seededData);
const rentVsBuyHandler = createRentVsBuyHandler(async () => seededData);

function fakeResponse() {
  let statusCode = 200;
  let responseBody: unknown;
  const res: ApiResponse = {
    status(code) {
      statusCode = code;
      return res;
    },
    json(data) {
      responseBody = data;
    },
  };
  return { res, status: () => statusCode, body: () => responseBody };
}

async function postLoan(input: AffordabilityInput) {
  const response = fakeResponse();
  await loanHandler({ method: 'POST', query: {}, body: input } as ApiRequest, response.res);
  return { status: response.status(), body: response.body() as AffordabilityResult };
}

async function postRentVsBuy(input: RentVsBuyInput) {
  const response = fakeResponse();
  await rentVsBuyHandler({ method: 'POST', query: {}, body: input } as ApiRequest, response.res);
  return { status: response.status(), body: response.body() as RentVsBuyResult };
}

const loanInput: AffordabilityInput = {
  amount: 80_000,
  annualRate: 3.99,
  tenureMonths: 48,
  upfrontCash: 0,
  financedFee: false,
  rateType: 'flat',
  processingFeePercentage: 1,
};

const homeInput: RentVsBuyInput = {
  monthlyRent: 10_000,
  homePrice: 2_000_000,
  savings: 90_000,
  yearsToStay: 5,
  annualIncome: 300_000,
  existingInstallments: 2_300,
  familyPlans: 'Two children, staying about 5 years',
  serviceChargeAnnual: 20_000,
};

test('loan API responds to amount and rate type changes', async () => {
  const small = await postLoan({ ...loanInput, amount: 40_000 });
  const large = await postLoan({ ...loanInput, amount: 120_000 });
  const reducing = await postLoan({ ...loanInput, rateType: 'reducing' });
  assert.equal(small.status, 200);
  assert.equal(large.status, 200);
  assert.notEqual(small.body.monthlyInstallment, large.body.monthlyInstallment);
  assert.notEqual(reducing.body.monthlyInstallment, (await postLoan(loanInput)).body.monthlyInstallment);
});

test('extreme loan returns does-not-fit and invalid loan input returns controlled 400', async () => {
  const extreme = await postLoan({ ...loanInput, amount: 2_000_000_000 });
  assert.equal(extreme.status, 200);
  assert.equal(extreme.body.verdict, 'does-not-fit');

  const invalid = fakeResponse();
  await loanHandler({ method: 'POST', query: {}, body: { ...loanInput, amount: -1 } } as ApiRequest, invalid.res);
  assert.equal(invalid.status(), 400);
  assert.match(JSON.stringify(invalid.body()), /amount/i);
});

test('rent-vs-buy API responds to property price, rent and savings changes', async () => {
  const base = await postRentVsBuy(homeInput);
  const changedPrice = await postRentVsBuy({ ...homeInput, homePrice: 1_000_000 });
  const changedRent = await postRentVsBuy({ ...homeInput, monthlyRent: 18_000 });
  const changedSavings = await postRentVsBuy({ ...homeInput, savings: 700_000 });
  assert.equal(base.status, 200);
  assert.notEqual(base.body.dayOneCash, changedPrice.body.dayOneCash);
  assert.notDeepEqual(base.body.scenarios, changedRent.body.scenarios);
  assert.notEqual(base.body.cashShortfall, changedSavings.body.cashShortfall);
});

test('insufficient savings returns a cash shortfall and rent verdict', async () => {
  const result = await postRentVsBuy({ ...homeInput, savings: 10_000 });
  assert.equal(result.status, 200);
  assert.ok((result.body.cashShortfall ?? 0) > 0);
  assert.equal(result.body.verdict, 'rent');
});

test('API mapping uses the backend profile and deterministic calendar context', async () => {
  const calendar = buildMoneyCalendar(seededData.profile, seededData.events);
  const forecast = buildCalendarForecast(seededData.profile, seededData.events);
  const result = await postLoan(loanInput);
  assert.equal(result.body.resilience.targetBuffer, seededData.profile.bufferTarget);
  assert.equal(result.body.resilience.bufferAfterUpfront, calendar.financialSnapshot.currentAvailableBalance - 800);
  assert.equal(result.body.calendar.lowestBalance, forecast.lowestPoint.balance - 800);
});

test('rent-vs-buy mapping uses backend balance and buffer context', async () => {
  const affordableInput = { ...homeInput, homePrice: 100_000, savings: 50_000, monthlyRent: 1_000 };
  const healthyHandler = createRentVsBuyHandler(async () => ({
    profile: { ...seededData.profile, openingBalance: 10_000_000, bufferTarget: 0 },
    events: seededData.events,
  }));
  const constrainedHandler = createRentVsBuyHandler(async () => ({
    profile: { ...seededData.profile, openingBalance: 50_000, bufferTarget: 45_000 },
    events: seededData.events,
  }));

  const healthy = fakeResponse();
  await healthyHandler({ method: 'POST', query: {}, body: affordableInput } as ApiRequest, healthy.res);
  const constrained = fakeResponse();
  await constrainedHandler({ method: 'POST', query: {}, body: affordableInput } as ApiRequest, constrained.res);

  assert.equal(healthy.status(), 200);
  assert.equal(constrained.status(), 200);
  assert.doesNotMatch((healthy.body() as RentVsBuyResult).flipFactor, /current balance|chosen buffer/i);
  assert.match((constrained.body() as RentVsBuyResult).flipFactor, /current balance|chosen buffer/i);
});

test('frontend calculator methods use same-origin HTTP and calculator paths never import Gemini', () => {
  const root = new URL('../', import.meta.url);
  const httpClient = readFileSync(fileURLToPath(new URL('src/lib/api/http-client.ts', root)), 'utf8');
  const compositionRoot = readFileSync(fileURLToPath(new URL('src/lib/api/index.ts', root)), 'utf8');
  const loanRoute = readFileSync(fileURLToPath(new URL('api/loan.ts', root)), 'utf8');
  const rentRoute = readFileSync(fileURLToPath(new URL('api/rent-vs-buy.ts', root)), 'utf8');
  const loanCalculator = readFileSync(fileURLToPath(new URL('api/_lib/loan-calculator.ts', root)), 'utf8');
  const rentCalculator = readFileSync(fileURLToPath(new URL('api/_lib/rent-vs-buy-calculator.ts', root)), 'utf8');

  assert.match(httpClient, /postJson<AffordabilityResult>\('\/api\/loan', input\)/);
  assert.match(httpClient, /postJson<RentVsBuyResult>\('\/api\/rent-vs-buy', input\)/);
  assert.match(compositionRoot, /checkAffordability:\s*httpClient\.checkAffordability/);
  assert.match(compositionRoot, /compareRentVsBuy:\s*httpClient\.compareRentVsBuy/);
  for (const source of [loanRoute, rentRoute, loanCalculator, rentCalculator]) {
    assert.doesNotMatch(source, /from\s+['"][^'"]*gemini|callGemini|askGemini|generativelanguage/i);
  }
});
