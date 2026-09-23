import { useMemo, useState } from 'react';
import { ArrowRight, Bookmark, Check, ChevronDown, Clock3, Home, Landmark, Search, ShieldCheck, ShoppingBag, X } from 'lucide-react';
import { BayzatiMobileShell } from '@/components/bayzati-mobile-shell';

type Guide = {
  id: string;
  title: string;
  summary: string;
  time: string;
  icon: typeof Home;
  color: 'sky' | 'berry' | 'gold' | 'blue';
  steps: string[];
};

const guides: Guide[] = [
  { id: 'move-home', title: 'Moving home without the money fog', summary: 'A practical way to price the move, deposit, and the first month before you say yes.', time: '6 min read', icon: Home, color: 'sky', steps: ['List the one-off costs separately from your new monthly rent.', 'Keep your existing buffer intact while you compare the full move-in amount.', 'Give yourself a two-week overlap if the dates allow it.'] },
  { id: 'borrow', title: 'Before you borrow', summary: 'The calm check to make before a loan becomes another fixed date in your calendar.', time: '5 min read', icon: Landmark, color: 'berry', steps: ['Write the total repayment beside the monthly instalment.', 'Test the payment against a tight month, not your best month.', 'Ask what changes if your income arrives late or your plans move.'] },
  { id: 'buffer', title: 'Building a buffer from an ordinary salary', summary: 'Start small, choose a number, and make the safety net visible.', time: '4 min read', icon: ShieldCheck, color: 'blue', steps: ['Choose one month of essentials as the first horizon.', 'Set an amount that can survive a month with a large payment.', 'Move the amount on payday, before the month gets noisy.'] },
  { id: 'big-purchase', title: 'Planning a big purchase', summary: 'A little space between wanting something and buying it can change the whole decision.', time: '4 min read', icon: ShoppingBag, color: 'gold', steps: ['Name the real job the purchase needs to do.', 'Set a cash target and a date before comparing upgrades.', 'Keep the goal visible in your Money Calendar.'] },
];

function GuideCard({ guide, saved, onToggle, onOpen }: { guide: Guide; saved: boolean; onToggle: (id: string) => void; onOpen: (guide: Guide) => void }) {
  const Icon = guide.icon;
  const colors = { sky: 'bg-[#E8F7FD] text-[#139BE8]', berry: 'bg-[#FBEAF2] text-[#D20A58]', gold: 'bg-[#FFF5DB] text-[#B47700]', blue: 'bg-[#E8F0F8] text-[#003B73]' };
  return <article className="rounded-[18px] border border-[#E4E7EC] bg-white p-4" data-testid={`card-guide-${guide.id}`}>
    <div className="flex items-start justify-between gap-4"><span className={`grid size-11 place-items-center rounded-2xl ${colors[guide.color]}`}><Icon className="size-5" /></span><button onClick={() => onToggle(guide.id)} aria-label={`${saved ? 'Remove' : 'Save'} ${guide.title}`} className={`grid size-10 place-items-center rounded-full border ${saved ? 'border-[#139BE8] bg-[#E8F7FD] text-[#003B73]' : 'border-[#DCE8EE] text-[#98A2B3]'}`} data-testid={`button-bookmark-${guide.id}`}>{saved ? <Check className="size-4" /> : <Bookmark className="size-4" />}</button></div>
    <p className="mt-5 flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-[.14em] text-[#98A2B3]"><Clock3 className="size-3.5" /> {guide.time}</p>
    <h2 className="mt-2 text-[20px] font-bold leading-tight tracking-[-.03em] text-[#003B73]" data-testid={`text-guide-title-${guide.id}`}>{guide.title}</h2><p className="mt-2 text-[12px] leading-5 text-[#667085]">{guide.summary}</p>
    <button onClick={() => onOpen(guide)} className="mt-4 flex min-h-10 items-center gap-2 text-[12px] font-semibold text-[#003B73]" data-testid={`button-read-guide-${guide.id}`}>Read the guide <ArrowRight className="size-4 text-[#D20A58]" /></button>
  </article>;
}

