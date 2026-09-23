// Routes a chat message into exactly one intent using whole-word / start-of-
// message checks — never a raw substring test. A substring check (the old
// approach) let "billion" match "bill"; `\bbill\b` does not.
export type Intent = 'read' | 'calendar_change' | 'missing_data' | 'unavailable' | 'decline';

// Calendar-change requests in this app are usually imperative ("Add ...",
// "Remove ..."), so checking only the first word avoids misreading a read
// question that happens to contain one of these verbs mid-sentence (e.g.
// "What would change my safe-to-spend?"). A second, narrow pattern catches
// the one common non-imperative phrasing this app must also support:
// reporting income just received ("I received an AED 8,000 bonus today"),
// which names no read-question keyword at all.
const CALENDAR_CHANGE_VERBS = new Set(['add', 'remove', 'delete', 'update', 'change', 'edit', 'set']);
const CALENDAR_CHANGE_OPENER_PATTERN = /^i\s+(received|got|earned)\b/i;

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

  if (CALENDAR_CHANGE_VERBS.has(firstWord(trimmed)) || CALENDAR_CHANGE_OPENER_PATTERN.test(trimmed)) {
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
