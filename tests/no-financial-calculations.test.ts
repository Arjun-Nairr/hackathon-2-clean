import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
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

test("the composition root is the only place that imports mock-client and http-client for app wiring", () => {
  const source = sourceOf("src/lib/api/index.ts");
  assert.match(source, /import\s*{\s*mockClient\s*}\s*from\s*['"]\.\/mock-client['"]/);
  assert.match(source, /import\s*{\s*httpClient\s*}\s*from\s*['"]\.\/http-client['"]/);
  // Calendar, Chat, Loan and Rent-vs-buy are real HTTP calls; the remaining
  // methods stay on the mock until their endpoints exist.
  assert.match(source, /\.\.\.mockClient/);
  assert.match(source, /getMoneyCalendar:\s*httpClient\.getMoneyCalendar/);
  assert.match(source, /getCalendarForecast:\s*httpClient\.getCalendarForecast/);
  assert.match(source, /checkAffordability:\s*httpClient\.checkAffordability/);
  assert.match(source, /compareRentVsBuy:\s*httpClient\.compareRentVsBuy/);
  assert.match(source, /sendChatMessage:\s*httpClient\.sendChatMessage/);
});

test("http-client.ts contains no financial calculation — it only relays already-computed server responses", () => {
  const source = sourceOf("src/lib/api/http-client.ts");
  for (const forbidden of forbiddenNames) {
    assert.ok(!source.includes(forbidden), `http-client.ts must not contain "${forbidden}"`);
  }
});

function allSourceFiles(dir: string): string[] {
  const abs = fileURLToPath(new URL(`../${dir}`, import.meta.url));
  const files: string[] = [];
  const walk = (relative: string) => {
    for (const entry of readdirSync(`${abs}/${relative}`, { withFileTypes: true })) {
      const entryRelative = relative ? `${relative}/${entry.name}` : entry.name;
      if (entry.isDirectory()) walk(entryRelative);
      else if (/\.(ts|tsx)$/.test(entry.name)) files.push(`${dir}/${entryRelative}`);
    }
  };
  walk('');
  return files;
}

test("no frontend source file imports a Neon or Gemini SDK, or reads their env vars directly", () => {
  for (const file of allSourceFiles("src")) {
    const source = sourceOf(file);
    assert.ok(!source.includes('@neondatabase'), `${file} must not import a Neon SDK`);
    assert.ok(!/generativelanguage|@google\/generative-ai/.test(source), `${file} must not call Gemini directly`);
    assert.ok(!source.includes('process.env.DATABASE_URL') && !source.includes('process.env.GEMINI_API_KEY'), `${file} must not read server secrets directly`);
  }
});
