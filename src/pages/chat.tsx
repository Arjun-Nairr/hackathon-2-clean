import { useEffect, useRef, useState, type FormEvent } from 'react';
import { ArrowUp, Loader2, MessageCircle, Sparkles, X } from 'lucide-react';
import { Link } from 'wouter';
import { useQueryClient } from '@tanstack/react-query';
import {
  getGetCalendarForecastQueryKey,
  getGetMoneyCalendarQueryKey,
  useConfirmCalendarDraft,
  useGetMoneyCalendar,
  useRejectCalendarDraft,
  useSendChatMessage,
} from '@/lib/api/hooks';
import type { ChatCard } from '@/lib/api/types';
import { BayzatiMobileShell } from '@/components/bayzati-mobile-shell';

const money = (value: number) => new Intl.NumberFormat('en-AE', { maximumFractionDigits: 2, minimumFractionDigits: value % 1 ? 2 : 0 }).format(value);

type DraftStatus = 'pending' | 'confirmed' | 'rejected';
type Message =
  | { id: string; role: 'user'; text: string }
  | { id: string; role: 'assistant'; text: string; card: ChatCard; draftStatus?: DraftStatus };

const quickPrompts = [
  "What's safe to spend today?",
  "What's my tightest month this year?",
  'What goals am I on track for?',
];
const quickLabels = ['Safe to spend?', 'My tight month?', 'My goals?'];

const writeActions = [
  { label: 'Add expense', prompt: 'Add an expense to my calendar.' },
  { label: 'Add income', prompt: 'Add an income source to my calendar.' },
  { label: 'Remove item', prompt: 'Remove an expense or income source from my calendar.' },
];

const bandClass: Record<Extract<ChatCard, { type: 'verdict' }>['comfortBand'], { bar: string; word: string; label: string }> = {
  green: { bar: 'bg-[#12A66A]', word: 'text-[#168657]', label: 'Comfortable' },
  amber: { bar: 'bg-[#E0A100]', word: 'text-[#9A6B00]', label: 'Tight' },
  red: { bar: 'bg-[#D20A58]', word: 'text-[#D20A58]', label: 'Not safe' },
};

function NumberRow({ item }: { item: Extract<ChatCard, { type: 'verdict' }>['numbers'][number] }) {
  const value = item.valueAed !== undefined ? `AED ${money(item.valueAed)}` : item.valuePct !== undefined ? `${item.valuePct.toFixed(item.valuePct % 1 ? 2 : 0)}%` : item.valueText ?? '';
  return (
    <div className="grid grid-cols-[1fr_auto] items-baseline gap-3 border-b border-[#EEF1F3] py-2 last:border-b-0">
      <div className="min-w-0">
        <p className="text-[12px] font-semibold text-[#17212B]">{item.label}</p>
        {item.detail && <p className="mt-0.5 text-[10.5px] leading-4 text-[#667085]">{item.detail}</p>}
      </div>
      <p className="text-[17px] font-bold tabular-nums text-[#003B73]">{value}</p>
    </div>
  );
}

