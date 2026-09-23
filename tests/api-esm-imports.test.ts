import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, readdirSync, statSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

// Vercel runs the compiled api/**/*.ts functions as native Node ESM
// ("type": "module" in package.json). Node's ESM loader requires an
// explicit extension on every relative import -- an extensionless
// `from './_lib/http'` throws ERR_MODULE_NOT_FOUND in production even
// though it resolves fine locally under tsx/bundler resolution. This test
// fails the way production failed: by finding any relative import in
// api/**/*.ts missing its `.js`.
const apiDir = fileURLToPath(new URL("../api", import.meta.url));

function collectTsFiles(dir: string): string[] {
  let files: string[] = [];
  for (const entry of readdirSync(dir)) {
    const full = path.join(dir, entry);
    if (statSync(full).isDirectory()) {
      files = files.concat(collectTsFiles(full));
    } else if (entry.endsWith(".ts")) {
      files.push(full);
    }
  }
  return files;
}

// Matches both `import ... from '...'` and `export ... from '...'` with a
// relative specifier, single-line (this codebase's own style).
const RELATIVE_FROM_CLAUSE = /^\s*(import|export)\s[^;]*?from\s+['"](\.\.?\/[^'"]+)['"]/gm;

test("every runtime-relative import/re-export in api/**/*.ts has an explicit .js extension", () => {
  const files = collectTsFiles(apiDir);
  assert.ok(files.length > 5, "expected to find the api/**/*.ts files");

  const violations: string[] = [];

  for (const file of files) {
    const source = readFileSync(file, "utf8");
    for (const match of source.matchAll(RELATIVE_FROM_CLAUSE)) {
      const [fullStatement, , specifier] = match;
      // A pure `import type { ... } from '...'` (or `export type`) is
      // erased entirely by the TypeScript compiler -- it never becomes a
      // runtime ESM import, so Node's extension requirement doesn't apply.
      const isTypeOnly = /^\s*(import|export)\s+type\s/.test(fullStatement);
      if (isTypeOnly) continue;
      if (!specifier.endsWith(".js")) {
        violations.push(`${path.relative(apiDir, file)}: "${specifier}"`);
      }
    }
  }

  assert.deepEqual(
    violations,
    [],
    `every runtime-relative import under api/ must end in .js (Node ESM requirement on Vercel):\n${violations.join("\n")}`,
  );
});