export default function LearnPage() {
  const [query, setQuery] = useState('');
  const [saved, setSaved] = useState<string[]>([]);
  const [activeGuide, setActiveGuide] = useState<Guide | null>(null);
  const [showSaved, setShowSaved] = useState(false);
  const [openQuestion, setOpenQuestion] = useState<string | null>(null);
  const visibleGuides = useMemo(() => guides.filter((guide) => (!showSaved || saved.includes(guide.id)) && `${guide.title} ${guide.summary}`.toLowerCase().includes(query.toLowerCase())), [query, saved, showSaved]);
  const toggleSaved = (id: string) => setSaved((current) => current.includes(id) ? current.filter((item) => item !== id) : [...current, id]);

  return <BayzatiMobileShell active="none">
    <div className="relative" data-testid="page-learn">
      <header className="mt-7">
        <div><p className="text-[11px] font-semibold uppercase tracking-[.16em] text-[#667085]">Learn</p><h1 className="mt-1 text-[28px] font-bold leading-none tracking-[-.04em] text-[#003B73]" data-testid="heading-learn">Money help for real life.</h1><p className="mt-3 max-w-[440px] text-[12px] leading-5 text-[#667085]">Short, practical guides for the moments where money and life overlap.</p></div>
        <div className="mt-4 flex w-fit items-center gap-1 rounded-full border border-[#E4E7EC] bg-white p-1"><button onClick={() => setShowSaved(false)} className={`min-h-10 rounded-full px-4 text-[11px] font-semibold ${!showSaved ? 'bg-[#EAF6FD] text-[#003B73]' : 'text-[#667085]'}`} data-testid="button-filter-all">All guides</button><button onClick={() => setShowSaved(true)} className={`min-h-10 rounded-full px-4 text-[11px] font-semibold ${showSaved ? 'bg-[#FCEAF1] text-[#D20A58]' : 'text-[#667085]'}`} data-testid="button-filter-saved">Saved {saved.length ? `(${saved.length})` : ''}</button></div>
      </header>
      <section className="mt-5 rounded-[18px] bg-[#003B73] p-5 text-[#F2FBFD]" data-testid="card-learn-intro"><div><p className="text-[10px] font-semibold uppercase tracking-[.13em] text-[#EAF6FD]">Start where you are</p><h2 className="mt-2 text-[23px] font-bold leading-tight tracking-[-.04em]">What is taking up money-space in your mind?</h2><p className="mt-2 text-[12px] leading-5 text-[#C4E5EF]">Choose the situation, not a chapter. Save a guide and come back when the decision is closer.</p></div><label className="mt-4 flex min-h-11 items-center gap-2 rounded-xl bg-white/10 px-3 text-[#C4E5EF]"><Search className="size-4" /><span className="sr-only">Search guides</span><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Find a situation" className="w-full bg-transparent text-[12px] text-white outline-none placeholder:text-[#9ABCCC]" data-testid="input-search-guides" /></label></section>
      <section className="mt-5" data-testid="section-guides"><div className="mb-3 flex items-end justify-between"><div><p className="text-[10px] font-semibold uppercase tracking-[.14em] text-[#98A2B3]">Choose your moment</p><h2 className="mt-1 text-[19px] font-bold text-[#003B73]">Guides for today</h2></div>{visibleGuides.length === 0 && <span className="text-[11px] text-[#667085]">Nothing saved here yet.</span>}</div><div className="grid gap-3">{visibleGuides.map((guide) => <GuideCard key={guide.id} guide={guide} saved={saved.includes(guide.id)} onToggle={toggleSaved} onOpen={setActiveGuide} />)}</div></section>
      <section className="mt-6 border-t border-[#E4E7EC] pt-5" data-testid="section-learn-questions"><p className="text-[10px] font-semibold uppercase tracking-[.14em] text-[#98A2B3]">One more useful thing</p><h2 className="mt-1 text-[19px] font-bold text-[#003B73]">Questions worth asking</h2><div className="mt-3 divide-y divide-[#E4E7EC] rounded-[18px] border border-[#E4E7EC] bg-white">{['What would make this decision feel safe enough?', 'Which number am I avoiding looking at?', 'What can wait until next month?'].map((question) => <div key={question}><button onClick={() => setOpenQuestion(openQuestion === question ? null : question)} className="flex min-h-14 w-full items-center justify-between gap-3 px-4 text-left text-[12px] font-semibold text-[#003B73]" data-testid={`button-question-${question.slice(0, 10).replaceAll(' ', '-').toLowerCase()}`}>{question}<ChevronDown className={`size-4 shrink-0 text-[#139BE8] transition-transform ${openQuestion === question ? 'rotate-180' : ''}`} /></button>{openQuestion === question && <p className="px-4 pb-4 text-[12px] leading-5 text-[#667085]">You do not need a perfect answer. Put the next honest step in your calendar and let that be enough for today.</p>}</div>)}</div></section>
      {activeGuide && <div className="fixed inset-0 z-50 bg-[#003B73]/35 p-4 backdrop-blur-[2px]" onClick={() => setActiveGuide(null)}><section role="dialog" aria-modal="true" aria-labelledby="guide-title" onClick={(event) => event.stopPropagation()} className="absolute inset-x-4 bottom-4 mx-auto max-w-[488px] rounded-[24px] bg-white p-6 shadow-2xl" data-testid="dialog-guide-detail"><button onClick={() => setActiveGuide(null)} aria-label="Close guide" className="float-right grid size-9 place-items-center rounded-full border border-[#E4E7EC] text-[#667085]" data-testid="button-close-guide"><X className="size-4" /></button><p className="text-[10px] font-semibold uppercase tracking-[.14em] text-[#D20A58]">A practical guide</p><h2 id="guide-title" className="mt-2 max-w-[390px] text-[25px] font-bold leading-tight tracking-[-.04em] text-[#003B73]">{activeGuide.title}</h2><div className="mt-5 space-y-3">{activeGuide.steps.map((step, index) => <div key={step} className="flex gap-3 rounded-xl bg-[#F2FAFC] p-3"><span className="grid size-6 shrink-0 place-items-center rounded-full bg-[#E0F3F8] text-[10px] font-bold text-[#003B73]">0{index + 1}</span><p className="text-[12px] leading-5 text-[#4E6471]">{step}</p></div>)}</div><button onClick={() => { toggleSaved(activeGuide.id); setActiveGuide(null); }} className="mt-5 flex min-h-11 w-full items-center justify-center gap-2 rounded-xl bg-[#003B73] text-[12px] font-bold text-white" data-testid="button-save-guide">{saved.includes(activeGuide.id) ? <Check className="size-4" /> : <Bookmark className="size-4" />} {saved.includes(activeGuide.id) ? 'Saved to your guides' : 'Save for later'}</button></section></div>}
    </div>
  </BayzatiMobileShell>;
}