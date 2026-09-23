import { useMemo, useState } from 'react';
import { CalendarDays, Check, CircleAlert, CircleHelp, Sparkles } from 'lucide-react';
import { Link } from 'wouter';
import { useGetMoneyCalendar } from '@/lib/api/hooks';
import type { CalendarEvent } from '@/lib/api/types';
import { BayzatiMobileShell } from '@/components/bayzati-mobile-shell';
import { YearAheadRibbon } from '@/components/year-ahead-ribbon';

const money = (value: number) => new Intl.NumberFormat('en-AE', { maximumFractionDigits: 0 }).format(Math.round(value));

const statusLabel: Record<CalendarEvent['status'], string> = {
  actual: 'Actual',
  forecasted: 'Forecast',
  pending: 'Pending',
  overdue: 'Overdue',
};

function eventTone(event: CalendarEvent) {
  if (event.kind === 'income') return { dot: '#12A66A', chip: 'bg-[#F0FBF5] text-[#168657]' };
  if (event.kind === 'goal') return { dot: '#139BE8', chip: 'bg-[#EAF6FD] text-[#007DBE]' };
  return { dot: '#D20A58', chip: 'bg-[#FCEAF1] text-[#D20A58]' };
}

function EventCard({
  event,
  reviewed,
  onReview,
}: {
  event: CalendarEvent;
  reviewed: boolean;
  onReview: () => void;
}) {
  const tone = eventTone(event);
  return (
    <article className="rounded-[16px] border border-[#E4E7EC] bg-white p-3.5" data-testid={`calendar-event-${event.id}`}>
      <div className="flex items-start gap-3">
        <span className="mt-1.5 size-2.5 shrink-0 rounded-full" style={{ backgroundColor: tone.dot }} />
        <div className="min-w-0 flex-1">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <h3 className="truncate text-[13px] font-bold text-[#003B73]">{event.label}</h3>
              <p className="mt-1 text-[10px] text-[#667085]">{event.paymentType.replace('-', ' ')} · {event.accountName}</p>
            </div>
            <p className={`shrink-0 text-[12px] font-bold ${event.kind === 'income' ? 'text-[#168657]' : 'text-[#D20A58]'}`}>{event.kind === 'income' ? '+' : '−'}AED {money(event.amount)}</p>
          </div>
          <div className="mt-3 flex flex-wrap items-center gap-1.5">
            <span className={`rounded-full px-2 py-1 text-[10px] font-semibold ${tone.chip}`}>{statusLabel[event.status]}</span>
            <span className="rounded-full bg-[#F2F4F7] px-2 py-1 text-[10px] font-semibold text-[#667085]">{event.confidence} confidence</span>
            {event.amountType !== 'fixed' && <span className="rounded-full bg-[#FFF5DB] px-2 py-1 text-[10px] font-semibold text-[#9A6B00]">{event.amountType} amount</span>}
          </div>
          {event.note && <p className="mt-3 text-[11px] leading-4 text-[#667085]">{event.note}</p>}
          <div className="mt-3 flex items-center justify-between gap-3 border-t border-[#EEF1F3] pt-3">
            <p className="text-[10px] text-[#98A2B3]">{reviewed ? 'Reviewed for this plan' : 'Needs your review'}</p>
            <button type="button" onClick={onReview} className={`flex min-h-9 items-center gap-1.5 rounded-full px-3 text-[10px] font-semibold ${reviewed ? 'bg-[#F0FBF5] text-[#168657]' : 'bg-[#003B73] text-white'}`} data-testid={`button-review-${event.id}`}>
              {reviewed ? <Check className="size-3.5" /> : <CircleAlert className="size-3.5" />}
              {reviewed ? 'Reviewed' : 'Review'}
            </button>
          </div>
        </div>
      </div>
    </article>
  );
}

function monthParts(month: string) {
  const [year, monthNumber] = month.split('-').map(Number);
  return { year, monthNumber, days: new Date(year, monthNumber, 0).getDate(), firstWeekday: new Date(year, monthNumber - 1, 1).getDay() };
}

