import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { loadSkill } from "../api/_lib/skill";

test("loadSkill reads the authoritative SKILL.md and returns its real, non-empty text", () => {
  const text = loadSkill();
  assert.ok(text.includes("uae-finance-planner"));
  assert.ok(text.includes("Never calculate"));
  assert.ok(text.length > 500);
});

test("loadSkill caches — a second call returns the identical string instance's content without re-reading", () => {
  const first = loadSkill();
  const second = loadSkill();
  assert.equal(first, second);
});

// Source-assertion (this repo's convention for "is X wired up" checks that
// don't need a render): chat.ts must actually call loadSkill() and fold its
// text into the system instruction sent to Gemini, not just import it.
test("chat.ts loads the skill once and includes it in Gemini's system instruction", () => {
  const path = fileURLToPath(new URL("../api/_lib/chat.ts", import.meta.url));
  const source = readFileSync(path, "utf8");
  assert.match(source, /import\s*\{\s*loadSkill\s*\}\s*from\s*'\.\/skill\.js'/);
  assert.match(source, /const skill = loadSkill\(\)/);
  assert.match(source, /systemInstruction = \[\s*\n\s*skill,/);
});
