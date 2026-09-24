export type RentVsBuyVerdict = 'buy' | 'rent' | 'close-call';
export type PropertyScenarioId = 'flat-price' | 'growth-3pct' | 'sale-price-down-10pct';

export interface RentVsBuyFinancialContext {
  monthlyIncome: number;
  recurringCommitments: number;
  currentBalance: number;
  bufferTarget: number;
  lowestForecastBalance: number;
}

export interface RentVsBuyInput {
  propertyPrice: number;
  monthlyRent: number;
  availableSavings: number;
  plannedStayYears: number;
  downPaymentPct: number;
  annualMortgageRatePct: number;
  mortgageTermYears: number;
  annualServiceCharges: number;
  annualRentGrowthPct: number;
  purchaseCostPct: number;
  sellingCostPct: number;
  context: RentVsBuyFinancialContext;
}

export interface PropertyScenarioResult {
  id: PropertyScenarioId;
  label: string;
  salePriceAtPlannedExit: number;
  buyerNetPosition: number;
  renterNetPosition: number;
  buyerAdvantage: number;
  breakEvenYear: number | null;
}

export interface RentVsBuyResult {
  requiredDownPayment: number;
  purchaseCosts: number;
  totalDayOneCash: number;
  cashShortfall: number;
  mortgagePrincipal: number;
  monthlyMortgagePayment: number;
  estimatedMonthlyOwnershipCost: number;
  monthlyCashHeadroom: number;
  cumulativeRentingCost: number;
  projectedCurrentBalanceAfterDayOneCash: number;
  projectedLowestBalanceAfterDayOneCash: number;
  scenarios: PropertyScenarioResult[];
  verdict: RentVsBuyVerdict;
  assumptions: string[];
  reasons: string[];
}

export const RENT_VS_BUY_DEMO_ASSUMPTIONS = {
  retainedCashAnnualReturnPct: 5,
  comparisonTolerancePctOfProperty: 1,
  maximumBreakEvenHorizonYears: 30,
} as const;

const MAX_SUPPORTED_AED_INPUT = 1_000_000_000_000;
const MAX_SUPPORTED_ANNUAL_RATE_PCT = 100;

export class RentVsBuyInputError extends Error {}

function assertFiniteNonNegative(name: string, value: number): void {
  if (!Number.isFinite(value) || value < 0) {
    throw new RentVsBuyInputError(`${name} must be a finite number greater than or equal to zero.`);
  }
}

function assertSupportedAed(name: string, value: number, allowNegative = false): void {
  if (!Number.isFinite(value) || (!allowNegative && value < 0) || Math.abs(value) > MAX_SUPPORTED_AED_INPUT) {
    const range = allowNegative ? `between -${MAX_SUPPORTED_AED_INPUT} and ${MAX_SUPPORTED_AED_INPUT}` : `between 0 and ${MAX_SUPPORTED_AED_INPUT}`;
    throw new RentVsBuyInputError(`${name} must be a finite AED amount ${range}.`);
  }
}