export default function CalendarPage() {
  const { data: calendar, isLoading, isError, refetch } = useGetMoneyCalendar();
  const [selectedDay, setSelectedDay] = useState(1);
  // Review is a session-only UI flag, not a calendar write: nothing here
  // persists or changes a financial figure.
  const [reviewedOverrides, setReviewedOverrides] = useState<Record<string, boolean>>({});

  const events = useMemo(() => [...(calendar?.events ?? [])].sort((a, b) => a.day - b.day), [calendar?.events]);
  if (isLoading) return <div className="mx-auto max-w-[520px] space-y-5 bg-[#F8FAFC] p-5"><div className="h-32 animate-pulse rounded-[18px] bg-[#E4E7EC]" /><div className="h-80 animate-pulse rounded-[18px] bg-[#E4E7EC]" /></div>;
  if (isError || !calendar) return <BayzatiMobileShell active="calendar"><div className="mt-10 rounded-[18px] border border-[#D20A58]/25 bg-white p-8 text-center"><CircleHelp className="mx-auto mb-3 size-8 text-[#D20A58]" /><h1 className="text-2xl font-bold text-[#003B73]">The calendar is taking a breath.</h1><p className="mt-2 text-sm text-[#667085]">We could not load your month.</p><button onClick={() => refetch()} className="mt-5 rounded-xl bg-[#003B73] px-4 py-3 text-sm font-semibold text-white">Try again</button></div></BayzatiMobileShell>;

  const { year, monthNumber, days, firstWeekday } = monthParts(calendar.month);
  const eventsForDay = events.filter((event) => event.day === selectedDay);
  const monthName = new Intl.DateTimeFormat('en-AE', { month: 'long' }).format(new Date(year, monthNumber - 1, 1));
  const toggleReviewed = (id: string, current: boolean) => setReviewedOverrides((value) => ({ ...value, [id]: !current }));

  return (
    <BayzatiMobileShell active="calendar">
      <div data-testid="page-calendar">
        <header className="mt-7">
          <p className="text-[11px] font-semibold uppercase tracking-[.16em] text-[#667085]">Money timeline</p>
          <div className="mt-1 flex items-end justify-between gap-3">
            <div><h1 className="text-[28px] font-bold leading-none tracking-[-.04em] text-[#003B73]" data-testid="heading-calendar">{monthName} {year}</h1><p className="mt-3 text-[12px] leading-5 text-[#667085]">See what changes your balance, and review uncertain items before they shape your plan.</p></div>
            <span className="grid size-11 shrink-0 place-items-center rounded-full bg-[#EAF6FD] text-[#003B73]"><CalendarDays className="size-5" /></span>
          </div>
        </header>

        <YearAheadRibbon />

        <section className="mt-5 overflow-hidden rounded-[18px] border border-[#E4E7EC] bg-white p-3" data-testid="calendar-month-grid">
          <div className="mb-3 flex items-center justify-between px-1"><p className="text-[10px] font-semibold uppercase tracking-[.13em] text-[#98A2B3]">{monthName} money view</p><span className="rounded-full bg-[#EAF6FD] px-2.5 py-1 text-[10px] font-semibold text-[#003B73]">{events.length} items</span></div>
          <div className="grid grid-cols-7 gap-1 text-center">{['S', 'M', 'T', 'W', 'T', 'F', 'S'].map((day, index) => <span key={`${day}-${index}`} className="py-2 text-[10px] font-semibold text-[#98A2B3]">{day}</span>)}{Array.from({ length: firstWeekday }, (_, index) => <span key={`empty-${index}`} />)}{Array.from({ length: days }, (_, index) => { const day = index + 1; const dayEvents = events.filter((event) => event.day === day); return <button type="button" key={day} onClick={() => setSelectedDay(day)} className="flex min-h-[60px] flex-col items-center rounded-xl border border-transparent p-0 outline-none transition-colors focus-visible:ring-2 focus-visible:ring-[#139BE8]/40" data-testid={`button-calendar-day-${day}`}><span className={`grid size-9 place-items-center rounded-full text-[12px] font-semibold transition-colors ${selectedDay === day ? 'border border-[#139BE8] bg-[#EAF6FD] text-[#003B73]' : 'text-[#667085] hover:bg-[#F2F4F7]'}`}>{day}</span><span className="mt-1 flex h-2 items-center justify-center gap-1">{dayEvents.slice(0, 3).map((event) => <i key={event.id} className="size-1.5 rounded-full" style={{ backgroundColor: eventTone(event).dot }} />)}</span>{dayEvents.length > 3 && <span className="absolute bottom-1 right-1 text-[8px] font-bold text-[#98A2B3]">+{dayEvents.length - 3}</span>}</button>; })}</div>
          <div className="mt-3 flex flex-wrap gap-x-4 gap-y-2 border-t border-[#EEF1F3] px-1 pt-3 text-[10px] text-[#667085]"><span><i className="mr-1.5 inline-block size-1.5 rounded-full bg-[#12A66A]" />Income</span><span><i className="mr-1.5 inline-block size-1.5 rounded-full bg-[#D20A58]" />Commitment</span><span><i className="mr-1.5 inline-block size-1.5 rounded-full bg-[#139BE8]" />Goal</span></div>
        </section>

        <section className="mt-5" data-testid="section-selected-day">
          <div className="mb-3 flex items-end justify-between"><div><p className="text-[10px] font-semibold uppercase tracking-[.14em] text-[#98A2B3]">Selected day</p><h2 className="mt-1 text-[20px] font-bold text-[#003B73]">{monthName} {selectedDay}</h2></div><span className="text-[11px] text-[#667085]">{eventsForDay.length} {eventsForDay.length === 1 ? 'item' : 'items'}</span></div>
          {eventsForDay.length ? <div className="grid gap-3">{eventsForDay.map((event) => <EventCard key={event.id} event={event} reviewed={reviewedOverrides[event.id] ?? event.reviewed} onReview={() => toggleReviewed(event.id, reviewedOverrides[event.id] ?? event.reviewed)} />)}</div> : <div className="rounded-[16px] border border-dashed border-[#DCE8EE] bg-white p-6 text-center"><Sparkles className="mx-auto size-5 text-[#139BE8]" /><p className="mt-2 text-[12px] font-semibold text-[#003B73]">Nothing planned for this day.</p></div>}
        </section>

        <section className="mt-5 rounded-[18px] border border-[#D20A58]/25 bg-[#FCEAF1] p-4" data-testid="card-calendar-review-note"><p className="flex items-center gap-2 text-[11px] font-semibold text-[#D20A58]"><CircleAlert className="size-4" /> Review before relying on a forecast</p><p className="mt-2 text-[11px] leading-5 text-[#667085]">Medium-confidence items are visible, but they should not quietly become decisions. Confirm school fees, annual renewals, and other uncertain amounts before a large purchase.</p><Link href="/imports" className="mt-4 flex min-h-10 items-center justify-between rounded-xl bg-white px-3 text-[11px] font-semibold text-[#003B73]" data-testid="link-calendar-imports"><span>Import or review financial data</span><span>→</span></Link></section>
      </div>
    </BayzatiMobileShell>
  );
}
