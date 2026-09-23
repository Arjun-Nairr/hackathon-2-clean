import { useEffect, useMemo, useState } from 'react';
import { ArrowLeft, ArrowRight, Check, ChevronDown, CircleHelp, Landmark, LockKeyhole, Plus, RotateCcw, ShieldCheck, Trash2 } from 'lucide-react';
import { useLocation } from 'wouter';
import { useQueryClient } from '@tanstack/react-query';
import {
  getGetFinancialProfileQueryKey,
  getGetMoneyCalendarQueryKey,
  useGetFinancialProfile,
  useSaveFinancialProfile,
} from '@/lib/api/hooks';
import type { FinancialProfile, FinancialProfileInput } from '@/lib/api/types';

type Commitment = {
  name: string;
  amount: number;
  day: number;
  category: string;
  confidence: 'high' | 'medium' | 'low';
};

type Goal = {
  name: string;
  target: number;
  date: string;
  priority: 'high' | 'medium' | 'low';
};

type Profile = {
  country: string;
  emirate: string;
  residency: string;
  employment: string;
  householdType: string;
  adults: number;
  dependents: number;
  basicSalary: number;
  housingAllowance: number;
  variableIncome: number;
  payFrequency: string;
  payday: number;
  availableBalance: number;
  mainAccount: string;
  commitments: Commitment[];
  goals: Goal[];
  bufferPreference: string;
  bufferAmount: number;
};

type Step = 'context' | 'household' | 'income' | 'balance' | 'commitments' | 'goals' | 'buffer' | 'review';

const draftKey = 'bayzati-onboarding-draft';
const profileKey = 'bayzati-profile';

const initialProfile: Profile = {
  country: 'United Arab Emirates',
  emirate: 'Dubai',
  residency: 'UAE resident',
  employment: 'Salaried employee',
  householdType: 'Couple',
  adults: 2,
  dependents: 0,
  basicSalary: 0,
  housingAllowance: 0,
  variableIncome: 0,
  payFrequency: 'Monthly',
  payday: 27,
  availableBalance: 0,
  mainAccount: 'Main current account',
  commitments: [],
  goals: [],
  bufferPreference: 'recommended',
  bufferAmount: 0,
};

const steps: Array<{ id: Step; eyebrow: string; title: string; note: string }> = [
  { id: 'context', eyebrow: 'First, the setting', title: 'Where does your money life happen?', note: 'This keeps dates, currency, and assumptions grounded in your everyday life.' },
  { id: 'household', eyebrow: 'The people around you', title: 'Who is this plan making room for?', note: 'A household view is often kinder than a solo budget.' },
  { id: 'income', eyebrow: 'Your steady rhythm', title: 'How does money arrive?', note: 'We will use this to place your income on the plan, not to judge it.' },
  { id: 'balance', eyebrow: 'Today, as it is', title: 'What is available right now?', note: 'A simple starting point helps the plan begin from reality.' },
  { id: 'commitments', eyebrow: 'The things already spoken for', title: 'What should we protect first?', note: 'Add the regular commitments that shape your month. You can come back to the rest.' },
  { id: 'goals', eyebrow: 'A little further ahead', title: 'What would feel lighter to have planned?', note: 'Goals can be practical, hopeful, or both. Add one now or leave it for later.' },
  { id: 'buffer', eyebrow: 'Your breathing room', title: 'How much space should stay untouched?', note: 'We recommend a buffer based on your commitments, but the choice stays yours.' },
  { id: 'review', eyebrow: 'A clear beginning', title: 'Here is what we will use', note: 'Known inputs anchor today. Forecasted inputs help us look ahead without pretending.' },
];

const money = (value: number) => new Intl.NumberFormat('en-AE', { maximumFractionDigits: 0 }).format(Math.max(0, value || 0));

function readDraft(): { profile: Profile; step: Step } | null {
  if (typeof window === 'undefined') return null;
  try {
    const raw = window.localStorage.getItem(draftKey);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as { profile?: Partial<Profile>; step?: Step };
    return {
      profile: { ...initialProfile, ...(parsed.profile ?? {}), commitments: parsed.profile?.commitments ?? [], goals: parsed.profile?.goals ?? [] },
      step: steps.some((item) => item.id === parsed.step) ? parsed.step as Step : 'context',
    };
  } catch {
    return null;
  }
}

