// Defense in depth against Gemini inventing — or misattributing — a
// financial figure the backend never computed. The system prompt already
// tells it not to, but a prompt is not a guarantee.
//
// This is field-aware, not a flat "does this number appear anywhere in
// context" check: a global membership test would wrongly accept "AED 25
// safe to spend" just because 25 happens to be the payday day somewhere
// else in context. Instead, only numbers the reply explicitly tags as
// money (via "AED") are checked, and they're checked against an explicit
// list of amounts the finance engine actually computed — never against
// day-of-month, year, or other non-monetary numbers.
const AED_CLAIM_PATTERN = /(?:AED\s*([\d,]+(?:\.\d+)?))|(?:([\d,]+(?:\.\d+)?)\s*AED)/gi;

function extractMonetaryClaims(text: string): number[] {
  const claims: number[] = [];
  for (const match of text.matchAll(AED_CLAIM_PATTERN)) {
    const raw = match[1] ?? match[2];
    if (raw) claims.push(Number(raw.replace(/,/g, '')));
  }
  return claims;
}

export function findUnsupportedMonetaryClaims(responseText: string, allowedAmounts: number[]): number[] {
  const allowed = new Set(allowedAmounts.map((n) => Math.round(n * 100) / 100));
  const claimed = extractMonetaryClaims(responseText);
  return claimed.filter((n) => !allowed.has(Math.round(n * 100) / 100));
}

const NUMBER_PATTERN = /\d[\d,]*(?:\.\d+)?/g;

// Every plain number literal in a message (not just AED-tagged ones) — used
// to extend the monetary allow-list with figures the *user themselves*
// supplied in a calendar-change request (e.g. "Add AED 1,200..."), which
// are facts, not something Gemini invented.
export function extractNumbers(text: string): number[] {
  const numbers: number[] = [];
  for (const match of text.matchAll(NUMBER_PATTERN)) {
    numbers.push(Number(match[0].replace(/,/g, '')));
  }
  return numbers;
}