function assertInputs(input: RentVsBuyInput): void {
  const aedValues: Array<[string, number]> = [
    ['propertyPrice', input.propertyPrice],
    ['monthlyRent', input.monthlyRent],
    ['availableSavings', input.availableSavings],
    ['annualServiceCharges', input.annualServiceCharges],
    ['monthlyIncome', input.context.monthlyIncome],
    ['recurringCommitments', input.context.recurringCommitments],
    ['currentBalance', input.context.currentBalance],
    ['bufferTarget', input.context.bufferTarget],
  ];
  for (const [name, value] of aedValues) assertSupportedAed(name, value);
  assertSupportedAed('lowestForecastBalance', input.context.lowestForecastBalance, true);
  assertFiniteNonNegative('plannedStayYears', input.plannedStayYears);
  assertFiniteNonNegative('downPaymentPct', input.downPaymentPct);
  assertFiniteNonNegative('annualMortgageRatePct', input.annualMortgageRatePct);
  assertFiniteNonNegative('mortgageTermYears', input.mortgageTermYears);
  assertFiniteNonNegative('annualRentGrowthPct', input.annualRentGrowthPct);
  assertFiniteNonNegative('purchaseCostPct', input.purchaseCostPct);
  assertFiniteNonNegative('sellingCostPct', input.sellingCostPct);
  if (input.propertyPrice <= 0) throw new RentVsBuyInputError('propertyPrice must be greater than zero.');
  if (input.monthlyRent <= 0) throw new RentVsBuyInputError('monthlyRent must be greater than zero.');
  if (input.plannedStayYears <= 0 || input.plannedStayYears > 50) {
    throw new RentVsBuyInputError('plannedStayYears must be greater than zero and no more than 50.');
  }
  if (!Number.isInteger(input.mortgageTermYears) || input.mortgageTermYears <= 0 || input.mortgageTermYears > 50) {
    throw new RentVsBuyInputError('mortgageTermYears must be an integer between 1 and 50.');
  }
  if (input.downPaymentPct > 100 || input.purchaseCostPct > 100 || input.sellingCostPct > 100) {
    throw new RentVsBuyInputError('Percentage inputs cannot exceed 100.');
  }
  if (input.annualMortgageRatePct > MAX_SUPPORTED_ANNUAL_RATE_PCT || input.annualRentGrowthPct > MAX_SUPPORTED_ANNUAL_RATE_PCT) {
    throw new RentVsBuyInputError(`Annual mortgage and rent-growth rates cannot exceed ${MAX_SUPPORTED_ANNUAL_RATE_PCT}%.`);
  }
}

function roundMoney(value: number): number {
  return Math.round((value + Number.EPSILON) * 100) / 100;
}

function mortgagePayment(principal: number, annualRatePct: number, months: number): number {
  if (principal === 0) return 0;
  if (annualRatePct === 0) return principal / months;
  const rate = annualRatePct / 100 / 12;
  return (principal * rate) / (1 - (1 + rate) ** -months);
}

function outstandingMortgage(principal: number, annualRatePct: number, totalMonths: number, paidMonths: number): number {
  const elapsed = Math.min(Math.max(0, Math.floor(paidMonths)), totalMonths);
  if (elapsed >= totalMonths) return 0;
  if (annualRatePct === 0) return principal * (1 - elapsed / totalMonths);
  const rate = annualRatePct / 100 / 12;
  const payment = mortgagePayment(principal, annualRatePct, totalMonths);
  return principal * (1 + rate) ** elapsed - payment * (((1 + rate) ** elapsed - 1) / rate);
}

function cumulativeRent(monthlyRent: number, annualGrowthPct: number, months: number): number {
  let total = 0;
  for (let month = 0; month < months; month += 1) {
    const yearIndex = Math.floor(month / 12);
    total += monthlyRent * (1 + annualGrowthPct / 100) ** yearIndex;
  }
  return total;
}

function retainedCashFutureValue(amount: number, years: number): number {
  return amount * (1 + RENT_VS_BUY_DEMO_ASSUMPTIONS.retainedCashAnnualReturnPct / 100) ** years;
}

function scenarioSalePrice(id: PropertyScenarioId, propertyPrice: number, years: number): number {
  if (id === 'growth-3pct') return propertyPrice * 1.03 ** years;
  if (id === 'sale-price-down-10pct') return propertyPrice * 0.9;
  return propertyPrice;
}

interface PositionAtYear {
  salePrice: number;
  buyer: number;
  renter: number;
  advantage: number;
}

function positionAtYear(input: RentVsBuyInput, year: number): PositionAtYear {
  const totalMortgageMonths = input.mortgageTermYears * 12;
  const elapsedMonths = Math.min(Math.round(year * 12), totalMortgageMonths);
  const downPayment = input.propertyPrice * (input.downPaymentPct / 100);
  const purchaseCosts = input.propertyPrice * (input.purchaseCostPct / 100);
  const dayOneCash = downPayment + purchaseCosts;
  const principal = input.propertyPrice - downPayment;
  const payment = mortgagePayment(principal, input.annualMortgageRatePct, totalMortgageMonths);
  const paidMortgage = payment * elapsedMonths;
  const paidServiceCharges = input.annualServiceCharges * year;
  const outstanding = outstandingMortgage(principal, input.annualMortgageRatePct, totalMortgageMonths, elapsedMonths);
  const rentingCost = cumulativeRent(input.monthlyRent, input.annualRentGrowthPct, Math.round(year * 12));
  const renter = retainedCashFutureValue(input.availableSavings, year) - rentingCost;

  // Buyer position is remaining cash (which keeps the same visible 5% demo
  // return assumption) plus net sale proceeds, less mortgage/service cash
  // paid during the stay. Down payment and purchase costs were removed from
  // remaining cash on day one; principal paid is recovered through equity.
  const remainingCash = input.availableSavings - dayOneCash;
  const cashAtExit = retainedCashFutureValue(remainingCash, year);

  // `salePrice` is filled by the caller per scenario; these shared fields
  // are returned with a placeholder and completed below.
  return { salePrice: 0, buyer: cashAtExit - paidMortgage - paidServiceCharges - outstanding, renter, advantage: 0 };
}

