// Composition root: the one place that decides which ApiClient
// implementation the app runs against. Everything else (hooks, pages)
// imports `apiClient` from here and never imports `mockClient` directly.
//
// Bundle 1 wires the mock below. Bundle 2 swaps this one assignment for an
// HTTP client that calls same-origin `/api/*` routes — no hook or page
// changes required, because both implementations satisfy the same
// `ApiClient` interface (./client.ts).
import { mockClient } from './mock-client';
import type { ApiClient } from './client';

export const apiClient: ApiClient = mockClient;

export type { ApiClient } from './client';
