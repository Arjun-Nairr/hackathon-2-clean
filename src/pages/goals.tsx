import { useMemo, useState } from 'react';
import { ArrowUpRight, CalendarClock, Check, CircleHelp, Plus, Target, Trash2, X } from 'lucide-react';
import { BayzatiMobileShell } from '@/components/bayzati-mobile-shell';

export type Goal = {
  id: string;
  name: string;
  detail: string;
  saved: number;
  target: number;
  date: string;
  tint: 'sky' | 'berry' | 'blue';
  priority: 'high' | 'medium' | 'low';
};

export const initialGoals: Goal[] = [
  { id: 'home-move', name: 'Move-home fund', detail: 'Deposit, movers, and the first quiet week', saved: 18400, target: 30000, date: '30 Sep 2025', tint: 'sky', priority: 'high' },
  { id: 'buffer', name: 'A softer buffer', detail: 'Three months of essential commitments', saved: 7600, target: 15000, date: '31 Dec 2025', tint: 'berry', priority: 'high' },
  { id: 'camera', name: 'The camera I keep eyeing', detail: 'A considered purchase, paid for in cash', saved: 2150, target: 4800, date: '15 Mar 2026', tint: 'blue', priority: 'medium' },
];

const profileKey = 'bayzati-profile';
type GoalStorage = Pick<Storage, 'getItem' | 'setItem'>;

