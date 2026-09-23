import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

// No jsdom/RTL in this repo; asserts the visible-copy fix directly from
// source, matching this project's existing no-render test convention.
function sourceOf(relativePath: string): string {
  const path = fileURLToPath(new URL(`../${relativePath}`, import.meta.url));
  return readFileSync(path, "utf8");
}

test("Home no longer claims 'Your money today' and shows a visible, un-collapsed demo-date badge", () => {
  const source = sourceOf("src/pages/home.tsx");
  assert.ok(!source.includes("Your money today"), "the misleading 'today' headline must be gone");
  assert.match(source, /Your money, \{exemplarDateLabel\}/, "the headline should read the real exemplar date instead");
  // The badge must render unconditionally in the main return, not only
  // inside the `detailsOpen &&` collapsed section further down the file.
  const badgeIndex = source.indexOf('data-testid="text-demo-date-badge"');
  const collapsedSectionIndex = source.indexOf("detailsOpen &&");
  assert.ok(badgeIndex > -1, "expected a demo-date badge");
  assert.ok(badgeIndex < collapsedSectionIndex, "the demo-date badge must appear before (outside) the collapsed 'How this is calculated' section");
  assert.match(source, /Demo data.*not the real current date/);
});

test("the year-ahead ribbon no longer claims 'Safe to spend today' without the exemplar date, and shows a visible demo-date badge", () => {
  const source = sourceOf("src/components/year-ahead-ribbon.tsx");
  assert.ok(!source.includes("Safe to spend today"), "the misleading 'today' label must be gone");
  assert.match(source, /Safe to spend, \{exemplarDateLabel\}/);
  assert.match(source, /Demo data.*not the real current date/);
  assert.match(source, /data-testid="text-ribbon-demo-date-badge"/);
});

test("Home's 'Coming up' card reads the backend-provided upcomingCommitments list, not a client-side re-filter of all events", () => {
  const source = sourceOf("src/pages/home.tsx");
  assert.match(source, /calendar\?\.upcomingCommitments/, "Home must read the backend's own as-of-aware list");
  assert.ok(!/\(calendar\?\.events ?\?\? \[\]\)\.filter/.test(source), "Home must not independently re-filter `events` by date/kind for 'coming up'");
});
