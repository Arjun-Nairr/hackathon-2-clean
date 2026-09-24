import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

function sourceOf(relativePath: string): string {
  return readFileSync(fileURLToPath(new URL(`../${relativePath}`, import.meta.url)), "utf8");
}

const CALCULATED_LABEL = "Calculated from your inputs and demo financial profile";

test("the Loan results panel honestly labels its live calculation", () => {
  const source = sourceOf("src/pages/loan.tsx");
  assert.ok(source.includes(CALCULATED_LABEL));
  assert.ok(!/Sample result — not calculated/i.test(source));
  assert.ok(!/legal debt ratio/i.test(source), "must not describe demo thresholds as legal eligibility");
});

test("the Rent-vs-buy results panel honestly labels its live calculation", () => {
  const source = sourceOf("src/pages/rent-vs-buy.tsx");
  assert.ok(source.includes(CALCULATED_LABEL));
  assert.ok(!/Sample result — not calculated/i.test(source));
});

test("the plan hub and chat no longer present Loan/Rent-vs-buy as live chat capabilities", () => {
  const planSource = sourceOf("src/pages/plan.tsx");
  assert.ok(!/Loans, rent vs buy/i.test(planSource));
  const chatSource = sourceOf("api/_lib/chat.ts");
  assert.match(chatSource, /sample walkthrough/i);
});