function positionForScenario(input: RentVsBuyInput, year: number, id: PropertyScenarioId): PositionAtYear {
  const base = positionAtYear(input, year);
  const salePrice = scenarioSalePrice(id, input.propertyPrice, year);
  const sellingCosts = salePrice * (input.sellingCostPct / 100);
  const buyer = base.buyer + salePrice - sellingCosts;
  return { salePrice, buyer, renter: base.renter, advantage: buyer - base.renter };
}

function findBreakEvenYear(input: RentVsBuyInput, id: PropertyScenarioId): number | null {
  const horizon = Math.min(input.mortgageTermYears, RENT_VS_BUY_DEMO_ASSUMPTIONS.maximumBreakEvenHorizonYears);
  for (let year = 1; year <= horizon; year += 1) {
    if (positionForScenario(input, year, id).advantage >= 0) return year;
  }
  return null;
}

const SCENARIOS: Array<{ id: PropertyScenarioId; label: string }> = [
  { id: 'flat-price', label: 'Flat property price' },
  { id: 'growth-3pct', label: 'Property price grows 3% each year' },
  { id: 'sale-price-down-10pct', label: 'Sale price is 10% below purchase price' },
];

export function calculateRentVsBuyDecision(input: RentVsBuyInput): RentVsBuyResult {
  assertInputs(input);

  const plannedStayMonths = Math.max(1, Math.round(input.plannedStayYears * 12));
  const normalizedStayYears = plannedStayMonths / 12;

  const requiredDownPayment = input.propertyPrice * (input.downPaymentPct / 100);
  const purchaseCosts = input.propertyPrice * (input.purchaseCostPct / 100);
  const totalDayOneCash = requiredDownPayment + purchaseCosts;
  const cashShortfall = Math.max(0, totalDayOneCash - input.availableSavings);
  const mortgagePrincipal = input.propertyPrice - requiredDownPayment;
  const monthlyMortgagePayment = mortgagePayment(mortgagePrincipal, input.annualMortgageRatePct, input.mortgageTermYears * 12);
  const estimatedMonthlyOwnershipCost = monthlyMortgagePayment + input.annualServiceCharges / 12;
  const monthlyCashHeadroom = input.context.monthlyIncome - input.context.recurringCommitments;
  const cumulativeRentingCost = cumulativeRent(input.monthlyRent, input.annualRentGrowthPct, plannedStayMonths);
  const projectedCurrentBalanceAfterDayOneCash = input.context.currentBalance - totalDayOneCash;
  const projectedLowestBalanceAfterDayOneCash = input.context.lowestForecastBalance - totalDayOneCash;

  const scenarios = SCENARIOS.map(({ id, label }) => {
    const position = positionForScenario(input, normalizedStayYears, id);
    return {
      id,
      label,
      salePriceAtPlannedExit: roundMoney(position.salePrice),
      buyerNetPosition: roundMoney(position.buyer),
      renterNetPosition: roundMoney(position.renter),
      buyerAdvantage: roundMoney(position.advantage),
      breakEvenYear: findBreakEvenYear(input, id),
    };
  });

  const flatScenario = scenarios[0]!;
  const tolerance = input.propertyPrice * (RENT_VS_BUY_DEMO_ASSUMPTIONS.comparisonTolerancePctOfProperty / 100);
  const liquidityFails = cashShortfall > 0 || projectedCurrentBalanceAfterDayOneCash < 0 || projectedLowestBalanceAfterDayOneCash < input.context.bufferTarget;
  const monthlyCostFails = estimatedMonthlyOwnershipCost > monthlyCashHeadroom;

  const derivedValues = [
    requiredDownPayment,
    purchaseCosts,
    totalDayOneCash,
    mortgagePrincipal,
    monthlyMortgagePayment,
    estimatedMonthlyOwnershipCost,
    cumulativeRentingCost,
    projectedCurrentBalanceAfterDayOneCash,
    projectedLowestBalanceAfterDayOneCash,
    ...scenarios.flatMap((scenario) => [scenario.salePriceAtPlannedExit, scenario.buyerNetPosition, scenario.renterNetPosition, scenario.buyerAdvantage]),
  ];
  if (!derivedValues.every(Number.isFinite)) {
    throw new RentVsBuyInputError('Inputs produce a result outside the calculator supported numeric range.');
  }

  let verdict: RentVsBuyVerdict;
  if (liquidityFails || monthlyCostFails || flatScenario.buyerAdvantage < -tolerance) verdict = 'rent';
  else if (flatScenario.buyerAdvantage > tolerance) verdict = 'buy';
  else verdict = 'close-call';

  const reasons: string[] = [];
  if (cashShortfall > 0) reasons.push('Available savings do not cover the estimated day-one cash requirement.');
  if (projectedCurrentBalanceAfterDayOneCash < 0) reasons.push('The day-one cash requirement is higher than the Neon-derived current balance.');
  if (projectedLowestBalanceAfterDayOneCash < input.context.bufferTarget) reasons.push('The day-one cash requirement would push the existing forecast below the chosen buffer.');
  if (monthlyCostFails) reasons.push('Estimated monthly ownership cost is higher than income left after recurring commitments.');
  if (Math.abs(flatScenario.buyerAdvantage) <= tolerance) reasons.push('The flat-price comparison is within the visible close-call tolerance.');
  else reasons.push(flatScenario.buyerAdvantage > 0 ? 'Buying leads in the flat-price scenario at the planned exit.' : 'Renting leads in the flat-price scenario at the planned exit.');

  return {
    requiredDownPayment: roundMoney(requiredDownPayment),
    purchaseCosts: roundMoney(purchaseCosts),
    totalDayOneCash: roundMoney(totalDayOneCash),
    cashShortfall: roundMoney(cashShortfall),
    mortgagePrincipal: roundMoney(mortgagePrincipal),
    monthlyMortgagePayment: roundMoney(monthlyMortgagePayment),
    estimatedMonthlyOwnershipCost: roundMoney(estimatedMonthlyOwnershipCost),
    monthlyCashHeadroom: roundMoney(monthlyCashHeadroom),
    cumulativeRentingCost: roundMoney(cumulativeRentingCost),
    projectedCurrentBalanceAfterDayOneCash: roundMoney(projectedCurrentBalanceAfterDayOneCash),
    projectedLowestBalanceAfterDayOneCash: roundMoney(projectedLowestBalanceAfterDayOneCash),
    scenarios,
    verdict,
    assumptions: [
      'All amounts are in AED.',
      'Mortgage payments use a standard reducing-balance amortisation formula.',
      `Cash not used on day one is assumed to earn ${RENT_VS_BUY_DEMO_ASSUMPTIONS.retainedCashAnnualReturnPct}% annually.`,
      `The planned stay is normalized to ${plannedStayMonths} whole months for every comparison.`,
      'Rent grows once per year at the entered rate; service charges stay flat.',
      'The three sale scenarios are flat price, 3% yearly growth, and a sale price 10% below purchase price.',
      `A result within ${RENT_VS_BUY_DEMO_ASSUMPTIONS.comparisonTolerancePctOfProperty}% of the property price is treated as a close call.`,
      `Break-even is tested once per year for up to ${RENT_VS_BUY_DEMO_ASSUMPTIONS.maximumBreakEvenHorizonYears} years or the mortgage term, whichever is shorter.`,
      'Results exclude maintenance, insurance, taxes, transaction timing and financing approval unless entered as explicit costs.',
      'This is a planning comparison, not a property valuation, mortgage offer or recommendation.',
    ],
    reasons,
  };
}