function VerdictCardView({ card }: { card: Extract<ChatCard, { type: 'verdict' }> }) {
  const band = bandClass[card.comfortBand] ?? bandClass.amber;
  return (
    <article className="relative overflow-hidden rounded-[16px] border border-[#E4E7EC] bg-white pl-4 pr-3.5 py-3.5" data-testid="card-verdict">
      <span className={`absolute inset-y-0 left-0 w-1.5 ${band.bar}`} aria-hidden="true" />
      <p className={`text-[10px] font-semibold ${band.word}`}>{band.label}</p>
      <h3 className="mt-1 text-[16px] font-bold leading-tight tracking-[-.03em] text-[#003B73]">{card.headline}</h3>
      <div className="mt-2">{card.numbers.map((item) => <NumberRow key={item.label} item={item} />)}</div>
      {card.components && card.components.length > 0 && (
        <details className="mt-2 rounded-[12px] bg-[#F8FAFC] px-3 py-2">
          <summary className="cursor-pointer text-[11px] font-semibold text-[#003B73]">Where the day-one cash goes</summary>
          <ul className="mt-2 space-y-1">
            {card.components.map((c) => (
              <li key={c.label} className="flex items-baseline justify-between gap-3 text-[11px]">
                <span className="text-[#667085]">{c.label}{c.typical && <em className="ml-1 not-italic text-[#98A2B3]">typical</em>}</span>
                <span className="font-semibold tabular-nums text-[#17212B]">AED {money(c.valueAed)}</span>
              </li>
            ))}
          </ul>
        </details>
      )}
      {card.whatWouldChangeIt.length > 0 && (
        <div className="mt-3">
          <p className="text-[10px] font-semibold uppercase tracking-[.12em] text-[#98A2B3]">What would change it</p>
          <ul className="mt-1 space-y-1">{card.whatWouldChangeIt.map((line) => <li key={line} className="text-[11.5px] leading-4 text-[#17212B]">{line}</li>)}</ul>
        </div>
      )}
      {card.rules.length > 0 && (
        <div className="mt-3">
          <p className="text-[10px] font-semibold uppercase tracking-[.12em] text-[#98A2B3]">Rules used</p>
          <ul className="mt-1 space-y-1">
            {card.rules.map((rule) => <li key={rule.path} className="text-[10.5px] leading-4 text-[#667085]">{rule.source}</li>)}
          </ul>
        </div>
      )}
      <p className="mt-3 rounded-[12px] bg-[#EAF6FD] px-3 py-2 text-[11px] leading-4 text-[#003B73]"><span className="font-semibold">If you do nothing: </span>{card.doNothing}</p>
    </article>
  );
}

const recurrenceLabel: Record<Extract<ChatCard, { type: 'calendar_draft' }>['events'][number]['recurrence'], string> = {
  none: 'one-time',
  monthly: 'monthly',
  quarterly: 'quarterly',
  yearly: 'yearly',
};

// The skill asks the model to prefix a classification onto the free-text
// `note` field (e.g. "Classification: emergency. Boiler replacement.")
// rather than adding a new structured field — this splits it back out for
// display without touching the draft schema.
const CLASSIFICATION_PATTERN = /^classification:\s*(expected|discretionary|emergency)\.?\s*/i;
function splitClassification(note?: string): { classification?: string; rest?: string } {
  if (!note) return {};
  const match = note.match(CLASSIFICATION_PATTERN);
  if (!match) return { rest: note };
  const rest = note.slice(match[0].length).trim();
  return { classification: match[1]!.toLowerCase(), rest: rest || undefined };
}

