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
const READ_PATTERN = /\b(spend|safe|allowance|tight|lowest|commitment|bill|due|balance|salary|income|buffer|afford|month|calendar|payday|plan|upcoming|rent)\b/i;

function firstWord(message: string): string {
  return (
    message
      .trim()
      .split(/\s+/)[0]
      ?.toLowerCase()
      .replace(/[^a-z]/g, '') ?? ''
  );
}

export function classifyIntent(message: string): Intent {
  const trimmed = message.trim();
  if (!trimmed) return 'decline';

  const withoutOpener = trimmed.replace(REQUEST_OPENER_PATTERN, '');
  if (CALENDAR_CHANGE_VERBS.has(firstWord(withoutOpener)) || CALENDAR_CHANGE_OPENER_PATTERN.test(trimmed)) {
    return 'calendar_change';
  }
  if (LOAN_PATTERN.test(trimmed) || RENT_VS_BUY_PATTERN.test(trimmed)) {
    return 'unavailable';
  }
  if (GOAL_PATTERN.test(trimmed)) {
    return 'missing_data';
  }
  if (READ_PATTERN.test(trimmed)) {
    return 'read';
  }
  return 'decline';
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

// A genuine clarifying question ("Could you share the amount...?") ends in
// '?'. A completed request's reply (e.g. "I've drafted AED 3,000 monthly
// school fees — confirm in the app to apply it.") is a statement, not a
// question — that difference is the only signal available here (history is
// plain role+text, no card metadata), and it's exactly the signal needed to
// avoid reviving a request that already got its draft.
function isClarifyingQuestion(content: string): boolean {
  return content.trim().endsWith('?');
}

// classifyIntent looks at one message in isolation. A multi-turn calendar
// change breaks that: "Add school fees" (calendar_change) gets a
// clarifying question back, and the user's answer — "AED 3,000 monthly
// from 1 October 2026" — has no calendar verb and no read keyword, so on
// its own it classifies as `decline`. This layer asks, only for messages
// that fell through to `decline`, whether the conversation has an
// unresolved add/remove request the current message could be answering.
// `history` is exactly what the frontend already sends with each request
// (session-only React state) — nothing here reads or writes any other
// storage.
export function classifyIntentWithHistory(message: string, history: HistoryTurn[]): Intent {
  const own = classifyIntent(message);
  if (own !== 'decline') return own;

  const trimmed = message.trim();
  if (!trimmed || isNonAnswer(trimmed)) return 'decline';

  // Only a direct reply to the assistant's own last turn counts — not an
  // unrelated message that happens to arrive after some older calendar
  // conversation. And it must actually be a clarifying question: a
  // completed-request reply means there is nothing left open to continue.
  const last = history[history.length - 1];
  if (!last || last.role !== 'assistant' || !isClarifyingQuestion(last.content)) return 'decline';

  // Walk back from just before that question looking for the request it
  // belongs to — not "any calendar-change message anywhere in history".
  // A short/non-classifiable user reply (answering only part of what was
  // asked) or another clarifying question keeps the same open thread; any
  // other assistant reply (a completed draft, a plain answer) means an
  // earlier request was already resolved, so the walk stops there instead
  // of crediting a later, unrelated request as still open.
  let openRequest = false;
  for (let i = history.length - 2; i >= 0; i -= 1) {
    const turn = history[i];
    if (turn.role === 'user') {
      const turnIntent = classifyIntent(turn.content);
      if (turnIntent === 'calendar_change') { openRequest = true; break; }
      if (turnIntent !== 'decline') break; // an unrelated topic closes the thread
      continue; // a partial clarification answer — keep looking further back
    }
    if (!isClarifyingQuestion(turn.content)) break; // a resolved/completed reply closes the thread
  }
  if (!openRequest) return 'decline';

  // A new question is never a continuation, however short.
  if (trimmed.includes('?') || QUESTION_OPENER_PATTERN.test(trimmed)) return 'decline';

  const hasDigit = /\d/.test(trimmed);
  const isShortPhrase = trimmed.split(/\s+/).length <= MAX_CONTINUATION_WORDS;
  return hasDigit || isShortPhrase ? 'calendar_change' : 'decline';
}
