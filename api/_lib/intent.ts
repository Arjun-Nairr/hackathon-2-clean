// Routes a chat message into exactly one intent using whole-word / start-of-
// message checks — never a raw substring test. A substring check (the old
// approach) let "billion" match "bill"; `\bbill\b` does not.
export type Intent = 'read' | 'calendar_change' | 'missing_data' | 'unavailable' | 'decline';

// Calendar-change requests in this app are usually imperative ("Add ...",
// "Remove ..."), so checking only the first word avoids misreading a read
// question that happens to contain one of these verbs mid-sentence (e.g.
// "What would change my safe-to-spend?"). A polite/indirect framing
// ("Can you add an expense?", "I want to add a bonus", "Help me remove
// this payment") says the same thing with a few extra words in front — this
// pattern strips one recognized opener before applying the same
// first-word check, so those still count while a verb buried mid-sentence
// (not right after a recognized opener) still does not. A second, narrow
// pattern catches the one common non-imperative phrasing this app must
// also support: reporting income received or being received
// ("I received an AED 8,000 bonus today", "I'm receiving a bonus
// tomorrow"), which names no read-question keyword at all.
const CALENDAR_CHANGE_VERBS = new Set(['add', 'remove', 'delete', 'update', 'change', 'edit', 'set']);
const CALENDAR_CHANGE_OPENER_PATTERN = /^i(?:'m|\s+am)?\s+(received|receiving|got|getting|earned|earning)\b/i;
const REQUEST_OPENER_PATTERN = /^(i want to|i'd like to|i would like to|i wanna|please|can you|could you|would you|help me(?: to)?)\s+/i;

const LOAN_PATTERN = /\b(loan|emi|amorti[sz]ation|apr|debt[- ]burden|debt[- ]to[- ]income)\b/i;
const RENT_VS_BUY_PATTERN = /\brent\b[^.?!]*\bbuy\b|\bbuy\b[^.?!]*\brent\b|rent[- ]vs\.?[- ]buy|rent[- ]versus[- ]buy/i;
const GOAL_PATTERN = /\bgoals?\b/i;
// Read keywords split in two. TOPIC words mark a genuinely new read
// question and close any open clarification. ANSWER words are read
// keywords too, but also ordinary vocabulary in an answer to a clarifying
// question ("income", "end of month", "AED 5,000 rent") — they must not, on
// their own, pull a continuation away from the calendar change it answers.
const READ_TOPIC_PATTERN = /\b(spend|safe|allowance|tight|tightest|lowest|commitments?|due|balance|buffer|afford|calendar|payday|plan|upcoming|money|cash|forecast|get\s+paid|coming\s+up)\b/i;
const READ_ANSWER_WORD_PATTERN = /\b(bills?|salary|income|month|rent|expenses?)\b/i;

// A calendar-change verb only counts as a write request on its own — "add
// up" ("Can you add up my bills?") is arithmetic/summary language sharing
// the word "add" but meaning something entirely different, not a request
// to create an event.
function isCalendarChangeVerb(withoutOpener: string): boolean {
  const words = withoutOpener.trim().split(/\s+/);
  const first = (words[0] ?? '').toLowerCase().replace(/[^a-z]/g, '');
  if (!CALENDAR_CHANGE_VERBS.has(first)) return false;
  const second = (words[1] ?? '').toLowerCase().replace(/[^a-z]/g, '');
  if (first === 'add' && second === 'up') return false;
  return true;
}

export function classifyIntent(message: string): Intent {
  const trimmed = message.trim();
  if (!trimmed) return 'decline';

  const withoutOpener = trimmed.replace(REQUEST_OPENER_PATTERN, '');
  if (isCalendarChangeVerb(withoutOpener) || CALENDAR_CHANGE_OPENER_PATTERN.test(trimmed)) {
    return 'calendar_change';
  }
  if (LOAN_PATTERN.test(trimmed) || RENT_VS_BUY_PATTERN.test(trimmed)) {
    return 'unavailable';
  }
  if (GOAL_PATTERN.test(trimmed)) {
    return 'missing_data';
  }
  if (READ_TOPIC_PATTERN.test(trimmed) || READ_ANSWER_WORD_PATTERN.test(trimmed)) {
    return 'read';
  }
  return 'decline';
}

// True for a fresh "add" request with no amount/date given yet ("Add an
// expense to my calendar.", "Add my rent", the chat page's write-action
// buttons) — used by chat.ts to answer with a fixed, figure-free
// clarification instead of sending it to Gemini. In practice, Gemini's own
// free-text clarifying reply to a request this open-ended has sometimes
// included an illustrative example figure ("...the amount, e.g. AED 500"),
// which the number guard then correctly rejects as unverified, surfacing as
// a false "couldn't verify" outage for a completely ordinary first message.
// A request that already includes a digit (an amount or date) is
// specific enough to go straight to Gemini as before; a "remove" request
// is out of scope here — its disambiguation already comes from real
// tool-sourced data, not an invented figure.
export function isUnderspecifiedAddRequest(message: string): boolean {
  const trimmed = message.trim();
  if (!trimmed || /\d/.test(trimmed)) return false;
  const withoutOpener = trimmed.replace(REQUEST_OPENER_PATTERN, '');
  const first = (withoutOpener.trim().split(/\s+/)[0] ?? '').toLowerCase().replace(/[^a-z]/g, '');
  const second = (withoutOpener.trim().split(/\s+/)[1] ?? '').toLowerCase().replace(/[^a-z]/g, '');
  const isAddVerb = first === 'add' && second !== 'up';
  return isAddVerb || CALENDAR_CHANGE_OPENER_PATTERN.test(trimmed);
}

export interface HistoryTurn {
  role: 'user' | 'assistant';
  content: string;
}

// A message built only from bare confirmation/cancellation/filler words
// ("Yes, confirm it.", "Never mind.") answers nothing new — never treated
// as continuing an open calendar_change thread, even though (like a
// genuine continuation) it carries no independent classification signal.
const NON_ANSWER_WORDS = new Set([
  'yes', 'yeah', 'yep', 'sure', 'ok', 'okay', 'confirm', 'confirmed', 'go', 'ahead',
  'never', 'mind', 'cancel', 'cancelled', 'canceled', 'forget', 'it', 'nothing',
  'skip', 'no', 'nope', 'not', 'now', 'thanks', 'thank', 'please', 'that',
]);

function isNonAnswer(trimmed: string): boolean {
  // A digit is never filler — "4000", "AED 4,000", and "12 September" are
  // all real answers, but stripping non-letters before checking would
  // reduce "4000" to an empty word list and wrongly count as one.
  if (/\d/.test(trimmed)) return false;
  const words = trimmed.toLowerCase().replace(/[^a-z\s]/g, '').split(/\s+/).filter(Boolean);
  return words.length === 0 || words.every((w) => NON_ANSWER_WORDS.has(w));
}

// A genuinely new question is never a continuation, no matter how short —
// "What's the weather?" must not be swept up just because it's brief and
// shares no keyword with anything.
const QUESTION_OPENER_PATTERN = /^(what|who|when|where|why|how|is|are|was|were|do|does|did|can|could|would|will|should)\b/i;

// A continuation answer is usually short — a number, a date, or a couple of
// words naming an event ("The credit card minimum"). Longer replies with no
// independent signal are more likely a genuinely new, unrelated message.
const MAX_CONTINUATION_WORDS = 6;

// The recognized shapes of an answer to a calendar-change clarification.
// Recurrence, type, and classification double as their own "is this field
// being asked about" signal — a genuine question naturally uses the same
// vocabulary a valid answer would ("Is this one-time or recurring?").
// Amount, date, and a removal choice need their own distinct ask-side
// patterns instead, since a plain digit or free-text event name can't be
// used to detect that they were asked for.
const DATE_WORD_PATTERN = /\b(jan(?:uary)?|feb(?:ruary)?|mar(?:ch)?|apr(?:il)?|may|jun(?:e)?|jul(?:y)?|aug(?:ust)?|sep(?:t|tember)?|oct(?:ober)?|nov(?:ember)?|dec(?:ember)?|today|tomorrow|next\s+\w+|(?:mon|tues|wednes|thurs|fri|satur|sun)day|weekend|end\s+of\s+(?:the\s+)?month|this\s+month)\b/i;
const RECURRENCE_PATTERN = /\b(one-?time|once|monthly|quarterly|yearly|annually|recurring|every\s+\w+)\b/i;
const DIRECTION_TYPE_PATTERN = /\b(income|expense|bonus|salary|bills?)\b/i;
const CLASSIFICATION_PATTERN = /\b(expected|discretionary|emergency)\b/i;
const AMOUNT_ASK_PATTERN = /\b(amount|how much|price|cost|figure)\b/i;
const DATE_ASK_PATTERN = /\b(date|day|when|start\w*)\b/i;
// Any "which ...?" choice or "did you mean" — Gemini phrases a removal
// choice many ways ("Which one...", "Which would you like to remove?").
const REMOVAL_CHOICE_ASK_PATTERN = /\bwhich\b|\bdid\s+you\s+mean\b/i;

// Small talk or meta-commentary about the conversation ("hello there",
// "that sounds confusing") — short and signal-free just like a genuine
// continuation, but never itself an answer, so it must never revive an
// open thread.
const GENERIC_REPLY_PATTERN = /^(hi|hello|hey|hiya|yo)\b|\b(confus\w*|complicat\w*|unclear|lost|unsure)\b/i;

// chat.ts guarantees every draft reply contains "Nothing changes until you
// confirm in the app." — checked first so a completed request is never
// mistaken for an open one, even if it ends in '?' (e.g. Gemini tacking on
// "Would you like anything else?") or mentions a recurrence/type word while
// describing what it just drafted.
const COMPLETED_DRAFT_PATTERN = /\bnothing\s+changes\s+until\s+you\s+confirm\b|\b(?:prepared|created|drafted|set\s+up)\s+a\s+draft\b/i;

// Server/UI failure replies. A failed turn answered nothing, so it and the
// user message that triggered it are skipped when reading history — the
// user retrying the same answer still continues the open clarification.
const FAILED_TURN_PATTERN = /couldn.t reach the planner|figure I couldn.t verify/i;

function withoutFailedTurns(history: HistoryTurn[]): HistoryTurn[] {
  const kept: HistoryTurn[] = [];
  for (const turn of history) {
    if (turn.role === 'assistant' && FAILED_TURN_PATTERN.test(turn.content)) {
      if (kept[kept.length - 1]?.role === 'user') kept.pop();
      continue;
    }
    kept.push(turn);
  }
  return kept;
}

// Not every clarifying turn is phrased as a question — "Please provide the
// amount and date." asks for the same thing as a statement.
const CLARIFICATION_STATEMENT_PATTERN = /\b(please\s+(provide|share|tell\s+me|give\s+me|specify|confirm)|could\s+you\s+(provide|share|tell\s+me|give\s+me|specify)|i\s+need\s+(the|to\s+know)|let\s+me\s+know)\b/i;

interface AskedFields {
  amount: boolean;
  date: boolean;
  recurrence: boolean;
  type: boolean;
  classification: boolean;
  removalChoice: boolean;
}

function hasAnyAskedField(fields: AskedFields): boolean {
  return fields.amount || fields.date || fields.recurrence || fields.type || fields.classification || fields.removalChoice;
}

// Whether an assistant turn is a still-open, specific calendar-field
// clarification — and if so, exactly which field(s) it asked about. A
// completed-draft reply is never open (regardless of phrasing). A reply
// that's question-shaped but names no recognized field (e.g. "Would you
// like anything else?") is not treated as open either — there is nothing
// for a later short reply to plausibly be answering.
function openClarification(content: string): { open: boolean; fields: AskedFields } {
  const trimmed = content.trim();
  const closed = { open: false, fields: { amount: false, date: false, recurrence: false, type: false, classification: false, removalChoice: false } };
  if (COMPLETED_DRAFT_PATTERN.test(trimmed)) return closed;

  // '?' anywhere, not just at the end: Gemini often asks first, then lists
  // the options ("Which payment would you like to remove?\n\n- Rent...").
  const isQuestionShaped = trimmed.includes('?') || CLARIFICATION_STATEMENT_PATTERN.test(trimmed);
  if (!isQuestionShaped) return closed;

  const fields: AskedFields = {
    amount: AMOUNT_ASK_PATTERN.test(trimmed),
    date: DATE_ASK_PATTERN.test(trimmed),
    recurrence: RECURRENCE_PATTERN.test(trimmed),
    type: DIRECTION_TYPE_PATTERN.test(trimmed),
    classification: CLASSIFICATION_PATTERN.test(trimmed),
    removalChoice: REMOVAL_CHOICE_ASK_PATTERN.test(trimmed),
  };
  if (!hasAnyAskedField(fields)) return closed;
  return { open: true, fields };
}

// classifyIntent looks at one message in isolation. A multi-turn calendar
// change breaks that: "Add school fees" (calendar_change) gets a
// clarifying question back, and the user's answer — "AED 3,000 monthly
// from 1 October 2026", "end of month", "the car loan installment" —
// classifies on its own as decline, read, or even unavailable ("loan").
// This layer asks whether the conversation has an open add/remove
// clarification the current message answers. A real new question or a
// read-topic message always keeps its own classification. `history` is
// exactly what the frontend already sends with each request (session-only
// React state) — nothing here reads or writes any other storage.
export function classifyIntentWithHistory(message: string, history: HistoryTurn[]): Intent {
  const own = classifyIntent(message);
  if (own === 'calendar_change') return own;

  const trimmed = message.trim();
  if (!trimmed || isNonAnswer(trimmed)) return own;
  // A new question or a read topic ("Show my balance") is never a
  // continuation, however short — it closes the open clarification.
  if (trimmed.includes('?') || QUESTION_OPENER_PATTERN.test(trimmed) || READ_TOPIC_PATTERN.test(trimmed)) return own;

  return answersOpenClarification(trimmed, withoutFailedTurns(history)) ? 'calendar_change' : own;
}

function answersOpenClarification(trimmed: string, history: HistoryTurn[]): boolean {
  // Only a direct reply to the assistant's own last turn counts, and that
  // turn must be a still-open, specific field clarification: a completed
  // draft, or a generic question naming no recognized field ("Would you
  // like anything else?"), leaves nothing open to answer.
  const last = history[history.length - 1];
  if (!last || last.role !== 'assistant') return false;
  const lastClarification = openClarification(last.content);
  if (!lastClarification.open) return false;

  // The clarification must belong to a calendar change: the user message
  // it replied to was itself one — directly ("Add school fees") or as an
  // earlier answer in the same clarification (checked recursively against
  // the history before it). Not "any calendar-change message anywhere".
  const prompter = history[history.length - 2];
  if (!prompter || prompter.role !== 'user') return false;
  if (classifyIntentWithHistory(prompter.content, history.slice(0, -2)) !== 'calendar_change') return false;

  // Generic small talk ("hello there") or meta-commentary about the
  // conversation itself ("that sounds confusing") is exactly as short and
  // signal-free as a genuine continuation answer, but doesn't answer
  // anything the assistant asked.
  if (GENERIC_REPLY_PATTERN.test(trimmed)) return false;

  // A continuation is credited only when the reply matches the SPECIFIC
  // field the last clarification actually asked about — not any field a
  // clarification could ever ask about. A bare digit answers an amount or
  // date question but not a removal choice; a short free-text phrase
  // answers a removal choice (no fixed vocabulary exists for an arbitrary
  // event name) but not an amount question ("the gym membership" is never
  // a valid amount).
  const fields = lastClarification.fields;
  const hasDigit = /\d/.test(trimmed);
  const matchesAskedField =
    (fields.amount && hasDigit) ||
    (fields.date && (hasDigit || DATE_WORD_PATTERN.test(trimmed))) ||
    (fields.recurrence && RECURRENCE_PATTERN.test(trimmed)) ||
    (fields.type && DIRECTION_TYPE_PATTERN.test(trimmed)) ||
    (fields.classification && CLASSIFICATION_PATTERN.test(trimmed));
  if (matchesAskedField) return true;

  if (fields.removalChoice) {
    // A removal choice names an existing event in free text — there's no
    // fixed vocabulary to match against, so a short phrase is accepted as
    // long as it isn't a bare number (an amount is never an event choice)
    // or generic small talk (already ruled out above).
    const hasLetters = /[a-z]/i.test(trimmed);
    return hasLetters && trimmed.split(/\s+/).length <= MAX_CONTINUATION_WORDS;
  }

  return false;
}
