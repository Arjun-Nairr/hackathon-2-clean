import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

// No jsdom/RTL in this repo; asserts the forecast graph's explanatory
// elements directly from source.
const source = readFileSync(fileURLToPath(new URL("../src/components/year-ahead-ribbon.tsx", import.meta.url)), "utf8");

test("the forecast legend names the line, income markers, expense markers, and the buffer", () => {
  for (const id of ["legend-balance", "legend-income", "legend-expense", "legend-buffer"]) {
    assert.match(source, new RegExp(`data-testid="${id}"`), id);
  }
});

test("legend swatches and graph marks share one set of color constants, so they cannot drift apart", () => {
  for (const name of ["BALANCE_COLOR", "INCOME_COLOR", "EXPENSE_COLOR", "BUFFER_COLOR"]) {
    const uses = source.match(new RegExp(`\\b${name}\\b`, "g")) ?? [];
    assert.ok(uses.length >= 3, `${name} should be defined once and used by both the graph and the legend (found ${uses.length})`);
  }
  // No stray literal colors left on the plotted marks.
  assert.doesNotMatch(source, /stroke="#003B73"|fill=\{dot\.credit \? '#/);
});

test("the buffer line is positioned from forecast.bufferTarget on the graph's own y-scale, and hidden when out of range", () => {
  assert.match(source, /y\(forecast\.bufferTarget\)/);
  assert.match(source, /forecast\.bufferTarget >= min && forecast\.bufferTarget <= max/);
  assert.match(source, /strokeDasharray/);
  assert.doesNotMatch(source, /45[,_]?000/, "the buffer amount must never be hardcoded");
});

test("safe to spend is explained in terms that match the engine's formula", () => {
  assert.match(source, /Safe to spend is today’s balance minus the bills due before payday, planned goal savings, and your protected buffer\./);
});
