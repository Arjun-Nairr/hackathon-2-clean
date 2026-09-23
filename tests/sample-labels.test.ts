import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

function sourceOf(relativePath: string): string {
  return readFileSync(fileURLToPath(new URL(`../${relativePath}`, import.meta.url)), "utf8");
}

const SAMPLE_LABEL = "Sample result — not calculated from your inputs yet";

test("the Loan results panel carries the sample-result label and no longer claims to calculate from the current inputs", () => {
  const source = sourceOf("src/pages/loan.tsx");
  assert.ok(source.includes(SAMPLE_LABEL));
  assert.ok(!/runs the instalment through every month/i.test(source), "must not claim per-input calculation");
  assert.ok(!/We check UAE legal limits/i.test(source), "must not claim a live legal-limits check");
});

test("the Rent-vs-buy results panel carries the sample-result label", () => {
  const source = sourceOf("src/pages/rent-vs-buy.tsx");
  assert.ok(source.includes(SAMPLE_LABEL));
});

test("the plan hub and chat no longer present Loan/Rent-vs-buy as live chat capabilities", () => {
  const planSource = sourceOf("src/pages/plan.tsx");
  assert.ok(!/Loans, rent vs buy/i.test(planSource));
  const chatSource = sourceOf("api/_lib/chat.ts");
  assert.match(chatSource, /sample walkthrough/i);
});
