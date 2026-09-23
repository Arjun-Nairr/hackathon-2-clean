import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

// No jsdom/RTL in this app; this asserts the retained routing table and the
// Vercel SPA rewrite directly from source, matching this project's existing
// no-render test convention.
function sourceOf(relativePath: string): string {
  const path = fileURLToPath(new URL(`../${relativePath}`, import.meta.url));
  return readFileSync(path, "utf8");
}

const retainedRoutes = ["/onboarding", "/", "/plan/rent-vs-buy", "/loan", "/home", "/goals", "/calendar", "/chat", "/learn", "/imports"];

test("App router wires every retained route to a component", () => {
  const source = sourceOf("src/App.tsx");
  for (const route of retainedRoutes) {
    const pattern = new RegExp(`<Route path="${route.replace(/\//g, "\\/")}" component=`);
    assert.match(source, pattern, `expected a <Route> for ${route}`);
  }
});

test("vercel.json rewrites unmatched paths to index.html without intercepting /api/*", () => {
  const config = JSON.parse(sourceOf("vercel.json")) as { rewrites?: Array<{ source: string; destination: string }> };
  const fallback = config.rewrites?.find((rewrite) => rewrite.destination === "/index.html");
  assert.ok(fallback, "expected a rewrite falling back to /index.html");
  // Vercel matches `source` against the full pathname, so anchor it here too.
  const anchored = new RegExp(`^${fallback!.source}$`);
  assert.match("/calendar", anchored);
  assert.match("/chat", anchored);
  assert.doesNotMatch("/api/agent/chat", anchored);
});