const defaultProfileFields: Record<string, unknown> = {
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
  bufferPreference: 'recommended',
  bufferAmount: 0,
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function normalizeStoredGoal(value: unknown, index: number): Goal | null {
  if (!isRecord(value)) return null;
  const name = typeof value.name === 'string' ? value.name.trim() : '';
  const target = typeof value.target === 'number' ? value.target : Number(value.target);
  const date = typeof value.date === 'string' ? value.date : '';
  if (!name || !Number.isFinite(target) || target <= 0 || !date) return null;
  const tint = value.tint === 'berry' || value.tint === 'blue' || value.tint === 'sky'
    ? value.tint
    : index % 3 === 1 ? 'berry' : index % 3 === 2 ? 'blue' : 'sky';
  const priority = value.priority === 'high' || value.priority === 'low' ? value.priority : 'medium';
  return {
    id: typeof value.id === 'string' && value.id ? value.id : `profile-goal-${index}-${name.toLowerCase().replace(/[^a-z0-9]+/g, '-')}`,
    name,
    detail: typeof value.detail === 'string' && value.detail ? value.detail : 'A goal you chose for your future self',
    saved: typeof value.saved === 'number' && Number.isFinite(value.saved) ? Math.max(0, Math.min(target, value.saved)) : 0,
    target,
    date,
    tint,
    priority,
  };
}

export function readGoalsFromProfile(storage?: GoalStorage): Goal[] {
  if (!storage) return initialGoals.map((goal) => ({ ...goal }));
  try {
    const raw = storage.getItem(profileKey);
    if (!raw) return initialGoals.map((goal) => ({ ...goal }));
    const profile = JSON.parse(raw) as unknown;
    if (!isRecord(profile) || !Array.isArray(profile.goals)) return initialGoals.map((goal) => ({ ...goal }));
    return profile.goals.map(normalizeStoredGoal).filter((goal): goal is Goal => goal !== null);
  } catch {
    return initialGoals.map((goal) => ({ ...goal }));
  }
}

export function persistGoalsToProfile(storage: GoalStorage, goals: Goal[]): void {
  let profile: Record<string, unknown> = { ...defaultProfileFields };
  const raw = storage.getItem(profileKey);
  if (raw) {
    const parsed = JSON.parse(raw) as unknown;
    if (!isRecord(parsed)) throw new Error('The saved Bayzati profile is not an object.');
    profile = parsed;
  }
  storage.setItem(profileKey, JSON.stringify({ ...profile, goals }));
}

function isValidGoalInput(nameInput: string, targetInput: string, date: string): boolean {
  const name = nameInput.trim();
  const target = Number(targetInput);
  return Boolean(name && Number.isFinite(target) && target > 0 && date && !Number.isNaN(Date.parse(`${date}T00:00:00`)));
}

export function buildGoal(nameInput: string, targetInput: string, date: string, index: number): Goal | null {
  if (!isValidGoalInput(nameInput, targetInput, date)) return null;
  const name = nameInput.trim();
  const target = Number(targetInput);
  return {
    id: `goal-${Date.now()}`,
    name,
    detail: 'A goal you chose for your future self',
    saved: 0,
    target,
    date,
    tint: index % 3 === 1 ? 'berry' : index % 3 === 2 ? 'blue' : 'sky',
    priority: 'medium',
  };
}

const formatAed = (value: number) => `AED ${new Intl.NumberFormat('en-AE', { maximumFractionDigits: 0 }).format(value)}`;
const percentage = (goal: Goal) => Math.min(100, Math.round((goal.saved / goal.target) * 100));

function ProgressRing({ value, tone }: { value: number; tone: Goal['tint'] }) {
  const toneClass = tone === 'berry' ? 'text-[#D20A58]' : tone === 'blue' ? 'text-[#003B73]' : 'text-[#139BE8]';
  return (
    <div className={`relative grid size-[64px] shrink-0 place-items-center rounded-full ${tone === 'berry' ? 'bg-[#FBEAF2]' : tone === 'blue' ? 'bg-[#E8F0F8]' : 'bg-[#E8F7FD]'}`} data-testid={`progress-ring-${tone}`}>
      <div className="absolute inset-[7px] rounded-full border-[7px] border-current/10" />
      <div className={`absolute inset-[7px] rounded-full border-[7px] border-transparent ${toneClass}`} style={{ clipPath: `polygon(0 0, ${value}% 0, ${value}% 100%, 0 100%)` }} />
      <span className={`relative text-xs font-bold ${toneClass}`}>{value}%</span>
    </div>
  );
}

function GoalCard({ goal, onAdd, onDelete }: { goal: Goal; onAdd: (goal: Goal) => void; onDelete: (goal: Goal) => void }) {
  const remaining = Math.max(0, goal.target - goal.saved);
  return (
    <article className="rounded-[18px] border border-[#E4E7EC] bg-white p-4" data-testid={`card-goal-${goal.id}`}>
      <div className="flex items-start justify-between gap-4">
        <div className="min-w-0">
          <div className="mb-3 flex items-center gap-2">
            <span className={`size-2 rounded-full ${goal.tint === 'berry' ? 'bg-[#D20A58]' : goal.tint === 'blue' ? 'bg-[#003B73]' : 'bg-[#139BE8]'}`} />
            <span className="text-[10px] font-semibold uppercase tracking-[.14em] text-[#667085]">Savings goal</span>
          </div>
          <h2 className="text-[20px] font-bold leading-tight tracking-[-.03em] text-[#003B73]" data-testid={`text-goal-name-${goal.id}`}>{goal.name}</h2>
          <p className="mt-2 max-w-[250px] text-[12px] leading-5 text-[#667085]">{goal.detail}</p>
        </div>
        <div className="flex shrink-0 flex-col items-end gap-2">
          <ProgressRing value={percentage(goal)} tone={goal.tint} />
          <button type="button" onClick={() => onDelete(goal)} aria-label={`Delete ${goal.name}`} className="grid min-h-11 min-w-11 place-items-center rounded-full text-[#98A2B3] transition-colors hover:bg-[#FCEAF1] hover:text-[#D20A58]" data-testid={`button-delete-goal-${goal.id}`}><Trash2 className="size-4" /></button>
        </div>
      </div>
      <div className="mt-6 h-2 overflow-hidden rounded-full bg-[#E7F0F4]" data-testid={`progress-bar-${goal.id}`}>
        <div className={`h-full rounded-full ${goal.tint === 'berry' ? 'bg-[#D20A58]' : goal.tint === 'blue' ? 'bg-[#003B73]' : 'bg-[#139BE8]'}`} style={{ width: `${percentage(goal)}%` }} />
      </div>
      <div className="mt-5 grid grid-cols-3 gap-3 border-t border-[#E7EEF2] pt-4">
        <div><p className="text-[10px] text-[#98A2B3]">Saved</p><p className="mt-1 text-[13px] font-bold text-[#003B73]" data-testid={`text-goal-saved-${goal.id}`}>{formatAed(goal.saved)}</p></div>
        <div><p className="text-[10px] text-[#98A2B3]">To go</p><p className="mt-1 text-[13px] font-bold text-[#D20A58]" data-testid={`text-goal-remaining-${goal.id}`}>{formatAed(remaining)}</p></div>
        <div><p className="text-[10px] text-[#98A2B3]">Target</p><p className="mt-1 text-[13px] font-bold text-[#003B73]" data-testid={`text-goal-target-${goal.id}`}>{formatAed(goal.target)}</p></div>
      </div>
      <div className="mt-4 flex items-center justify-between gap-3">
        <p className="flex items-center gap-1.5 text-[11px] text-[#667085]"><CalendarClock className="size-3.5 text-[#139BE8]" /> Target date <span className="font-semibold text-[#003B73]" data-testid={`text-goal-date-${goal.id}`}>{goal.date}</span></p>
        <button onClick={() => onAdd(goal)} className="flex min-h-11 items-center gap-1.5 rounded-full bg-[#EAF6FD] px-3 text-[11px] font-semibold text-[#003B73]" data-testid={`button-add-to-goal-${goal.id}`}><Plus className="size-3.5" /> Add money</button>
      </div>
    </article>
  );
}

export default function GoalsPage() {
  const [goals, setGoals] = useState<Goal[]>(() => readGoalsFromProfile(typeof window === 'undefined' ? undefined : window.localStorage));
  const [selectedGoal, setSelectedGoal] = useState<Goal | null>(null);
  const [newGoalOpen, setNewGoalOpen] = useState(false);
  const [amount, setAmount] = useState('');
  const [newName, setNewName] = useState('');
  const [newTarget, setNewTarget] = useState('');
  const [newDate, setNewDate] = useState('');
  const totalSaved = useMemo(() => goals.reduce((sum, goal) => sum + goal.saved, 0), [goals]);
  const totalTarget = useMemo(() => goals.reduce((sum, goal) => sum + goal.target, 0), [goals]);
  const canCreateGoal = isValidGoalInput(newName, newTarget, newDate);

  const replaceGoals = (nextGoals: Goal[]) => {
    try {
      if (typeof window !== 'undefined') persistGoalsToProfile(window.localStorage, nextGoals);
      setGoals(nextGoals);
    } catch {
      // Keep the current UI state rather than overwrite a malformed or unavailable profile.
    }
  };

  const addMoney = () => {
    const value = Number(amount);
    if (!selectedGoal || !value || value < 1) return;
    replaceGoals(goals.map((goal) => goal.id === selectedGoal.id ? { ...goal, saved: Math.min(goal.target, goal.saved + value) } : goal));
    setAmount('');
    setSelectedGoal(null);
  };

  const createGoal = () => {
    const goal = buildGoal(newName, newTarget, newDate, goals.length);
    if (!goal) return;
    replaceGoals([...goals, goal]);
    setNewName('');
    setNewTarget('');
    setNewDate('');
    setNewGoalOpen(false);
  };

  const cancelCreateGoal = () => {
    setNewName('');
    setNewTarget('');
    setNewDate('');
    setNewGoalOpen(false);
  };

  const deleteGoal = (goal: Goal) => {
    replaceGoals(goals.filter((item) => item.id !== goal.id));
    if (selectedGoal?.id === goal.id) setSelectedGoal(null);
  };

  return (
    <BayzatiMobileShell active="goals" floatingAction={<button onClick={() => setNewGoalOpen(true)} className="flex min-h-11 items-center gap-2 rounded-full bg-[#D20A58] px-4 py-3 text-[12px] font-semibold text-white shadow-lg" data-testid="button-create-goal"><Plus className="size-4" /> New goal</button>}>
      <div className="relative" data-testid="page-goals">
        <header className="mt-7">
          <div>
            <p className="text-[11px] font-semibold uppercase tracking-[.16em] text-[#667085]">Your goals</p>
            <h1 className="mt-1 text-[28px] font-bold leading-none tracking-[-.04em] text-[#003B73]" data-testid="heading-goals">Small steps, visible future.</h1>
            <p className="mt-3 max-w-[440px] text-[12px] leading-5 text-[#667085]">Turn a wish into a number you can make room for, one calm step at a time.</p>
          </div>
        </header>

        <section className="mt-5 grid gap-3">
          <div className="relative overflow-hidden rounded-[18px] bg-[#003B73] p-5 text-[#F2FBFD]" data-testid="card-goals-overview">
            <div className="absolute -right-8 -top-12 size-40 rounded-full border-[18px] border-[#139BE8]/25" />
            <div className="relative">
              <p className="flex items-center gap-2 text-[10px] font-semibold uppercase tracking-[.13em] text-[#EAF6FD]"><Target className="size-4 text-[#139BE8]" /> Across your goals</p>
              <p className="mt-3 text-[36px] font-bold leading-none tracking-[-.06em]" data-testid="text-total-saved">{formatAed(totalSaved)}</p>
              <p className="mt-2 text-[12px] text-[#C4E5EF]">saved of {formatAed(totalTarget)} · {goals.length} things worth making room for</p>
              <div className="mt-6 h-2 max-w-[460px] overflow-hidden rounded-full bg-white/15"><div className="h-full rounded-full bg-[#55D5EE] transition-all" style={{ width: `${totalTarget > 0 ? Math.min(100, (totalSaved / totalTarget) * 100) : 0}%` }} /></div>
            </div>
          </div>
          <div className="rounded-[18px] border border-[#D20A58]/25 bg-[#FCEAF1] p-4" data-testid="card-goals-note">
            <CircleHelp className="size-5 text-[#139BE8]" />
            <h2 className="mt-3 text-[17px] font-bold leading-tight text-[#003B73]">A goal is a kindness to future you.</h2>
            <p className="mt-3 text-[12px] leading-5 text-[#667085]">You do not need to fund everything at once. Start with the one that would make next month feel lighter.</p>
            <p className="mt-3 text-[11px] font-semibold leading-5 text-[#667085]">Saved on this device only. Changes here do not change your calendar or financial forecast.</p>
          </div>
        </section>

        <section className="mt-5" data-testid="section-goal-list">
          <div className="mb-3 flex items-center justify-between"><div><p className="text-[10px] font-semibold uppercase tracking-[.14em] text-[#98A2B3]">In progress</p><h2 className="mt-1 text-[19px] font-bold text-[#003B73]">Your goals</h2></div><span className="rounded-full bg-[#EAF6FD] px-3 py-1.5 text-[10px] font-semibold text-[#003B73]" data-testid="text-goal-count">{goals.length} active</span></div>
          <div className="grid gap-3">{goals.map((goal) => <GoalCard key={goal.id} goal={goal} onAdd={setSelectedGoal} onDelete={deleteGoal} />)}</div>
        </section>

      {selectedGoal && <div className="fixed inset-0 z-50 bg-[#003B73]/35 p-4 backdrop-blur-[2px]" onClick={() => setSelectedGoal(null)}>
        <section role="dialog" aria-modal="true" aria-labelledby="add-goal-title" onClick={(event) => event.stopPropagation()} className="absolute inset-x-4 bottom-4 mx-auto max-w-[440px] rounded-[26px] bg-[#FBFEFF] p-6 shadow-2xl md:bottom-1/2 md:translate-y-1/2" data-testid="dialog-add-goal">
          <button onClick={() => setSelectedGoal(null)} aria-label="Close add money dialog" className="float-right grid size-11 place-items-center rounded-full border border-[#DCE8EE] text-[#667085]" data-testid="button-close-add-goal"><X className="size-4" /></button>
          <p className="text-[10px] font-semibold uppercase tracking-[.14em] text-[#D20A58]">Add to goal</p><h2 id="add-goal-title" className="mt-2 text-[25px] font-bold leading-none tracking-[-.04em] text-[#003B73]">{selectedGoal.name}</h2><p className="mt-2 text-[12px] text-[#667085]">Current balance {formatAed(selectedGoal.saved)} · target {formatAed(selectedGoal.target)}</p>
          <label className="mt-6 block text-[11px] font-bold text-[#667085]">How much would you like to add?<div className="mt-2 flex items-center rounded-xl border border-[#C9DDE6] bg-white px-3"><span className="text-sm text-[#98A2B3]">AED</span><input type="number" min="1" value={amount} onChange={(event) => setAmount(event.target.value)} placeholder="0" className="w-full bg-transparent px-3 py-3 text-[16px] font-bold text-[#003B73] outline-none" data-testid="input-goal-amount" /></div></label>
          <button onClick={addMoney} className="mt-5 flex min-h-12 w-full items-center justify-center gap-2 rounded-xl bg-[#003B73] text-[13px] font-bold text-white" data-testid="button-save-goal-amount"><ArrowUpRight className="size-4" /> Save this locally</button>
        </section>
      </div>}

      {newGoalOpen && <div className="fixed inset-0 z-50 bg-[#003B73]/35 p-4 backdrop-blur-[2px]" onClick={cancelCreateGoal}>
        <section role="dialog" aria-modal="true" aria-labelledby="new-goal-title" onClick={(event) => event.stopPropagation()} className="absolute inset-x-4 bottom-4 mx-auto max-w-[500px] rounded-[26px] bg-[#FBFEFF] p-6 shadow-2xl md:bottom-1/2 md:translate-y-1/2" data-testid="dialog-create-goal">
          <button onClick={cancelCreateGoal} aria-label="Close new goal dialog" className="float-right grid size-11 place-items-center rounded-full border border-[#DCE8EE] text-[#667085]" data-testid="button-close-create-goal"><X className="size-4" /></button>
          <p className="text-[10px] font-semibold uppercase tracking-[.14em] text-[#D20A58]">Make it concrete</p><h2 id="new-goal-title" className="mt-2 text-[25px] font-bold leading-none tracking-[-.04em] text-[#003B73]">Name a new goal</h2>
          <label className="mt-5 block text-[11px] font-bold text-[#667085]">What are you making room for?<input value={newName} onChange={(event) => setNewName(event.target.value)} placeholder="e.g. A weekend in Al Ain" className="mt-2 min-h-11 w-full rounded-xl border border-[#C9DDE6] bg-white px-3.5 py-3 text-[13px] outline-none focus:border-[#139BE8]" data-testid="input-new-goal-name" /></label>
          <div className="mt-3 grid grid-cols-2 gap-3"><label className="text-[11px] font-bold text-[#667085]">Target amount<div className="mt-2 flex min-h-11 items-center rounded-xl border border-[#C9DDE6] px-3"><span className="font-mono-data text-[10px] text-[#98A2B3]">AED</span><input type="number" min="1" value={newTarget} onChange={(event) => setNewTarget(event.target.value)} className="min-h-11 w-full bg-transparent px-2 py-3 text-[13px] outline-none" data-testid="input-new-goal-target" /></div></label><label className="text-[11px] font-bold text-[#667085]">Target date<input type="date" value={newDate} onChange={(event) => setNewDate(event.target.value)} className="mt-2 min-h-11 w-full rounded-xl border border-[#C9DDE6] bg-white px-3 py-3 text-[12px] outline-none" data-testid="input-new-goal-date" /></label></div>
          <div className="mt-5 grid grid-cols-2 gap-3">
            <button type="button" onClick={cancelCreateGoal} className="min-h-11 rounded-xl border border-[#DCE8EE] bg-white text-[13px] font-bold text-[#667085]" data-testid="button-cancel-create-goal">Cancel</button>
            <button type="button" onClick={createGoal} disabled={!canCreateGoal} className="min-h-11 rounded-xl bg-[#D20A58] text-[13px] font-bold text-white disabled:cursor-not-allowed disabled:opacity-45" data-testid="button-save-new-goal"><Check className="mr-2 inline size-4" /> Add goal</button>
          </div>
        </section>
      </div>}
      </div>
    </BayzatiMobileShell>
  );
}
