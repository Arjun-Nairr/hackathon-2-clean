import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

// Guard against the finance engine sneaking back into the frontend before
// Bundle 2 builds it for real. `mock-client.ts` must return fixed, typed
// fixtures only — no amortization, APR, DBR, LTV, break-even, or verdict
// arithmetic. This reads the source directly so the check survives any
// refactor that keeps the forbidden logic but renames the call site.
function sourceOf(relativePath: string): string {
  const path = fileURLToPath(new URL(`../${relativePath}`, import.meta.url));
  return readFileSync(path, "utf8");
}

const forbiddenNames = [
  "amortizedInstallment",
  "computeAffordability",
  "computeRentVsBuy",
  "monthlyInstallment =",
  "debtRatio =",
  "salaryMultiple =",
  "breakEvenYear =",
  "monthsSurvived =",
  "downPaymentPct",
  "Math.pow",
];

test("mock-client.ts contains no affordability, amortization, APR, DBR, LTV, break-even, or verdict-calculation logic", () => {
  const source = sourceOf("src/lib/api/mock-client.ts");
  for (const forbidden of forbiddenNames) {
    assert.ok(!source.includes(forbidden), `mock-client.ts must not contain "${forbidden}"`);
  }
});

test("checkAffordability and compareRentVsBuy return fixed fixtures, not functions of their input", () => {
  const source = sourceOf("src/lib/api/mock-client.ts");
  assert.match(source, /async checkAffordability\(\)\s*{\s*await network\(\);\s*return AFFORDABILITY_FIXTURE;\s*}/);
  assert.match(source, /async compareRentVsBuy\(\)\s*{\s*await network\(\);\s*return RENT_VS_BUY_FIXTURE;\s*}/);
});

test("hooks import the configured ApiClient from the composition root, never mockClient directly", () => {
  const source = sourceOf("src/lib/api/hooks.ts");
  assert.ok(!source.includes("mock-client"), "hooks.ts must not import from ./mock-client");
  assert.match(source, /import\s*{\s*apiClient\s*}\s*from\s*['"]\.\/index['"]/);
});

test("the composition root is the only place that imports mock-client for app wiring", () => {
  const source = sourceOf("src/lib/api/index.ts");
  assert.match(source, /import\s*{\s*mockClient\s*}\s*from\s*['"]\.\/mock-client['"]/);
  assert.match(source, /export const apiClient: ApiClient = mockClient;/);
});
