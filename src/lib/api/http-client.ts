// Real HTTP implementation for the methods backed by same-origin /api/*
// routes. The composition root delegates remaining methods to the mock.
import type { ApiClient } from './client';
import type { AffordabilityInput, AffordabilityResult, CalendarForecast, ChatRequest, ChatResponse, ConfirmDraftResult, MoneyCalendar, RejectDraftResult, RentVsBuyInput, RentVsBuyResult } from './types';

async function getJson<T>(path: string): Promise<T> {
  const response = await fetch(path);
  if (!response.ok) {
    throw new Error(`${path} failed: ${response.status} ${await response.text()}`);
  }
  return (await response.json()) as T;
}

async function postJson<T>(path: string, body?: unknown): Promise<T> {
  const response = await fetch(path, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });
  if (!response.ok) {
    throw new Error(`${path} failed: ${response.status} ${await response.text()}`);
  }
  return (await response.json()) as T;
}

export const httpClient: Pick<ApiClient, 'getMoneyCalendar' | 'getCalendarForecast' | 'checkAffordability' | 'compareRentVsBuy' | 'sendChatMessage' | 'confirmCalendarDraft' | 'rejectCalendarDraft'> = {
  getMoneyCalendar(): Promise<MoneyCalendar> {
    return getJson<MoneyCalendar>('/api/calendar');
  },

  getCalendarForecast(): Promise<CalendarForecast> {
    return getJson<CalendarForecast>('/api/calendar-forecast');
  },

  checkAffordability(input: AffordabilityInput): Promise<AffordabilityResult> {
    return postJson<AffordabilityResult>('/api/loan', input);
  },

  compareRentVsBuy(input: RentVsBuyInput): Promise<RentVsBuyResult> {
    return postJson<RentVsBuyResult>('/api/rent-vs-buy', input);
  },

  sendChatMessage(request: ChatRequest): Promise<ChatResponse> {
    return postJson<ChatResponse>('/api/chat', request);
  },

  confirmCalendarDraft(draftId: string): Promise<ConfirmDraftResult> {
    return postJson<ConfirmDraftResult>(`/api/drafts/${encodeURIComponent(draftId)}/confirm`);
  },

  rejectCalendarDraft(draftId: string): Promise<RejectDraftResult> {
    return postJson<RejectDraftResult>(`/api/drafts/${encodeURIComponent(draftId)}/reject`);
  },
};
