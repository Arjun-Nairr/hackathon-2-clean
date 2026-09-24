import type { RentVsBuyInput as FormInput, RentVsBuyResult as FrontendResult } from '../src/lib/api/types.js';
import type { ApiRequest, ApiResponse } from './_lib/http.js';
import { sendError } from './_lib/http.js';
import { buildCalendarForecast, buildMoneyCalendar } from './_lib/finance-engine.js';
import { calculateRentVsBuyDecision, RentVsBuyInputError } from './_lib/rent-vs-buy-calculator.js';
import { loadProfileAndEvents } from './_lib/repository.js';

const DEFAULTS = {
  downPaymentPct: 20,
  annualMortgageRatePct: 4.5,
  mortgageTermYears: 25,
  annualRentGrowthPct: 3,
  purchaseCostPct: 6.5,
  sellingCostPct: 2,
} as const;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function parseInput(body: unknown): FormInput {
  if (!isRecord(body)) throw new RentVsBuyInputError('Request body must be an object.');
  const numericFields = ['monthlyRent', 'homePrice', 'savings', 'yearsToStay', 'annualIncome', 'existingInstallments', 'serviceChargeAnnual'] as const;
  for (const field of numericFields) {
    if (typeof body[field] !== 'number' || !Number.isFinite(body[field])) {
      throw new RentVsBuyInputError(`${field} must be a finite number.`);
    }
  }
  if (typeof body.familyPlans !== 'string') throw new RentVsBuyInputError('familyPlans must be a string.');
  return body as unknown as FormInput;
}

export function createRentVsBuyHandler(loadData: typeof loadProfileAndEvents = loadProfileAndEvents) {
  return async function handler(req: ApiRequest, res: ApiResponse) {
    if (req.method && req.method !== 'POST') return sendError(res, 405, 'Method not allowed.');
    try {
      const input = parseInput(req.body);
      const data = await loadData();
      if (!data) return sendError(res, 404, 'No profile found. Run the seed script first.');

    const calendar = buildMoneyCalendar(data.profile, data.events);
    const forecast = buildCalendarForecast(data.profile, data.events);
    const backendDebt = data.events
      .filter((event) => event.recurring && event.kind === 'commitment' && (event.paymentType === 'loan' || event.paymentType === 'credit-card'))
      .reduce((sum, event) => sum + event.amount / Math.max(1, event.recurrenceIntervalMonths), 0);
    const otherRecurringCommitments = data.events
      .filter((event) => event.recurring && event.kind !== 'income' && event.paymentType !== 'housing' && event.paymentType !== 'loan' && event.paymentType !== 'credit-card')
      .reduce((sum, event) => sum + event.amount / Math.max(1, event.recurrenceIntervalMonths), 0);

    const decision = calculateRentVsBuyDecision({
      propertyPrice: input.homePrice,
      monthlyRent: input.monthlyRent,
      availableSavings: input.savings,
      plannedStayYears: input.yearsToStay,
      downPaymentPct: DEFAULTS.downPaymentPct,
      annualMortgageRatePct: DEFAULTS.annualMortgageRatePct,
      mortgageTermYears: DEFAULTS.mortgageTermYears,
      annualServiceCharges: input.serviceChargeAnnual,
      annualRentGrowthPct: DEFAULTS.annualRentGrowthPct,
      purchaseCostPct: DEFAULTS.purchaseCostPct,
      sellingCostPct: DEFAULTS.sellingCostPct,
      context: {
        monthlyIncome: input.annualIncome / 12,
        recurringCommitments: otherRecurringCommitments + Math.max(input.existingInstallments, backendDebt),
        currentBalance: calendar.financialSnapshot.currentAvailableBalance,
        bufferTarget: data.profile.bufferTarget,
        lowestForecastBalance: forecast.lowestPoint.balance,
      },
    });

    const flatScenario = decision.scenarios.find((scenario) => scenario.id === 'flat-price')!;
    const result: FrontendResult = {
      verdict: decision.verdict,
      headline:
        decision.verdict === 'buy'
          ? 'Buying leads in the flat-price demo scenario.'
          : decision.verdict === 'rent'
            ? 'Renting is safer under the submitted figures and demo profile.'
            : 'Renting and buying are close under the demo assumptions.',
      dayOneCash: decision.totalDayOneCash,
      monthlyOwning: decision.estimatedMonthlyOwnershipCost,
      monthlyRenting: input.monthlyRent,
      breakEvenYear: flatScenario.breakEvenYear,
      flipFactor: decision.reasons[0] ?? 'Change the price, rent, savings or planned stay to compare another scenario.',
      components: [
        { label: 'Down payment', amount: decision.requiredDownPayment },
        { label: 'Purchase costs', amount: decision.purchaseCosts, typical: true },
      ],
      cashShortfall: decision.cashShortfall,
      dayOneCashPctOfPrice: Math.round(((decision.totalDayOneCash / input.homePrice) * 100) * 10) / 10,
      scenarios: decision.scenarios.map((scenario) => ({
        label: scenario.label,
        netPosition: scenario.buyerAdvantage,
        breakEvenYear: scenario.breakEvenYear,
      })),
      assumptions: [
        ...decision.assumptions,
        `Defaults used because the form has no fields for them: ${DEFAULTS.downPaymentPct}% down payment, ${DEFAULTS.annualMortgageRatePct}% reducing mortgage, ${DEFAULTS.mortgageTermYears}-year mortgage, ${DEFAULTS.annualRentGrowthPct}% annual rent growth, ${DEFAULTS.purchaseCostPct}% purchase costs and ${DEFAULTS.sellingCostPct}% selling costs.`,
        'Current balance, buffer, forecast low and recurring calendar commitments come from the demo backend profile.',
        'Submitted annual income and existing payments are planning inputs, not proof of mortgage eligibility.',
      ],
    };
      res.status(200).json(result);
    } catch (error) {
      if (error instanceof RentVsBuyInputError) return sendError(res, 400, error.message);
      sendError(res, 500, error instanceof Error ? error.message : 'Unknown error');
    }
  };
}

export default createRentVsBuyHandler();
