import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

function sourceOf(relativePath: string): string {
  return readFileSync(fileURLToPath(new URL(`../${relativePath}`, import.meta.url)), "utf8");
}

test("`start` is one command that builds then serves, and `build` cannot silently reuse a stale dist/", () => {
  const pkg = JSON.parse(sourceOf("package.json")) as { scripts: Record<string, string> };
  assert.equal(pkg.scripts.start, "pnpm run build && pnpm run serve");
  // `prebuild` runs automatically before `build` (npm/pnpm convention) and
  // must remove dist/ first, so a build that fails partway can never leave
  // old, gitignored output behind to be served.
  assert.ok(pkg.scripts.prebuild?.includes("clean-dist"));
  const cleanScript = sourceOf("scripts/clean-dist.mjs");
  assert.match(cleanScript, /rmSync/);
  assert.match(cleanScript, /dist/);
});

test("frontend-only preview commands are named distinctly from the real full-stack command", () => {
  const pkg = JSON.parse(sourceOf("package.json")) as { scripts: Record<string, string> };
  assert.ok(pkg.scripts["dev:frontend-only"]);
  assert.ok(pkg.scripts["preview:frontend-only"]);
  assert.ok(!pkg.scripts.dev, 'no bare "dev" script that could be mistaken for the full-stack app');
  assert.ok(!pkg.scripts.preview, 'no bare "preview" script that could be mistaken for the full-stack app');
});

test("chat copy no longer claims Loan or Rent-vs-buy support", () => {
  const source = sourceOf("src/pages/chat.tsx");
  assert.ok(!/loan/i.test(source), "chat.tsx must not mention loan capability");
  assert.ok(!/rent vs buy|rent-vs-buy/i.test(source), "chat.tsx must not mention rent-vs-buy capability");
});

test("after confirming a draft, the chat page invalidates the money-calendar and calendar-forecast queries (Home, Calendar, and the forecast ribbon all read from these)", () => {
  const source = sourceOf("src/pages/chat.tsx");
  assert.match(source, /onSuccess:\s*\(\)\s*=>\s*\{[\s\S]*?invalidateQueries\(\{\s*queryKey:\s*getGetMoneyCalendarQueryKey\(\)\s*\}\)/);
  assert.match(source, /invalidateQueries\(\{\s*queryKey:\s*getGetCalendarForecastQueryKey\(\)\s*\}\)/);
});

test("the draft card discloses that nothing changes until confirmation, and both actions are disabled while a request is pending", () => {
  const source = sourceOf("src/pages/chat.tsx");
  assert.match(source, /Nothing changes until you confirm in the app\./);
  assert.match(source, /disabled=\{busy\}/);
});