function CalendarDraftCardView({ card, status, onStatusChange }: { card: Extract<ChatCard, { type: 'calendar_draft' }>; status: DraftStatus; onStatusChange: (status: DraftStatus) => void }) {
  const confirm = useConfirmCalendarDraft();
  const reject = useRejectCalendarDraft();
  const queryClient = useQueryClient();
  const busy = confirm.isPending || reject.isPending;

  const [failed, setFailed] = useState(false);

  const handleConfirm = () => {
    if (busy || status !== 'pending') return;
    setFailed(false);
    confirm.mutate(
      { draftId: card.draftId },
      {
        onSuccess: () => {
          queryClient.invalidateQueries({ queryKey: getGetMoneyCalendarQueryKey() });
          queryClient.invalidateQueries({ queryKey: getGetCalendarForecastQueryKey() });
          onStatusChange('confirmed');
        },
        onError: () => setFailed(true),
      },
    );
  };

  const handleReject = () => {
    if (busy || status !== 'pending') return;
    setFailed(false);
    reject.mutate({ draftId: card.draftId }, { onSuccess: () => onStatusChange('rejected'), onError: () => setFailed(true) });
  };

  const actionLabel = card.action === 'add' ? 'Proposed addition' : card.action === 'update' ? 'Proposed update' : 'Proposed removal';

  return (
    <article className="rounded-[16px] border border-[#E4E7EC] bg-white p-3.5" data-testid="card-calendar-draft">
      <p className="text-[10px] font-semibold uppercase tracking-[.12em] text-[#98A2B3]">{actionLabel}</p>
      {card.events.length > 0 ? (
        card.events.map((event) => {
          const { classification, rest } = splitClassification(event.note);
          return (
            <div key={event.name} className="mt-2">
              <p className="text-[15px] font-bold leading-tight text-[#003B73]">{event.name}</p>
              <p className="mt-0.5 text-[14px] font-semibold tabular-nums text-[#17212B]">{event.direction === 'credit' ? '+' : '−'}AED {money(event.amountAed)}</p>
              <p className="mt-0.5 text-[11.5px] text-[#667085]">
                {event.date} · {recurrenceLabel[event.recurrence]} · {event.category}
                {classification && <> · <span className="capitalize">{classification}</span></>}
              </p>
              {rest && <p className="mt-0.5 text-[11px] text-[#98A2B3]">{rest}</p>}
            </div>
          );
        })
      ) : (
        <p className="mt-2 text-[15px] font-bold leading-tight text-[#003B73]">Remove: {card.targetEventLabel ?? card.targetEventId}</p>
      )}
      <div className="mt-2 rounded-[12px] bg-[#F8FAFC] px-3 py-2" data-testid="text-draft-impact">
        <p className="text-[10px] font-semibold uppercase tracking-[.1em] text-[#98A2B3]">{card.impact.metricLabel}</p>
        <p className="mt-1 text-[12px] text-[#17212B]">
          <span className="tabular-nums">AED {money(card.impact.before)}</span>
          <span className="mx-1.5 text-[#98A2B3]">→</span>
          <span className={`font-semibold tabular-nums ${card.impact.after >= card.impact.before ? 'text-[#12A66A]' : 'text-[#D20A58]'}`}>AED {money(card.impact.after)}</span>
        </p>
      </div>
      <p className="mt-3 rounded-[12px] bg-[#EAF6FD] px-3 py-2 text-[11px] leading-4 text-[#003B73]">Nothing changes until you confirm in the app.</p>
      {status === 'pending' && (
        <div className="mt-3 flex gap-2">
          <button type="button" onClick={handleConfirm} disabled={busy} className="min-h-10 flex-1 rounded-xl bg-[#003B73] text-[12px] font-semibold text-white disabled:opacity-50" data-testid="button-confirm-draft">
            {confirm.isPending ? 'Confirming…' : 'Confirm plan'}
          </button>
          <button type="button" onClick={handleReject} disabled={busy} className="min-h-10 flex-1 rounded-xl border border-[#DDE7EC] text-[12px] font-semibold text-[#667085] disabled:opacity-50" data-testid="button-reject-draft">
            {reject.isPending ? 'Please wait…' : 'Not now'}
          </button>
        </div>
      )}
      {failed && status === 'pending' && <p className="mt-2 text-[11.5px] font-semibold text-[#D20A58]" data-testid="text-draft-error">That didn’t go through — your calendar is unchanged. Try again.</p>}
      {status === 'confirmed' && <p className="mt-3 text-[12px] font-semibold text-[#12A66A]" data-testid="text-draft-confirmed">Confirmed — your calendar is updated.</p>}
      {status === 'rejected' && <p className="mt-3 text-[12px] font-semibold text-[#667085]" data-testid="text-draft-rejected">Not applied.</p>}
    </article>
  );
}

