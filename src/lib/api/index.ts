// Composition root: the one place that decides which ApiClient
// implementation the app runs against. Everything else (hooks, pages)
// imports `apiClient` from here and never imports `mockClient` or
// `httpClient` directly.
//
// Home, Calendar, Chat, Loan and Rent-vs-buy use same-origin `/api/*`
// routes. Imports, Goals and Onboarding stay on the mock until their real
// endpoints exist.
import { mockClient } from './mock-client';
import { httpClient } from './http-client';
import type { ApiClient } from './client';

export const apiClient: ApiClient = {
  ...mockClient,
  getMoneyCalendar: httpClient.getMoneyCalendar,
  getCalendarForecast: httpClient.getCalendarForecast,
  checkAffordability: httpClient.checkAffordability,
  compareRentVsBuy: httpClient.compareRentVsBuy,
  sendChatMessage: httpClient.sendChatMessage,
  confirmCalendarDraft: httpClient.confirmCalendarDraft,
  rejectCalendarDraft: httpClient.rejectCalendarDraft,
};

export type { ApiClient } from './client';
