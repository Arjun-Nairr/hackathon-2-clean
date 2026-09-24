import type { FormEvent } from 'react';
import { useState } from 'react';
import { ArrowLeft, ArrowRight, Check, CircleAlert, Home as HomeIcon, Info, Loader2, Sparkles } from 'lucide-react';
import { useLocation, Link } from 'wouter';
import { useCompareRentVsBuy } from '@/lib/api/hooks';
import type { RentVsBuyResult } from '@/lib/api/types';
import { BayzatiMobileShell } from '@/components/bayzati-mobile-shell';

const money = (value: number) => new Intl.NumberFormat('en-AE', { maximumFractionDigits: 0 }).format(Math.round(value));
const moneyShort = (value: number) => `AED ${money(value)}`;
const initialHome = { monthlyRent: 10000, homePrice: 2000000, savings: 90000, yearsToStay: 5, annualIncome: 300000, existingInstallments: 2300, familyPlans: 'Two children, staying about 5 years', serviceChargeAnnual: 20000 };

export default function RentVsBuyPage() {
  const compare = useCompareRentVsBuy();
  const [, setLocation] = useLocation();
  const [form, setForm] = useState(initialHome);
  const [result, setResult] = useState<RentVsBuyResult>();
  const [stayingPut, setStayingPut] = useState(false);
  const setField = (key: keyof typeof initialHome, value: string) => setForm((current) => ({ ...current, [key]: key === 'familyPlans' ? value : Number(value) }));
  const submit = (event: FormEvent) => { event.preventDefault(); setStayingPut(false); compare.mutate({ data: form }, { onSuccess: setResult }); };
  const sendToCalendar = () => { setLocation('/calendar'); };
  const inputClass = 'mt-1.5 h-11 w-full rounded-xl border border-[#E4E7EC] bg-white px-3 text-[13px] text-[#17212B] outline-none focus:border-[#139BE8]';

  return <BayzatiMobileShell active="plan">
    <div data-testid="page-rent-vs-buy">
      <header className="mt-7 flex items-start gap-3">
        <Link href="/" className="mt-1 grid size-9 shrink-0 place-items-center rounded-full border border-[#E4E7EC] bg-white text-[#667085] transition-colors hover:text-[#003B73]" data-testid="link-back-plan">
          <ArrowLeft className="size-4" />
        </Link>
        <div>
          <p className="text-[11px] font-semibold uppercase tracking-[.16em] text-[#667085]">Decision 01 / Home</p>
          <h1 className="mt-1 text-[28px] font-bold leading-none tracking-[-.04em] text-[#003B73]">Rent or buy?</h1>
          <p className="mt-3 text-[12px] leading-5 text-[#667085]">Compare the cash, monthly cost, and freedom each choice leaves you.</p>
        </div>
      </header>

      <section className="mt-5 rounded-[18px] border border-[#E4E7EC] bg-white p-4" data-testid="section-home-form">
        <div className="mb-5 flex items-start justify-between gap-4">
          <div><h2 className="text-[17px] font-bold text-[#003B73]">Let the horizon do the talking.</h2><p className="mt-1 text-[11px] leading-4 text-[#667085]">Bring the cash, mobility, and family decisions together.</p></div>
          <span className="grid size-10 shrink-0 place-items-center rounded-xl bg-[#EAF6FD] text-[#003B73]"><HomeIcon className="size-5" /></span>
        </div>
        <form onSubmit={submit} className="space-y-3.5">
          <div className="grid grid-cols-2 gap-3">
            <label className="text-[11px] font-semibold text-[#667085]">Monthly rent <span className="font-normal">(AED)</span><input value={form.monthlyRent} onChange={(e) => setField('monthlyRent', e.target.value)} type="number" min="0" className={inputClass} data-testid="input-monthly-rent" /></label>
            <label className="text-[11px] font-semibold text-[#667085]">Home price <span className="font-normal">(AED)</span><input value={form.homePrice} onChange={(e) => setField('homePrice', e.target.value)} type="number" min="0" className={inputClass} data-testid="input-home-price" /></label>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <label className="text-[11px] font-semibold text-[#667085]">Savings <span className="font-normal">(AED)</span><input value={form.savings} onChange={(e) => setField('savings', e.target.value)} type="number" min="0" className={inputClass} data-testid="input-home-savings" /></label>
            <label className="text-[11px] font-semibold text-[#667085]">Stay for <span className="font-normal">(years)</span><input value={form.yearsToStay} onChange={(e) => setField('yearsToStay', e.target.value)} type="number" min="1" max="30" className={inputClass} data-testid="input-years-to-stay" /></label>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <label className="text-[11px] font-semibold text-[#667085]">Annual income <span className="font-normal">(AED)</span><input value={form.annualIncome} onChange={(e) => setField('annualIncome', e.target.value)} type="number" min="0" className={inputClass} data-testid="input-annual-income" /></label>
            <label className="text-[11px] font-semibold text-[#667085]">Existing payments <span className="font-normal">(monthly)</span><input value={form.existingInstallments} onChange={(e) => setField('existingInstallments', e.target.value)} type="number" min="0" className={inputClass} data-testid="input-existing-payments" /></label>
          </div>
          <label className="block text-[11px] font-semibold text-[#667085]">Service charge <span className="font-normal">(AED a year)</span><input value={form.serviceChargeAnnual} onChange={(e) => setField('serviceChargeAnnual', e.target.value)} type="number" min="0" className={inputClass} data-testid="input-service-charge" /></label>
          <label className="block text-[11px] font-semibold text-[#667085]">Family plans<input value={form.familyPlans} onChange={(e) => setField('familyPlans', e.target.value)} type="text" className={inputClass} data-testid="input-family-plans" /></label>
          <button disabled={compare.isPending} type="submit" className="flex min-h-11 w-full items-center justify-center gap-2 rounded-xl bg-[#003B73] px-4 text-[13px] font-semibold text-white disabled:opacity-60" data-testid="button-compare-home">{compare.isPending ? <Loader2 className="size-4 animate-spin" /> : <ArrowRight className="size-4" />} Compare my options</button>
          <button type="button" onClick={() => { setStayingPut(true); setResult(undefined); }} className={`flex min-h-10 w-full items-center justify-center gap-2 rounded-xl border text-[11px] font-semibold ${stayingPut ? 'border-[#12A66A]/40 bg-[#12A66A]/10 text-[#12A66A]' : 'border-[#E4E7EC] text-[#667085]'}`} data-testid="button-home-do-nothing">{stayingPut && <Check className="size-3.5" />} Do nothing for now</button>
          {compare.isError && <p className="flex gap-2 text-[11px] text-[#D20A58]" data-testid="status-home-error"><CircleAlert className="size-4 shrink-0" />The comparison did not complete. Check the figures and try again.</p>}
        </form>
      </section>

      {result ? <section className="mt-4 overflow-hidden rounded-[18px] bg-[#003B73] p-5 text-white" data-testid="section-home-result">
        <p className="mb-3 inline-flex items-center gap-1.5 rounded-full bg-white/10 px-3 py-1.5 text-[10px] font-semibold text-[#EAF6FD]" data-testid="text-rent-vs-buy-sample-label">
          Calculated from your inputs and demo financial profile
        </p>
        <span className="inline-flex items-center gap-2 rounded-full bg-white/10 px-3 py-1.5 text-[10px] font-semibold uppercase tracking-[.13em] text-[#EAF6FD]"><span className="size-1.5 rounded-full bg-[#D20A58]" />{result.verdict.replaceAll('-', ' ')}</span>
        <h2 className="mt-4 text-[25px] font-bold leading-tight tracking-[-.04em]" data-testid="text-home-headline">{result.headline}</h2>
        <div className="mt-5 grid grid-cols-3 gap-2">{[['Day-one cash', moneyShort(result.dayOneCash)], ['Owning / month', moneyShort(result.monthlyOwning)], ['Break-even', result.breakEvenYear ? `Year ${result.breakEvenYear}` : 'Never']].map(([label, value]) => <div key={label} className="rounded-xl bg-white/10 p-3"><p className="text-[9px] text-[#C4E5EF]">{label}</p><p className="mt-1 text-[12px] font-semibold">{value}</p></div>)}</div>
        <div className="mt-4 rounded-xl bg-white/10 p-4"><p className="flex items-center gap-2 text-[12px] font-semibold"><Sparkles className="size-4 text-[#55D5EE]" />The flip factor</p><p className="mt-2 text-[11px] leading-5 text-[#C4E5EF]">{result.flipFactor}</p></div>
        {result.components && result.components.length > 0 && <details className="mt-4 rounded-xl bg-white/10 p-3" data-testid="details-day-one-cash"><summary className="cursor-pointer text-[12px] font-semibold">Where the day-one cash goes{typeof result.dayOneCashPctOfPrice === 'number' && <span className="ml-2 font-normal text-[#C4E5EF]">· {result.dayOneCashPctOfPrice.toFixed(1)}% of the price</span>}</summary><ul className="mt-2 space-y-1">{result.components.map((c) => <li key={c.label} className="flex items-baseline justify-between gap-3 text-[11px]"><span className="text-[#C4E5EF]">{c.label}{c.typical && <em className="ml-1 not-italic text-[#8FB8D8]">typical</em>}</span><span className="font-semibold tabular-nums">{moneyShort(c.amount)}</span></li>)}</ul>{typeof result.cashShortfall === 'number' && result.cashShortfall > 0 && <p className="mt-2 text-[11px] font-semibold text-[#F784AE]">You are {moneyShort(result.cashShortfall)} short of the day-one cash.</p>}</details>}
        <div className="mt-4 divide-y divide-white/15">{result.scenarios.map((scenario) => <div key={scenario.label} className="flex items-center justify-between py-3 text-[11px]"><span className="text-[#C4E5EF]">{scenario.label}<span className="ml-2 text-[#8FB8D8]">{scenario.breakEvenYear ? `break-even year ${scenario.breakEvenYear}` : scenario.breakEvenYear === null ? 'never breaks even' : ''}</span></span><span className={scenario.netPosition >= 0 ? 'font-semibold text-[#55D5EE]' : 'font-semibold text-[#F784AE]'}>{scenario.netPosition >= 0 ? '+' : '−'}{moneyShort(Math.abs(scenario.netPosition))}</span></div>)}</div>
        <p className="mt-2 text-[10px] text-[#C4E5EF]">Net position after {form.yearsToStay} years, owner vs renter, each scenario. Rent grows 3% a year; day-one cash would otherwise earn 5%.</p>
        <button onClick={sendToCalendar} className="mt-4 flex min-h-11 w-full items-center justify-center gap-2 rounded-xl bg-white text-[12px] font-semibold text-[#003B73]" data-testid="button-send-home-to-calendar"><Check className="size-4" />Review my calendar</button>
        <p className="mt-2 text-center text-[10px] text-[#C4E5EF]">Nothing is added automatically. Review your calendar to consider the impact.</p>
        <div className="mt-5 border-t border-white/15 pt-4"><p className="flex items-center gap-2 text-[11px] font-semibold"><Info className="size-3.5 text-[#55D5EE]" />Assumptions</p><ul className="mt-2 space-y-1">{result.assumptions.map((item) => <li key={item} className="text-[10px] leading-4 text-[#C4E5EF]">· {item}</li>)}</ul></div>
      </section> : <section className="mt-4 rounded-[18px] border border-[#D20A58]/25 bg-[#FCEAF1] p-4" data-testid="empty-home-result">
        <div className="flex items-start gap-3"><span className="grid size-9 shrink-0 place-items-center rounded-full bg-white text-[#D20A58]"><Info className="size-4" /></span><div><h2 className="text-[16px] font-bold text-[#003B73]">There is more than one kind of home.</h2><p className="mt-1 text-[11px] leading-5 text-[#667085]">We will compare monthly life, day-one cash, and the cost of keeping your options open.</p></div></div>
      </section>}
    </div>
  </BayzatiMobileShell>;
}