function toLocalProfile(savedProfile: FinancialProfile): Profile {
  return {
    country: savedProfile.country,
    emirate: savedProfile.emirate,
    residency: savedProfile.residency,
    employment: savedProfile.employment,
    householdType: savedProfile.householdType,
    adults: savedProfile.adults,
    dependents: savedProfile.dependents,
    basicSalary: savedProfile.basicSalary,
    housingAllowance: savedProfile.housingAllowance,
    variableIncome: savedProfile.variableIncome,
    payFrequency: savedProfile.payFrequency,
    payday: savedProfile.payday,
    availableBalance: savedProfile.availableBalance,
    mainAccount: savedProfile.mainAccount,
    commitments: savedProfile.commitments.map(({ name, amount, day, category, confidence }) => ({ name, amount, day, category, confidence })),
    goals: savedProfile.goals.map(({ name, target, date, priority }) => ({ name, target, date, priority })),
    bufferPreference: savedProfile.bufferPreference,
    bufferAmount: savedProfile.bufferAmount,
  };
}

function Field({ label, hint, children }: { label: string; hint?: string; children: React.ReactNode }) {
  return <label className="block text-[12px] font-semibold text-[#536273]">{label}{hint && <span className="ml-1 font-normal text-[#98A2B3]">{hint}</span>}{children}</label>;
}

function SelectField({ value, onChange, children, testId }: { value: string; onChange: (value: string) => void; children: React.ReactNode; testId: string }) {
  return <div className="relative mt-2"><select value={value} onChange={(event) => onChange(event.target.value)} className="h-12 w-full appearance-none rounded-[13px] border border-[#DDE7EC] bg-[#FBFDFE] px-3.5 text-[13px] font-medium text-[#173B5D] outline-none transition-colors focus:border-[#139BE8]" data-testid={testId}>{children}</select><ChevronDown className="pointer-events-none absolute right-3 top-1/2 size-4 -translate-y-1/2 text-[#98A2B3]" /></div>;
}

function InputField({ value, onChange, type = 'text', placeholder, min, max, testId }: { value: string | number; onChange: (value: string) => void; type?: string; placeholder?: string; min?: number; max?: number; testId: string }) {
  return <input value={value} onChange={(event) => onChange(event.target.value)} type={type} min={min} max={max} placeholder={placeholder} className="mt-2 h-12 w-full rounded-[13px] border border-[#DDE7EC] bg-[#FBFDFE] px-3.5 text-[13px] font-medium text-[#173B5D] outline-none transition-colors placeholder:text-[#B2BDC7] focus:border-[#139BE8]" data-testid={testId} />;
}

function BayzatiMark() {
  return <div className="flex items-center gap-2.5"><img src="/images/bayzati-logo.png" alt="Bayzati" className="size-9 object-contain" /><div className="leading-none"><p className="text-[19px] font-semibold tracking-[-.04em] text-[#003B73]">bayzati</p><p className="mt-1 text-[9px] font-semibold uppercase tracking-[.13em] text-[#98A2B3]">your calmer money plan</p></div></div>;
}

function Choice({ selected, onClick, title, description, testId }: { selected: boolean; onClick: () => void; title: string; description?: string; testId: string }) {
  return <button type="button" onClick={onClick} className={`flex min-h-[58px] w-full items-center justify-between gap-3 rounded-[14px] border px-4 py-3 text-left transition-colors ${selected ? 'border-[#139BE8] bg-[#EAF6FD]' : 'border-[#DDE7EC] bg-[#FBFDFE] hover:border-[#B9D9E7]'}`} data-testid={testId}><span><span className="block text-[13px] font-semibold text-[#173B5D]">{title}</span>{description && <span className="mt-0.5 block text-[11px] font-normal leading-4 text-[#718091]">{description}</span>}</span><span className={`grid size-5 shrink-0 place-items-center rounded-full border ${selected ? 'border-[#139BE8] bg-[#139BE8] text-white' : 'border-[#C8D5DC]'}`}>{selected && <Check className="size-3" strokeWidth={3} />}</span></button>;
}

