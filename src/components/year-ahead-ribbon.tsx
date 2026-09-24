import { useMemo } from 'react';
import { TrendingDown } from 'lucide-react';
import { getGetCalendarForecastQueryKey, useGetCalendarForecast } from '@/lib/api/hooks';
import type { CalendarForecast } from '@/lib/api/types';

const money = (value: number) => new Intl.NumberFormat('en-AE', { maximumFractionDigits: 0 }).format(Math.round(value));

// Shared by the graph marks and the legend swatches so the two can't drift.
const BALANCE_COLOR = '#003B73';
const INCOME_COLOR = '#12A66A';
const EXPENSE_COLOR = '#D20A58';
const BUFFER_COLOR = '#9A6B00';
const longDate = (value: string) => {
  const [year, month, day] = value.split('-').map(Number);
  return new Intl.DateTimeFormat('en-AE', { day: 'numeric', month: 'short', year: 'numeric' }).format(new Date(Date.UTC(year, month - 1, day)));
};

function Ribbon({ forecast }: { forecast: CalendarForecast }) {
  const { path, dots, low, min, max, bufferY } = useMemo(() => {
    const points = forecast.points;
    const values = [forecast.openingBalance, ...points.map((p) => p.balanceAfter)];
    const min = Math.min(0, ...values);
    const max = Math.max(...values, 1);
    const width = 320;
    const height = 96;
    const pad = 6;
    const x = (index: number) => pad + (index / Math.max(points.length, 1)) * (width - pad * 2);
    const y = (value: number) => height - pad - ((value - min) / (max - min || 1)) * (height - pad * 2);
    const path = [`M ${x(0)} ${y(forecast.openingBalance)}`, ...points.map((p, index) => `L ${x(index + 1)} ${y(p.balanceAfter)}`)].join(' ');
    const lowIndex = points.findIndex((p) => p.date === forecast.lowestPoint.date && p.balanceAfter === forecast.lowestPoint.balance);
    const low = { x: x(lowIndex + 1), y: y(forecast.lowestPoint.balance) };
    const dots = points
      .map((p, index) => ({ p, index }))
      .filter(({ p }) => Math.abs(p.amount) >= 10_000)
      .map(({ p, index }) => ({ x: x(index + 1), y: y(p.balanceAfter), credit: p.amount > 0, label: p.label }));
    // Only drawn when the buffer falls inside the plotted range — a line
    // clamped to the edge would misstate where the buffer sits.
    const bufferY = forecast.bufferTarget >= min && forecast.bufferTarget <= max ? y(forecast.bufferTarget) : null;
    return { path, dots, low, min, max, bufferY };
  }, [forecast]);

  return (
    <>
      <svg viewBox="0 0 320 96" className="mt-3 h-24 w-full" role="img" aria-label={`Projected balance for the next ${forecast.horizonMonths} months. Lowest point AED ${money(forecast.lowestPoint.balance)} on ${longDate(forecast.lowestPoint.date)}. Protected buffer AED ${money(forecast.bufferTarget)}.`}>
        {min < 0 && <line x1="0" x2="320" y1={96 - 6 - ((0 - min) / (max - min || 1)) * 84} y2={96 - 6 - ((0 - min) / (max - min || 1)) * 84} stroke={EXPENSE_COLOR} strokeDasharray="3 3" strokeWidth="1" />}
        {bufferY !== null && (
          <line x1="0" x2="320" y1={bufferY} y2={bufferY} stroke={BUFFER_COLOR} strokeDasharray="4 3" strokeWidth="1" data-testid="line-protected-buffer">
            <title>Protected buffer AED {money(forecast.bufferTarget)}</title>
          </line>
        )}
        <path d={path} fill="none" stroke={BALANCE_COLOR} strokeWidth="2" strokeLinejoin="round" strokeLinecap="round" />
        {dots.map((dot, index) => <circle key={index} cx={dot.x} cy={dot.y} r="2.5" fill={dot.credit ? INCOME_COLOR : EXPENSE_COLOR}><title>{dot.label}</title></circle>)}
        <circle cx={low.x} cy={low.y} r="5" fill="#FFFFFF" stroke={EXPENSE_COLOR} strokeWidth="2" />
      </svg>
      <ul className="mt-2 flex flex-wrap gap-x-3 gap-y-1 text-[10px] text-[#667085]" data-testid="forecast-legend">
        <li className="flex items-center gap-1.5" data-testid="legend-balance"><span className="h-0.5 w-3.5 rounded-full" style={{ backgroundColor: BALANCE_COLOR }} />Projected balance</li>
        <li className="flex items-center gap-1.5" data-testid="legend-income"><span className="size-2 rounded-full" style={{ backgroundColor: INCOME_COLOR }} />Large income</li>
        <li className="flex items-center gap-1.5" data-testid="legend-expense"><span className="size-2 rounded-full" style={{ backgroundColor: EXPENSE_COLOR }} />Large expense</li>
        <li className="flex items-center gap-1.5" data-testid="legend-buffer">
          <span className="w-3.5 border-t-2 border-dashed" style={{ borderColor: BUFFER_COLOR }} />
          Protected buffer AED {money(forecast.bufferTarget)}{bufferY === null && ' (outside chart range)'}
        </li>
      </ul>
    </>
  );
}