function AssistantMessage({ message, onDraftStatusChange }: { message: Extract<Message, { role: 'assistant' }>; onDraftStatusChange: (id: string, status: DraftStatus) => void }) {
  const { card } = message;
  return (
    <div className="space-y-2" data-testid={`message-assistant-${message.id}`}>
      <p className="text-[13px] leading-5 text-[#17212B]">{message.text}</p>
      {card.type === 'verdict' && <VerdictCardView card={card} />}
      {card.type === 'missing_data' && (
        <div className="rounded-[14px] border border-[#E4E7EC] bg-white p-3.5" data-testid="card-missing-data">
          <ul className="space-y-1.5">{card.fields.map((field) => <li key={field.key} className="text-[11.5px] leading-4 text-[#17212B]"><span className="font-semibold">{field.label}.</span> <span className="text-[#667085]">{field.how}</span></li>)}</ul>
          <Link href="/onboarding" className="mt-3 inline-flex min-h-10 items-center rounded-xl bg-[#EAF6FD] px-3 text-[12px] font-semibold text-[#003B73]">Open profile</Link>
        </div>
      )}
      {card.type === 'calendar_draft' && (
        <CalendarDraftCardView card={card} status={message.draftStatus ?? 'pending'} onStatusChange={(status) => onDraftStatusChange(message.id, status)} />
      )}
      {card.type === 'decline' && (
        <p className="rounded-[14px] bg-[#F2F4F7] px-3.5 py-2.5 text-[12px] leading-5 text-[#667085]" data-testid="card-decline">I can only answer questions about your calendar, balance, safe-to-spend, or upcoming commitments right now.</p>
      )}
      {card.type === 'unavailable' && card.capability !== 'chat' && card.capability !== 'unverified-figure' && (
        <p className="rounded-[14px] bg-[#F2F4F7] px-3.5 py-2.5 text-[12px] leading-5 text-[#667085]" data-testid="card-unavailable">That capability isn’t connected yet.</p>
      )}
    </div>
  );
}

