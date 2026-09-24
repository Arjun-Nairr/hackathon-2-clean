import type { AffordabilityInput, AffordabilityResult } from '../src/lib/api/types.js';
import type { ApiRequest, ApiResponse } from './_lib/http.js';
import { sendError } from './_lib/http.js';
import { buildCalendarForecast, buildMoneyCalendar } from './_lib/finance-engine.js';
import type { EventRow } from './_lib/finance-engine.js';
import { calculateLoanDecision, LoanCalculatorInputError } from './_lib/loan-calculator.js';
import { loadProfileAndEvents } from './_lib/repository.js';

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function parseInput(body: unknown): AffordabilityInput {
  if (!isRecord(body)) throw new LoanCalculatorInputError('Request body must be an object.');
  const numericFields = ['amount', 'annualRate', 'tenureMonths', 'upfrontCash', 'processingFeePercentage'] as const;
  for (const field of numericFields) {
    if (typeof body[field] !== 'number' || !Number.isFinite(body[field])) {
      throw new LoanCalculatorInputError(`${field} must be a finite number.`);
    }
  }
  if (typeof body.financedFee !== 'boolean') throw new LoanCalculatorInputError('financedFee must be a boolean.');
  if (body.rateType !== 'flat' && body.rateType !== 'reducing') throw new LoanCalculatorInputError('rateType must be flat or reducing.');
  const processingFeePercentage = body.processingFeePercentage as number;
  if (processingFeePercentage < 0 || processingFeePercentage > 100) {
    throw new LoanCalculatorInputError('processingFeePercentage must be between 0 and 100.');
  }
  return body as unknown as AffordabilityInput;
}

function monthlyRecurringAmount(events: EventRow[], predicate: (event: EventRow) => boolean): number {
  return events.filter(predicate).reduce((sum, event) => sum + event.amount / Math.max(1, event.recurrenceIntervalMonths), 0);
}

export function createLoanHandler(loadData: typeof loadProfileAndEvents = loadProfileAndEvents) {
  return async function handler(req: ApiRequest, res: ApiResponse) {
    if (req.method && req.method !== 'POST') return sendError(res, 405, 'Method not allowed.');
    try {
      const input = parseInput(req.body);
      const data = await loadData();
      if (!data) return sendError(res, 404, 'No profile found. Run the seed script first.');

    const calendar = buildMoneyCalendar(data.profile, data.events);
    const forecast = buildCalendarForecast(data.profile, data.events);
    const monthlyIncome = monthlyRecurringAmount(data.events, (event) => event.recurring && event.kind === 'income');
    const existingMonthlyDebt = monthlyRecurringAmount(
      data.events,
      (event) => event.recurring && event.kind === 'commitment' && (event.paymentType === 'loan' || event.paymentType === 'credit-card'),
    );
    const processingFeeAed = input.amount * (input.processingFeePercentage / 100);
    const decision = calculateLoanDecision({
      requestedLoanAmount: input.amount,
      annualInterestRatePct: input.annualRate,
      rateType: input.rateType,
      termMonths: input.tenureMonths,
      processingFeeAed,
      financeProcessingFee: input.financedFee,
      upfrontCashAed: input.upfrontCash,
      context: {
        monthlyIncome,
        existingMonthlyDebt,
        currentBalance: calendar.financialSnapshot.currentAvailableBalance,
        bufferTarget: data.profile.bufferTarget,
        lowestForecastBalance: forecast.lowestPoint.balance,
      },
    });

    const debtCheck = decision.checks.find((check) => check.id === 'monthly-debt-burden')!;
    const multipleCheck = decision.checks.find((check) => check.id === 'loan-to-income')!;
    const upfrontCheck = decision.checks.find((check) => check.id === 'upfront-liquidity')!;
    const bufferCheck = decision.checks.find((check) => check.id === 'buffer-resilience')!;
    const verdict: AffordabilityResult['verdict'] = decision.verdict === 'comfortable' ? 'fits' : decision.verdict === 'tight' ? 'fits-if' : 'does-not-fit';
    const result: AffordabilityResult = {
      verdict,
      headline:
        verdict === 'fits'
          ? 'This loan fits the demo affordability checks.'
          : verdict === 'fits-if'
            ? 'This loan is tight against the demo affordability checks.'
            : 'This loan does not fit the demo affordability checks.',
      monthlyInstallment: decision.monthlyInstalment,
      maxInstallment: Math.max(0, Math.round((monthlyIncome * 0.5 - existingMonthlyDebt) * 100) / 100),
      reducingEquivalentRate: decision.reducingEquivalentAnnualRatePct,
      apr: input.annualRate,
      totalInterest: decision.totalInterest,
      totalCostAbovePrincipal: Math.round((decision.totalInterest + processingFeeAed) * 100) / 100,
      legal: {
        debtRatio: decision.debtBurdenRatioPct,
        maxDebtRatio: debtCheck.demoMaximum ?? 50,
        salaryMultiple: decision.loanToMonthlyIncomeMultiple,
        maxSalaryMultiple: multipleCheck.demoMaximum ?? 20,
        passes: debtCheck.status !== 'fail' && multipleCheck.status !== 'fail',
      },
      calendar: { lowestBalance: decision.projectedLowestBalanceAfterUpfrontCosts, worstMonth: forecast.lowestPoint.date.slice(0, 7) },
      resilience: {
        bufferAfterUpfront: upfrontCheck.actual,
        targetBuffer: data.profile.bufferTarget,
        monthsSurvived: 0,
        passes: upfrontCheck.status !== 'fail' && bufferCheck.status !== 'fail',
      },
      suggestions: decision.reasons,
      assumptions: [
        ...decision.assumptions,
        `The processing fee is the submitted ${input.processingFeePercentage}% of the requested amount.`,
        'Income, existing debt, current balance, emergency buffer and forecast low come from the demo backend profile and calendar.',
        'The displayed input rate is not an APR or a bank offer.',
      ],
    };
      res.status(200).json(result);
    } catch (error) {
      if (error instanceof LoanCalculatorInputError) return sendError(res, 400, error.message);
      sendError(res, 500, error instanceof Error ? error.message : 'Unknown error');
    }
  };
}

export default createLoanHandler();
