import { test } from "node:test";
import assert from "node:assert/strict";
import { mockClient } from "../src/lib/api/mock-client";

const loanInputA = { amount: 20000, annualRate: 3, tenureMonths: 36, upfrontCash: 0, financedFee: false, rateType: "reducing" as const, processingFeePercentage: 1 };
const loanInputB = { amount: 700000, annualRate: 12, tenureMonths: 96, upfrontCash: 50000, financedFee: true, rateType: "flat" as const, processingFeePercentage: 5 };

const homeInputA = { monthlyRent: 10000, homePrice: 2000000, savings: 90000, yearsToStay: 5, annualIncome: 300000, existingInstallments: 2300, familyPlans: "", serviceChargeAnnual: 20000 };
const homeInputB = { monthlyRent: 3000, homePrice: 500000, savings: 20000, yearsToStay: 1, annualIncome: 60000, existingInstallments: 0, familyPlans: "", serviceChargeAnnual: 0 };

test("getMoneyCalendar returns the fixed status/daily-allowance fixture, not something derived at request time", async () => {
  const calendar = await mockClient.getMoneyCalendar();
  assert.equal(calendar.status.tone, "warning");
  assert.equal(calendar.dailyAllowance, 596.67);
  assert.equal(calendar.daysLeft, 15);
});

test("getCalendarForecast lowest point matches the worst point in its own fixed series", async () => {
  const forecast = await mockClient.getCalendarForecast();
  const worst = Math.min(forecast.openingBalance, ...forecast.points.map((p) => p.balanceAfter));
  assert.equal(forecast.lowestPoint.balance, worst);
});

test("checkAffordability returns the identical fixture regardless of submitted input", async () => {
  const resultA = await mockClient.checkAffordability(loanInputA);
  const resultB = await mockClient.checkAffordability(loanInputB);
  assert.deepEqual(resultA, resultB);
  assert.equal(resultA.verdict, "fits");
});

test("compareRentVsBuy returns the identical fixture regardless of submitted input", async () => {
  const resultA = await mockClient.compareRentVsBuy(homeInputA);
  const resultB = await mockClient.compareRentVsBuy(homeInputB);
  assert.deepEqual(resultA, resultB);
  const sum = resultA.components.reduce((total, c) => total + c.amount, 0);
  assert.equal(sum, resultA.dayOneCash);
});

test("sendChatMessage routes each quick prompt to its matching fixture card, and declines what it can't compute", async () => {
  const loan = await mockClient.sendChatMessage({ sessionId: "s1", message: "Can I afford this loan?", history: [] });
  assert.equal(loan.card.type, "verdict");

  const rent = await mockClient.sendChatMessage({ sessionId: "s1", message: "Should I rent or buy a home?", history: [] });
  assert.equal(rent.card.type, "verdict");

  const tight = await mockClient.sendChatMessage({ sessionId: "s1", message: "What's my tight month?", history: [] });
  assert.equal(tight.card.type, "answer");

  const other = await mockClient.sendChatMessage({ sessionId: "s1", message: "What's the weather today?", history: [] });
  assert.equal(other.card.type, "decline");
});

test("no chat rule reference carries a link the app hasn't verified itself", async () => {
  const response = await mockClient.sendChatMessage({ sessionId: "s1", message: "Can I afford this loan?", history: [] });
  assert.equal(response.card.type, "verdict");
  if (response.card.type === "verdict") {
    for (const rule of response.card.rules) {
      assert.equal("url" in rule, false);
    }
  }
});
