// Runs before every build (see package.json's "prebuild") so `pnpm run
// start`/`build` can never silently serve a stale, gitignored dist/ from an
// earlier change.
import { rmSync } from 'node:fs';

rmSync(new URL('../dist', import.meta.url), { recursive: true, force: true });