export default function ChatPage() {
  const { data: calendar } = useGetMoneyCalendar({ query: { queryKey: getGetMoneyCalendarQueryKey() } });
  const send = useSendChatMessage();
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState('');
  const [sessionId] = useState(() => `session-${Date.now()}`);
  const endRef = useRef<HTMLDivElement>(null);

  useEffect(() => { endRef.current?.scrollIntoView({ behavior: 'smooth', block: 'end' }); }, [messages.length]);

  const ask = (text: string) => {
    const trimmed = text.trim();
    if (!trimmed || send.isPending) return;
    setMessages((current) => [...current, { id: `u-${Date.now()}`, role: 'user', text: trimmed }]);
    setInput('');
    const history = messages.slice(-6).map((m) => ({ role: m.role, content: m.text }));
    send.mutate({ data: { sessionId, message: trimmed, history } }, {
      onSuccess: (response) => {
        const draftStatus = response.card.type === 'calendar_draft' ? 'pending' : undefined;
        setMessages((current) => [...current, { id: response.messageId, role: 'assistant', text: response.text, card: response.card, draftStatus }]);
      },
      onError: () => {
        setMessages((current) => [...current, { id: `e-${Date.now()}`, role: 'assistant', text: "I couldn't reach the planner. Your calendar is unchanged — try again in a moment.", card: { type: 'unavailable', capability: 'chat' } }]);
      },
    });
  };

  const setDraftStatus = (id: string, status: DraftStatus) => {
    setMessages((current) => current.map((m) => (m.id === id && m.role === 'assistant' ? { ...m, draftStatus: status } : m)));
  };

  const submit = (event: FormEvent) => { event.preventDefault(); ask(input); };

  return (
    <BayzatiMobileShell active="chat">
      <div data-testid="page-chat" className="flex min-h-[60vh] flex-col">
        <header className="mt-7">
          <p className="text-[11px] font-semibold uppercase tracking-[.16em] text-[#667085]">Ask Bayzati</p>
          <h1 className="mt-1 text-[28px] font-bold leading-none tracking-[-.04em] text-[#003B73]" data-testid="heading-chat">Decide with your calendar.</h1>
          <p className="mt-3 text-[12px] leading-5 text-[#667085]">Every number comes from your plan. Answers only cover what's computed here — nothing else is guessed.</p>
        </header>

        {messages.length === 0 && (
          <div className="mt-5 flex flex-wrap gap-2" data-testid="chat-quick-prompts">
            {quickPrompts.map((prompt, index) => (
              <button key={prompt} type="button" onClick={() => ask(prompt)} className="min-h-10 rounded-full border border-[#DDE7EC] bg-white px-3.5 text-[12px] font-semibold text-[#003B73]" data-testid={`button-quick-prompt-${index}`}>{quickLabels[index]}</button>
            ))}
          </div>
        )}

        {messages.length === 0 && (
          <div className="mt-3" data-testid="chat-write-actions">
            <p className="text-[10px] font-semibold uppercase tracking-[.12em] text-[#98A2B3]">Change your calendar</p>
            <div className="mt-1.5 flex flex-wrap gap-2">
              {writeActions.map((action, index) => (
                <button key={action.label} type="button" onClick={() => ask(action.prompt)} className="min-h-10 rounded-full border border-[#DDE7EC] bg-white px-3.5 text-[12px] font-semibold text-[#003B73]" data-testid={`button-write-action-${index}`}>{action.label}</button>
              ))}
            </div>
          </div>
        )}

        <div className="mt-5 flex-1 space-y-4">
          {messages.length === 0 && (
            <p className="flex items-center gap-2 text-[12px] text-[#667085]" data-testid="chat-empty-state">
              <MessageCircle className="size-4 text-[#139BE8]" /> Ask something grounded in your calendar, or try a prompt above.
            </p>
          )}
          {messages.map((message) => message.role === 'user'
            ? <p key={message.id} className="ml-8 rounded-[16px] rounded-br-[4px] bg-[#003B73] px-3.5 py-2.5 text-[13px] leading-5 text-white" data-testid={`message-user-${message.id}`}>{message.text}</p>
            : <AssistantMessage key={message.id} message={message} onDraftStatusChange={setDraftStatus} />)}
          {send.isPending && <p className="flex items-center gap-2 text-[12px] text-[#667085]" data-testid="chat-thinking"><Loader2 className="size-3.5 animate-spin" /> Checking your calendar…</p>}
          <div ref={endRef} />
        </div>

        <form onSubmit={submit} className="sticky bottom-[96px] mt-5 flex items-end gap-2 rounded-[18px] border border-[#E4E7EC] bg-white p-2 shadow-[0_8px_24px_rgba(0,46,93,.08)]">
          <textarea
            value={input}
            onChange={(event) => setInput(event.target.value)}
            onKeyDown={(event) => { if (event.key === 'Enter' && !event.shiftKey) { event.preventDefault(); ask(input); } }}
            rows={1}
            placeholder={calendar ? 'Ask about your balance, safe-to-spend, or propose a calendar change' : 'Loading your calendar…'}
            disabled={!calendar}
            className="max-h-32 min-h-11 flex-1 resize-none bg-transparent px-2 py-2.5 text-[13px] text-[#17212B] outline-none"
            data-testid="input-chat"
          />
          <button type="submit" disabled={!input.trim() || send.isPending} aria-label="Send" className="grid size-11 place-items-center rounded-full bg-[#003B73] text-white disabled:opacity-40" data-testid="button-send-chat">
            {send.isPending ? <Loader2 className="size-4 animate-spin" /> : <ArrowUp className="size-4" />}
          </button>
        </form>
        {messages.length > 0 && (
          <button type="button" onClick={() => setMessages([])} className="mx-auto mt-3 flex items-center gap-1 text-[11px] text-[#98A2B3]" data-testid="button-clear-chat"><X className="size-3" /> Clear</button>
        )}
        <p className="mt-2 flex items-center justify-center gap-1 text-[10px] text-[#98A2B3]"><Sparkles className="size-3" /> The planner never moves money. It only explains.</p>
      </div>
    </BayzatiMobileShell>
  );
}
