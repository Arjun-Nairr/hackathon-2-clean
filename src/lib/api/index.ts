// Composition root: the one place that decides which ApiClient
// implementation the app runs against. Everything else (hooks, pages)
// imports `apiClient` from here and never imports `mockClient` or
// `httpClient` directly.
//
// Bundle 2: Home, Calendar, the forecast ribbon, and Chat are wired to
// `httpClient` (same-origin `/api/*`, backed by Neon + the deterministic
// finance engine + Gemini). Loan, Rent-vs-buy, Imports, Goals, and
// Onboarding are explicitly out of this bundle's scope and stay on
// `mockClient`'s fixtures/in-memory state — no page changes needed there.
import { mockClient } from './mock-client';
import { httpClient } from './http-client';
import type { ApiClient } from './client';

export const apiClient: ApiClient = {
  ...mockClient,
  getMoneyCalendar: httpClient.getMoneyCalendar,
  getCalendarForecast: httpClient.getCalendarForecast,
  sendChatMessage: httpClient.sendChatMessage,
  confirmCalendarDraft: httpClient.confirmCalendarDraft,
  rejectCalendarDraft: httpClient.rejectCalendarDraft,
};

export type { ApiClient } from './client';
