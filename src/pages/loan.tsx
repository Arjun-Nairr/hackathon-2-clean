import type { FormEvent } from 'react';
import { useState } from 'react';
import { ArrowLeft, Check, CircleAlert, Info, Landmark, Loader2, ShieldCheck, Sparkles } from 'lucide-react';
import { Link } from 'wouter';
import { getGetMoneyCalendarQueryKey, useCheckAffordability, useGetMoneyCalendar } from '@/lib/api/hooks';
import type { AffordabilityResult } from '@/lib/api/types';
import { BayzatiMobileShell } from '@/components/bayzati-mobile-shell';

const money = (value: number) => new Intl.NumberFormat('en-AE', { maximumFractionDigits: 0 }).format(Math.round(value));
const moneyShort = (value: number) => `AED ${money(value)}`;

const initialLoan = { amount: 80000, annualRate: 3.99, tenureMonths: 48, upfrontCash: 0, financedFee: false, rateType: 'flat' as 'flat' | 'reducing', processingFeePercentage: 1 };

function Metric({ label, value, hint, good }: { label: string; value: string; hint: string; good?: boolean }) {
  return (
    <div className="rounded-[14px] bg-[#EAF6FD]/50 p-3">
      <p className="text-[9px] uppercase tracking-[.12em] text-[#667085]">{label}</p>
      <p className={`mt-1.5 text-[15px] font-bold ${good === false ? 'text-[#D20A58]' : good ? 'text-[#12A66A]' : 'text-[#003B73]'}`}>{value}</p>
      <p className="mt-1 text-[9px] text-[#667085]">{hint}</p>
    </div>
  );
}

function ResultPanel({ result }: { result: AffordabilityResult }) {
  const tone = result.verdict === 'fits' ? 'bg-[#F0FBF5] text-[#12A66A]' : result.verdict === 'fits-if' ? 'bg-[#EAF6FD] text-[#003B73]' : 'bg-[#FCEAF1] text-[#D20A58]';
  const dotTone = result.verdict === 'fits' ? 'bg-[#12A66A]' : result.verdict === 'fits-if' ? 'bg-[#139BE8]' : 'bg-[#D20A58]';

  return (
    <section className="mt-5 overflow-hidden rounded-[18px] border border-[#E4E7EC] bg-white p-4 shadow-sm" data-testid="section-loan-result">
      <p className="mb-3 inline-flex items-center gap-1.5 rounded-full border border-[#DDE7EC] bg-[#F8FAFC] px-3 py-1.5 text-[10px] font-semibold text-[#667085]" data-testid="text-loan-sample-label">
        Calculated from your inputs and demo financial profile
      </p>
      <span className={`inline-flex items-center gap-2 rounded-full px-3 py-1.5 text-[10px] font-semibold uppercase tracking-[.12em] ${tone}`}>
        <span className={`size-1.5 rounded-full ${dotTone}`} />
        {result.verdict === 'fits-if' ? 'Fits with a condition' : result.verdict === 'fits' ? 'Fits your frame' : 'Not yet'}
      </span>
      <h2 className="mt-4 text-[24px] font-bold leading-tight tracking-[-.04em] text-[#003B73]" data-testid="text-loan-headline">{result.headline}</h2>

      <div className="mt-5 grid grid-cols-3 gap-2">
        <Metric label="Monthly pay" value={moneyShort(result.monthlyInstallment)} hint={`Max ${moneyShort(result.maxInstallment)}`} good={result.monthlyInstallment <= result.maxInstallment} />
        <Metric label="After upfront" value={moneyShort(result.resilience.bufferAfterUpfront)} hint={`Target ${moneyShort(result.resilience.targetBuffer)}`} good={result.resilience.bufferAfterUpfront >= result.resilience.targetBuffer} />
        <Metric label="Lowest balance" value={moneyShort(result.calendar.lowestBalance)} hint={result.calendar.worstMonth} good={result.calendar.lowestBalance >= 0} />
      </div>

      <div className="mt-2 grid grid-cols-3 gap-2">
        <Metric label="Real rate" value={`${result.reducingEquivalentRate.toFixed(2)}%`} hint="Reducing-balance equivalent" />
        <Metric label="Input rate" value={`${result.apr.toFixed(2)}%`} hint="Not an APR or bank offer" />
        <Metric label="Total interest" value={moneyShort(result.totalInterest)} hint={`Cost above principal ${moneyShort(result.totalCostAbovePrincipal)}`} />
      </div>

      <div className="mt-2 grid grid-cols-3 gap-2">
        <Metric label="Demo debt ratio" value={`${result.legal.debtRatio.toFixed(1)}%`} hint={`Demo max ${result.legal.maxDebtRatio.toFixed(1)}%`} good={result.legal.passes} />
        <Metric label="Salary multiple" value={`${result.legal.salaryMultiple.toFixed(1)}×`} hint={`Demo max ${result.legal.maxSalaryMultiple.toFixed(1)}×`} good={result.legal.salaryMultiple <= result.legal.maxSalaryMultiple} />
        <Metric label="Buffer check" value={result.resilience.passes ? 'Pass' : 'Review'} hint="Planning threshold only" good={result.resilience.passes} />
      </div>

      {result.suggestions.length > 0 && (
        <div className="mt-4 rounded-[14px] bg-[#F8FAFC] p-4">
          <div className="mb-3 flex items-center gap-2 text-[12px] font-semibold text-[#003B73]">
            <Sparkles className="size-4 text-[#139BE8]" /> Ways to make this calmer
          </div>
          <ul className="space-y-2">
            {result.suggestions.map((suggestion) => (
              <li key={suggestion} className="flex gap-2 text-[11px] leading-5 text-[#667085]">
                <Check className="mt-0.5 size-3.5 shrink-0 text-[#139BE8]" /> {suggestion}
              </li>
            ))}
          </ul>
        </div>
      )}

      <div className="mt-4 border-t border-[#EEF1F3] pt-4">
        <p className="flex items-center gap-2 text-[11px] font-semibold text-[#667085]">
          <Info className="size-3.5 text-[#139BE8]" /> Assumptions
        </p>
        <ul className="mt-2 grid gap-1">
          {result.assumptions.map((item) => (
            <li key={item} className="text-[10px] leading-4 text-[#667085]">· {item}</li>
          ))}
        </ul>
      </div>
    </section>
  );
}

