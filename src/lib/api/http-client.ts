// Real HTTP implementation, calling same-origin /api/* routes. Bundle 2
// only migrates Home/Calendar/forecast-ribbon/Chat (per scope), so this
// covers exactly those three ApiClient methods; the composition root
// (./index.ts) still delegates everything else to the mock.
import type { ApiClient } from './client';
import type { CalendarForecast, ChatRequest, ChatResponse, ConfirmDraftResult, MoneyCalendar, RejectDraftResult } from './types';

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

export const httpClient: Pick<ApiClient, 'getMoneyCalendar' | 'getCalendarForecast' | 'sendChatMessage' | 'confirmCalendarDraft' | 'rejectCalendarDraft'> = {
  getMoneyCalendar(): Promise<MoneyCalendar> {
    return getJson<MoneyCalendar>('/api/calendar');
  },

  getCalendarForecast(): Promise<CalendarForecast> {
    return getJson<CalendarForecast>('/api/calendar-forecast');
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