export default function OnboardingPage() {
  const [, setLocation] = useLocation();
  const saved = useMemo(() => readDraft(), []);
  const [profile, setProfile] = useState<Profile>(saved?.profile ?? initialProfile);
  const [step, setStep] = useState<Step>(saved?.step ?? 'context');
  const [error, setError] = useState('');
  const queryClient = useQueryClient();
  const { data: savedProfile } = useGetFinancialProfile();
  const saveProfile = useSaveFinancialProfile();
  const currentIndex = steps.findIndex((item) => item.id === step);
  const current = steps[currentIndex] ?? steps[0];
  const progress = Math.round(((currentIndex + 1) / steps.length) * 100);

  useEffect(() => {
    window.localStorage.setItem(draftKey, JSON.stringify({ profile, step }));
  }, [profile, step]);

  useEffect(() => {
    if (!saved && savedProfile) setProfile(toLocalProfile(savedProfile));
  }, [saved, savedProfile]);

  const update = <K extends keyof Profile>(key: K, value: Profile[K]) => setProfile((currentValue) => ({ ...currentValue, [key]: value }));
  const updateCommitment = (index: number, patch: Partial<Commitment>) => update('commitments', profile.commitments.map((item, itemIndex) => itemIndex === index ? { ...item, ...patch } : item));
  const updateGoal = (index: number, patch: Partial<Goal>) => update('goals', profile.goals.map((item, itemIndex) => itemIndex === index ? { ...item, ...patch } : item));
  const addCommitment = () => update('commitments', [...profile.commitments, { name: '', amount: 0, day: 1, category: 'Housing', confidence: 'high' }]);
  const addGoal = () => update('goals', [...profile.goals, { name: '', target: 0, date: '', priority: 'medium' }]);

  const validate = () => {
    if (step === 'context' && (!profile.country || !profile.emirate)) return 'Choose your country and emirate to continue.';
    if (step === 'household' && (profile.adults < 1 || profile.dependents < 0)) return 'Add at least one adult to this household.';
    if (step === 'income' && (profile.basicSalary <= 0 || profile.payday < 1 || profile.payday > 31)) return 'Add your basic monthly salary and a payday between 1 and 31.';
    if (step === 'balance' && (profile.availableBalance < 0 || !profile.mainAccount.trim())) return 'Add your available balance and name the account it belongs to.';
    if (step === 'commitments' && profile.commitments.some((item) => !item.name.trim() || item.amount <= 0 || item.day < 1 || item.day > 31)) return 'Complete each commitment or remove the unfinished row.';
    if (step === 'goals' && profile.goals.some((item) => !item.name.trim() || item.target <= 0 || !item.date)) return 'Complete each goal or remove the unfinished row.';
    if (step === 'buffer' && profile.bufferPreference === 'custom' && profile.bufferAmount <= 0) return 'Add a custom amount, or choose our recommended buffer.';
    return '';
  };

  const next = async () => {
    const validation = validate();
    if (validation) {
      setError(validation);
      return;
    }
    setError('');
    if (step === 'review') {
      const input: FinancialProfileInput = {
        ...profile,
        bufferPreference: profile.bufferPreference,
        commitments: profile.commitments.map((commitment) => ({ ...commitment })),
        goals: profile.goals.map((goal) => ({ ...goal })),
      };
      try {
        await saveProfile.mutateAsync({ data: input });
        window.localStorage.setItem(profileKey, JSON.stringify({ ...profile, savedAt: new Date().toISOString() }));
        window.localStorage.removeItem(draftKey);
        await Promise.all([
          queryClient.invalidateQueries({ queryKey: getGetMoneyCalendarQueryKey() }),
          queryClient.invalidateQueries({ queryKey: getGetFinancialProfileQueryKey() }),
        ]);
        setLocation('/');
      } catch {
        setError('We could not save your plan yet. Please try again.');
      }
      return;
    }
    setStep(steps[currentIndex + 1].id);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const back = () => {
    setError('');
    if (currentIndex === 0) return setLocation('/');
    setStep(steps[currentIndex - 1].id);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const skip = () => {
    setError('');
    if (step === 'commitments') update('commitments', []);
    if (step === 'goals') update('goals', []);
    setStep(steps[currentIndex + 1].id);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const reset = () => {
    if (!window.confirm('Start the setup again? Your saved draft on this device will be cleared.')) return;
    window.localStorage.removeItem(draftKey);
    window.localStorage.removeItem(profileKey);
    setProfile(initialProfile);
    setStep('context');
    setError('');
  };

  const monthlyCommitments = profile.commitments.reduce((sum, item) => sum + item.amount, 0);
  const bufferValue = profile.bufferPreference === 'custom' ? profile.bufferAmount : Math.max(2500, monthlyCommitments * 0.75);

  return <main className="page-grain min-h-[100dvh] bg-[#F5FAFC] text-[#17212B]" data-testid="page-onboarding">
    <header className="sticky top-0 z-20 border-b border-[#DDE7EC]/80 bg-[#F8FCFD]/90 backdrop-blur-xl">
      <div className="mx-auto flex h-[76px] max-w-[1180px] items-center justify-between px-5 md:px-10">
        <BayzatiMark />
        <div className="flex items-center gap-2.5">
          <span className="hidden items-center gap-1.5 rounded-full border border-[#DDE7EC] bg-white/70 px-3 py-2 text-[10px] font-semibold text-[#667085] sm:flex"><LockKeyhole className="size-3.5 text-[#139BE8]" />Private setup</span>
          <button type="button" onClick={reset} className="grid size-10 place-items-center rounded-full border border-[#DDE7EC] bg-white text-[#667085] transition-colors hover:border-[#139BE8] hover:text-[#003B73]" aria-label="Reset setup" data-testid="button-reset-onboarding"><RotateCcw className="size-4" /></button>
        </div>
      </div>
    </header>

    <div className="mx-auto grid max-w-[1180px] gap-8 px-5 py-7 md:grid-cols-[240px_minmax(0,640px)] md:gap-16 md:px-10 md:py-12 lg:grid-cols-[250px_minmax(0,660px)]">
      <aside className="hidden md:block">
        <p className="font-mono-data text-[10px] uppercase tracking-[.16em] text-[#98A2B3]">A quiet beginning</p>
        <h1 className="mt-5 font-display text-[42px] leading-[.94] text-[#003B73]">Let’s make your money feel less loud.</h1>
        <p className="mt-5 text-[13px] leading-6 text-[#667085]">A few honest details are enough to start. You can change any assumption later, and nothing leaves this device in this first release.</p>
        <div className="mt-10 border-t border-[#DDE7EC] pt-5">
          <div className="flex items-center gap-2 text-[10px] font-semibold uppercase tracking-[.13em] text-[#139BE8]"><ShieldCheck className="size-4" /> Your pace, your plan</div>
          <p className="mt-3 text-[11px] leading-5 text-[#8A98A5]">Skip the parts you are not ready to name. Bayzati will mark them as a later conversation.</p>
        </div>
      </aside>

      <section className="min-w-0">
        <div className="mb-7 flex items-center justify-between gap-4">
          <div className="flex-1">
            <div className="mb-2 flex items-center justify-between text-[10px] font-semibold uppercase tracking-[.13em] text-[#98A2B3]"><span>Setup {String(currentIndex + 1).padStart(2, '0')} of {String(steps.length).padStart(2, '0')}</span><span>{progress}%</span></div>
            <div className="h-1.5 overflow-hidden rounded-full bg-[#DDEBF0]"><div className="h-full rounded-full bg-[#139BE8] transition-all duration-300" style={{ width: `${progress}%` }} /></div>
          </div>
        </div>

        <div className="reveal">
          <p className="text-[10px] font-semibold uppercase tracking-[.17em] text-[#139BE8]">{current.eyebrow}</p>
          <h2 className="mt-2 max-w-[650px] text-[30px] font-bold leading-[1.03] tracking-[-.05em] text-[#003B73] md:text-[39px]" data-testid="heading-onboarding-step">{current.title}</h2>
          <p className="mt-3 max-w-[560px] text-[13px] leading-5 text-[#667085]">{current.note}</p>

          <div className="mt-7 rounded-[22px] border border-[#DDE7EC] bg-white p-4 shadow-[0_16px_50px_rgba(0,59,115,.05)] md:p-7">
            {step === 'context' && <div className="grid gap-5">
              <div className="grid gap-4 sm:grid-cols-2">
                <Field label="Country"><SelectField value={profile.country} onChange={(value) => update('country', value)} testId="select-country"><option>United Arab Emirates</option><option>Saudi Arabia</option><option>Other</option></SelectField></Field>
                <Field label="Emirate"><SelectField value={profile.emirate} onChange={(value) => update('emirate', value)} testId="select-emirate">{['Dubai', 'Abu Dhabi', 'Sharjah', 'Ajman', 'Ras Al Khaimah', 'Fujairah', 'Umm Al Quwain'].map((item) => <option key={item}>{item}</option>)}</SelectField></Field>
              </div>
              <Field label="Residency"><SelectField value={profile.residency} onChange={(value) => update('residency', value)} testId="select-residency"><option>UAE resident</option><option>UAE national</option><option>Living in the UAE temporarily</option></SelectField></Field>
              <Field label="Work context"><SelectField value={profile.employment} onChange={(value) => update('employment', value)} testId="select-employment"><option>Salaried employee</option><option>Self-employed</option><option>Between roles</option><option>Mixed income</option></SelectField></Field>
              <div className="flex items-start gap-3 rounded-[14px] bg-[#F2FAFC] p-3.5 text-[11px] leading-5 text-[#667085]"><Landmark className="mt-0.5 size-4 shrink-0 text-[#139BE8]" /><span>Your plan will use AED and the UAE calendar context. Nothing is connected to your bank.</span></div>
            </div>}

            {step === 'household' && <div className="grid gap-5">
              <Field label="Household shape"><div className="mt-2 grid gap-2 sm:grid-cols-2">{['Just me', 'Couple', 'Family', 'Shared household'].map((item) => <Choice key={item} selected={profile.householdType === item} onClick={() => update('householdType', item)} title={item} testId={`choice-household-${item.toLowerCase().replaceAll(' ', '-')}`} />)}</div></Field>
              <div className="grid grid-cols-2 gap-4">
                <Field label="Adults"><InputField value={profile.adults} onChange={(value) => update('adults', Number(value))} type="number" min={1} testId="input-adults" /></Field>
                <Field label="Children or dependents"><InputField value={profile.dependents} onChange={(value) => update('dependents', Number(value))} type="number" min={0} testId="input-dependents" /></Field>
              </div>
              <p className="text-[11px] leading-5 text-[#98A2B3]">Include the people whose essentials your money plan regularly supports.</p>
            </div>}

            {step === 'income' && <div className="grid gap-5">
              <div className="grid gap-4 sm:grid-cols-3">
                <Field label="Basic salary" hint="AED / month"><InputField value={profile.basicSalary || ''} onChange={(value) => update('basicSalary', Number(value))} type="number" min={0} placeholder="e.g. 18000" testId="input-basic-salary" /></Field>
                <Field label="Housing allowance" hint="AED / month"><InputField value={profile.housingAllowance || ''} onChange={(value) => update('housingAllowance', Number(value))} type="number" min={0} placeholder="Optional" testId="input-housing-allowance" /></Field>
                <Field label="Variable income" hint="AED / month"><InputField value={profile.variableIncome || ''} onChange={(value) => update('variableIncome', Number(value))} type="number" min={0} placeholder="Optional" testId="input-variable-income" /></Field>
              </div>
              <div className="grid gap-4 sm:grid-cols-2">
                <Field label="Pay frequency"><SelectField value={profile.payFrequency} onChange={(value) => update('payFrequency', value)} testId="select-pay-frequency"><option>Monthly</option><option>Twice monthly</option><option>Weekly</option><option>Irregular</option></SelectField></Field>
                <Field label="Usual payday" hint="day of the month"><InputField value={profile.payday} onChange={(value) => update('payday', Number(value))} type="number" min={1} max={31} testId="input-payday" /></Field>
              </div>
              <div className="rounded-[14px] bg-[#FFF7E5] p-3.5 text-[11px] leading-5 text-[#7A6440]">If income changes month to month, use your reliable base here. We can treat the rest as a forecast.</div>
            </div>}

            {step === 'balance' && <div className="grid gap-5">
              <Field label="Available balance today" hint="AED"><InputField value={profile.availableBalance || ''} onChange={(value) => update('availableBalance', Number(value))} type="number" min={0} placeholder="What could you use today?" testId="input-available-balance" /></Field>
              <Field label="Where does this balance live?"><InputField value={profile.mainAccount} onChange={(value) => update('mainAccount', value)} placeholder="e.g. Main current account" testId="input-main-account" /></Field>
              <div className="flex items-start gap-3 rounded-[14px] bg-[#EAF6FD] p-3.5 text-[11px] leading-5 text-[#496A7B]"><CircleHelp className="mt-0.5 size-4 shrink-0 text-[#139BE8]" /><span>Use the amount you would see if you opened the account now. Savings accounts and cash can be added later as separate context.</span></div>
            </div>}

            {step === 'commitments' && <div className="grid gap-3">
              {profile.commitments.length === 0 && <div className="rounded-[16px] border border-dashed border-[#C9DCE5] bg-[#F9FCFD] p-6 text-center"><p className="text-[14px] font-semibold text-[#173B5D]">Nothing here yet.</p><p className="mt-1 text-[11px] leading-5 text-[#718091]">Rent, school, loans, insurance, or the payment you never want to forget.</p></div>}
              {profile.commitments.map((item, index) => <div key={`commitment-${index}`} className="rounded-[16px] border border-[#DDE7EC] bg-[#FBFDFE] p-3.5">
                <div className="flex items-start justify-between gap-3"><p className="text-[10px] font-semibold uppercase tracking-[.13em] text-[#139BE8]">Commitment {String(index + 1).padStart(2, '0')}</p><button type="button" onClick={() => update('commitments', profile.commitments.filter((_, itemIndex) => itemIndex !== index))} aria-label={`Remove commitment ${index + 1}`} className="text-[#98A2B3] hover:text-[#D20A58]" data-testid={`button-remove-commitment-${index}`}><Trash2 className="size-4" /></button></div>
                <div className="mt-3 grid gap-3 sm:grid-cols-[1.5fr_1fr_88px]"><Field label="Name"><InputField value={item.name} onChange={(value) => updateCommitment(index, { name: value })} placeholder="e.g. Apartment rent" testId={`input-commitment-name-${index}`} /></Field><Field label="Category"><SelectField value={item.category} onChange={(value) => updateCommitment(index, { category: value })} testId={`select-commitment-category-${index}`}><option>Housing</option><option>Loan</option><option>School</option><option>Insurance</option><option>Family</option><option>Other</option></SelectField></Field><Field label="Day"><InputField value={item.day} onChange={(value) => updateCommitment(index, { day: Number(value) })} type="number" min={1} max={31} testId={`input-commitment-day-${index}`} /></Field></div>
                <div className="mt-3 grid gap-3 sm:grid-cols-2"><Field label="Amount" hint="AED"><InputField value={item.amount || ''} onChange={(value) => updateCommitment(index, { amount: Number(value) })} type="number" min={0} placeholder="e.g. 7200" testId={`input-commitment-amount-${index}`} /></Field><Field label="How certain is this amount?"><SelectField value={item.confidence} onChange={(value) => updateCommitment(index, { confidence: value as Commitment['confidence'] })} testId={`select-commitment-confidence-${index}`}><option value="high">High · stays consistent</option><option value="medium">Medium · usually close</option><option value="low">Low · still an estimate</option></SelectField></Field></div>
              </div>)}
              <button type="button" onClick={addCommitment} className="flex min-h-12 items-center justify-center gap-2 rounded-[13px] border border-dashed border-[#9BCDE0] text-[12px] font-semibold text-[#007DBE] hover:bg-[#F1FAFD]" data-testid="button-add-commitment"><Plus className="size-4" /> Add a commitment</button>
            </div>}

            {step === 'goals' && <div className="grid gap-3">
              {profile.goals.length === 0 && <div className="rounded-[16px] border border-dashed border-[#C9DCE5] bg-[#F9FCFD] p-6 text-center"><p className="text-[14px] font-semibold text-[#173B5D]">A blank page is okay.</p><p className="mt-1 text-[11px] leading-5 text-[#718091]">A move, a school year, a softer reserve, or something just for you.</p></div>}
              {profile.goals.map((item, index) => <div key={`goal-${index}`} className="rounded-[16px] border border-[#DDE7EC] bg-[#FBFDFE] p-3.5">
                <div className="flex items-start justify-between gap-3"><p className="text-[10px] font-semibold uppercase tracking-[.13em] text-[#139BE8]">Goal {String(index + 1).padStart(2, '0')}</p><button type="button" onClick={() => update('goals', profile.goals.filter((_, itemIndex) => itemIndex !== index))} aria-label={`Remove goal ${index + 1}`} className="text-[#98A2B3] hover:text-[#D20A58]" data-testid={`button-remove-goal-${index}`}><Trash2 className="size-4" /></button></div>
                <div className="mt-3 grid gap-3 sm:grid-cols-[1.5fr_1fr]"><Field label="What are you making room for?"><InputField value={item.name} onChange={(value) => updateGoal(index, { name: value })} placeholder="e.g. Family holiday" testId={`input-goal-name-${index}`} /></Field><Field label="Target" hint="AED"><InputField value={item.target || ''} onChange={(value) => updateGoal(index, { target: Number(value) })} type="number" min={0} placeholder="e.g. 25000" testId={`input-goal-target-${index}`} /></Field></div>
                <div className="mt-3 grid gap-3 sm:grid-cols-2"><Field label="Target month"><InputField value={item.date} onChange={(value) => updateGoal(index, { date: value })} type="month" testId={`input-goal-date-${index}`} /></Field><Field label="How much does it matter now?"><SelectField value={item.priority} onChange={(value) => updateGoal(index, { priority: value as Goal['priority'] })} testId={`select-goal-priority-${index}`}><option value="high">High priority</option><option value="medium">Medium priority</option><option value="low">A future priority</option></SelectField></Field></div>
              </div>)}
              <button type="button" onClick={addGoal} className="flex min-h-12 items-center justify-center gap-2 rounded-[13px] border border-dashed border-[#9BCDE0] text-[12px] font-semibold text-[#007DBE] hover:bg-[#F1FAFD]" data-testid="button-add-goal"><Plus className="size-4" /> Add a goal</button>
            </div>}

            {step === 'buffer' && <div className="grid gap-3">
              <Choice selected={profile.bufferPreference === 'recommended'} onClick={() => update('bufferPreference', 'recommended')} title="Use the recommended breathing room" description={`Around AED ${money(Math.max(2500, monthlyCommitments * 0.75))} based on what you have shared.`} testId="choice-buffer-recommended" />
              <Choice selected={profile.bufferPreference === 'custom'} onClick={() => update('bufferPreference', 'custom')} title="I have a number in mind" description="Choose an amount that feels right for your household." testId="choice-buffer-custom" />
              {profile.bufferPreference === 'custom' && <Field label="Your buffer amount" hint="AED"><InputField value={profile.bufferAmount || ''} onChange={(value) => update('bufferAmount', Number(value))} type="number" min={0} placeholder="e.g. 12000" testId="input-buffer-amount" /></Field>}
              <div className="mt-3 flex items-start gap-3 rounded-[14px] bg-[#FCEAF1] p-3.5 text-[11px] leading-5 text-[#785164]"><ShieldCheck className="mt-0.5 size-4 shrink-0 text-[#D20A58]" /><span>This buffer is not a locked account. It is a calm line in the plan that says: do not spend this by accident.</span></div>
            </div>}

            {step === 'review' && <div className="grid gap-5">
              <div className="rounded-[16px] bg-[#EAF6FD] p-4"><p className="text-[10px] font-semibold uppercase tracking-[.14em] text-[#007DBE]">Known today</p><div className="mt-3 grid gap-3 sm:grid-cols-2"><div><p className="text-[10px] text-[#718091]">Where</p><p className="mt-1 text-[13px] font-semibold text-[#173B5D]">{profile.emirate}, {profile.country}</p></div><div><p className="text-[10px] text-[#718091]">Household</p><p className="mt-1 text-[13px] font-semibold text-[#173B5D]">{profile.adults} adults · {profile.dependents} dependents</p></div><div><p className="text-[10px] text-[#718091]">Monthly income</p><p className="mt-1 text-[13px] font-semibold text-[#173B5D]">AED {money(profile.basicSalary + profile.housingAllowance + profile.variableIncome)}</p></div><div><p className="text-[10px] text-[#718091]">Available now</p><p className="mt-1 text-[13px] font-semibold text-[#173B5D]">AED {money(profile.availableBalance)} · {profile.mainAccount}</p></div></div></div>
              <div className="rounded-[16px] border border-[#DDE7EC] bg-[#FBFDFE] p-4"><p className="text-[10px] font-semibold uppercase tracking-[.14em] text-[#D20A58]">Forecasted with care</p><div className="mt-3 divide-y divide-[#E9EFF2]">{profile.commitments.length > 0 && <div className="flex items-center justify-between gap-4 py-2 text-[12px]"><span className="text-[#718091]">{profile.commitments.length} commitment{profile.commitments.length === 1 ? '' : 's'}</span><span className="font-semibold text-[#173B5D]">AED {money(monthlyCommitments)} / month</span></div>}<div className="flex items-center justify-between gap-4 py-2 text-[12px]"><span className="text-[#718091]">{profile.goals.length} goal{profile.goals.length === 1 ? '' : 's'} to make room for</span><span className="font-semibold text-[#173B5D]">Future contributions</span></div><div className="flex items-center justify-between gap-4 py-2 text-[12px]"><span className="text-[#718091]">Protected buffer</span><span className="font-semibold text-[#173B5D]">AED {money(bufferValue)}</span></div></div></div>
              <p className="text-[11px] leading-5 text-[#8A98A5]">You can change these inputs from a later profile release. For now, this stays saved only on this device and the Plan will keep assumptions visible.</p>
            </div>}
          </div>

          {error && <p className="mt-3 rounded-[12px] border border-[#D20A58]/25 bg-[#FCEAF1] px-3.5 py-3 text-[11px] font-semibold text-[#B30A4B]" role="alert" data-testid="text-onboarding-error">{error}</p>}

          <div className="mt-5 flex items-center justify-between gap-3">
            <button type="button" onClick={back} className="flex min-h-11 items-center gap-2 rounded-full px-2 text-[12px] font-semibold text-[#667085] hover:text-[#003B73]" data-testid="button-onboarding-back"><ArrowLeft className="size-4" /> Back</button>
            <div className="flex items-center gap-2">
              {(step === 'commitments' || step === 'goals') && <button type="button" onClick={skip} className="flex min-h-11 rounded-full px-2 text-[11px] font-semibold text-[#667085] hover:text-[#003B73] sm:px-3" data-testid={`button-skip-${step}`}>I’ll add this later</button>}
             <button type="button" onClick={next} disabled={saveProfile.isPending} className="flex min-h-11 items-center gap-2 rounded-full bg-[#003B73] px-5 text-[12px] font-semibold text-white shadow-[0_8px_18px_rgba(0,59,115,.16)] transition-transform hover:-translate-y-0.5 disabled:cursor-wait disabled:opacity-60" data-testid={step === 'review' ? 'button-finish-onboarding' : 'button-onboarding-continue'}>{saveProfile.isPending ? 'Saving…' : step === 'review' ? 'Save and see my Plan' : 'Continue'}<ArrowRight className="size-4" /></button>
            </div>
          </div>
           <p className="mt-4 flex items-center justify-center gap-1.5 text-center text-[10px] text-[#98A2B3]"><LockKeyhole className="size-3" /> Your draft stays on this device; the finished plan is saved to Bayzati’s financial record.</p>
        </div>
      </section>
    </div>
  </main>;
}