export function YearAheadRibbon({ compact = false }: { compact?: boolean }) {
  const { data: forecast, isLoading, isError } = useGetCalendarForecast({ query: { queryKey: getGetCalendarForecastQueryKey() } });

  if (isLoading) return <div className="mt-5 h-40 animate-pulse rounded-[18px] bg-[#E4E7EC]" data-testid="ribbon-loading" />;
  if (isError || !forecast) return <div className="mt-5 rounded-[18px] border border-[#E4E7EC] bg-white p-4 text-[12px] text-[#667085]" data-testid="ribbon-error">The year-ahead forecast is not available right now. The month view still works.</div>;

  const lowestMonth = new Intl.DateTimeFormat('en-AE', { month: 'long', year: 'numeric' }).format(new Date(`${forecast.lowestPoint.date}T00:00:00Z`));
  const tone = forecast.lowestPoint.balance < 0 ? 'text-[#D20A58]' : forecast.lowestPoint.balance < forecast.bufferTarget ? 'text-[#9A6B00]' : 'text-[#12A66A]';
  const exemplarDateLabel = new Date(forecast.asOf).toLocaleDateString('en-AE', { day: 'numeric', month: 'short', year: 'numeric' });

  return (
    <section className="mt-5 rounded-[18px] border border-[#E4E7EC] bg-white p-4" data-testid="section-year-ahead">
      {!compact && (
        <p className="mb-3 inline-flex items-center gap-1.5 rounded-full border border-[#DDE7EC] bg-[#F8FAFC] px-3 py-1.5 text-[10px] font-semibold text-[#667085]" data-testid="text-ribbon-demo-date-badge">
          Demo data — fixed as of {exemplarDateLabel}, not the real current date
        </p>
      )}
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-[10px] font-semibold uppercase tracking-[.13em] text-[#98A2B3]">Safe to spend, {exemplarDateLabel}</p>
          <p className="mt-1 text-[30px] font-bold leading-none tracking-[-.04em] text-[#003B73] tabular-nums" data-testid="text-safe-to-spend-today">AED {money(forecast.safeToSpendToday)}</p>
          {/* Mirrors the engine's formula exactly (finance-engine.ts safeToSpendUntilPayday). */}
          {!compact && <p className="mt-2 max-w-[34ch] text-[11px] leading-4 text-[#667085]" data-testid="text-safe-to-spend-explainer">Safe to spend is today’s balance minus the bills due before payday, planned goal savings, and your protected buffer.</p>}
        </div>
        <span className="grid size-11 shrink-0 place-items-center rounded-full bg-[#FCEAF1] text-[#D20A58]"><TrendingDown className="size-5" /></span>
      </div>
      <Ribbon forecast={forecast} />
      <p className={`mt-1 text-[12px] font-semibold tabular-nums ${tone}`} data-testid="text-lowest-point">
        Lowest point: AED {money(forecast.lowestPoint.balance)} on {longDate(forecast.lowestPoint.date)}
        <span className="font-normal text-[#667085]"> · {lowestMonth}, after {forecast.lowestPoint.label.toLowerCase()}</span>
      </p>
      {!compact && (
        <div className="mt-3 grid grid-cols-4 gap-1 border-t border-[#EEF1F3] pt-3">
          {Object.entries(forecast.monthEnd).slice(0, 12).map(([month, balance]) => (
            <div key={month} className="text-center">
              <p className="text-[9px] font-semibold uppercase text-[#98A2B3]">{new Intl.DateTimeFormat('en-AE', { month: 'short' }).format(new Date(`${month}-01T00:00:00Z`))}</p>
              <p className={`text-[10px] font-semibold tabular-nums ${balance < forecast.bufferTarget ? 'text-[#9A6B00]' : 'text-[#003B73]'}`}>{money(balance / 1000)}k</p>
            </div>
          ))}
        </div>
      )}
    </section>
  );
}