export default function LoanPage() {
  const { data: calendar } = useGetMoneyCalendar({ query: { queryKey: getGetMoneyCalendarQueryKey() } });
  const affordability = useCheckAffordability();
  const [form, setForm] = useState(initialLoan);
  const [result, setResult] = useState<AffordabilityResult>();
  const [noForNow, setNoForNow] = useState(false);

  const setField = (key: keyof typeof initialLoan, value: string | boolean) => setForm((current) => ({ ...current, [key]: typeof value === 'boolean' ? value : key === 'rateType' ? value : Number(value) }));
  const submit = (event: FormEvent) => { event.preventDefault(); setNoForNow(false); affordability.mutate({ data: form }, { onSuccess: setResult }); };

  const inputClass = 'mt-1.5 h-11 w-full rounded-xl border border-[#E4E7EC] bg-white px-3 text-[13px] text-[#17212B] outline-none focus:border-[#139BE8]';

  return (
    <BayzatiMobileShell active="plan">
      <div data-testid="page-loan">
        <header className="mt-7 flex items-start gap-3">
          <Link href="/" className="mt-1 grid size-9 shrink-0 place-items-center rounded-full border border-[#E4E7EC] bg-white text-[#667085] transition-colors hover:text-[#003B73]" data-testid="link-back-plan">
            <ArrowLeft className="size-4" />
          </Link>
          <div>
            <p className="text-[11px] font-semibold uppercase tracking-[.16em] text-[#667085]">Decision 02 / Borrowing</p>
            <h1 className="mt-1 text-[28px] font-bold leading-none tracking-[-.04em] text-[#003B73]">Can I safely borrow?</h1>
            <p className="mt-3 text-[12px] leading-5 text-[#667085]">See what this demo affordability check weighs: transparent thresholds, month-by-month cash flow, and buffer resilience.</p>
          </div>
        </header>

        <section className="mt-6 rounded-[18px] border border-[#E4E7EC] bg-white p-4" data-testid="section-loan-form">
          <div className="mb-5 flex items-start justify-between gap-4">
            <div>
              <h2 className="text-[17px] font-bold text-[#003B73]">Give it the real numbers.</h2>
              <p className="mt-1 text-[11px] leading-4 text-[#667085]">Test the impact before making a commitment.</p>
            </div>
            <span className="grid size-10 shrink-0 place-items-center rounded-xl bg-[#EAF6FD] text-[#003B73]"><Landmark className="size-5" /></span>
          </div>

          <form onSubmit={submit} className="space-y-3.5">
            <label className="block text-[11px] font-semibold text-[#667085]">
              Loan amount <span className="font-normal">(AED)</span>
              <input value={form.amount} onChange={(e) => setField('amount', e.target.value)} type="number" min="0" className={inputClass} data-testid="input-loan-amount" />
            </label>

            <div className="grid grid-cols-2 gap-3">
              <label className="block text-[11px] font-semibold text-[#667085]">
                Annual rate <span className="font-normal">(%)</span>
                <input value={form.annualRate} onChange={(e) => setField('annualRate', e.target.value)} type="number" step="0.01" min="0" className={inputClass} data-testid="input-loan-rate" />
              </label>
              <label className="block text-[11px] font-semibold text-[#667085]">
                Tenure <span className="font-normal">(months)</span>
                <input value={form.tenureMonths} onChange={(e) => setField('tenureMonths', e.target.value)} type="number" min="1" max="120" className={inputClass} data-testid="input-loan-tenure" />
              </label>
            </div>

            <div className="flex rounded-full bg-[#F2F4F7] p-1 text-[12px] font-semibold" role="radiogroup" aria-label="Rate type">
              {(['flat', 'reducing'] as const).map((type) => (
                <button key={type} type="button" role="radio" aria-checked={form.rateType === type} onClick={() => setField('rateType', type)} className={`min-h-10 flex-1 rounded-full ${form.rateType === type ? 'bg-white text-[#003B73]' : 'text-[#667085]'}`} data-testid={`button-rate-type-${type}`}>
                  {type === 'flat' ? 'Flat rate (as advertised)' : 'Reducing balance'}
                </button>
              ))}
            </div>
            <p className="-mt-1 text-[10px] leading-4 text-[#98A2B3]">Banks advertise flat rates; the rate you pay is the reducing-balance equivalent. We show both.</p>

            <label className="block text-[11px] font-semibold text-[#667085]">
              Upfront cash <span className="font-normal">(AED)</span>
              <input value={form.upfrontCash} onChange={(e) => setField('upfrontCash', e.target.value)} type="number" min="0" className={inputClass} data-testid="input-upfront-cash" />
            </label>

            <label className="flex cursor-pointer items-center gap-3 rounded-[14px] border border-[#E4E7EC] bg-white p-3.5">
              <input checked={form.financedFee} onChange={(e) => setField('financedFee', e.target.checked)} type="checkbox" className="size-4 accent-[#139BE8]" data-testid="input-financed-fee" />
              <span className="text-[11px] text-[#667085]">Include processing fee in financed amount</span>
            </label>

            <div className="mt-5 space-y-2">
              <button disabled={affordability.isPending} type="submit" className="flex min-h-11 w-full items-center justify-center gap-2 rounded-xl bg-[#003B73] px-4 text-[13px] font-semibold text-white transition-opacity hover:opacity-90 disabled:opacity-60" data-testid="button-check-affordability">
                {affordability.isPending ? <Loader2 className="size-4 animate-spin" /> : <ShieldCheck className="size-4" />} Check my affordability
              </button>
              <button type="button" onClick={() => { setNoForNow(true); setResult(undefined); }} className={`flex min-h-10 w-full items-center justify-center gap-2 rounded-xl border text-[11px] font-semibold transition-colors ${noForNow ? 'border-[#12A66A]/40 bg-[#12A66A]/10 text-[#12A66A]' : 'border-[#E4E7EC] text-[#667085] hover:bg-[#F8FAFC]'}`} data-testid="button-loan-do-nothing">
                {noForNow && <Check className="size-3.5" />} Do nothing for now
              </button>
            </div>

            {affordability.isError && (
              <p className="flex gap-2 text-[11px] text-[#D20A58]" data-testid="status-affordability-error">
                <CircleAlert className="size-4 shrink-0" />
                The check didn't complete. Review the numbers and try again.
              </p>
            )}
          </form>

          {calendar && (
            <div className="mt-5 border-t border-[#EEF1F3] pt-4 text-[10px] leading-4 text-[#667085]">
              <span className="font-semibold text-[#003B73]">Using {calendar.monthLabel} as the demo financial profile.</span> Results use the numbers above plus backend calendar context.
            </div>
          )}
        </section>

        <div>
          {result ? (
            <ResultPanel result={result} />
          ) : (
            <div className="mt-5 flex min-h-[300px] flex-col justify-between rounded-[18px] border border-dashed border-[#DCE8EE] bg-white/50 p-5" data-testid="empty-loan-result">
              <div>
                <div className="mb-4 grid size-12 place-items-center rounded-[14px] bg-[#EAF6FD]">
                  <ShieldCheck className="size-6 text-[#139BE8]" />
                </div>
                <h2 className="text-[24px] font-bold leading-tight tracking-[-.04em] text-[#003B73]">No pressure.<br />Just a clearer next step.</h2>
                <p className="mt-3 text-[12px] leading-5 text-[#667085]">The answer is not a bank's maximum. It is the commitment your actual month can carry and your future self can live with.</p>
              </div>
              <div className="mt-6 flex items-start gap-2 border-t border-[#DCE8EE] pt-4 text-[11px] leading-4 text-[#667085]">
                <Info className="mt-0.5 size-3.5 shrink-0 text-[#139BE8]" />
                <span>Do nothing is always a valid outcome. A pause can be part of the plan.</span>
              </div>
            </div>
          )}
        </div>
      </div>
    </BayzatiMobileShell>
  );
}
